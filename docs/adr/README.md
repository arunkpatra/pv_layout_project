# Architecture Decision Records

Decisions that materially affect the shape of the system live here as ADRs. Format per the template in [`CLAUDE.md`](../../CLAUDE.md#10-architecture-decision-records) §10.

## Index

- [ADR 0001](./0001-online-required-entitlements.md) — Online-required entitlement policy (S7, accepted 2026-04-24).

## Expected ADRs (assigned to spikes)

- **S8:** basemap strategy (online free tiles vs. offline vector pack).
- **S12:** telemetry event granularity + opt-in/opt-out.
- **S13.7:** subscription model redesign (ADR 0002) + migration plan (ADR 0003).
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
