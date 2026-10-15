use crate::model::*;
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{io::AsyncWriteExt, process::Command};

#[derive(Clone)]
pub struct Adb {
    pub directory: PathBuf,
}
pub fn hidden(command: &mut Command) {
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command.kill_on_drop(true);
}
impl Adb {
    pub fn new(directory: &Path) -> Self {
        Self {
            directory: directory.into(),
        }
    }
    pub fn command(&self, executable: &str) -> Command {
        let mut command = Command::new(self.directory.join(executable));
        command
            .current_dir(&self.directory)
            .env("ADB", self.directory.join("adb.exe"));
        hidden(&mut command);
        command
    }
    pub async fn run(&self, args: &[&str]) -> Result<String> {
        let mut command = self.command("adb.exe");
        command.args(args).stdin(Stdio::null());
        let output = tokio::time::timeout(Duration::from_secs(12), command.output())
            .await
            .map_err(|_| AppError::new("timeout", "ADB did not respond within 12 seconds"))??;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if !output.status.success() {
            return Err(AppError::new("adb", format!("{stdout}{stderr}").trim()));
        }
        Ok(stdout)
    }
    pub async fn device(&self, serial: &str) -> Result<DetectedDevice> {
        validate_serial(serial)?;
        let listing = parse_devices(&self.run(&["devices", "-l"]).await?);
        let mut device = listing
            .into_iter()
            .find(|d| d.serial == serial)
            .ok_or_else(|| AppError::new("not_found", "Device is no longer connected"))?;
        if device.state != "device" {
            return Err(AppError::new(
                &device.state,
                "Unlock the phone and allow USB debugging",
            ));
        }
        let properties = self.run(&["-s", serial, "shell", "getprop"]).await?;
        apply_properties(&mut device, &properties);
        Ok(device)
    }
    pub async fn discover(&self) -> Result<Discovery> {
        let mut devices = parse_devices(&self.run(&["devices", "-l"]).await?);
        for device in &mut devices {
            if device.state == "device" {
                if let Ok(properties) = self.run(&["-s", &device.serial, "shell", "getprop"]).await
                {
                    apply_properties(device, &properties);
                }
            }
        }
        let (services, warning) = match self.run(&["mdns", "services"]).await {
            Ok(value) => (parse_mdns(&value), None),
            Err(_) => (vec![], Some("mdns_unavailable".into())),
        };
        Ok(Discovery {
            devices,
            services,
            warning,
        })
    }
    pub async fn connect(&self, endpoint: &str) -> Result<DetectedDevice> {
        validate_endpoint(endpoint)?;
        let result = self.run(&["connect", endpoint]).await?;
        if result.contains("failed") || result.contains("cannot") || result.contains("unable") {
            return Err(AppError::new("connection", result.trim()));
        }
        // adbd may still be completing its handshake after `adb connect`.
        let mut last = AppError::new("connection", "Waiting for device authorization");
        for _ in 0..5 {
            match self.device(endpoint).await {
                Ok(device) => return Ok(device),
                Err(error) => last = error,
            }
            tokio::time::sleep(Duration::from_millis(350)).await;
        }
        Err(last)
    }
    pub async fn pair(&self, endpoint: &str, code: &str) -> Result<()> {
        validate_endpoint(endpoint)?;
        if code.len() != 6 || !code.bytes().all(|c| c.is_ascii_digit()) {
            return Err(AppError::new(
                "pair_code",
                "Enter the six-digit pairing code",
            ));
        }
        let mut command = self.command("adb.exe");
        // Never include the pairing secret in command-line arguments, logs or error output.
        command
            .args(["pair", endpoint])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command.spawn()?;
        if let Some(mut input) = child.stdin.take() {
            input.write_all(format!("{code}\n").as_bytes()).await?;
        }
        let output = tokio::time::timeout(Duration::from_secs(30), child.wait_with_output())
            .await
            .map_err(|_| {
                AppError::new(
                    "pair_failed",
                    "Pairing timed out. Generate a new code on your phone.",
                )
            })??;
        if !output.status.success()
            || !String::from_utf8_lossy(&output.stdout).contains("Successfully paired")
        {
            return Err(AppError::new(
                "pair_failed",
                "Pairing failed. Check the pairing port and generate a new code.",
            ));
        }
        Ok(())
    }
    pub async fn prepare_wifi(&self, serial: &str) -> Result<DetectedDevice> {
        let device = self.device(serial).await?;
        if device.transport != "usb" {
            return Err(AppError::new(
                "usb_required",
                "Connect the phone by USB to prepare Wi-Fi",
            ));
        }
        let routes = self.run(&["-s", serial, "shell", "ip", "route"]).await?;
        let ip = route_ip(&routes).ok_or_else(|| {
            AppError::new(
                "wifi_address",
                "Connect the phone to Wi-Fi before continuing",
            )
        })?;
        self.run(&["-s", serial, "tcpip", "5555"]).await?;
        tokio::time::sleep(Duration::from_secs(1)).await;
        let connected = self.connect(&format!("{ip}:5555")).await?;
        if device.identity.is_some() && device.identity != connected.identity {
            return Err(AppError::new(
                "identity_mismatch",
                "Wi-Fi endpoint belongs to another device",
            ));
        }
        Ok(connected)
    }
}
pub fn validate_serial(serial: &str) -> Result<()> {
    if serial.is_empty()
        || serial.len() > 256
        || serial.starts_with('-')
        || serial.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(AppError::new(
            "invalid_address",
            "Invalid device identifier",
        ));
    }
    Ok(())
}
pub fn validate_endpoint(endpoint: &str) -> Result<()> {
    validate_serial(endpoint)?;
    let (host, port) = endpoint
        .rsplit_once(':')
        .ok_or_else(|| AppError::new("invalid_address", "Use address:port"))?;
    let valid_host = if host.starts_with('[') && host.ends_with(']') {
        host[1..host.len() - 1]
            .parse::<std::net::Ipv6Addr>()
            .is_ok()
    } else {
        !host.is_empty()
            && host
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
            && !host.starts_with('-')
    };
    if !valid_host || port.parse::<u16>().ok().filter(|p| *p != 0).is_none() {
        return Err(AppError::new(
            "invalid_address",
            "Use a valid hostname or IP address and port (1–65535)",
        ));
    }
    Ok(())
}
pub fn parse_devices(text: &str) -> Vec<DetectedDevice> {
    text.lines()
        .filter_map(|line| {
            let mut words = line.split_whitespace();
            let serial = words.next()?;
            let state = words.next()?;
            if !["device", "offline", "unauthorized", "recovery", "no"].contains(&state) {
                return None;
            }
            let details: Vec<_> = words.collect();
            let usb = details.iter().any(|v| v.starts_with("usb:"))
                || (!serial.contains(':')
                    && !serial.contains("._tcp")
                    && !serial.starts_with("emulator-"));
            let model = details
                .iter()
                .find_map(|v| v.strip_prefix("model:"))
                .unwrap_or(serial)
                .replace('_', " ");
            Some(DetectedDevice {
                serial: serial.into(),
                state: state.into(),
                transport: if usb { "usb" } else { "wifi" }.into(),
                model,
                ..Default::default()
            })
        })
        .collect()
}
pub fn apply_properties(device: &mut DetectedDevice, properties: &str) {
    let get = |key: &str| {
        properties
            .lines()
            .find_map(|line| {
                line.strip_prefix(&format!("[{key}]: ["))
                    .and_then(|v| v.strip_suffix(']'))
            })
            .unwrap_or("")
            .trim()
            .to_string()
    };
    device.model = get("ro.product.model");
    device.manufacturer = get("ro.product.manufacturer");
    device.android_version = get("ro.build.version.release");
    device.sdk = get("ro.build.version.sdk").parse().unwrap_or(0);
    device.identity = [get("ro.serialno"), get("ro.boot.serialno")]
        .into_iter()
        .find(|s| {
            s.len() >= 4
                && !["unknown", "null", "0123456789ABCDEF"].contains(&s.as_str())
                && !s.chars().all(|c| c == '0')
        });
}
pub fn parse_mdns(text: &str) -> Vec<MdnsService> {
    text.lines()
        .filter_map(|line| {
            let words: Vec<_> = line.split_whitespace().collect();
            if words.len() < 3 {
                return None;
            }
            let kind = words[1].trim_end_matches('.');
            if ![
                "_adb-tls-connect._tcp",
                "_adb-tls-pairing._tcp",
                "_adb._tcp",
            ]
            .contains(&kind)
                || validate_endpoint(words[2]).is_err()
            {
                return None;
            }
            Some(MdnsService {
                name: words[0].into(),
                kind: kind.into(),
                endpoint: words[2].into(),
            })
        })
        .collect()
}
pub fn route_ip(text: &str) -> Option<String> {
    text.lines()
        .filter(|line| line.contains("wlan") || line.contains("wifi"))
        .find_map(|line| {
            let words: Vec<_> = line.split_whitespace().collect();
            words
                .windows(2)
                .find(|w| w[0] == "src")
                .and_then(|w| w[1].parse::<std::net::Ipv4Addr>().ok())
                .map(|ip| ip.to_string())
        })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn devices_include_permission_and_offline_states() {
        let devices = parse_devices(
            "List of devices attached\nUSB123 unauthorized usb:1-1\n192.168.1.8:5555 offline\nadb-SERIAL-x._adb-tls-connect._tcp device model:Pixel_8\n",
        );
        assert_eq!(devices.len(), 3);
        assert_eq!(devices[0].transport, "usb");
        assert_eq!(devices[2].transport, "wifi");
    }
    #[test]
    fn mdns_distinguishes_pairing_from_connection_ports() {
        let services = parse_mdns(
            "List of discovered mdns services\nphone _adb-tls-pairing._tcp. 192.168.1.8:37111\nphone _adb-tls-connect._tcp. 192.168.1.8:40999\n",
        );
        assert_eq!(services.len(), 2);
        assert_ne!(services[0].endpoint, services[1].endpoint);
    }
    #[test]
    fn endpoints_reject_arguments_and_invalid_ports() {
        for invalid in [
            "-s",
            "host:0",
            "host:65536",
            "host:5555 --bad",
            "http://host:55",
            "a;echo:55",
        ] {
            assert!(validate_endpoint(invalid).is_err(), "{invalid}");
        }
        assert!(validate_endpoint("[::1]:5555").is_ok());
        assert!(validate_endpoint("phone.local:5555").is_ok());
    }
    #[test]
    fn route_and_properties_extract_stable_identity() {
        assert_eq!(
            route_ip("192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.5"),
            Some("192.168.1.5".into())
        );
        let mut device = DetectedDevice::default();
        apply_properties(
            &mut device,
            "[ro.serialno]: [unknown]\n[ro.boot.serialno]: [ABC1234]\n[ro.build.version.sdk]: [33]",
        );
        assert_eq!(device.identity, Some("ABC1234".into()));
        assert_eq!(device.sdk, 33);
    }
}
