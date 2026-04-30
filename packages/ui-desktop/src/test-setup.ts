// Vitest setup for the @solarlayout/ui package.
//
// Imports jest-dom matchers and stubs the browser APIs that the UI
// components touch but happy-dom doesn't implement.

import "@testing-library/jest-dom/vitest"
import { vi, afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
})

// matchMedia stub — ThemeProvider reads `(prefers-color-scheme: dark)`
// at mount; happy-dom doesn't implement matchMedia.
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

// ResizeObserver stub — Radix popover/dropdown components subscribe to
// it for positioning. happy-dom doesn't ship one.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
