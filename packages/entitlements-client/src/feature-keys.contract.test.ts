/**
 * Contract test — asserts that every feature key in the frontend registry
 * corresponds to a real key in the `renewable_energy` backend seed.
 *
 * The seed file is the authoritative source of truth for feature-key
 * names (see ADR-0005 and docs/principles/external-contracts.md). Any
 * drift between the two sides is a production-breaking bug that the S7
 * → S10.2 incident proved can pass every other gate.
 *
 * Strategy: parse the seed file literally (as text), extract all
 * `featureKey: "..."` string values, and assert that every member of
 * `ALL_FEATURE_KEYS` appears there. The seed is allowed to have keys
 * this repo doesn't consume (backend may define features before the
 * desktop wires them); we only fail if WE reference something THEY
 * don't have.
 *
 * Why parse-as-text (not import)? The seed lives in a sibling repo
 * under a different toolchain (Prisma + Node ESM in
 * `renewable_energy`); importing it through Bun here would require a
 * cross-repo symlink or workspace, which is more fragile than reading
 * the file as a string. Parse target is intentionally narrow — one
 * regex against a stable field name — so the test doesn't care about
 * unrelated seed edits (prices, display order, labels).
 */
import { describe, test, expect } from "bun:test"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { ALL_FEATURE_KEYS } from "./feature-keys.js"

// Seed-data file path, relative to this repo's root. Updated if the
// renewable_energy repo moves or the seed-data file is renamed. As of
// 2026-04-30 the literal feature-key strings live in the seed-data
// module (`src/seed-data/products.ts`); the prisma seed runner
// (`prisma/seed-products.ts`) imports the `products` array from there.
const SEED_PATH_FROM_HERE = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "renewable_energy",
  "packages",
  "mvp_db",
  "src",
  "seed-data",
  "products.ts"
)

function readSeedKeys(): string[] | null {
  if (!existsSync(SEED_PATH_FROM_HERE)) return null
  const content = readFileSync(SEED_PATH_FROM_HERE, "utf-8")
  // Match { featureKey: "foo", ... }. The seed uses double-quoted
  // string literals consistently.
  const matches = content.matchAll(/featureKey:\s*"([a-z_]+)"/g)
  const set = new Set<string>()
  for (const m of matches) {
    set.add(m[1]!)
  }
  return Array.from(set)
}

describe("feature-keys contract with renewable_energy seed", () => {
  test("every FEATURE_KEYS entry is present in the backend seed", () => {
    const seedKeys = readSeedKeys()
    if (seedKeys === null) {
      // If the sibling repo isn't checked out (CI environments where
      // only this repo is cloned), skip rather than fail. The test
      // file path is documented so a CI environment that wants strict
      // enforcement can ensure the sibling repo is present.
      console.warn(
        `[feature-keys.contract.test] Seed file not found at ${SEED_PATH_FROM_HERE}. ` +
          `Skipping strict contract check. Run locally with the renewable_energy ` +
          `repo checked out alongside to enforce.`
      )
      expect(ALL_FEATURE_KEYS.length).toBeGreaterThan(0)
      return
    }

    const missing = ALL_FEATURE_KEYS.filter((key) => !seedKeys.includes(key))
    expect(missing).toEqual([])
  })

  test("registry has exactly the six expected keys", () => {
    // Lock the current vocabulary. Adding a key requires (a) updating
    // the seed, (b) updating the registry, (c) updating this expectation.
    // That three-step sequence is intentional — it surfaces the contract
    // change in a code review.
    expect([...ALL_FEATURE_KEYS].sort()).toEqual([
      "cable_measurements",
      "cable_routing",
      "energy_yield",
      "generation_estimates",
      "obstruction_exclusion",
      "plant_layout",
    ])
  })
})
