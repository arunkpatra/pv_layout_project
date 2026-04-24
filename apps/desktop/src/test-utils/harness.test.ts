// Smoke test for the desktop workspace test harness.
//
// App.tsx itself has a deeply async boot flow (sidecar phase →
// keyring → entitlements query → full shell) that's not worth mocking
// at this spike's level. A meaningful App-level test will land in S8.8
// once Zustand owns the boot state and we have a cleaner mounting
// surface.
//
// What this test proves: the test environment is wired correctly for
// desktop-workspace tests — TypeScript resolves @solarlayout/* imports,
// happy-dom mounts, and the mocked sidecar client roundtrips.

import { describe, it, expect, vi } from "vitest"
import { createMockSidecarClient } from "./mockSidecar"

describe("desktop test harness", () => {
  it("createMockSidecarClient returns a typed mock with default health", async () => {
    const client = createMockSidecarClient()
    const health = await client.health()
    expect(health).toEqual({ status: "ok", version: "test" })
    expect(client.health).toHaveBeenCalledTimes(1)
  })

  it("createMockSidecarClient overrides accept custom implementations", async () => {
    const client = createMockSidecarClient({
      health: vi.fn().mockRejectedValue(new Error("offline")),
    })
    await expect(client.health()).rejects.toThrow("offline")
  })

  it("default parseKmz returns a well-formed empty ParsedKMZ", async () => {
    const client = createMockSidecarClient()
    const parsed = await client.parseKmz(new Blob([""]))
    expect(parsed).toEqual({
      boundaries: [],
      centroid_lat: 0,
      centroid_lon: 0,
    })
  })
})
