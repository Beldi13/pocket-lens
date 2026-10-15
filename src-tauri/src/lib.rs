pub mod adb;
pub mod engine;
pub mod model;
pub mod store;

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
fn forget_device(engine: State<'_, Backend>, id: String) -> Result<()> {
    engine.forget(&id)
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
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
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
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .setup(|app| {
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
                    "quit" => app.exit(0),
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
            open_device,
            close_device,
            save_preferences,
            session_diagnostics,
            exit_app,
            open_source
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Pocket Lens");
    app.run(move |app, event| {
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
                    engine.shutdown().await;
                    shutdown.store(2, Ordering::SeqCst);
                    app.exit(0);
                });
            }
        }
    });
}
