import { describe, it, expect, beforeEach } from "vitest"
import type { ParsedKMZ } from "@solarlayout/sidecar-client"
import { useProjectStore } from "./project"

const sampleKmz: ParsedKMZ = {
  boundaries: [
    {
      name: "Plant 1",
      coords: [
        [76.4, 14.8],
        [76.5, 14.8],
        [76.5, 14.9],
        [76.4, 14.9],
        [76.4, 14.8],
      ],
      obstacles: [],
      line_obstructions: [],
    },
  ],
  centroid_lat: 14.85,
  centroid_lon: 76.45,
}

describe("useProjectStore", () => {
  beforeEach(() => {
    // Reset between tests — Zustand stores survive module hot-reload but
    // need explicit reset between Vitest test cases.
    useProjectStore.getState().clearProject()
  })

  it("starts with null project", () => {
    expect(useProjectStore.getState().project).toBeNull()
  })

  it("setProject sets the active project", () => {
    useProjectStore.getState().setProject({
      kmz: sampleKmz,
      fileName: "kudlugi.kmz",
    })
    const state = useProjectStore.getState()
    expect(state.project).not.toBeNull()
    expect(state.project!.fileName).toBe("kudlugi.kmz")
    expect(state.project!.kmz.boundaries).toHaveLength(1)
  })

  it("clearProject resets to null", () => {
    useProjectStore.getState().setProject({
      kmz: sampleKmz,
      fileName: "x.kmz",
    })
    useProjectStore.getState().clearProject()
    expect(useProjectStore.getState().project).toBeNull()
  })

  it("setProject replaces, doesn't merge", () => {
    useProjectStore.getState().setProject({
      kmz: sampleKmz,
      fileName: "first.kmz",
    })
    const second: ParsedKMZ = { ...sampleKmz, centroid_lat: 21.7 }
    useProjectStore.getState().setProject({
      kmz: second,
      fileName: "second.kmz",
    })
    expect(useProjectStore.getState().project!.fileName).toBe("second.kmz")
    expect(useProjectStore.getState().project!.kmz.centroid_lat).toBe(21.7)
  })

  it("subscribers fire on project changes", () => {
    const seen: (string | null)[] = []
    const unsub = useProjectStore.subscribe(
      (s) => s.project?.fileName ?? null,
      (fileName) => seen.push(fileName)
    )
    useProjectStore.getState().setProject({ kmz: sampleKmz, fileName: "a.kmz" })
    useProjectStore.getState().setProject({ kmz: sampleKmz, fileName: "b.kmz" })
    useProjectStore.getState().clearProject()
    unsub()
    // subscribeWithSelector fires only when the selected slice changes.
    expect(seen).toEqual(["a.kmz", "b.kmz", null])
  })
})
