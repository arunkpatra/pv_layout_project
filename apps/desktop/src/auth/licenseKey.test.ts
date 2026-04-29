/**
 * Tests for the licenseKey wrapper.
 *
 * Covers:
 *   1. Preview-mode (non-Tauri) — getLicenseKey returns the legacy preview
 *      sentinel; saveLicenseKey writes to sessionStorage; clearLicenseKey
 *      clears it. These are the paths exercised by vite preview / headless
 *      screenshot runs and by the entire desktop test suite (test-setup.ts
 *      strips __TAURI_INTERNALS__ so every test starts in non-Tauri mode).
 *   2. In-Tauri — the wrapper invokes the Rust commands via `@tauri-apps/api/core`.
 *      We mock the `invoke` import at the boundary so we never hit a real
 *      keyring (which would be platform-dependent and racy).
 *
 * The wrapper itself is thin (~60 lines) but it's the seam between the
 * React state machine and the OS credential store — a regression here
 * silently breaks the whole sign-in flow, so co-located tests earn their
 * keep.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("licenseKey wrapper — preview-mode (non-Tauri)", () => {
  beforeEach(() => {
    // Each test starts with no Tauri runtime + clean sessionStorage.
    // (test-setup.ts already deletes __TAURI_INTERNALS__ globally; we
    // re-assert here so this file is self-contained.)
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    window.sessionStorage.clear()
    // Reset module registry so the freshly-imported wrapper picks up the
    // current `inTauri()` state on each test.
    vi.resetModules()
  })

  it("getLicenseKey returns the legacy preview sentinel when not in Tauri", async () => {
    const { getLicenseKey, PREVIEW_LICENSE_KEY } = await import("./licenseKey")
    const key = await getLicenseKey()
    expect(key).toBe(PREVIEW_LICENSE_KEY)
  })

  it("saveLicenseKey writes the trimmed key to sessionStorage", async () => {
    const { saveLicenseKey } = await import("./licenseKey")
    await saveLicenseKey("sl_live_abc123")
    expect(window.sessionStorage.getItem("__solarlayout_license_key_preview__")).toBe(
      "sl_live_abc123"
    )
  })

  it("clearLicenseKey removes the sessionStorage entry", async () => {
    const { saveLicenseKey, clearLicenseKey } = await import("./licenseKey")
    await saveLicenseKey("sl_live_abc123")
    await clearLicenseKey()
    expect(
      window.sessionStorage.getItem("__solarlayout_license_key_preview__")
    ).toBeNull()
  })

  it("clearLicenseKey on an already-empty store is a no-op", async () => {
    const { clearLicenseKey } = await import("./licenseKey")
    await expect(clearLicenseKey()).resolves.toBeUndefined()
  })

  it("preview sentinels all match the sl_live_ prefix expected by isPlausibleLicenseKey", async () => {
    const {
      PREVIEW_LICENSE_KEY,
      PREVIEW_LICENSE_KEY_BASIC,
      PREVIEW_LICENSE_KEY_PRO,
      PREVIEW_LICENSE_KEY_PRO_PLUS,
    } = await import("./licenseKey")
    for (const k of [
      PREVIEW_LICENSE_KEY,
      PREVIEW_LICENSE_KEY_BASIC,
      PREVIEW_LICENSE_KEY_PRO,
      PREVIEW_LICENSE_KEY_PRO_PLUS,
    ]) {
      expect(k.startsWith("sl_live_")).toBe(true)
    }
  })
})

describe("licenseKey wrapper — in-Tauri (mocked invoke)", () => {
  // The shape of the mock: every test installs invokeMock as the default
  // `invoke` export of @tauri-apps/api/core. Each test then configures what
  // invokeMock returns.
  const invokeMock = vi.fn()

  beforeEach(() => {
    // Simulate Tauri runtime presence — wrapper's inTauri() check.
    ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    invokeMock.mockReset()
    vi.resetModules()
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
  })

  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    vi.doUnmock("@tauri-apps/api/core")
  })

  it("getLicenseKey calls the get_license Rust command", async () => {
    invokeMock.mockResolvedValue("sl_live_persisted")
    const { getLicenseKey } = await import("./licenseKey")
    const key = await getLicenseKey()
    expect(invokeMock).toHaveBeenCalledWith("get_license")
    expect(key).toBe("sl_live_persisted")
  })

  it("getLicenseKey returns null when the keyring has no entry", async () => {
    invokeMock.mockResolvedValue(null)
    const { getLicenseKey } = await import("./licenseKey")
    expect(await getLicenseKey()).toBeNull()
  })

  it("saveLicenseKey passes the key through to save_license", async () => {
    invokeMock.mockResolvedValue(undefined)
    const { saveLicenseKey } = await import("./licenseKey")
    await saveLicenseKey("sl_live_xyz")
    expect(invokeMock).toHaveBeenCalledWith("save_license", { key: "sl_live_xyz" })
  })

  it("clearLicenseKey calls the clear_license Rust command", async () => {
    invokeMock.mockResolvedValue(undefined)
    const { clearLicenseKey } = await import("./licenseKey")
    await clearLicenseKey()
    expect(invokeMock).toHaveBeenCalledWith("clear_license")
  })

  it("getLicenseKey propagates a Rust-side error so the caller can show it", async () => {
    invokeMock.mockRejectedValue(new Error("read keyring entry: NoStorageAccess"))
    const { getLicenseKey } = await import("./licenseKey")
    await expect(getLicenseKey()).rejects.toThrow("NoStorageAccess")
  })

  it("saveLicenseKey propagates a Rust-side error (e.g. empty key rejected)", async () => {
    invokeMock.mockRejectedValue(new Error("license key is empty"))
    const { saveLicenseKey } = await import("./licenseKey")
    await expect(saveLicenseKey("")).rejects.toThrow("license key is empty")
  })
})
