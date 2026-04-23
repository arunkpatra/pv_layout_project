/**
 * Thin wrapper around the Tauri keyring commands.
 *
 * Rust-side: apps/desktop/src-tauri/src/keyring.rs
 * Tauri commands: get_license / save_license / clear_license
 *
 * Outside the Tauri runtime (headless screenshot / vite preview) these
 * functions fall back to in-memory storage so the design-preview fallback
 * in App.tsx can still render without a real OS keychain.
 */
import { invoke } from "@tauri-apps/api/core"

const KEYRING_KEY = "__solarlayout_license_key_preview__"

/**
 * Sentinel key recognised in preview mode (vite preview / headless
 * screenshot rig). Matches the sl_live_ prefix so isPlausibleLicenseKey
 * still accepts it; the entitlements hook returns stubbed data for it
 * without hitting api.solarlayout.in.
 */
export const PREVIEW_LICENSE_KEY = "sl_live_preview_mode_design_review_only"

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function getLicenseKey(): Promise<string | null> {
  if (!inTauri()) {
    // Preview mode — skip the license dialog entirely so design reviewers
    // see the populated shell, not the blocking dialog. Real Tauri runs
    // always hit the keyring.
    return PREVIEW_LICENSE_KEY
  }
  return (await invoke<string | null>("get_license")) ?? null
}

export async function saveLicenseKey(key: string): Promise<void> {
  if (!inTauri()) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(KEYRING_KEY, key)
    }
    return
  }
  await invoke<void>("save_license", { key })
}

export async function clearLicenseKey(): Promise<void> {
  if (!inTauri()) {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(KEYRING_KEY)
    }
    return
  }
  await invoke<void>("clear_license")
}
