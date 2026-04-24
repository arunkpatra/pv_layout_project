// Vitest setup for @solarlayout/desktop.
//
// Imports jest-dom matchers and stubs the browser + Tauri APIs that the
// app touches but happy-dom doesn't implement.

import "@testing-library/jest-dom/vitest"
import { vi, afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
})

// matchMedia stub — ThemeProvider needs it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// ResizeObserver stub — Radix components subscribe.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// Default to "not running inside Tauri" — the app's `inTauri()` helper
// checks for `window.__TAURI_INTERNALS__`. Tests that need to simulate
// the Tauri runtime can override this in their own setup.
//
// We do NOT mock @tauri-apps/api/core etc. globally — tests that import
// those modules should mock them at the import boundary using vi.mock().
delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
