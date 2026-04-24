// Typed mock factory for the SidecarClient.
//
// Tests that need a sidecar use `createMockSidecarClient({ ... overrides })`
// instead of constructing a real one. Method signatures are typed against
// the real interface so drift surfaces as a TypeScript error at compile
// time, not as a silent test pass.

import { vi } from "vitest"
import type {
  SidecarClient,
  HealthResponse,
  ParsedKMZ,
} from "@solarlayout/sidecar-client"

/** Sane defaults that pass any "is the app booting?" smoke test. */
const defaultHealth: HealthResponse = { status: "ok", version: "test" }

const defaultParsedKmz: ParsedKMZ = {
  boundaries: [],
  centroid_lat: 0,
  centroid_lon: 0,
}

/**
 * Build a mock SidecarClient. Each method is a `vi.fn()` so individual
 * tests can assert call counts / arguments. Pass `overrides` to swap in
 * specific responses or rejections.
 *
 * @example
 *   const client = createMockSidecarClient({
 *     health: vi.fn().mockRejectedValue(new Error("boom")),
 *   })
 */
export function createMockSidecarClient(
  overrides: Partial<SidecarClient> = {}
): SidecarClient {
  return {
    baseUrl: "http://127.0.0.1:0",
    health: vi.fn().mockResolvedValue(defaultHealth),
    parseKmz: vi.fn().mockResolvedValue(defaultParsedKmz),
    ...overrides,
  }
}
