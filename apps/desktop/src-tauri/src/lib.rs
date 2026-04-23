//! Tauri app entry.
//!
//! Registers the sidecar plugin, wires up state, and exposes a single
//! command (`get_sidecar_config`) that the React shell polls for the
//! host/port/token the Python sidecar is listening on.

mod keyring;
mod menu;
mod sidecar;

use sidecar::{ConfigState, SidecarConfig, SidecarState};
use std::time::Duration;
use tauri::{Manager, RunEvent, WindowEvent};
use tokio::time;

/// Polls the managed `SidecarState` until the sidecar transitions out of
/// `Waiting`. Returns the resolved config or a human-readable failure.
///
/// The React shell calls this once on mount. If the sidecar is still
/// booting when the call arrives, the poll loop covers the cold-start
/// window; if it has already reported READY, the first read returns.
#[tauri::command]
async fn get_sidecar_config(
    state: tauri::State<'_, SidecarState>,
) -> Result<SidecarConfig, String> {
    // 60-iteration poll × 500ms = 30 s upper bound on the command itself.
    // The sidecar spawn has its own 45 s internal timeout; this one just
    // bounds how long the Tauri IPC call may block the React caller.
    for _ in 0..60 {
        {
            let guard = state.config.read().await;
            match &*guard {
                ConfigState::Ready(cfg) => return Ok(cfg.clone()),
                ConfigState::Failed(msg) => return Err(msg.clone()),
                ConfigState::Waiting => {}
            }
        }
        time::sleep(Duration::from_millis(500)).await;
    }
    Err("timed out waiting for sidecar to become ready".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SidecarState::default())
        .invoke_handler(tauri::generate_handler![
            get_sidecar_config,
            keyring::get_license,
            keyring::save_license,
            keyring::clear_license,
        ])
        .setup(|app| {
            env_logger::Builder::from_env(
                env_logger::Env::default().default_filter_or("info"),
            )
            .format_timestamp_secs()
            .try_init()
            .ok();

            // Native menu — S6. Event IDs are forwarded to the frontend
            // as `menu:<id>` events; progressive wiring lands in S8+.
            let menu = menu::build(app.handle())?;
            app.set_menu(menu)?;
            menu::wire_events(app.handle());

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                sidecar::spawn(&handle).await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                // The last window is gone — kill the sidecar before the
                // Tauri runloop has a chance to exit uncleanly.
                if window.label() == "main" {
                    let handle = window.app_handle().clone();
                    tauri::async_runtime::block_on(async move {
                        let state = handle.state::<SidecarState>();
                        sidecar::shutdown(&state).await;
                    });
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running Tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                // Belt-and-braces — `on_window_event` usually covers it,
                // but RunEvent::Exit is the final guarantee.
                let state = app_handle.state::<SidecarState>();
                tauri::async_runtime::block_on(async move {
                    sidecar::shutdown(&state).await;
                });
            }
        });
}
