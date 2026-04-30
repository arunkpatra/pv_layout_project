import { describe, it, expect, beforeEach } from "vitest"
import type { ParsedKMZ } from "@solarlayout/sidecar-client"
import {
  useProjectStore,
  type PersistedProject,
  type Run,
} from "./project"

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

// ---------------------------------------------------------------------------
// Post-parity additions: backend-persisted Project + Runs + selection
// ---------------------------------------------------------------------------
//
// `currentProject` holds the backend metadata (id, name, kmz blob URL, edits,
// timestamps). The existing `project` field above keeps holding the parsed-KMZ
// local working copy — they coexist during the post-parity transition. P1/P2
// (new-project / open-project flows) populate both: `currentProject` from the
// backend response, `project` from parsing the downloaded KMZ blob.
//
// IDs are opaque strings minted by the backend with `prj_` / `run_` prefixes
// (semantic-ID Prisma extension in renewable_energy). Client treats them as
// strings and never constructs them.

const samplePersistedProject: PersistedProject = {
  id: "prj_01HX7Z3K9D2MN5Q8R7T1V4W6Y0",
  userId: "usr_test1",
  name: "Phase Boundary 2",
  kmzBlobUrl: "https://s3.ap-south-1.amazonaws.com/.../phaseboundary2.kmz",
  kmzSha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  edits: {},
  createdAt: "2026-04-29T10:00:00Z",
  updatedAt: "2026-04-29T10:00:00Z",
  deletedAt: null,
}

// `projectId` is implicit (= currentProject.id) on the post-parity Run
// summary shape; it's a parameter here only because the older test cases
// referenced it for readability. We just discard it now — the slice
// doesn't store it.
function makeRun(id: string, _projectId: string, name: string): Run {
  return {
    id,
    name,
    params: {},
    billedFeatureKey: "plant_layout",
    createdAt: "2026-04-29T10:05:00Z",
  }
}

describe("useProjectStore — post-parity slice", () => {
  beforeEach(() => {
    useProjectStore.getState().clearAll()
  })

  it("starts with currentProject null, runs empty, selectedRunId null", () => {
    const s = useProjectStore.getState()
    expect(s.currentProject).toBeNull()
    expect(s.runs).toEqual([])
    expect(s.selectedRunId).toBeNull()
  })

  it("setCurrentProject sets backend metadata", () => {
    useProjectStore.getState().setCurrentProject(samplePersistedProject)
    expect(useProjectStore.getState().currentProject).toEqual(
      samplePersistedProject
    )
  })

  it("setCurrentProject(null) clears", () => {
    useProjectStore.getState().setCurrentProject(samplePersistedProject)
    useProjectStore.getState().setCurrentProject(null)
    expect(useProjectStore.getState().currentProject).toBeNull()
  })

  it("setRuns replaces the list (does not merge)", () => {
    useProjectStore.getState().setRuns([
      makeRun("run_a", "prj_x", "first"),
      makeRun("run_b", "prj_x", "second"),
    ])
    useProjectStore.getState().setRuns([makeRun("run_c", "prj_x", "third")])
    const runs = useProjectStore.getState().runs
    expect(runs).toHaveLength(1)
    expect(runs[0]!.id).toBe("run_c")
  })

  it("addRun appends in insertion order", () => {
    useProjectStore.getState().addRun(makeRun("run_a", "prj_x", "a"))
    useProjectStore.getState().addRun(makeRun("run_b", "prj_x", "b"))
    useProjectStore.getState().addRun(makeRun("run_c", "prj_x", "c"))
    const ids = useProjectStore.getState().runs.map((r) => r.id)
    expect(ids).toEqual(["run_a", "run_b", "run_c"])
  })

  it("removeRun by id removes matching run only", () => {
    useProjectStore.getState().setRuns([
      makeRun("run_a", "prj_x", "a"),
      makeRun("run_b", "prj_x", "b"),
      makeRun("run_c", "prj_x", "c"),
    ])
    useProjectStore.getState().removeRun("run_b")
    expect(useProjectStore.getState().runs.map((r) => r.id)).toEqual([
      "run_a",
      "run_c",
    ])
  })

  it("removeRun on non-existent id is a no-op", () => {
    useProjectStore
      .getState()
      .setRuns([makeRun("run_a", "prj_x", "a"), makeRun("run_b", "prj_x", "b")])
    useProjectStore.getState().removeRun("run_zzz")
    expect(useProjectStore.getState().runs).toHaveLength(2)
  })

  it("selectRun sets selectedRunId", () => {
    useProjectStore.getState().selectRun("run_a")
    expect(useProjectStore.getState().selectedRunId).toBe("run_a")
  })

  it("selectRun(null) clears the selection", () => {
    useProjectStore.getState().selectRun("run_a")
    useProjectStore.getState().selectRun(null)
    expect(useProjectStore.getState().selectedRunId).toBeNull()
  })

  it("removing the selected run clears selectedRunId", () => {
    useProjectStore
      .getState()
      .setRuns([makeRun("run_a", "prj_x", "a"), makeRun("run_b", "prj_x", "b")])
    useProjectStore.getState().selectRun("run_a")
    useProjectStore.getState().removeRun("run_a")
    expect(useProjectStore.getState().selectedRunId).toBeNull()
    expect(useProjectStore.getState().runs.map((r) => r.id)).toEqual(["run_b"])
  })

  it("removing a non-selected run leaves selectedRunId untouched", () => {
    useProjectStore
      .getState()
      .setRuns([makeRun("run_a", "prj_x", "a"), makeRun("run_b", "prj_x", "b")])
    useProjectStore.getState().selectRun("run_a")
    useProjectStore.getState().removeRun("run_b")
    expect(useProjectStore.getState().selectedRunId).toBe("run_a")
  })

  it("setRuns drops a stale selectedRunId not in the new list", () => {
    useProjectStore
      .getState()
      .setRuns([makeRun("run_a", "prj_x", "a"), makeRun("run_b", "prj_x", "b")])
    useProjectStore.getState().selectRun("run_b")
    useProjectStore.getState().setRuns([makeRun("run_c", "prj_x", "c")])
    expect(useProjectStore.getState().selectedRunId).toBeNull()
  })

  it("setRuns preserves selectedRunId when it's still in the new list", () => {
    useProjectStore
      .getState()
      .setRuns([makeRun("run_a", "prj_x", "a"), makeRun("run_b", "prj_x", "b")])
    useProjectStore.getState().selectRun("run_a")
    useProjectStore.getState().setRuns([
      makeRun("run_a", "prj_x", "a"),
      makeRun("run_c", "prj_x", "c"),
    ])
    expect(useProjectStore.getState().selectedRunId).toBe("run_a")
  })

  it("clearAll resets currentProject + runs + selectedRunId AND parity-era project", () => {
    useProjectStore.getState().setCurrentProject(samplePersistedProject)
    useProjectStore.getState().setRuns([makeRun("run_a", "prj_x", "a")])
    useProjectStore.getState().selectRun("run_a")
    useProjectStore
      .getState()
      .setProject({ kmz: sampleKmz, fileName: "x.kmz" })
    useProjectStore.getState().clearAll()
    const s = useProjectStore.getState()
    expect(s.currentProject).toBeNull()
    expect(s.runs).toEqual([])
    expect(s.selectedRunId).toBeNull()
    expect(s.project).toBeNull()
  })

  it("post-parity actions don't disturb parity-era `project` field", () => {
    useProjectStore
      .getState()
      .setProject({ kmz: sampleKmz, fileName: "untouched.kmz" })
    useProjectStore.getState().setCurrentProject(samplePersistedProject)
    useProjectStore.getState().addRun(makeRun("run_a", "prj_x", "a"))
    useProjectStore.getState().selectRun("run_a")
    expect(useProjectStore.getState().project?.fileName).toBe("untouched.kmz")
  })

  it("subscribers fire on currentProject changes via fine-grained selector", () => {
    const seen: (string | null)[] = []
    const unsub = useProjectStore.subscribe(
      (s) => s.currentProject?.id ?? null,
      (id) => seen.push(id)
    )
    useProjectStore.getState().setCurrentProject(samplePersistedProject)
    useProjectStore
      .getState()
      .setCurrentProject({ ...samplePersistedProject, id: "prj_other" })
    useProjectStore.getState().setCurrentProject(null)
    unsub()
    expect(seen).toEqual([
      "prj_01HX7Z3K9D2MN5Q8R7T1V4W6Y0",
      "prj_other",
      null,
    ])
  })
})
