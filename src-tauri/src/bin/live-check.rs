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
    if args.len() != 4
        && !(args.len() == 5 && ["--artwork-only", "--files-only"].contains(&args[4].as_str()))
    {
        return Err(AppError::new(
            "usage",
            "pocket-lens-check <scrcpy-directory> <device-serial> <output-directory> [--artwork-only|--files-only]",
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
    if args.get(4).is_some_and(|arg| arg == "--files-only") {
        return files_check(engine, &profile.id, &output).await;
    }
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
    let result = async {
    let session = engine.open(profile.id.clone(), None).await?;
    assert_eq!(
        engine
            .open(profile.id.clone(), None)
            .await
            .unwrap_err()
            .code,
        "session_active"
    );
    tokio::time::sleep(Duration::from_secs(20)).await;
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
    // Opt-in diagnostic owns this recording/session; never changes the user's saved profile.
    if let Err(error) = engine.screen_power(&profile.id, true).await {
        engine.stop(&profile.id).await?;
        return Err(error);
    }
    tokio::time::sleep(Duration::from_millis(700)).await;
    let on = engine
        .adb
        .run(&["-s", &device.serial, "shell", "dumpsys", "SurfaceFlinger"])
        .await?;
    std::fs::write(output.join("screen-on.txt"), &on)?;
    if on.lines().map(str::trim).find(|line| line.starts_with("powerMode=")) != Some("powerMode=On") {
        return Err(AppError::new(
            "fixture",
            "Physical display did not report ON",
        ));
    }
    if let Err(error) = engine.screen_power(&profile.id, false).await {
        engine.stop(&profile.id).await?;
        return Err(error);
    }
    tokio::time::sleep(Duration::from_millis(700)).await;
    let display = engine
        .adb
        .run(&["-s", &device.serial, "shell", "dumpsys", "SurfaceFlinger"])
        .await?;
    if display.lines().map(str::trim).find(|line| line.starts_with("powerMode=")) != Some("powerMode=Off") {
        return Err(AppError::new(
            "fixture",
            "Physical display did not report OFF",
        ));
    }
    std::fs::write(output.join("display-state.txt"), display)?;
    assert!(engine.settings().profiles[0].options.turn_screen_off);
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
    }.await;
    if result.is_err() {
        let _ = std::fs::write(
            output.join("scrcpy-session.txt"),
            engine.diagnostics(&profile.id),
        );
    }
    engine.shutdown().await;
    result
}

async fn files_check(engine: Arc<Engine>, id: &str, output: &std::path::Path) -> Result<()> {
    use pocket_lens_lib::{
        file_io::FileSystem,
        files::{FileManager, FileRequest},
    };
    let local = output.join(format!("files-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(local.join("original/empty"))?;
    std::fs::create_dir_all(local.join("returned"))?;
    let name = "nombre ' $(echo test) Ñ 日本.apk";
    let content = vec![0x5a; 1024 * 1024 + 7];
    std::fs::write(local.join("original").join(name), &content)?;
    let folder = format!("PocketLensCheck-{}", uuid::Uuid::new_v4());
    let phone = format!("/sdcard/Download/{folder}");
    let manager = Arc::new(FileManager::new(
        engine,
        None,
        local.to_string_lossy().into(),
    ));
    manager
        .edit(id, "phone", "/sdcard/Download", &folder, None, None)
        .await?;
    async fn run(manager: &Arc<FileManager>, request: FileRequest) -> Result<()> {
        let job = manager.enqueue(request)?;
        for _ in 0..1800 {
            let state = manager.jobs().into_iter().find(|j| j.id == job.id).unwrap();
            match state.state.as_str() {
                "completed" => return Ok(()),
                "error" | "cancelled" => return Err(state.error.unwrap()),
                "conflict" => return Err(AppError::new("fixture", "Unexpected fixture conflict")),
                _ => tokio::time::sleep(Duration::from_millis(100)).await,
            }
        }
        manager.cancel(&job.id)?;
        Err(AppError::new("fixture", "Fixture transfer timed out"))
    }
    let request =
        |operation: &str, source: &str, paths: Vec<String>, target: &str, directory: &str| {
            FileRequest {
                profile_id: id.into(),
                operation: operation.into(),
                source_side: source.into(),
                paths,
                target_side: target.into(),
                target_directory: directory.into(),
                confirmed_serial: None,
            }
        };
    run(
        &manager,
        request(
            "copy",
            "local",
            vec![local.join("original").to_string_lossy().into()],
            "phone",
            &phone,
        ),
    )
    .await?;
    let uploaded = format!("{phone}/original");
    let listing = manager.list(id, "phone", &uploaded, None).await?;
    assert!(
        listing
            .entries
            .iter()
            .any(|e| e.name == name && e.size == content.len() as u64)
    );
    manager
        .edit(
            id,
            "phone",
            &uploaded,
            "renamed Ñ.apk",
            Some(format!("{uploaded}/{name}")),
            None,
        )
        .await?;
    run(
        &manager,
        request(
            "copy",
            "phone",
            vec![uploaded.clone()],
            "local",
            &local.join("returned").to_string_lossy(),
        ),
    )
    .await?;
    assert_eq!(
        std::fs::read(local.join("returned/original/renamed Ñ.apk"))?,
        content
    );
    assert!(local.join("returned/original/empty").is_dir());
    std::fs::create_dir(local.join("moved"))?;
    run(
        &manager,
        request(
            "move",
            "phone",
            vec![format!("{uploaded}/renamed Ñ.apk")],
            "local",
            &local.join("moved").to_string_lossy(),
        ),
    )
    .await?;
    assert!(
        !manager
            .list(id, "phone", &uploaded, None)
            .await?
            .entries
            .iter()
            .any(|e| e.name.ends_with(".apk"))
    );
    let (_tx, cancel) = tokio::sync::watch::channel(false);
    assert_eq!(
        FileSystem::Local
            .hash(
                &local.join("moved/renamed Ñ.apk").to_string_lossy(),
                &cancel
            )
            .await?,
        FileSystem::Local
            .hash(
                &local.join("original").join(name).to_string_lossy(),
                &cancel
            )
            .await?
    );
    // Only the unique directory this harness just created is ever removed.
    assert!(phone.starts_with("/sdcard/Download/PocketLensCheck-"));
    run(
        &manager,
        request("delete", "phone", vec![phone.clone()], "phone", &phone),
    )
    .await?;
    println!(
        "File hardware check passed: both directions, recursive and empty folders, Unicode and shell-special names, APK copied as data, rename, SHA-256 verified move, fixture-only permanent deletion."
    );
    Ok(())
}
