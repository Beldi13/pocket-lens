pub mod adb;
pub mod artwork;
pub mod engine;
pub mod file_io;
pub mod files;
pub mod model;
pub mod screen;
pub mod store;
#[cfg(feature = "diagnostics")]
mod update_check;
pub mod updates;

use engine::Engine;
use model::*;
use std::sync::{
    Arc,
    atomic::{AtomicU8, Ordering},
};
use tauri::{
    Emitter, Manager, State,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

type Backend = Arc<Engine>;
type FileBackend = Arc<files::FileManager>;
#[tauri::command]
fn snapshot(app: tauri::AppHandle, engine: State<'_, Backend>) -> AppSnapshot {
    engine.snapshot(app.autolaunch().is_enabled().unwrap_or(false))
}
#[tauri::command]
async fn discover(engine: State<'_, Backend>) -> Result<Discovery> {
    engine.refresh().await
}
#[tauri::command]
async fn connect_device(engine: State<'_, Backend>, endpoint: String) -> Result<DetectedDevice> {
    let device = engine.adb.connect(endpoint.trim()).await?;
    let _ = engine.refresh().await;
    Ok(device)
}
#[tauri::command]
async fn pair_device(engine: State<'_, Backend>, endpoint: String, code: String) -> Result<()> {
    engine.adb.pair(endpoint.trim(), code.trim()).await?;
    let _ = engine.refresh().await;
    Ok(())
}
#[tauri::command]
async fn prepare_wifi(engine: State<'_, Backend>, serial: String) -> Result<DetectedDevice> {
    let device = engine.adb.prepare_wifi(&serial).await?;
    let _ = engine.refresh().await;
    Ok(device)
}
#[tauri::command]
async fn register_device(
    engine: State<'_, Backend>,
    serial: String,
    name: String,
    options: MirrorOptions,
    associate_id: Option<String>,
) -> Result<DeviceProfile> {
    engine.register(serial, name, options, associate_id).await
}
#[tauri::command]
fn edit_device(
    engine: State<'_, Backend>,
    id: String,
    name: String,
    options: MirrorOptions,
) -> Result<()> {
    engine.edit(id, name, options)
}
#[tauri::command]
fn forget_device(
    engine: State<'_, Backend>,
    files: State<'_, FileBackend>,
    id: String,
) -> Result<()> {
    if files.has_active(Some(&id)) {
        return Err(file_io::issue("file_busy"));
    }
    engine.forget(&id)
}
#[tauri::command]
async fn update_artwork(
    engine: State<'_, Backend>,
    id: String,
    path: Option<String>,
) -> Result<bool> {
    engine.update_artwork(&id, path).await
}
#[tauri::command]
async fn remove_artwork(engine: State<'_, Backend>, id: String) -> Result<()> {
    engine.remove_artwork(&id).await
}
#[tauri::command]
async fn open_device(
    engine: State<'_, Backend>,
    id: String,
    confirmed_serial: Option<String>,
) -> Result<SessionStatus> {
    engine.inner().open(id, confirmed_serial).await
}
#[tauri::command]
async fn close_device(engine: State<'_, Backend>, id: String) -> Result<()> {
    engine.stop(&id).await
}
#[tauri::command]
async fn screen_power(engine: State<'_, Backend>, id: String, on: bool) -> Result<()> {
    engine.screen_power(&id, on).await
}
#[tauri::command]
fn file_defaults(files: State<'_, FileBackend>, id: String) -> (String, String) {
    files.defaults(&id)
}
#[tauri::command]
fn file_jobs(files: State<'_, FileBackend>) -> Vec<files::FileJob> {
    files.jobs()
}
#[tauri::command]
async fn list_files(
    files: State<'_, FileBackend>,
    id: String,
    side: String,
    path: String,
    confirmed_serial: Option<String>,
) -> Result<file_io::DirectoryListing> {
    files.list(&id, &side, &path, confirmed_serial).await
}
#[tauri::command]
async fn edit_file(
    files: State<'_, FileBackend>,
    id: String,
    side: String,
    directory: String,
    name: String,
    source: Option<String>,
    confirmed_serial: Option<String>,
) -> Result<()> {
    files
        .edit(&id, &side, &directory, &name, source, confirmed_serial)
        .await
}
#[tauri::command]
fn start_file_job(
    files: State<'_, FileBackend>,
    request: files::FileRequest,
) -> Result<files::FileJob> {
    files.inner().enqueue(request)
}
#[tauri::command]
fn cancel_file_job(files: State<'_, FileBackend>, id: String) -> Result<()> {
    files.cancel(&id)
}
#[tauri::command]
fn resolve_file_conflict(
    files: State<'_, FileBackend>,
    id: String,
    choice: String,
    all: bool,
) -> Result<()> {
    files.resolve(&id, choice, all)
}
#[tauri::command]
fn update_status(updates: State<'_, updates::Updates>) -> updates::UpdateStatus {
    updates.status()
}
#[tauri::command]
async fn check_updates(
    app: tauri::AppHandle,
    updates: State<'_, updates::Updates>,
) -> Result<updates::UpdateStatus> {
    updates.check(&app).await
}
#[tauri::command]
async fn download_update(
    app: tauri::AppHandle,
    updates: State<'_, updates::Updates>,
) -> Result<updates::UpdateStatus> {
    updates.download(&app).await
}
#[tauri::command]
async fn install_update(
    app: tauri::AppHandle,
    engine: State<'_, Backend>,
    files: State<'_, FileBackend>,
    updates: State<'_, updates::Updates>,
    cancel_jobs: bool,
) -> Result<()> {
    files.block_and_cancel(cancel_jobs).await?;
    if let Err(error) = engine.prepare_install().await {
        files.unblock();
        return Err(error);
    }
    if let Err(error) = updates.install(&app) {
        files.unblock();
        engine.resume_operations();
        return Err(error);
    }
    Ok(())
}
#[tauri::command]
fn save_preferences(
    app: tauri::AppHandle,
    engine: State<'_, Backend>,
    language: String,
    theme: String,
    autostart: bool,
) -> Result<()> {
    engine.preferences(language, theme)?;
    let launch = app.autolaunch();
    if autostart {
        launch.enable()
    } else {
        launch.disable()
    }
    .map_err(|e| AppError::new("autostart", e.to_string()))?;
    Ok(())
}
#[tauri::command]
fn session_diagnostics(engine: State<'_, Backend>, id: String) -> String {
    engine.diagnostics(&id)
}
#[tauri::command]
async fn exit_app(
    app: tauri::AppHandle,
    files: State<'_, FileBackend>,
    cancel_jobs: Option<bool>,
) -> Result<()> {
    files.block_and_cancel(cancel_jobs.unwrap_or(false)).await?;
    app.exit(0);
    Ok(())
}
#[tauri::command]
fn open_source(app: tauri::AppHandle) -> Result<()> {
    app.opener()
        .open_url("https://github.com/Beldi13/pocket-lens", None::<&str>)
        .map_err(|e| AppError::new("io", e.to_string()))
}

fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
pub fn run() {
    let shutdown = Arc::new(AtomicU8::new(0));
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .setup(|app| {
            #[cfg(feature = "diagnostics")]
            if app.config().identifier == "dev.beldi.pocketlens.updatecheck" {
                return update_check::setup(app);
            }
            let vendor = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("vendor/scrcpy")
            } else {
                app.path().resource_dir()?.join("scrcpy")
            };
            for file in [
                "adb.exe",
                "scrcpy.exe",
                "scrcpy-server",
                "bundle-manifest.json",
                "pocket-lens-wallpaper.jar",
                "pocket-lens-files.jar",
            ] {
                if !vendor.join(file).exists() {
                    return Err(std::io::Error::other(format!(
                        "Missing {file}. Run npm run vendor:prepare before building."
                    ))
                    .into());
                }
            }
            let engine = Arc::new(
                Engine::new(
                    adb::Adb::new(&vendor),
                    app.path().app_config_dir()?.join("settings.json"),
                    Some(app.handle().clone()),
                )
                .map_err(|e| std::io::Error::other(e.message))?,
            );
            if !engine.settings().preferences.autostart_initialized
                && app.autolaunch().enable().is_ok()
            {
                engine
                    .initialized_autostart()
                    .map_err(|e| std::io::Error::other(e.message))?;
            }
            app.manage(engine.clone());
            app.manage(Arc::new(files::FileManager::new(
                engine.clone(),
                Some(app.handle().clone()),
                app.path().download_dir()?.to_string_lossy().into(),
            )));
            app.manage(updates::Updates::default());
            let artwork_engine = engine.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    artwork_engine.refresh_artwork().await;
                    tokio::time::sleep(std::time::Duration::from_secs(6)).await;
                }
            });
            let open =
                MenuItem::with_id(app, "open", "Abrir / Open Pocket Lens", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir / Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Pocket Lens")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    "quit" => {
                        if app.state::<FileBackend>().has_active(None) {
                            show(app);
                            let _ = app.emit("exit://requested", true);
                        } else {
                            app.exit(0);
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Err(error) = engine.refresh().await
                        && let Some(app) = &engine.app
                    {
                        let _ = app.emit("engine://error", error);
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(6)).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            discover,
            connect_device,
            pair_device,
            prepare_wifi,
            register_device,
            edit_device,
            forget_device,
            update_artwork,
            remove_artwork,
            open_device,
            close_device,
            screen_power,
            file_defaults,
            file_jobs,
            list_files,
            edit_file,
            start_file_job,
            cancel_file_job,
            resolve_file_conflict,
            update_status,
            check_updates,
            download_update,
            install_update,
            save_preferences,
            session_diagnostics,
            exit_app,
            open_source
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Pocket Lens");
    app.run(move |app, event| {
        #[cfg(feature = "diagnostics")]
        if app.config().identifier == "dev.beldi.pocketlens.updatecheck" {
            return;
        }
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if shutdown.load(Ordering::SeqCst) == 2 {
                return;
            }
            api.prevent_exit();
            if shutdown
                .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                let engine = app.state::<Backend>().inner().clone();
                let app = app.clone();
                let shutdown = shutdown.clone();
                tauri::async_runtime::spawn(async move {
                    let files = app.state::<FileBackend>().inner().clone();
                    if files.block_and_cancel(true).await.is_err() {
                        shutdown.store(0, Ordering::SeqCst);
                        show(&app);
                        let _ = app.emit("engine://error", file_io::issue("file_busy"));
                        return;
                    }
                    engine.shutdown().await;
                    shutdown.store(2, Ordering::SeqCst);
                    app.exit(0);
                });
            }
        }
    });
}
