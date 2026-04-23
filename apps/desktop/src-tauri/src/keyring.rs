//! OS credential-store bridge for the SolarLayout license key.
//!
//! Wraps the `keyring` crate so the rest of the shell can read, write, or
//! clear the license key without touching platform-specific APIs. Backends:
//!   - macOS   → Keychain (Security framework)
//!   - Linux   → Secret Service (libsecret)
//!   - Windows → Credential Manager (wincred)
//!
//! Port of `PVlayout_Advance/auth/key_store.py` into Rust. Same service /
//! account naming kept identical so a user who already had the Python app
//! installed wouldn't see a duplicate entry — except that we moved from
//! `solarlayout` to `solarlayout-desktop` as the service name to signal
//! the platform boundary. A user migrating from the old app re-enters
//! their key once; no silent data migration.
//!
//! Exposed as three Tauri commands:
//!   - `get_license()`     → Ok(Some(key)) / Ok(None) / Err(msg)
//!   - `save_license(key)` → Ok(()) / Err(msg)
//!   - `clear_license()`   → Ok(())  — idempotent; missing entry is a no-op
//!
//! Errors are stringified (not structured) because the frontend shows
//! them verbatim to the user — a native keychain failure is already
//! rare and descriptive. No sensitive data is logged.

use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "solarlayout-desktop";
const ACCOUNT: &str = "license_key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("open keyring entry: {e}"))
}

#[tauri::command]
pub fn get_license() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(format!("read keyring entry: {e}")),
    }
}

#[tauri::command]
pub fn save_license(key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("license key is empty".into());
    }
    entry()?
        .set_password(key.trim())
        .map_err(|e| format!("write keyring entry: {e}"))
}

#[tauri::command]
pub fn clear_license() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()), // already absent — idempotent
        Err(e) => Err(format!("delete keyring entry: {e}")),
    }
}
