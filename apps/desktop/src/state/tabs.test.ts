/**
 * Tests for the tabs slice — S2 multi-tab top bar.
 *
 * Covers:
 *   - openTab creates a fresh tab + makes it active
 *   - openTab dedupes by projectId (single-project-per-tab enforced)
 *   - closeTab removes by id; updates activeTabId on active-close
 *   - closeTab picks right-neighbour as new active, falls back to left
 *   - closeTab on the last tab leaves activeTabId null
 *   - closeTab on non-active tab leaves activeTabId untouched
 *   - switchTab no-ops when id is invalid or already active
 *   - updateTabName patches the matching tab's name
 *   - reset clears state
 */
import { describe, it, expect, beforeEach } from "vitest"
import { useTabsStore } from "./tabs"

beforeEach(() => {
  useTabsStore.getState().reset()
})

describe("tabs slice — openTab", () => {
  it("creates a tab and sets it active", () => {
    const id = useTabsStore.getState().openTab("prj_a", "Project A")
    const s = useTabsStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0]?.projectId).toBe("prj_a")
    expect(s.tabs[0]?.projectName).toBe("Project A")
    expect(s.activeTabId).toBe(id)
  })

  it("dedupes by projectId (single-project-per-tab enforcement)", () => {
    const id1 = useTabsStore.getState().openTab("prj_a", "Project A")
    const id2 = useTabsStore.getState().openTab("prj_a", "Project A renamed")
    expect(id1).toBe(id2)
    expect(useTabsStore.getState().tabs).toHaveLength(1)
  })

  it("activates the existing tab when called for an already-open project", () => {
    useTabsStore.getState().openTab("prj_a", "A")
    const idB = useTabsStore.getState().openTab("prj_b", "B")
    expect(useTabsStore.getState().activeTabId).toBe(idB)
    // Re-opening A should switch to A's tab without creating a third.
    const idA = useTabsStore.getState().openTab("prj_a", "A")
    expect(useTabsStore.getState().activeTabId).toBe(idA)
    expect(useTabsStore.getState().tabs).toHaveLength(2)
  })
})

describe("tabs slice — closeTab", () => {
  it("removes the tab by id", () => {
    const idA = useTabsStore.getState().openTab("prj_a", "A")
    useTabsStore.getState().openTab("prj_b", "B")
    useTabsStore.getState().closeTab(idA)
    const s = useTabsStore.getState()
    expect(s.tabs.map((t) => t.projectId)).toEqual(["prj_b"])
  })

  it("on closing the active tab, picks the right neighbour as new active", () => {
    const idA = useTabsStore.getState().openTab("prj_a", "A")
    const idB = useTabsStore.getState().openTab("prj_b", "B")
    useTabsStore.getState().openTab("prj_c", "C")
    useTabsStore.getState().switchTab(idA) // active = A
    useTabsStore.getState().closeTab(idA)
    expect(useTabsStore.getState().activeTabId).toBe(idB)
  })

  it("on closing the active rightmost tab, falls back to the left neighbour", () => {
    useTabsStore.getState().openTab("prj_a", "A")
    const idB = useTabsStore.getState().openTab("prj_b", "B")
    const idC = useTabsStore.getState().openTab("prj_c", "C")
    // C is currently active (last opened). Close C → left neighbour B.
    useTabsStore.getState().closeTab(idC)
    expect(useTabsStore.getState().activeTabId).toBe(idB)
  })

  it("closing the last remaining tab leaves activeTabId null", () => {
    const id = useTabsStore.getState().openTab("prj_a", "A")
    useTabsStore.getState().closeTab(id)
    expect(useTabsStore.getState().activeTabId).toBeNull()
    expect(useTabsStore.getState().tabs).toEqual([])
  })

  it("closing a non-active tab leaves activeTabId untouched", () => {
    useTabsStore.getState().openTab("prj_a", "A")
    const idB = useTabsStore.getState().openTab("prj_b", "B")
    // B is active. Close A.
    const idA = useTabsStore.getState().tabs[0]!.id
    useTabsStore.getState().closeTab(idA)
    expect(useTabsStore.getState().activeTabId).toBe(idB)
  })

  it("closeTab is a no-op for an unknown id", () => {
    const id = useTabsStore.getState().openTab("prj_a", "A")
    useTabsStore.getState().closeTab("nonexistent")
    expect(useTabsStore.getState().tabs).toHaveLength(1)
    expect(useTabsStore.getState().activeTabId).toBe(id)
  })
})

describe("tabs slice — switchTab", () => {
  it("sets active to the given id", () => {
    const idA = useTabsStore.getState().openTab("prj_a", "A")
    const idB = useTabsStore.getState().openTab("prj_b", "B")
    expect(useTabsStore.getState().activeTabId).toBe(idB) // most-recent
    useTabsStore.getState().switchTab(idA)
    expect(useTabsStore.getState().activeTabId).toBe(idA)
  })

  it("no-ops on unknown id", () => {
    const id = useTabsStore.getState().openTab("prj_a", "A")
    useTabsStore.getState().switchTab("nonexistent")
    expect(useTabsStore.getState().activeTabId).toBe(id)
  })

  it("no-ops when already active", () => {
    const id = useTabsStore.getState().openTab("prj_a", "A")
    // Just verifying no throw / no spurious state churn.
    useTabsStore.getState().switchTab(id)
    expect(useTabsStore.getState().activeTabId).toBe(id)
  })
})

describe("tabs slice — updateTabName", () => {
  it("patches the matching tab's name", () => {
    useTabsStore.getState().openTab("prj_a", "Old name")
    useTabsStore.getState().updateTabName("prj_a", "New name")
    expect(useTabsStore.getState().tabs[0]?.projectName).toBe("New name")
  })

  it("is a no-op for a projectId not in any tab", () => {
    useTabsStore.getState().openTab("prj_a", "A")
    useTabsStore.getState().updateTabName("prj_zzz", "irrelevant")
    expect(useTabsStore.getState().tabs[0]?.projectName).toBe("A")
  })
})

describe("tabs slice — goHome (S1-10)", () => {
  it("sets activeTabId to null without removing any tabs", () => {
    const idA = useTabsStore.getState().openTab("prj_a", "A")
    useTabsStore.getState().openTab("prj_b", "B")
    expect(useTabsStore.getState().activeTabId).not.toBeNull()
    useTabsStore.getState().goHome()
    const s = useTabsStore.getState()
    expect(s.activeTabId).toBeNull()
    expect(s.tabs.length).toBe(2)
    expect(s.tabs.map((t) => t.id)).toContain(idA)
  })

  it("is a no-op when already home (activeTabId null)", () => {
    useTabsStore.getState().goHome()
    expect(useTabsStore.getState().activeTabId).toBeNull()
    // Should remain null without throwing or otherwise changing state.
    useTabsStore.getState().goHome()
    expect(useTabsStore.getState().activeTabId).toBeNull()
  })
})

describe("tabs slice — reset", () => {
  it("clears tabs + activeTabId", () => {
    useTabsStore.getState().openTab("prj_a", "A")
    useTabsStore.getState().openTab("prj_b", "B")
    useTabsStore.getState().reset()
    const s = useTabsStore.getState()
    expect(s.tabs).toEqual([])
    expect(s.activeTabId).toBeNull()
  })
})
