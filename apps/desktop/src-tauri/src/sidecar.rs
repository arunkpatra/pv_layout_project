//! Sidecar lifecycle: spawn pvlayout-engine, parse its READY line,
//! expose `{host, port, token, version}` to the React shell.
//!
//! Two spawn modes, switched by `cfg!(debug_assertions)`:
//!
//! * **Dev** (Cargo debug profile, i.e. `bun run tauri dev`):
//!   launches `uv run python -m pvlayout_engine.main` with the working
//!   directory set to `../../../python/pvlayout_engine`. This keeps the
//!   inner loop fast — no PyInstaller rebuild on every Python change.
//!
//! * **Release** (Cargo release profile, i.e. `bun run tauri build`):
//!   launches the `pvlayout-engine` sidecar binary that Tauri embedded
//!   into the app bundle via `externalBin`. Cold start is ~5–10s while
//!   PyInstaller unpacks `_MEIPASS`; the React shell shows a splash
//!   placeholder during that window.
//!
//! Shutdown: the spawned child is killed on app exit via the guard stored
//! in `SidecarState`. We also forward SIGTERM-style cleanup through
//! Tauri's `on_window_event` so a window close is immediate.

use std::sync::Arc;
use std::time::Duration;

use rand::distributions::Alphanumeric;
use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{oneshot, Mutex, RwLock};
use tokio::time;

/// Config the React shell needs to connect to the sidecar.
///
/// Serialised to JSON and returned from the `get_sidecar_config` command.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SidecarConfig {
    pub host: String,
    pub port: u16,
    pub token: String,
    pub version: String,
}

/// Shape of the `READY {...}` line the Python sidecar writes to stdout.
#[derive(Debug, Deserialize)]
struct ReadyPayload {
    #[serde(default)]
    ready: bool,
    host: String,
    port: u16,
    token: String,
    #[serde(default)]
    version: String,
}

/// Tauri-managed state: a reader of the resolved config (ready/waiting/failed)
/// plus the child process handle we must kill on shutdown.
#[derive(Default)]
pub struct SidecarState {
    pub config: Arc<RwLock<ConfigState>>,
    pub child: Arc<Mutex<Option<CommandChild>>>,
}

#[derive(Default, Clone)]
pub enum ConfigState {
    #[default]
    Waiting,
    Ready(SidecarConfig),
    Failed(String),
}

/// Spawn the sidecar, install a stdout reader that publishes the resolved
/// config on the state, and keep the child handle alive for later kill.
///
/// Returns immediately — the sidecar runs in the background. The React
/// shell polls `get_sidecar_config` which blocks until state becomes
/// Ready or Failed.
pub async fn spawn(app: &AppHandle) {
    let state = app.state::<SidecarState>();
    let token = generate_session_token();

    let shell = app.shell();

    // --- Build the Command, dev vs release ----------------------------------
    #[cfg(debug_assertions)]
    let command = {
        // Dev mode: invoke the sidecar's venv python directly. We avoid
        // `uv run` because it stays as a parent process — when we later
        // SIGKILL our immediate child, `uv` dies abruptly and the Python
        // grandchild becomes an orphan reparented to launchd/init.
        // Running the venv's python directly makes it our direct child
        // and guarantees clean shutdown.
        //
        // CARGO_MANIFEST_DIR is baked in at compile time and points at
        // apps/desktop/src-tauri/; walk up to repo root, then into
        // python/pvlayout_engine/.
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let engine_dir = manifest_dir
            .join("..")
            .join("..")
            .join("..")
            .join("python")
            .join("pvlayout_engine")
            .canonicalize()
            .unwrap_or_else(|_| {
                manifest_dir
                    .join("..")
                    .join("..")
                    .join("..")
                    .join("python")
                    .join("pvlayout_engine")
            });

        let python_bin = engine_dir.join(".venv").join("bin").join("python");

        log::info!(
            "dev mode: spawning `{} -m pvlayout_engine.main` in {}",
            python_bin.display(),
            engine_dir.display()
        );

        if !python_bin.exists() {
            let msg = format!(
                "dev-mode venv python not found at {}. Run `cd python/pvlayout_engine && uv sync --extra dev` first.",
                python_bin.display()
            );
            log::error!("{}", msg);
            *state.config.write().await = ConfigState::Failed(msg);
            return;
        }

        shell
            .command(python_bin.to_string_lossy().to_string())
            .args(["-m", "pvlayout_engine.main"])
            .current_dir(engine_dir)
            .env("PVLAYOUT_SIDECAR_TOKEN", &token)
            .env("PVLAYOUT_PARENT_PID", std::process::id().to_string())
    };

    #[cfg(not(debug_assertions))]
    let command = {
        log::info!("release mode: spawning bundled pvlayout-engine sidecar");
        match shell.sidecar("pvlayout-engine") {
            Ok(cmd) => cmd
                .env("PVLAYOUT_SIDECAR_TOKEN", &token)
                .env("PVLAYOUT_PARENT_PID", std::process::id().to_string()),
            Err(err) => {
                let msg = format!("failed to resolve sidecar binary: {err}");
                log::error!("{}", msg);
                *state.config.write().await = ConfigState::Failed(msg);
                return;
            }
        }
    };

    // --- Spawn and read stdout until READY ---------------------------------
    let (mut rx, child) = match command.spawn() {
        Ok((rx, child)) => (rx, child),
        Err(err) => {
            let msg = format!("failed to spawn sidecar: {err}");
            log::error!("{}", msg);
            *state.config.write().await = ConfigState::Failed(msg);
            return;
        }
    };

    *state.child.lock().await = Some(child);

    let state_clone = state.config.clone();
    let (ready_tx, ready_rx) = oneshot::channel();
    let mut ready_tx = Some(ready_tx);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line = String::from_utf8_lossy(&line).into_owned();
                    let trimmed = line.trim_end();
                    log::debug!("sidecar stdout: {}", trimmed);

                    if let Some(payload) = parse_ready_line(trimmed) {
                        log::info!(
                            "sidecar READY on {}:{} (version {})",
                            payload.host, payload.port, payload.version
                        );
                        let cfg = SidecarConfig {
                            host: payload.host,
                            port: payload.port,
                            token: payload.token,
                            version: payload.version,
                        };
                        *state_clone.write().await = ConfigState::Ready(cfg);
                        if let Some(tx) = ready_tx.take() {
                            let _ = tx.send(());
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    let line = String::from_utf8_lossy(&line).into_owned();
                    // S5 diagnostic: pass-through at info! so /health
                    // request logs are visible during the gate. Can drop
                    // to debug! once we're confident the path works.
                    log::info!("sidecar: {}", line.trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    log::warn!(
                        "sidecar terminated code={:?} signal={:?}",
                        payload.code, payload.signal
                    );
                    let mut guard = state_clone.write().await;
                    if matches!(*guard, ConfigState::Waiting) {
                        *guard = ConfigState::Failed(format!(
                            "sidecar exited before READY (code={:?}, signal={:?})",
                            payload.code, payload.signal
                        ));
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    // Bound the wait with a generous cold-start timeout.
    // PyInstaller --onefile on macOS takes ~10s to unpack; CI runners can be
    // slower. 45s is the upper bound before we declare the sidecar broken.
    let state_clone = state.config.clone();
    tauri::async_runtime::spawn(async move {
        let res = time::timeout(Duration::from_secs(45), ready_rx).await;
        if res.is_err() {
            let mut guard = state_clone.write().await;
            if matches!(*guard, ConfigState::Waiting) {
                *guard = ConfigState::Failed(
                    "sidecar did not report READY within 45 seconds".into(),
                );
            }
        }
    });
}

pub async fn shutdown(state: &SidecarState) {
    if let Some(child) = state.child.lock().await.take() {
        log::info!("killing sidecar");
        if let Err(err) = child.kill() {
            log::warn!("sidecar kill failed: {}", err);
        }
    }
}

fn generate_session_token() -> String {
    // 32 URL-safe characters → ~190 bits of entropy. Matches the minimum
    // the sidecar enforces (16 chars).
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

fn parse_ready_line(line: &str) -> Option<ReadyPayload> {
    let rest = line.strip_prefix("READY ")?;
    let payload: ReadyPayload = serde_json::from_str(rest).ok()?;
    if !payload.ready {
        return None;
    }
    Some(payload)
}
