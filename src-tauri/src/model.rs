use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
}
impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::new("io", error.to_string())
    }
}
pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MirrorOptions {
    pub turn_screen_off: bool,
    pub stay_awake: bool,
    pub audio: bool,
    pub control: bool,
    pub clipboard: bool,
    pub max_size: u32,
    pub max_fps: u32,
    pub bit_rate: u32,
    pub codec: String,
    pub window_width: u32,
    pub window_height: u32,
    pub fullscreen: bool,
    pub always_on_top: bool,
    pub record: bool,
    pub recording_directory: String,
}
impl Default for MirrorOptions {
    fn default() -> Self {
        Self {
            turn_screen_off: false,
            stay_awake: false,
            audio: true,
            control: true,
            clipboard: true,
            max_size: 1920,
            max_fps: 60,
            bit_rate: 8,
            codec: "h264".into(),
            window_width: 0,
            window_height: 0,
            fullscreen: false,
            always_on_top: false,
            record: false,
            recording_directory: String::new(),
        }
    }
}
impl MirrorOptions {
    pub fn validate(&self) -> Result<()> {
        if !["h264", "h265", "av1"].contains(&self.codec.as_str())
            || self.max_size > 8192
            || self.max_fps == 0
            || self.max_fps > 240
            || self.bit_rate == 0
            || self.bit_rate > 200
            || self.window_width > 7680
            || self.window_height > 7680
        {
            return Err(AppError::new(
                "invalid_options",
                "Invalid video or window settings",
            ));
        }
        if !self.control && (self.turn_screen_off || self.stay_awake) {
            return Err(AppError::new(
                "invalid_options",
                "Screen power options require device control",
            ));
        }
        if self.record
            && (self.recording_directory.trim().is_empty()
                || !std::path::Path::new(&self.recording_directory).is_absolute())
        {
            return Err(AppError::new(
                "recording_directory",
                "Choose an absolute recording directory",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceProfile {
    pub id: String,
    pub name: String,
    pub model: String,
    pub manufacturer: String,
    pub android_version: String,
    pub sdk: u32,
    pub identity: Option<String>,
    pub usb_serials: Vec<String>,
    pub endpoints: Vec<String>,
    pub mdns_names: Vec<String>,
    pub options: MirrorOptions,
    #[serde(default)]
    pub artwork: Option<String>,
    #[serde(default)]
    pub artwork_auto_attempted: bool,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppPreferences {
    pub language: String,
    pub theme: String,
    pub autostart_initialized: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub profiles: Vec<DeviceProfile>,
    pub preferences: AppPreferences,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            profiles: vec![],
            preferences: AppPreferences {
                theme: "system".into(),
                ..Default::default()
            },
        }
    }
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedDevice {
    pub serial: String,
    pub state: String,
    pub transport: String,
    pub model: String,
    pub manufacturer: String,
    pub android_version: String,
    pub sdk: u32,
    pub identity: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MdnsService {
    pub name: String,
    pub kind: String,
    pub endpoint: String,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Discovery {
    pub devices: Vec<DetectedDevice>,
    pub services: Vec<MdnsService>,
    pub warning: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub profile_id: String,
    pub state: String,
    pub serial: String,
    pub recording_path: Option<String>,
    pub error: Option<AppError>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatus {
    pub profile_id: String,
    pub state: String,
    pub serial: Option<String>,
    pub transport: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub settings: Settings,
    pub discovery: Discovery,
    pub sessions: Vec<SessionStatus>,
    pub devices: Vec<DeviceStatus>,
    pub autostart: bool,
    pub engine_version: String,
}

pub fn matches_profile(profile: &DeviceProfile, device: &DetectedDevice) -> bool {
    if device.state != "device" {
        return false;
    }
    match (&profile.identity, &device.identity) {
        (Some(expected), Some(actual)) => expected == actual,
        (None, None) if device.transport == "usb" => profile.usb_serials.contains(&device.serial),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_are_compatible_and_power_requires_control() {
        let mut options = MirrorOptions::default();
        assert!(options.validate().is_ok());
        options.control = false;
        options.turn_screen_off = true;
        assert!(options.validate().is_err());
    }
    #[test]
    fn recording_requires_absolute_directory_and_limits_are_enforced() {
        let mut options = MirrorOptions {
            record: true,
            recording_directory: "relative".into(),
            ..Default::default()
        };
        assert!(options.validate().is_err());
        options.record = false;
        options.codec = "h264 --bad".into();
        assert!(options.validate().is_err());
    }
    #[test]
    fn ip_and_model_do_not_establish_identity() {
        let profile = DeviceProfile {
            id: "a".into(),
            name: "a".into(),
            model: "Phone".into(),
            manufacturer: "".into(),
            android_version: "".into(),
            sdk: 30,
            identity: Some("first".into()),
            usb_serials: vec![],
            endpoints: vec!["192.168.1.2:5555".into()],
            mdns_names: vec![],
            options: MirrorOptions::default(),
            artwork: None,
            artwork_auto_attempted: false,
        };
        let mut device = DetectedDevice {
            serial: "192.168.1.2:5555".into(),
            state: "device".into(),
            transport: "wifi".into(),
            model: "Phone".into(),
            identity: Some("second".into()),
            ..Default::default()
        };
        assert!(!matches_profile(&profile, &device));
        device.identity = Some("first".into());
        assert!(matches_profile(&profile, &device));
    }
}
