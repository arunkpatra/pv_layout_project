# Principle — External contracts bind before code

> *"If a name appears on both sides of a network boundary, read the other side's source of truth before typing it on ours."*

## The principle

Names that cross a boundary to another repo or service have a source of truth that is not this repo. Feature-key strings, API response shapes, export-format identifiers, telemetry event names, sidecar route paths, CLI flag names consumed by external scripts — any string that leaves this repo or enters it from outside — carries an obligation: read the other side before you write ours.

This is a different failure mode from "Local execution, global awareness" in [CLAUDE.md §2](../../CLAUDE.md#local-execution-global-awareness). That principle governs forward binding (how today's choice constrains tomorrow's spikes). This one governs **sideways binding** — how today's choice can silently disagree with a contract that already exists in another repo.

## The incident that landed this principle

**S7 (license + entitlements + feature gating) invented feature-key names.** The frontend shipped `FeatureGate` with keys like `cables`, `energy`, `obstructions`, `icr_drag`, `dxf` — none of which existed in the `renewable_energy` backend seed. Only `plant_layout` aligned.

The S7 gate passed because `PREVIEW_ENTITLEMENTS` (used in design / preview runs) was self-consistent with the invented keys. Preview mode tested the UI; it did not test the contract. Production would have been broken for every real user: Pro and Pro Plus customers would see "upgrade" chips on features they'd paid for, because `availableFeatures` from the backend never contains strings like `cables`.

**S10 extended this onto two new surfaces** (`VisibilitySection` toggles + `SummaryPanel` PRO_PLUS rows) using the same invented keys. Compounding error: the "Show lightning arresters" toggle was gated as if LA were a Pro feature, when per the seed, LA is labeled inside `plant_layout` and is Basic-tier.

**S10.2** corrected both, introduced a typed registry + a contract test, and landed this principle. See [ADR-0005](../adr/0005-feature-key-registry.md) for the registry policy.

## Why preview / mock surfaces are dangerous by default

A mock that defines "what the backend would return" is self-consistent with the frontend that consumes it. If both sides invent the same name, every test passes. Every type-check passes. Every gate demo passes. The only way to catch the error is to compare the mock to the actual source of truth — and that comparison has to be automated, because no human consistently remembers to do it.

Two structural guards:

1. **Typed registries over string literals.** A single constant (`FEATURE_KEYS.PLANT_LAYOUT`, not `"plant_layout"`) removes the freedom to typo at call sites. Once the registry is the only way to reference a key, the compiler catches drift from the registry.
2. **Contract tests over trust.** A test that reads the external source of truth (e.g. `seed-products.ts` in `renewable_energy`) and asserts the local registry is a subset turns contract divergence into a CI failure. This is the test that would have caught S7 at commit time.

## Operational steps

1. **Before typing any name that crosses a boundary, open the other side's source of truth.** For entitlements/licensing, that's the `renewable_energy` seed. For sidecar endpoints, that's the route definitions inside `pvlayout_engine/`. For export format identifiers, `PVlayout_Advance` is the reference. Don't rely on memory or intuition — the cost of opening the file is seconds.
2. **Preview / mock surfaces are silent about contract divergence.** A test that only exercises preview cannot catch an invented name. Assume every mock is lying until a contract test or the real file agrees.
3. **Typed registries + contract tests are the structural guard.** Feature keys live in [`packages/entitlements-client/src/feature-keys.ts`](../../packages/entitlements-client/src/feature-keys.ts). Extend this pattern to any other enum-like boundary that gains more than two or three values.
4. **New names flow one direction: upstream first.** Backend seed changes first (or whatever external contract is authoritative), merged and deployed; the frontend registry then mirrors. Adding a name on our side and hoping the backend catches up is exactly how S7 broke.

## Authoritative source-of-truth files in `renewable_energy`

Read these before writing any name that crosses the boundary.

| Artifact | File | Use when |
|---|---|---|
| Feature keys + per-plan mapping | `packages/mvp_db/prisma/seed-products.ts` | Touching `availableFeatures`, `FeatureGate`, `useHasFeature`, `PREVIEW_ENTITLEMENTS`, or anything that gates UI / sidecar behavior by plan. |
| Entitlements response shape | `apps/mvp_api/src/modules/entitlements/entitlements.service.ts` | Changing the response parsing in `packages/entitlements-client/`. |
| Usage reporting payload | `apps/mvp_api/src/modules/usage/usage.service.ts` | Touching `/usage/report` client or sidecar usage hooks. |
| Product labels / prices (human-readable) | `packages/mvp_db/prisma/seed-products.ts` (same file, different fields) | Writing onboarding copy, upgrade dialogs, plan-summary UI. |

Feature-key names specifically are governed by [ADR-0005](../adr/0005-feature-key-registry.md). Registry in code: [`packages/entitlements-client/src/feature-keys.ts`](../../packages/entitlements-client/src/feature-keys.ts).

## What is intentionally *not* gated

A product decision locked in S10.2 (see [S10.2 gate memo](../gates/s10_2.md) and [SPIKE_PLAN.md](../SPIKE_PLAN.md) S11 / S13 entries):

- **All export formats** (DXF, KMZ, PDF, CSV) — ungated. Outputs serialize whatever was computed; they don't themselves represent value.
- **ICR drag** — ungated. Drag is an interaction on top of `plant_layout` (Basic-tier). A user entitled to compute a layout is entitled to refine its ICR positions.
- **Zoom / pan / undo / basic canvas interaction** — ungated, always.

The revenue lever is **feature keys** (what gets computed) and **calculation quota** (how many times you can compute), not format or interaction restrictions.

Obstruction drawing (S11) is gated on the existing `obstruction_exclusion` key — a Basic-tier feature per the seed.

## When this principle does not apply

- **Purely internal names** (TypeScript types that don't serialize, React prop names, file paths within this repo) — invent freely.
- **Implementation details of an external contract** (e.g. how the backend stores entitlements internally) — we don't mirror those, we only mirror the contract surface.
- **Names we originate and other systems consume downstream** (if any) — in that case, this repo is the source of truth, and downstream consumers have to read *us*. Document it as such so consumers don't guess.

If you can't tell whether a string is a "contract name" or "internal name", ask. The cost of asking is lower than the cost of S7.
