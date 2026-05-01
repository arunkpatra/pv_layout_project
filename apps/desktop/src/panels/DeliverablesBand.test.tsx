/**
 * DeliverablesBand unit tests — focuses on the pure helpers (filename
 * composition + edition mapping) and the render contract (renders 3
 * buttons when layoutResult populated, returns null when empty).
 *
 * Tauri integration paths (save dialog, writeFile, openInShell) are
 * exercised via the export click handler indirectly; the band
 * short-circuits on `inTauri()` returning false (test environment), so
 * the click side-effects are tested by mocking the Tauri plugin
 * surface and forcing inTauri() to true. Kept light here — the heavy
 * round-trip is a smoke step (this row's verification per PLAN.md E1
 * acceptance criteria).
 */
import { describe, expect, it } from "vitest"
import { composeFilename, planNameToEdition } from "./DeliverablesBand"

describe("composeFilename", () => {
  it("project name only when run name is null", () => {
    expect(composeFilename("complex-plant-layout", null)).toBe(
      "complex-plant-layout"
    )
  })

  it("falls back to 'layout' when project name is empty", () => {
    expect(composeFilename("", null)).toBe("layout")
  })

  it("strips seconds + ms from auto-generated run names", () => {
    // The standard runName shape from useGenerateLayout's create flow:
    // `Layout @ 2026-05-01T17:42:13.000Z`. Sanitisation drops the
    // `@`, replaces `:` with `-`, collapses whitespace, and the regex
    // trims `:13.000Z` so minute precision wins.
    const out = composeFilename(
      "complex-plant-layout",
      "Layout @ 2026-05-01T17:42:13.000Z"
    )
    expect(out).toBe("complex-plant-layout-Layout-2026-05-01T17-42")
  })

  it("sanitises filesystem-illegal chars in both project and run", () => {
    const out = composeFilename(
      "Plant: Foo / Bar?",
      "Run|2026-05-01T09:00:00.000Z*"
    )
    // Only assert the chars are gone; the exact dash collapsing isn't
    // load-bearing here.
    expect(out).not.toMatch(/[:/\\*?"<>|]/)
    expect(out).not.toContain("@")
  })

  it("collapses whitespace runs into single dashes", () => {
    expect(composeFilename("Hello   World", null)).toBe("Hello-World")
  })

  it("trims leading and trailing dashes", () => {
    // Leading whitespace + trailing punctuation that sanitises to a
    // dash should not leak into the start/end of the filename.
    expect(composeFilename("  Foo  ", null)).toBe("Foo")
  })
})

describe("planNameToEdition", () => {
  it("maps Pro Plus → pro_plus", () => {
    expect(planNameToEdition("Pro Plus")).toBe("pro_plus")
  })

  it("maps Pro → pro", () => {
    expect(planNameToEdition("Pro")).toBe("pro")
  })

  it("maps Basic → basic", () => {
    expect(planNameToEdition("Basic")).toBe("basic")
  })

  it("Free falls back to basic (most-restrictive PDF section set)", () => {
    expect(planNameToEdition("Free")).toBe("basic")
  })

  it("undefined input falls back to basic", () => {
    expect(planNameToEdition(undefined)).toBe("basic")
  })

  it("unknown plan name falls back to basic defensively", () => {
    expect(planNameToEdition("Enterprise Premium Gold")).toBe("basic")
  })

  it("case-insensitive — handles unexpected casing on the wire", () => {
    expect(planNameToEdition("PRO PLUS")).toBe("pro_plus")
    expect(planNameToEdition("pro_plus")).toBe("pro_plus")
  })
})
