# ADR 0005: Feature-key registry and backend contract
Date: 2026-04-24
Spike: S10.2
Status: accepted

## Context

S7 introduced runtime feature gating via `availableFeatures: string[]` on the entitlements response, plus a `FeatureGate` component and `useHasFeature(key)` hook. During S10's physical gate walkthrough we discovered the frontend is checking **invented feature-key names** that do not match what the `api.solarlayout.in/entitlements` endpoint actually returns.

The real source of truth is the product seed in the [renewable_energy](../../../renewable_energy) repo:

- File: `packages/mvp_db/prisma/seed-products.ts`
- Keys: `plant_layout`, `obstruction_exclusion`, `cable_routing`, `cable_measurements`, `energy_yield`, `generation_estimates`.
- Per-plan mapping:
  - **Basic** → `plant_layout`, `obstruction_exclusion`
  - **Pro** → adds `cable_routing`, `cable_measurements`
  - **Pro Plus** → adds `energy_yield`, `generation_estimates`

The frontend was checking `cables`, `energy`, `obstructions`, `icr_drag`, `dxf` — none of which are emitted by the backend. Only `plant_layout` aligned. The S7 gate passed because `PREVIEW_ENTITLEMENTS` (used in design/preview runs) was self-consistent with the invented keys; nothing in the stack asserted the frontend's key set is a subset of the backend's.

S10 extended this on two surfaces (`VisibilitySection` toggles, `SummaryPanel` PRO_PLUS rows) with the same invented keys. In production, every real user — Basic, Pro, or Pro Plus — would hit `useHasFeature("cables") === false` because the string never appears in `availableFeatures`, making Pro and Pro Plus users see "upgrade" chips on features they've paid for.

Additionally, a semantic error: the S10 implementation gated the LA (lightning arrester) toggle on `cables`. Per the seed, LA is part of `plant_layout` (the label is `"Plant Layout (MMS, Inverter, LA)"`) and is a **Basic**-tier feature.

Root causes:
1. No typed registry — feature keys are loose strings at every call site.
2. No contract test — nothing verifies the frontend's key set against the seed.
3. Preview mode is self-consistent by default — silent about divergence from production.
4. CLAUDE.md §7 names the renewable_energy repo without pointing to the specific seed file, so sessions touching entitlements can finish without ever reading it.

## Options considered

1. **Ad-hoc per-spike fix.** Every spike that adds a gate reads the seed and uses the right key. Rejected: relies on discipline; the same error will recur when the developer skims rather than reads.
2. **Runtime whitelist guard.** `FeatureGate` throws if `feature` isn't in a known-good set. Rejected: catches typos but not semantic mismatches (e.g. gating LA on `cables` would still pass if `cables` were in the whitelist).
3. **Typed registry + contract test (accepted).** Single const map of feature keys mirrors the seed; `FeatureKey` union type narrows `FeatureGate` / `useHasFeature`; a contract test in `entitlements-client` asserts the registry ⊆ seed keys. Compiler catches typos and stray usage; CI catches registry drift from backend.

## Decision

### 1. Authoritative source

`packages/mvp_db/prisma/seed-products.ts` in the `renewable_energy` repo is the **single source of truth** for feature-key names and per-plan mapping. The frontend registry mirrors it; the backend mutates it first, the frontend tracks.

### 2. Typed registry

New module: `packages/entitlements-client/src/feature-keys.ts`.

```ts
export const FEATURE_KEYS = {
  PLANT_LAYOUT: "plant_layout",
  OBSTRUCTION_EXCLUSION: "obstruction_exclusion",
  CABLE_ROUTING: "cable_routing",
  CABLE_MEASUREMENTS: "cable_measurements",
  ENERGY_YIELD: "energy_yield",
  GENERATION_ESTIMATES: "generation_estimates",
} as const

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS]

export const ALL_FEATURE_KEYS: readonly FeatureKey[] =
  Object.values(FEATURE_KEYS)
```

Re-exported from the package root. `FeatureGate` and `useHasFeature` are narrowed from `string` to `FeatureKey`. All call sites import `FEATURE_KEYS.FOO` rather than passing a string literal.

### 3. Contract test

`packages/entitlements-client/src/feature-keys.contract.test.ts` (or similar) loads the seed (either by relative import if build allows, or by mirroring the seed's key set in a const kept in sync — prefer the import if it compiles, otherwise mirror with a comment pointing at the source path). Asserts:

- Every `FeatureKey` value appears in the seed's key union.
- Every seed key is either in the registry or explicitly ignored via a documented allowlist (rare — exists only for keys the frontend intentionally doesn't consume).

Test runs in CI under `bun run test`. Divergence between frontend and backend becomes a failing build.

### 4. PREVIEW_ENTITLEMENTS alignment

`useEntitlements.ts` ships **three** preview variants — `PREVIEW_ENTITLEMENTS_BASIC`, `PREVIEW_ENTITLEMENTS_PRO`, `PREVIEW_ENTITLEMENTS_PRO_PLUS` — each reflecting the real seed output for its tier. The preview license key selects which. No invented keys; no "all features on" default that hides gating bugs.

### 5. S10 surface area corrections (absorbed into S10.2)

- `VisibilitySection` "Show lightning arresters" — **ungate** (part of `plant_layout`, always available to any licensed user).
- `VisibilitySection` "Show AC cables" — gate on `FEATURE_KEYS.CABLE_ROUTING`.
- `SummaryPanel` DC cable length / AC cable length rows — gate on `FEATURE_KEYS.CABLE_MEASUREMENTS`.
- `SummaryPanel` AC capacity / DC-AC ratio rows — gate on `FEATURE_KEYS.ENERGY_YIELD`. Flagged as a product decision to revisit in S13 or S13.7 (these are engineering stats, not energy-yield simulations — the current gating preserves S10's Pro-Plus intent using the nearest real key).

### 6. Stale preview keys removed

`icr_drag`, `dxf`, `obstructions` are removed from `PREVIEW_ENTITLEMENTS`. Nothing in the codebase currently gates on them, and **none of the three map to a feature that will be gated in the future** — see §9 "Ungated features" below for the product decisions that make these keys unnecessary.

### 7. Sidecar audit

Audit `python/pvlayout_engine/` for any feature-key usage. If the sidecar's `/export/dxf` or similar endpoint checks a feature key today, it must use the real backend name. Otherwise: no sidecar change in S10.2 — whatever spike wires the sidecar gate does it against the real registry.

### 8. New-key process

Adding a feature key is a three-step sequence, enforced by the contract test:

1. Update `seed-products.ts` in renewable_energy; ship the migration.
2. Add the key to `FEATURE_KEYS` + `ALL_FEATURE_KEYS` in this repo.
3. Use `FEATURE_KEYS.FOO` at the call site.

Steps 2–3 without step 1 fail the contract test. Step 1 alone is fine (the frontend simply doesn't consume the key yet).

"Ungated" is a valid answer and doesn't need a new key — see §9.

### 9. Ungated features (product decisions locked in S10.2)

The revenue model is: **feature keys gate what gets computed**; **the `calculations` quota gates how many times**. Outputs and UX refinements are not monetization boundaries. Per that model, the following are intentionally ungated and no feature key exists (or will exist) for them:

- **All export formats** — DXF, KMZ, PDF, CSV. A Basic user's DXF is naturally sparser than a Pro Plus user's because the feature keys that drove computation differ; the format itself is not a lever. This applies to S12 (KMZ + PDF) and S13 (DXF + 15-min CSV).
- **ICR drag (S11)** — drag is an interaction on top of layouts a user is already entitled to compute. The recompute following a drag is still naturally gated by the user's tier.
- **Zoom / pan / undo / basic canvas interaction** — always available.

Obstruction drawing (S11) is **not** in this list — it gates on the existing `OBSTRUCTION_EXCLUSION` key (Basic-tier per the seed). The existence of an `obstruction_exclusion` key means drawing is a computation-gating feature, not pure UX; a user without the key doesn't get the exclusion logic even if they draw the shape.

S13.7 may revisit this model if subscription-tier redesign surfaces new revenue levers. Until then, don't introduce export-format or interaction-level gates.

## Consequences

**What we gain:**
- Compiler-enforced key correctness at every call site.
- CI-enforced frontend/backend alignment (no silent divergence).
- One obvious place to look when "why is this gate not working?" comes up.
- Preview mode that reflects real plan shapes instead of a synthetic super-admin.
- Clear provenance: every key has a seed entry, labeled for humans.

**What we accept:**
- Two-repo edit discipline when adding a feature key. That's correct — the contract lives in renewable_energy.
- A small amount of cross-repo coupling via the contract test. If `renewable_energy/packages/mvp_db/prisma/seed-products.ts` moves, this test needs an update. That's a detection mechanism working, not a cost.
- S11/S12/S13 will each touch `FEATURE_KEYS` when they add new gates. Expected.

**Follow-ups (future spikes):**
- S11 — ICR drag ungated (§9); obstruction drawing uses `FEATURE_KEYS.OBSTRUCTION_EXCLUSION`. No new seed keys needed; no ADR-0005 amendment.
- S12 — KMZ and PDF export endpoints ungated (§9). No new seed keys; no ADR-0005 amendment.
- S13 — DXF export + 15-min CSV ungated (§9); energy yield computation gates on `FEATURE_KEYS.ENERGY_YIELD`; generation estimates (if a separate computation surface) gates on `FEATURE_KEYS.GENERATION_ESTIMATES`. All four keys already seeded.
- S13.7 may revisit the tier structure; may consolidate or split keys. This ADR stays valid; the registry updates with the seed.
- S10.5 (drawing pipeline ADR / ADR-0006) is unaffected; its scope is interaction library choice, not gating.
