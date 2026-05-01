# Resume prompt — post-merge, Day 3 complete (2026-05-01 end of day)

Copy the block between `--- BEGIN PROMPT ---` markers as the first
message in the resumed session. Reads in ~3 minutes.

---

--- BEGIN PROMPT ---

# Resuming SolarLayout work — post-merge, Day 3 complete (2026-05-01)

You're resuming a multi-day push that just landed two big pieces in one calendar day:

1. **Cable-compute perf POC** — Changes A (prepared geometry) + B (parallel per-plot ProcessPoolExecutor) shipped on `post-parity-v1-desktop`. Change C (skip individual routing pass) was tested but **dropped** on industry-correctness grounds (BoM correctness — see `docs/post-parity/PRD-cable-compute-strategy.md` §1.3 and §2). 1.88× wall-clock improvement on multi-plot KMZs, zero BoM impact.

2. **Repo merge** — `pv_layout_project` + `renewable_energy` → single `solarlayout` repo under `SolarLayout` GitHub org. Mechanically complete + Vercel cutover done + both DBs at migration HEAD + smoke-tested in prod.

## Critical state

**Local working dir**: `/Users/arunkpatra/codebase/pv_layout_project` (folder name unchanged; repo name on GitHub is `solarlayout`).

**Branch**: `main`, `58208b7 Merge pull request #3 from SolarLayout/post-parity-v1-desktop`, up-to-date with origin.

**Recent commits (newest first)**:
```
58208b7 Merge pull request #3 from SolarLayout/post-parity-v1-desktop
752d1b9 fix(ci): hardcode Clerk test publishable key for Next.js builds
4b6d5e0 fix: add env var (Arun's commit)
e6682fe merge: bring renewable_energy mvp stack into solarlayout
0ebb4aa merge: import renewable_energy → solarlayout monorepo (705 file ops)
806743d Add '_re_temp/' from commit '51e193e0e509a4b7a90467d8e3b074019ab547f1'
d6a8baf docs(merge): Merge Spike PRD + renewable_energy inventory
8164a40 docs(perf): cable-compute POC findings, architecture research, PRD
c175caf chore(perf): repeatable cable-calc benchmark scripts
c85d1a1 feat(cable): A+B perf wins — prepared geometry + parallel per-plot
```

**Branches**: `main`, `post-parity-v1-desktop` (kept; same content as main minus the merge commit), `merge/renewable-energy` (kept), `parity/p0` (old).

**Both DBs (staging + prod)**: ALL 15 migrations applied, schema up to date. RDS endpoint `journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432`. Credentials in gitignored `.env.staging` + `.env.production` at repo root. See memory `reference_db_credentials.md` for command pattern.

**Prod deploys (verified live)**:
- `api.solarlayout.in` ← mvp_api (Hono on Vercel)
- `solarlayout.in` ← mvp_web (Next.js; `www.` redirects to apex)
- `admin.solarlayout.in` ← mvp_admin (Next.js, Clerk-gated)

All deployed via `platform-deployment.yml` workflow_dispatch run on solarlayout repo. Vercel team: Journium. Smoke tested 2026-05-01 — all healthy.

## Locked decisions (do NOT relitigate)

**Cable-compute architecture (PRD: `docs/post-parity/PRD-cable-compute-strategy.md`)**:
- Spike 1 = local A+B + UX hygiene + "AC cable trench" relabel (~1 week, mostly desktop-side)
- Spike 2 = cloud Lambda offload framework (~4-5 weeks, cross-functional)
- BoM stays as legacy individual-route sum (industry-correct; cited IEC 62548 / NEC 690 / IEEE 1547 / IFC EPC guide)
- KMZ visual = "AC cable trench" route (MST geometry, EPC-correct labeling)

**Repo merge (PRD: `docs/post-parity/PRD-merge-spike.md`)**:
- GitHub repo: `solarlayout` under `SolarLayout` org (not `arunkpatra/*`)
- Layout: flat top-level (`apps/*`, `packages/*`, `python/`, `docs/`)
- Defunct stack deleted during merge (apps/{api,web,layout-engine}, packages/{db,api-client}) — git history preserved on archived `renewable_energy` repo
- Package scopes unified to `@solarlayout/*` (was `@renewable-energy/*` and `@solarlayout/*` mixed)
- `packages/ui` collision resolved: desktop's renamed to `packages/ui-desktop` (`@solarlayout/ui-desktop`); web's keeps the canonical name
- `@vitejs/plugin-react` unified at `^4.7.0` workspace-wide (downgrade from ^6 in mvp_web/admin — required for Vite 6 compat with desktop)
- Clerk test publishable key hardcoded in `ci.yml` (publishable keys are public by design)

**Other locked decisions (carried from prior sessions)**:
- Cloud-first; no internet → no app
- TS-extension architecture for V2 client; no separate Rust crate
- License-key bearer auth (`sl_live_*`); never Clerk on desktop
- AWS S3 ap-south-1 (account 378240665051); buckets `solarlayout-{local,staging,prod}-{downloads,projects}`
- V2 envelope `{success, data | error}`; V2ErrorCode union (locked exhaustive)
- Multi-tab metadata-only model; ONE project's state in memory at a time
- Tauri 2 webview suppresses `window.prompt` (lesson from S2-02)

## Quality gates (last verified 2026-05-01 post-merge)

| Gate | Result |
|---|---|
| `bun run lint` | 8/8 ✅ (2 pre-existing warnings) |
| `bun run typecheck` | 13/13 ✅ |
| `bun run test` | 9/9 ✅ (~931 JS/TS tests across 6 testing workspaces) |
| `bun run build` | 10/10 ✅ |
| `cd python/pvlayout_engine && uv run pytest tests/ -q` | 123 passed + 6 skipped ✅ |
| Prod smoke (curl checks) | api/web/admin all healthy |

## Pending work

**Day 4 — CLAUDE.md cascade + doc updates** (the obvious next item):
- Rewrite root `CLAUDE.md` to describe the merged repo (currently still describes desktop-only). Old renewable_energy CLAUDE.md is staged at `docs/post-parity/_merge-staging/CLAUDE-from-renewable-energy.md` for reference.
- Sweep per-app `CLAUDE.md` files for stale references
- Rewrite `docs/ARCHITECTURE.md` to cover desktop + cloud
- Merge `docs/adr-cloud/` into `docs/adr/` with offset numbering (e.g., renewable_energy ADRs become 0100+)
- Fix the 43 doc files that still reference `@renewable-energy/*` (mostly historical superpowers/plans/specs — verify with `grep -rln "@renewable-energy/" --include="*.md" .`)

**Cosmetic deferred (not blocking)**:
- Vercel projects' Git tab still points at renewable_energy repo. Cosmetic — deploys come via Vercel CLI from `platform-deployment.yml`, not Vercel git integration. Update whenever convenient.
- AWS OIDC trust subject still says `repo:SolarLayout/renewable_energy:*`. Irrelevant until Spike 2's cable-engine workflow lands.
- `merge/renewable-energy` and `post-parity-v1-desktop` branches can be deleted once you're confident in main; keep as audit trail for now.
- `renewable_energy` repo on GitHub: archive-pending. Do whenever ready.

**After Day 4 — back to product backlogs**:
- `docs/PLAN.md` — desktop post-parity active backlog (23/57 done as of 2026-04-30)
- `docs/initiatives/post-parity-v2-backend-plan.md` — backend V2 plan (25/26 rows done; B20 todo, B22 deferred)
- The cable-compute Spike 1 + Spike 2 work in `docs/post-parity/PRD-cable-compute-strategy.md` becomes the next major effort

## Active artifacts (re-read as needed)

**PRDs (forward-looking)**:
- `docs/post-parity/PRD-cable-compute-strategy.md` — Spike 1 + 2 plan for cable perf
- `docs/post-parity/PRD-merge-spike.md` — the merge plan that just executed

**Findings (research / audit trail)**:
- `docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md` — POC measurements + decision matrix
- `docs/post-parity/findings/2026-05-01-001-cable-perf-architecture-research.md` — six-track research feeding the cable PRD
- `docs/post-parity/findings/2026-05-01-002-renewable-energy-inventory.md` — pre-merge inventory of source repo

**Backend partner artifact**:
- `docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md` — backend session's feasibility audit (now in this repo since the merge)

**Code shipped on this branch**:
- A+B in `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py` (prepared geometry on `_seg_ok`) and `python/pvlayout_engine/pvlayout_engine/routes/layout.py` (parallel per-plot)
- Benchmark scripts: `python/pvlayout_engine/scripts/perf/{benchmark_cable_calc,benchmark_compare,benchmark_consolidated}.py`

## Process discipline reminders

- Backlog-driven per CLAUDE.md §2 — pick top `todo` row; flip to `done` on Acceptance.
- Tiered process per row (T1 / T2 / T3) — don't lighten or heavyen mid-row.
- All four gates pass before any commit (`bun run lint && bun run typecheck && bun run test && bun run build`).
- Sidecar pytest runs separately: `cd python/pvlayout_engine && uv run pytest tests/ -q`.
- Co-author every commit with `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Push after every commit; merged repo means single push target now.
- Memory has a `reference_db_credentials.md` entry — use the documented command pattern for any prisma operation; never paste DB URLs into chat.
- Velocity mode (today's pattern): make decisions decisively; surface risks, don't gate on them.
- User is in burn-the-boats mode for this product phase: zero live customers, prod downtime acceptable, hard cutovers fine.

## Standing by

Most likely first move post-compact: **start Day 4 CLAUDE.md cascade**. If the user wants something else, follow their lead. If they confirm Day 4, suggest opening with a subagent that reads every CLAUDE.md/ARCHITECTURE.md/ADR file and produces a unified diff of proposed changes.

--- END PROMPT ---
