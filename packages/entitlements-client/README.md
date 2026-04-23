# @solarlayout/entitlements-client

Tiny hand-written TypeScript client for the two endpoints we consume from `api.solarlayout.in`:

- `GET /entitlements` — edition + feature flags
- `POST /usage/report` — telemetry

Mirrors `PVlayout_Advance/auth/license_client.py`.

**Status: S0 stub.** Implementation lands in **S7** (License key + entitlements + feature gating).

See [`docs/SPIKE_PLAN.md`](../../docs/SPIKE_PLAN.md) for the full plan.
