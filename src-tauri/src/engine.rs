use crate::{adb::Adb, model::*, store};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::Emitter;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Child,
    sync::Mutex as AsyncMutex,
};

struct ManagedSession {
    status: SessionStatus,
    child: Arc<AsyncMutex<Child>>,
    stopping: bool,
    log: Arc<Mutex<String>>,
    identity: Option<String>,
}
pub struct Engine {
    pub adb: Adb,
    path: PathBuf,
    settings: Mutex<Settings>,
    discovery: Mutex<Discovery>,
    sessions: Mutex<HashMap<String, ManagedSession>>,
    opening: Mutex<HashSet<String>>,
    discovery_gate: AsyncMutex<()>,
    launch_gate: AsyncMutex<()>,
    pub app: Option<tauri::AppHandle>,
}
impl Engine {
    pub fn new(adb: Adb, path: PathBuf, app: Option<tauri::AppHandle>) -> Result<Self> {
        let settings = store::load(&path)?;
        Ok(Self {
            adb,
            path,
            settings: Mutex::new(settings),
            discovery: Mutex::default(),
            sessions: Mutex::default(),
            opening: Mutex::default(),
            discovery_gate: AsyncMutex::new(()),
            launch_gate: AsyncMutex::new(()),
            app,
        })
    }
    fn update(&self, change: impl FnOnce(&mut Settings) -> Result<()>) -> Result<()> {
        let mut settings = self.settings.lock().unwrap();
        let mut next = settings.clone();
        change(&mut next)?;
        store::save(&self.path, &next)?;
        *settings = next;
        Ok(())
    }
    pub fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }
    pub fn preferences(&self, language: String, theme: String) -> Result<()> {
        if !["es", "en"].contains(&language.as_str())
            || !["system", "light", "dark"].contains(&theme.as_str())
        {
            return Err(AppError::new(
                "preferences",
                "Unsupported language or theme",
            ));
        }
        self.update(|s| {
            s.preferences.language = language;
            s.preferences.theme = theme;
            Ok(())
        })
    }
    pub fn initialized_autostart(&self) -> Result<()> {
        self.update(|s| {
            s.preferences.autostart_initialized = true;
            Ok(())
        })
    }
    pub async fn refresh(&self) -> Result<Discovery> {
        let Ok(_gate) = self.discovery_gate.try_lock() else {
            return Ok(self.discovery.lock().unwrap().clone());
        };
        let discovery = self.adb.discover().await?;
        *self.discovery.lock().unwrap() = discovery.clone();
        if let Some(app) = &self.app {
            let _ = app.emit("devices://changed", &discovery);
        }
        Ok(discovery)
    }
    pub fn snapshot(&self, autostart: bool) -> AppSnapshot {
        let settings = self.settings();
        let discovery = self.discovery.lock().unwrap().clone();
        let sessions = self
            .sessions
            .lock()
            .unwrap()
            .values()
            .map(|s| s.status.clone())
            .collect();
        let devices = settings
            .profiles
            .iter()
            .map(|p| {
                let found = discovery
                    .devices
                    .iter()
                    .filter(|d| matches_profile(p, d))
                    .min_by_key(|d| if d.transport == "usb" { 0 } else { 1 });
                let pending = discovery
                    .devices
                    .iter()
                    .find(|d| p.usb_serials.contains(&d.serial) && d.state != "device");
                DeviceStatus {
                    profile_id: p.id.clone(),
                    state: found
                        .map(|_| "available")
                        .unwrap_or_else(|| {
                            pending.map(|d| d.state.as_str()).unwrap_or("disconnected")
                        })
                        .into(),
                    serial: found.map(|d| d.serial.clone()),
                    transport: found.map(|d| d.transport.clone()),
                }
            })
            .collect();
        AppSnapshot {
            settings,
            discovery,
            sessions,
            devices,
            autostart,
            engine_version: "4.1".into(),
        }
    }
    pub async fn register(
        &self,
        serial: String,
        name: String,
        options: MirrorOptions,
        associate_id: Option<String>,
    ) -> Result<DeviceProfile> {
        options.validate()?;
        validate_name(&name)?;
        let device = self.adb.device(&serial).await?;
        let services = self.discovery.lock().unwrap().services.clone();
        let mut result = None;
        self.update(|settings| {
            let matched = settings
                .profiles
                .iter()
                .find(|p| matches_profile(p, &device))
                .map(|p| p.id.clone());
            let target = associate_id.clone().or(matched);
            if let Some(id) = target {
                let profile = settings
                    .profiles
                    .iter_mut()
                    .find(|p| p.id == id)
                    .ok_or_else(|| AppError::new("not_found", "Profile not found"))?;
                if let (Some(expected), Some(actual)) = (&profile.identity, &device.identity) {
                    if expected != actual {
                        return Err(AppError::new(
                            "identity_mismatch",
                            "This is a different physical device",
                        ));
                    }
                }
                if profile.identity.is_none() {
                    profile.identity = device.identity.clone();
                }
                link(profile, &device, &services);
                profile.name = name.trim().into();
                profile.options = options.clone();
                result = Some(profile.clone());
            } else {
                let mut profile = DeviceProfile {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: name.trim().into(),
                    model: device.model.clone(),
                    manufacturer: device.manufacturer.clone(),
                    android_version: device.android_version.clone(),
                    sdk: device.sdk,
                    identity: device.identity.clone(),
                    usb_serials: vec![],
                    endpoints: vec![],
                    mdns_names: vec![],
                    options: options.clone(),
                };
                link(&mut profile, &device, &services);
                result = Some(profile.clone());
                settings.profiles.push(profile);
            }
            Ok(())
        })?;
        Ok(result.unwrap())
    }
    pub fn edit(&self, id: String, name: String, options: MirrorOptions) -> Result<()> {
        validate_name(&name)?;
        options.validate()?;
        self.update(|settings| {
            let profile = settings
                .profiles
                .iter_mut()
                .find(|p| p.id == id)
                .ok_or_else(|| AppError::new("not_found", "Profile not found"))?;
            profile.name = name.trim().into();
            profile.options = options;
            Ok(())
        })
    }
    pub fn forget(&self, id: &str) -> Result<()> {
        if self.opening.lock().unwrap().contains(id)
            || self.sessions.lock().unwrap().get(id).is_some_and(|s| {
                ["starting", "running", "stopping"].contains(&s.status.state.as_str())
            })
        {
            return Err(AppError::new(
                "session_active",
                "Close the device session before forgetting it",
            ));
        }
        self.update(|settings| {
            settings.profiles.retain(|p| p.id != id);
            Ok(())
        })?;
        self.sessions.lock().unwrap().remove(id);
        Ok(())
    }
    pub async fn open(
        self: &Arc<Self>,
        id: String,
        confirmed_serial: Option<String>,
    ) -> Result<SessionStatus> {
        {
            let mut opening = self.opening.lock().unwrap();
            if opening.contains(&id)
                || self.sessions.lock().unwrap().get(&id).is_some_and(|s| {
                    ["starting", "running", "stopping"].contains(&s.status.state.as_str())
                })
            {
                return Err(AppError::new(
                    "session_active",
                    "A session for this device is already open",
                ));
            }
            opening.insert(id.clone());
        }
        let result = self.open_inner(&id, confirmed_serial).await;
        self.opening.lock().unwrap().remove(&id);
        result
    }
    async fn resolve(
        &self,
        profile: &DeviceProfile,
        confirmed_serial: Option<String>,
    ) -> Result<DetectedDevice> {
        let discovery = self.refresh().await?;
        if let Some(found) = discovery
            .devices
            .iter()
            .filter(|d| matches_profile(profile, d))
            .min_by_key(|d| if d.transport == "usb" { 0 } else { 1 })
        {
            return self.adb.device(&found.serial).await;
        }
        if let Some(serial) = confirmed_serial {
            let device = self.adb.device(&serial).await?;
            if let (Some(expected), Some(actual)) = (&profile.identity, &device.identity) {
                if expected != actual {
                    return Err(AppError::new(
                        "identity_mismatch",
                        "This is a different physical device",
                    ));
                }
            }
            return Ok(device);
        }
        let mut endpoints: Vec<_> = discovery
            .services
            .iter()
            .filter(|s| s.kind != "_adb-tls-pairing._tcp" && profile.mdns_names.contains(&s.name))
            .map(|s| s.endpoint.clone())
            .collect();
        endpoints.extend(profile.endpoints.clone());
        endpoints.dedup();
        for endpoint in endpoints {
            if let Ok(device) = self.adb.connect(&endpoint).await {
                if matches_profile(profile, &device) {
                    return Ok(device);
                }
                if profile.identity.is_some() && device.identity.is_some() {
                    continue;
                }
                return Err(AppError::new(
                    "identity_confirmation",
                    "Identity unavailable. Select and confirm the device before opening.",
                ));
            }
        }
        if profile.identity.is_none() {
            return Err(AppError::new(
                "identity_confirmation",
                "Select and confirm the device before opening.",
            ));
        }
        Err(AppError::new(
            "not_found",
            "Device unavailable. Check debugging and Wi-Fi, or reconnect USB.",
        ))
    }
    async fn open_inner(
        self: &Arc<Self>,
        id: &str,
        confirmed_serial: Option<String>,
    ) -> Result<SessionStatus> {
        let profile = self
            .settings()
            .profiles
            .into_iter()
            .find(|p| p.id == id)
            .ok_or_else(|| AppError::new("not_found", "Profile not found"))?;
        let device = self.resolve(&profile, confirmed_serial).await?;
        // Re-read identity immediately before launch, including on an already known endpoint.
        let verified = self.adb.device(&device.serial).await?;
        if device.identity != verified.identity {
            return Err(AppError::new(
                "identity_mismatch",
                "Device changed before launch",
            ));
        }
        let _launch = self.launch_gate.lock().await;
        {
            let sessions = self.sessions.lock().unwrap();
            if sessions.values().any(|s| {
                (s.status.serial == verified.serial
                    || (s.identity.is_some() && s.identity == verified.identity))
                    && ["starting", "running", "stopping"].contains(&s.status.state.as_str())
            }) {
                return Err(AppError::new(
                    "session_active",
                    "This device is already open in another profile",
                ));
            }
        }
        let recording = recording_path(&profile)?;
        let args = build_arguments(&profile, &verified, recording.as_deref())?;
        let mut command = self.adb.command("scrcpy.exe");
        command
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|e| AppError::new("scrcpy", e.to_string()))?;
        let log = Arc::new(Mutex::new(String::new()));
        if let Some(stderr) = child.stderr.take() {
            drain(stderr, log.clone());
        }
        if let Some(stdout) = child.stdout.take() {
            drain(stdout, log.clone());
        }
        let child = Arc::new(AsyncMutex::new(child));
        let status = SessionStatus {
            profile_id: id.into(),
            state: "starting".into(),
            serial: verified.serial.clone(),
            recording_path: recording.clone(),
            error: None,
        };
        self.sessions.lock().unwrap().insert(
            id.into(),
            ManagedSession {
                status: status.clone(),
                child: child.clone(),
                stopping: false,
                log: log.clone(),
                identity: verified.identity.clone(),
            },
        );
        let services = self.discovery.lock().unwrap().services.clone();
        // Endpoint changes are only saved after identity verification.
        let _ = self.update(|settings| {
            if let Some(p) = settings.profiles.iter_mut().find(|p| p.id == id) {
                link(p, &verified, &services);
            }
            Ok(())
        });
        self.emit(&status);
        let engine = self.clone();
        let profile_id = id.to_string();
        tokio::spawn(async move {
            let started = std::time::Instant::now();
            loop {
                tokio::time::sleep(Duration::from_millis(300)).await;
                let exit = child.lock().await.try_wait();
                let mut sessions = engine.sessions.lock().unwrap();
                let Some(session) = sessions.get_mut(&profile_id) else {
                    break;
                };
                match exit {
                    Ok(Some(exit)) => {
                        let details = log.lock().unwrap().clone();
                        if session.status.state != "error" {
                            session.status.state = if exit.success() || session.stopping {
                                "closed"
                            } else {
                                "error"
                            }
                            .into();
                        }
                        if !exit.success() && !session.stopping {
                            session.status.error = Some(classify_failure(&details));
                        }
                        engine.emit(&session.status);
                        break;
                    }
                    Err(error) => {
                        session.status.state = "error".into();
                        session.status.error = Some(AppError::new("scrcpy", error.to_string()));
                        engine.emit(&session.status);
                        break;
                    }
                    Ok(None)
                        if started.elapsed() > Duration::from_millis(1200)
                            && session.status.state == "starting" =>
                    {
                        session.status.state = "running".into();
                        engine.emit(&session.status);
                    }
                    _ => {}
                }
            }
        });
        Ok(status)
    }
    fn emit(&self, status: &SessionStatus) {
        if let Some(app) = &self.app {
            let _ = app.emit("session://changed", status);
        }
    }
    pub async fn stop(&self, id: &str) -> Result<()> {
        let child = {
            let mut sessions = self.sessions.lock().unwrap();
            let session = sessions
                .get_mut(id)
                .ok_or_else(|| AppError::new("not_found", "Session not found"))?;
            if ["closed", "error"].contains(&session.status.state.as_str()) {
                return Ok(());
            }
            session.stopping = true;
            session.status.state = "stopping".into();
            self.emit(&session.status);
            session.child.clone()
        };
        let pid = child.lock().await.id();
        if let Some(pid) = pid {
            close_window(pid);
        }
        for _ in 0..40 {
            if child.lock().await.try_wait()?.is_some() {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        let mut child = child.lock().await;
        // A stuck process has no responsive window; only this owned child may be terminated.
        child.kill().await?;
        if let Some(session) = self.sessions.lock().unwrap().get_mut(id) {
            session.status.error = Some(AppError::new(
                "forced_close",
                "The session did not respond. Its recording may be incomplete.",
            ));
            session.status.state = "error".into();
            self.emit(&session.status);
        }
        Ok(())
    }
    pub async fn shutdown(&self) {
        let ids: Vec<_> = self.sessions.lock().unwrap().keys().cloned().collect();
        for id in ids {
            let _ = self.stop(&id).await;
        }
    }
    pub fn diagnostics(&self, id: &str) -> String {
        self.sessions
            .lock()
            .unwrap()
            .get(id)
            .map(|s| s.log.lock().unwrap().clone())
            .unwrap_or_default()
    }
}
fn validate_name(name: &str) -> Result<()> {
    if name.trim().is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
        return Err(AppError::new(
            "invalid_name",
            "Use a name between 1 and 80 characters",
        ));
    }
    Ok(())
}
fn link(profile: &mut DeviceProfile, device: &DetectedDevice, services: &[MdnsService]) {
    let aliases = if device.transport == "usb" {
        &mut profile.usb_serials
    } else {
        &mut profile.endpoints
    };
    if !aliases.contains(&device.serial)
        && (device.transport == "usb" || crate::adb::validate_endpoint(&device.serial).is_ok())
    {
        aliases.insert(0, device.serial.clone());
        aliases.truncate(8);
    }
    for service in services
        .iter()
        .filter(|s| s.endpoint == device.serial && s.kind != "_adb-tls-pairing._tcp")
    {
        if !profile.mdns_names.contains(&service.name) {
            profile.mdns_names.push(service.name.clone());
        }
    }
}
pub fn recording_path(profile: &DeviceProfile) -> Result<Option<String>> {
    profile.options.validate()?;
    if !profile.options.record {
        return Ok(None);
    }
    let directory = PathBuf::from(&profile.options.recording_directory);
    if !directory.is_dir() {
        return Err(AppError::new(
            "recording_directory",
            "The recording directory does not exist",
        ));
    }
    let check = directory.join(format!(".pocket-lens-{}.tmp", uuid::Uuid::new_v4()));
    std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&check)
        .map_err(|_| {
            AppError::new(
                "recording_directory",
                "The recording directory is not writable",
            )
        })?;
    std::fs::remove_file(check)?;
    let name: String = profile
        .name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .take(40)
        .collect();
    Ok(Some(
        directory
            .join(format!(
                "{name}-{}-{}.mp4",
                chrono::Local::now().format("%Y%m%d-%H%M%S"),
                &uuid::Uuid::new_v4().to_string()[..8]
            ))
            .to_string_lossy()
            .into(),
    ))
}
pub fn build_arguments(
    profile: &DeviceProfile,
    device: &DetectedDevice,
    recording: Option<&str>,
) -> Result<Vec<String>> {
    let o = &profile.options;
    o.validate()?;
    crate::adb::validate_serial(&device.serial)?;
    let mut args = vec![
        format!("--serial={}", device.serial),
        format!("--window-title=Pocket Lens · {}", profile.name),
        "--no-terminal-title".into(),
        format!("--video-codec={}", o.codec),
        format!("--video-bit-rate={}M", o.bit_rate),
        format!("--max-fps={}", o.max_fps),
    ];
    if o.max_size > 0 {
        args.push(format!("--max-size={}", o.max_size));
    }
    for (enabled, flag) in [
        (o.turn_screen_off, "--turn-screen-off"),
        (o.stay_awake, "--stay-awake"),
        (!o.audio || device.sdk < 30, "--no-audio"),
        (!o.control, "--no-control"),
        (!o.clipboard, "--no-clipboard-autosync"),
        (o.fullscreen, "--fullscreen"),
        (o.always_on_top, "--always-on-top"),
    ] {
        if enabled {
            args.push(flag.into());
        }
    }
    if o.window_width > 0 {
        args.push(format!("--window-width={}", o.window_width));
    }
    if o.window_height > 0 {
        args.push(format!("--window-height={}", o.window_height));
    }
    if let Some(path) = recording {
        args.push(format!("--record={path}"));
        args.push("--record-format=mp4".into());
    }
    Ok(args)
}
fn drain<R: tokio::io::AsyncRead + Unpin + Send + 'static>(reader: R, log: Arc<Mutex<String>>) {
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let mut log = log.lock().unwrap();
            log.push_str(&line);
            log.push('\n');
            if log.len() > 16384 {
                let mut cut = log.len() - 8192;
                while !log.is_char_boundary(cut) {
                    cut += 1;
                }
                log.drain(..cut);
            }
        }
    });
}
pub fn classify_failure(log: &str) -> AppError {
    let lower = log.to_lowercase();
    let code = if lower.contains("encoder") || lower.contains("codec") {
        "codec"
    } else if lower.contains("unauthorized") {
        "unauthorized"
    } else if lower.contains("disconnected")
        || lower.contains("not find")
        || lower.contains("connection")
    {
        "connection"
    } else if lower.contains("record") || lower.contains("permission denied") {
        "recording_directory"
    } else {
        "scrcpy"
    };
    AppError::new(
        code,
        if log.trim().is_empty() {
            "scrcpy exited unexpectedly"
        } else {
            log.trim()
        },
    )
}
#[cfg(windows)]
fn close_window(pid: u32) {
    use windows_sys::{
        Win32::{
            Foundation::{HWND, LPARAM},
            UI::WindowsAndMessaging::{
                EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
            },
        },
        core::BOOL,
    };
    unsafe extern "system" fn callback(window: HWND, value: LPARAM) -> BOOL {
        let mut owner = 0;
        unsafe {
            GetWindowThreadProcessId(window, &mut owner);
            if owner == value as u32 {
                PostMessageW(window, WM_CLOSE, 0, 0);
            }
        }
        1
    }
    unsafe {
        EnumWindows(Some(callback), pid as LPARAM);
    }
}
#[cfg(not(windows))]
fn close_window(_pid: u32) {}

#[cfg(test)]
mod tests {
    use super::*;
    fn profile() -> DeviceProfile {
        DeviceProfile {
            id: "p".into(),
            name: "My phone; literal".into(),
            model: "".into(),
            manufacturer: "".into(),
            android_version: "".into(),
            sdk: 33,
            identity: Some("abc123".into()),
            usb_serials: vec![],
            endpoints: vec![],
            mdns_names: vec![],
            options: MirrorOptions::default(),
        }
    }
    #[test]
    fn arguments_are_isolated_and_always_target_a_device() {
        let p = profile();
        let d = DetectedDevice {
            serial: "serial123".into(),
            sdk: 29,
            ..Default::default()
        };
        let args = build_arguments(&p, &d, Some("C:\\My recordings\\video.mp4")).unwrap();
        assert!(args.contains(&"--serial=serial123".into()));
        assert!(args.contains(&"--no-audio".into()));
        assert!(args.contains(&"--window-title=Pocket Lens · My phone; literal".into()));
        assert!(args.contains(&"--record=C:\\My recordings\\video.mp4".into()));
        assert!(!args.iter().any(|a| a.contains("kill-adb")));
    }
    #[test]
    fn recordings_are_unique_and_bad_directories_fail_early() {
        let dir = tempfile::tempdir().unwrap();
        let mut p = profile();
        p.options.record = true;
        p.options.recording_directory = dir.path().to_string_lossy().into();
        assert_ne!(recording_path(&p).unwrap(), recording_path(&p).unwrap());
        p.options.recording_directory = dir.path().join("missing").to_string_lossy().into();
        assert_eq!(recording_path(&p).unwrap_err().code, "recording_directory");
    }
    #[test]
    fn encoder_errors_have_actionable_classification() {
        assert_eq!(
            classify_failure("ERROR: Could not create h265 video encoder").code,
            "codec"
        );
    }
}
