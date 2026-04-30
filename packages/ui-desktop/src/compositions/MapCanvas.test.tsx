// Regression guard for the S8 CSS Cascade Layers bug.
//
// MapLibre's stylesheet adds `.maplibregl-map { position: relative }` to
// the container element on `new maplibregl.Map(...)`. That rule is
// unlayered, so per the CSS Cascade Layers spec it BEATS Tailwind's
// layered `.absolute { position: absolute }` at equal specificity. The
// fix in MapCanvas was to size the container with `w-full h-full` (which
// MapLibre's CSS doesn't override) instead of `absolute inset-0`.
//
// This test pins the contract: if anyone refactors MapCanvas back to
// `absolute inset-0`, the canvas collapses to a 300px-tall letterbox in
// real life — and this test will fail to remind them why.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import { MapCanvas } from "./MapCanvas"
import { ThemeProvider } from "./ThemeProvider"

// Mock maplibre-gl so the test runs in happy-dom (no WebGL).
vi.mock("maplibre-gl", () => {
  class FakeMap {
    on() {}
    off() {}
    once() {}
    addControl() {}
    remove() {}
    setStyle() {}
    getStyle() {
      return { sources: {}, layers: [] }
    }
    getCanvas() {
      return { clientWidth: 0, clientHeight: 0, width: 0, height: 0 } as HTMLCanvasElement
    }
    getSource() {
      return undefined
    }
    fitBounds() {}
    getCenter() {
      return { toArray: () => [0, 0] }
    }
    getZoom() {
      return 1
    }
  }
  class FakeScale {}
  return {
    default: { Map: FakeMap, ScaleControl: FakeScale },
  }
})

// CSS import is stubbed — we don't need the stylesheet for this test.
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}))

beforeEach(() => {
  // Each test starts with a clean DOM (test-setup runs cleanup() in
  // afterEach).
})

describe("MapCanvas — cascade-layer regression guard", () => {
  it("sizes the MapLibre container with w-full h-full, NOT absolute inset-0", () => {
    const { container } = render(
      <ThemeProvider>
        <div style={{ width: 800, height: 600 }}>
          <MapCanvas />
        </div>
      </ThemeProvider>
    )

    // The MapCanvas wrapper has the `relative w-full h-full` outer.
    // The MapLibre container is the sole non-overlay direct child.
    // Under the bug, this child carried className "absolute inset-0".
    // Under the fix, it carries "w-full h-full".
    const wrapper = container.querySelector(".relative.w-full.h-full")
    expect(wrapper).not.toBeNull()
    const mapContainer = wrapper!.firstElementChild as HTMLElement
    expect(mapContainer).not.toBeNull()

    // The CRITICAL assertion: the container must have w-full h-full and
    // must NOT have `absolute inset-0`. If a future refactor adds them
    // back, the canvas will collapse to ~300px tall in real Tauri.
    expect(mapContainer.className).toContain("w-full")
    expect(mapContainer.className).toContain("h-full")
    expect(mapContainer.className).not.toContain("absolute")
    expect(mapContainer.className).not.toContain("inset-0")
  })
})
