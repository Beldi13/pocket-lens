//! Opt-in installer acceptance harness, compiled only with diagnostics and a separate app ID.
use crate::{model::*, store};
use tauri::{App, Manager};
use tauri_plugin_updater::UpdaterExt;

pub fn setup(app: &mut App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let output = std::env::var_os("POCKET_LENS_UPDATE_CHECK")
        .map(std::path::PathBuf::from)
        .ok_or("Missing explicit acceptance harness directory")?;
    if !output.is_absolute() || !output.join("authorized-fixture").is_file() {
        return Err("Acceptance fixture marker missing".into());
    }
    let config = app.path().app_config_dir()?;
    std::fs::create_dir_all(&config)?;
    let settings_path = config.join("settings.json");
    let version = app.package_info().version.to_string();
    if version == "0.3.0" {
        let mut settings = Settings::default();
        settings.preferences.language = "es".into();
        settings.preferences.theme = "dark".into();
        settings.preferences.autostart_initialized = true;
        settings.profiles.push(DeviceProfile {
            id: "fixture".into(),
            name: "Teléfono Ñ 日本".into(),
            model: "Fixture".into(),
            manufacturer: "Test".into(),
            android_version: "14".into(),
            sdk: 34,
            identity: Some("fixture-identity".into()),
            usb_serials: vec!["fixture-usb".into()],
            endpoints: vec![],
            mdns_names: vec![],
            options: MirrorOptions::default(),
            artwork: Some("fixture-image.png".into()),
            artwork_auto_attempted: true,
        });
        store::save(&settings_path, &settings)?;
        std::fs::write(config.join("fixture-image.png"), b"preserved fixture image")?;
        std::fs::copy(&settings_path, output.join("before.json"))?;
    }
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        let result: std::result::Result<(), Box<dyn std::error::Error + Send + Sync>> = async {
            if version == "0.3.1" {
                let before = std::fs::read(output.join("before.json"))?;
                let after = std::fs::read(&settings_path)?;
                if before != after
                    || store::load(&settings_path)?.profiles[0].name != "Teléfono Ñ 日本"
                    || std::fs::read(config.join("fixture-image.png"))?
                        != b"preserved fixture image"
                {
                    return Err("Update changed fixture data".into());
                }
                std::fs::write(
                    output.join("passed.json"),
                    "{\"version\":\"0.3.1\",\"signature\":true,\"dataPreserved\":true}",
                )?;
                handle.exit(0);
                return Ok(());
            }
            let updater = handle
                .updater_builder()
                .timeout(std::time::Duration::from_secs(300))
                .build()?;
            let update = updater
                .check()
                .await?
                .ok_or("Expected signed fixture update")?;
            if update.version != "0.3.1" {
                return Err("Wrong fixture version".into());
            }
            let bytes = update.download(|_, _| {}, || {}).await?;
            update.verify(&bytes)?;
            std::fs::write(output.join("verified"), "0.3.1")?;
            update.install(bytes)?;
            Ok(())
        }
        .await;
        if let Err(error) = result {
            let _ = std::fs::write(output.join("failed.txt"), error.to_string());
            handle.exit(1);
        }
    });
    Ok(())
}
