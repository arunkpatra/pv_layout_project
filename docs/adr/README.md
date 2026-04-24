# Architecture Decision Records

Decisions that materially affect the shape of the system live here as ADRs. Format per the template in [`CLAUDE.md`](../../CLAUDE.md#10-architecture-decision-records) §10.

## Index

- [ADR 0001](./0001-online-required-entitlements.md) — Online-required entitlement policy (S7, accepted 2026-04-24).
- [ADR 0002](./0002-no-basemap.md) — Canvas-first MapLibre, no basemap tiles (S8, accepted 2026-04-24).
- [ADR 0003](./0003-state-architecture.md) — State architecture: where each kind of state lives (S8.8, accepted 2026-04-24).
- [ADR 0004](./0004-cloud-as-passive-storage.md) — Cloud is passive storage; desktop is the engineering tool (S8.8, accepted 2026-04-24).
- [ADR 0005](./0005-feature-key-registry.md) — Feature-key registry and backend contract (S10.2, accepted 2026-04-24).

## Expected ADRs (assigned to spikes)

- **S10.5:** drawing/editing pipeline (ADR 0006 — pick deck.gl/nebula.gl vs Terra Draw vs maplibre-gl-draw before S11).
- **S12:** telemetry event granularity + opt-in/opt-out.
- **S13.7:** subscription model redesign + migration plan.
- **S14:** crash reporting provider.

## Template

```markdown
# ADR NNNN: <title>
Date: YYYY-MM-DD
Spike: S<NN>
Status: accepted | superseded | reversed

## Context
<the question and the constraints>

## Options considered
<bullets>

## Decision
<what we chose and why>

## Consequences
<what we accept as a result>
```
