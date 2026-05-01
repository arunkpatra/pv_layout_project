# ADR 0004: Cloud is passive storage — desktop is the engineering tool
Date: 2026-04-24
Spike: S8.8 (decision codified ahead of S12 design)
Status: accepted (with 2026-05-01 post-merge note — see bottom)

## Context

The product surface spans two repositories:

- **`pv_layout_project` (this repo)** — the desktop app (Tauri 2 + React 19 + Python sidecar).
- **`renewable_energy`** (`apps/mvp_web`, `apps/mvp_api`, `packages/mvp_db`) — the website/dashboard at `solarlayout.in`, the entitlements API at `api.solarlayout.in`, the Postgres schema.

Without an explicit boundary, there's natural drift toward "could the cloud do X?" reasoning: render PDFs server-side to slim the desktop bundle, run layout compute server-side to remove the sidecar entirely, push live updates to render incremental layout changes, etc. Every one of those reads as "smaller desktop / richer cloud" but each one moves us toward a SaaS web-app architecture, which is exactly what the founder explicitly does NOT want.

This ADR codifies the contract so it can't drift over future spikes.

## Options considered

1. **Cloud-backed compute / rendering** — sidecar shrinks to a thin client; heavy work (layout, PDF render, energy yield) runs in cloud. Rejected: turns this into a SaaS web app with a desktop frontend, breaks the offline-capable-engineering-tool product positioning, introduces network latency on the engineer's main work loop.
2. **Cloud is invisible** — desktop runs entirely standalone; no cloud at all (entitlements baked into license file). Rejected: ADR 0001 already chose online-required for entitlement enforcement; we have user dashboard / payments anyway.
3. **Cloud is passive — desktop is the engineering tool.** Accepted.

## Decision

The desktop app does **all engineering work** locally:
- KMZ parsing, layout generation, ICR placement, inverter sizing, cable routing, LA placement, energy yield computation.
- All artifact rendering (KMZ, DXF, PDF) executes in the local Python sidecar.

The cloud (`renewable_energy`) does **none of those things**. It does:
- **Marketing site** (`solarlayout.in` via `mvp_web`).
- **User authentication, plan / pricing, payments** (Stripe via `mvp_api`).
- **License key issuance and entitlement query API** (`api.solarlayout.in/entitlements`).
- **Usage telemetry sink** (`api.solarlayout.in/usage/report`).
- **Cold storage of artifacts the user opts to upload** — KMZ / PDF / DXF outputs land in S3 via `mvp_api` upload endpoints; metadata in Postgres.
- **Dashboard listing of those stored artifacts** — "your past designs" view; download links to S3.

That's the entire cloud surface. No compute. No rendering. No model state.

## Cloud upload contract (deferred to S12)

Cloud sync of artifacts is **opt-in per export**. After a successful local export, the desktop offers "Save to your dashboard?" — if accepted, the artifact is POSTed to a new `mvp_api` endpoint that handles the S3 put and DB record. The desktop never auto-syncs in the background.

Detailed contract — endpoint shape, auth, retry behavior, dashboard listing UI — is designed in S12 and `mvp_web` correspondingly. This ADR only fixes the principle.

## Consequences

- **S12 (Exports) design must NOT include cloud-side rendering.** PDF / DXF / KMZ all render in the sidecar. The cloud-sync feature is a small additive POST after local render succeeds.
- **Sidecar bundle size** stays as it is. matplotlib is bundled (~50MB) for PDF render. Not a release blocker given we don't have app-store size constraints (binaries shipped from `solarlayout.in/download`, not Microsoft Store / Mac App Store). Bundle slimming via reportlab-based PDF rewrite is a deferred optimization (see S15.5 in `SPIKE_PLAN.md`), picked up post-launch only if real users complain.
- **No cloud-side compute infrastructure** — no AWS Lambda render farm, no Docker queue worker, no cloud-side Python. The renewable_energy stack stays Hono + Postgres + Vercel — light and cheap.
- **Privacy** — designs never leave the user's laptop unless they explicitly upload. Aligns with B2B engineering tool norms (designs are often confidential client work).
- **Offline degradation** — without internet, the user can still do everything except: validate entitlements (already covered by ADR 0001 — online-required at startup), report usage (telemetry queues locally and retries), upload artifacts to dashboard (button greys out with "offline — will retry" copy).
- **Future temptation guard** — when a future spike proposes "small cloud-side compute," this ADR is the document to cite. Either revise this ADR (with explicit founder signoff) or drop the proposal.

## Non-decisions (deliberately deferred)

- **Auto-sync of every export** vs **opt-in per export** — opted into only. If we ever auto-sync, that's a new ADR.
- **Cross-device project sync** ("open this design on a different laptop") — out of scope. Possible future product feature; would require revisiting this ADR.
- **Real-time collaboration** ("two engineers editing the same plant") — out of scope. Same.
- **Versioned project history in cloud** — out of scope. The user's local Tauri filesystem is the source of truth for project state.

## 2026-05-01 post-merge note

The Context section above describes "two repositories" (`pv_layout_project` and `renewable_energy`). On 2026-04-30/05-01 those repos were merged into a single `solarlayout` monorepo (folder name on disk remains `pv_layout_project` for now). `apps/mvp_web`, `apps/mvp_admin`, `apps/mvp_api`, and `packages/mvp-db` now live alongside the desktop app and shared packages in this repo.

The merge does **not** change the decision. The boundary this ADR codifies is between the **desktop runtime** and the **cloud runtime**, not between two git repositories. The cloud apps are still passive storage + entitlements + telemetry; the desktop is still where every engineering computation happens. Whether the cloud code lives in this repo or a sibling repo is a delivery-mechanics choice, not an architecture choice.

What changed mechanically: references to `renewable_energy` in the Context and Decision sections should now be read as references to `apps/mvp_*` and `packages/mvp-db` within this repo. The "no cloud-side compute infrastructure" consequence still holds — `apps/mvp_api` is Hono + Postgres + Vercel, no compute layer added.
