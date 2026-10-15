//! Opt-in physical-device check. Never invoked by CI or during normal app startup.
use pocket_lens_lib::{adb::Adb, engine::Engine, model::*};
use std::{path::PathBuf, sync::Arc, time::Duration};
#[tokio::main]
async fn main() {
    if let Err(error) = check().await {
        eprintln!("{}: {}", error.code, error.message);
        std::process::exit(1);
    }
}
async fn check() -> Result<()> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 4 && !(args.len() == 5 && args[4] == "--artwork-only") {
        return Err(AppError::new(
            "usage",
            "pocket-lens-check <scrcpy-directory> <device-serial> <output-directory> [--artwork-only]",
        ));
    }
    let directory = PathBuf::from(&args[1]);
    let output = PathBuf::from(&args[3]);
    std::fs::create_dir_all(&output)?;
    let engine = Arc::new(Engine::new(
        Adb::new(&directory),
        output.join("settings.json"),
        None,
    )?);
    let device = engine.adb.device(&args[2]).await?;
    let options = MirrorOptions {
        max_size: 1280,
        max_fps: 30,
        bit_rate: 4,
        clipboard: false,
        turn_screen_off: true,
        record: true,
        recording_directory: output.to_string_lossy().into(),
        ..Default::default()
    };
    let profile = engine
        .register(
            device.serial.clone(),
            "Physical device check".into(),
            options,
            None,
        )
        .await?;
    if args.get(4).is_some_and(|arg| arg == "--artwork-only") {
        engine.refresh().await?;
        engine.refresh_artwork().await;
        let saved = engine
            .settings()
            .profiles
            .into_iter()
            .find(|p| p.id == profile.id)
            .unwrap();
        let available = saved.artwork.is_some();
        assert!(saved.artwork_auto_attempted);
        let restored = Engine::new(Adb::new(&directory), output.join("settings.json"), None)?;
        assert_eq!(restored.settings().profiles[0].artwork, saved.artwork);
        engine.remove_artwork(&profile.id).await?;
        engine.refresh_artwork().await;
        assert!(engine.settings().profiles[0].artwork.is_none());
        println!(
            "Artwork check passed: automatic attempt, local persistence, removal and no automatic reimport. Original wallpaper available: {available}. No mirroring session opened."
        );
        return Ok(());
    }
    let session = engine.open(profile.id.clone(), None).await?;
    assert_eq!(
        engine
            .open(profile.id.clone(), None)
            .await
            .unwrap_err()
            .code,
        "session_active"
    );
    tokio::time::sleep(Duration::from_secs(5)).await;
    let first = engine
        .snapshot(false)
        .sessions
        .into_iter()
        .find(|s| s.profile_id == profile.id)
        .unwrap();
    if first.state == "error" {
        engine.shutdown().await;
        return Err(first.error.unwrap());
    }
    let display = engine
        .adb
        .run(&["-s", &device.serial, "shell", "dumpsys", "display"])
        .await?;
    std::fs::write(output.join("display-state.txt"), display)?;
    engine.stop(&profile.id).await?;
    tokio::time::sleep(Duration::from_millis(600)).await;
    let closed = engine
        .snapshot(false)
        .sessions
        .into_iter()
        .find(|s| s.profile_id == profile.id)
        .unwrap();
    if closed.state == "error" {
        return Err(closed.error.unwrap());
    }
    let recording = session.recording_path.unwrap();
    if std::fs::metadata(&recording)?.len() < 1000 {
        return Err(AppError::new("recording", "Recording is empty"));
    }
    std::fs::write(
        output.join("scrcpy-session.txt"),
        engine.diagnostics(&profile.id),
    )?;
    engine.edit(
        profile.id.clone(),
        profile.name.clone(),
        MirrorOptions {
            clipboard: false,
            max_size: 1280,
            ..Default::default()
        },
    )?;
    engine.open(profile.id.clone(), None).await?;
    tokio::time::sleep(Duration::from_secs(2)).await;
    engine.stop(&profile.id).await?;
    println!(
        "Physical check passed: register, persist, open, duplicate-session prevention, record, graceful close, reopen.\nRecording: {recording}"
    );
    Ok(())
}
