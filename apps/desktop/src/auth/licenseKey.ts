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
 * Sentinel keys recognised in preview mode (vite preview / headless
 * screenshot rig). All match the sl_live_ prefix so isPlausibleLicenseKey
 * still accepts them; the entitlements hook returns tier-accurate stubbed
 * data for each without hitting api.solarlayout.in.
 *
 * Three tier variants mirror the renewable_energy seed plans per ADR-0005.
 * The legacy `PREVIEW_LICENSE_KEY` resolves to Pro Plus for backward
 * compatibility with design-review flows that didn't need tier switching.
 */
export const PREVIEW_LICENSE_KEY_BASIC = "sl_live_preview_basic"
export const PREVIEW_LICENSE_KEY_PRO = "sl_live_preview_pro"
export const PREVIEW_LICENSE_KEY_PRO_PLUS = "sl_live_preview_pro_plus"
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
