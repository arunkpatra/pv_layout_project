# Resume prompt — post-compaction handoff (mid-SP1, 2026-04-30)

Copy the block between `--- BEGIN PROMPT ---` markers as the first
message in the resumed session. Reads in ~3 minutes.

The full prompt is also reproduced inline in the current chat.

---

--- BEGIN PROMPT ---

# Resuming post-parity desktop work — 2026-04-30 (mid-SP1)

You're resuming a multi-week post-parity build on the
`pv_layout_project` repo. Context was compacted at this checkpoint
just after sending the SP1 memo v2 + SP4 row to the backend session
for re-review.

## Branch state

Working directory: `/Users/arunkpatra/codebase/pv_layout_project`.
Branch: `post-parity-v1-desktop` (DO NOT push directly to main).
HEAD: `8ec7ca8 post-parity: add SP4 (project card thumbnails) +
update protocol log` (pushed; origin tracking).

Plan status: **19 / 57 rows done** in [docs/PLAN.md](docs/PLAN.md).

Recent commits (newest first):

```
8ec7ca8 post-parity: add SP4 (project card thumbnails) + update protocol log
2830328 docs(memo): SP1 memo v2 — flip Path A + add §14 (SP4 / project cards)
52c2927 docs(memo): SP1 design memo — run thumbnail pipeline
86b4e3d docs(smoke): extend coordination protocol with cross-repo plan rows
6913174 post-parity: add Phase 6 (smoke-derived polish) + SP1/SP2/SP3 rows
2d22512 smoke(s1): confirm S1-09 closed live; held P2 queue clear
2ecbc51 fix(canvas): refit MapLibre camera on container resize (S1-09)
26fd1a0 smoke(s1): confirm S1-10 v2 closed live
d973274 feat(nav): persistent Home tab + bonus wordmark click (S1-10 v2)
1b4531c smoke(s1): close Session 1 with summary block
```

Earlier in this session: ran Session 1 smoke + landed 4 P0/P1 fixes
(S1-02 / S1-08 / S1-11 / S1-12 / S1-13) + 2 P2 fixes (S1-04 + S1-05)
+ 2 P3 fixes (S1-03 + S1-09 + S1-10 v2) + closed Session 1 with
summary; then opened SP1 memo + SP4 work as the next phase.

Test totals: **525 desktop + 36 ui + 176 entitlements-client = 737
across 3 packages green**. All four gates green every commit. (Run
counts may have shifted +/- a handful with each S1-row fix.)

## What's in flight RIGHT NOW

**Sent the backend session a paste-block** asking them to re-review
SP1 memo v2 + SP4 row. The user just pushed the 5 commits listed
above; backend will pull and read. **Awaiting their reply** with
answers to §10 Q1 (always-sign vs null-cutoff for pre-SP1 runs) +
confirmation that Q2-Q6 stances haven't shifted.

**No code work in flight.** Memo v2 + SP4 commits are paper rows
until backend executes B23 + B24 and we then ship desktop adapters.

## What was locked in the SP1 memo v2 (2830328)

These four design decisions are **locked, do not relitigate** unless
backend explicitly pushes back during the v2 review:

| Sub-decision | Locked |
|---|---|
| Format | **WebP** at quality 85 |
| Dimensions | **400 × 300** (4:3) — single asset for both surfaces |
| Render strategy | **On-Generate (always)** — hidden behind solver's 5-15s latency |
| Persistence | **Path A** — deterministic key `projects/<userId>/<projectId>/runs/<runId>/thumbnail.webp`; no DB column; no register endpoint; `<img onError>` handles 404 fallback |

§14 of the memo confirms the same asset works for SP4 (RecentsView
project cards) — no per-variant scheme, no second sidecar render
call. RecentsView card envelope (~260×180px) ≈ run gallery card
envelope (~250×150px); same 4:3 WebP scales cleanly via CSS.

## Cross-repo coordination state

Backend HEAD: `dfd0c48` on `post-parity-v2-backend` (committed +
pushed). Two backend partner rows live:

- **B23** at `555890e` — Run thumbnails (B17 wire extension +
  presigned-GET + sidecar PNG capability). T2. Status: `todo —
  awaiting SP1 design memo`.
- **B24** at `dfd0c48` — B10 listProjects extension with
  `mostRecentRunThumbnailBlobUrl: string \| null` (deterministic
  key path). T1. Status: `todo — awaiting B23 ship`.

The cross-repo plan-coordination protocol was locked during this
session — see "Cross-repo plan coordination" subsection in
[SMOKE-LOG.md](docs/post-parity/SMOKE-LOG.md). Pattern: paste-block
before either side commits a partner row; both sides ack; both sides
commit; both sides push. SP1↔B23 and SP4↔B24 are the first two
exercises of this pattern.

## Open questions awaiting backend

§10 of the SP1 memo lists 6 open questions. After memo v2 (Path A
flip), the most material one is:

**§10 Q1 — pre-SP1 runs: always-sign vs null-cutoff?** I recommended
always-sign (uniform behavior; `<img onError>` already mandatory for
the post-SP1 PUT-failure case so it costs nothing). Backend may
prefer null-cutoff for slight cleanliness. Answer pending.

§10 Q2-Q6 are unchanged from v1: `/layout/thumbnail` endpoint shape,
sidecar idempotency, max-bytes ceiling, migration ordering,
mvp_admin WebP support.

## Untouched / queued for future

**Session 2 smoke** is the natural next move once backend executes
B23 + B24 in the background. Coverage targets:

- P3 rename / delete project (interim window.prompt UX → SP3 will
  replace with Dialog modals)
- P4 auto-save edits (debounced PATCH)
- P9 delete run (multi-select)
- Other tier license keys: FREE quota enforcement, BASIC, PRO_PLUS,
  MULTI cheapest-first, EXHAUSTED → P10 upsell branch, DEACTIVATED →
  P10 contact-support branch, QUOTA_EDGE → B11 402
- Backend spot-check anchors: projectQuota per-tier, kmzDownloadUrl
  past-1h-expiry, B16 idempotency replay, B17 exportsBlobUrls=[]
- Verify Session 1 fixes still hold post-S2 features

Pre-Session-2 prep:
- Re-seed fixtures: `cd ~/codebase/renewable_energy && bun run
  packages/mvp_db/prisma/seed-desktop-test-fixtures.ts` (resets all
  8 stable keys atomically; ~5s)
- Tauri full restart per the smoke-reset doc requirement (HMR
  doesn't drain Rust event listeners)
- Follow the documented procedure in [SMOKE-LOG.md §"How to start a
  clean smoke session"](docs/post-parity/SMOKE-LOG.md)

## What stays locked across the compact (do not relitigate)

- **Cloud-first**: no internet → no app. Project state in Postgres + S3.
- **TS-extension architecture** for the V2 client — `@tauri-apps/plugin-http` delegates to native Rust HTTP; no separate Rust client crate.
- **License-key bearer auth** (`sl_live_*`); never Clerk on the desktop.
- **AWS S3 in `ap-south-1`** (account `378240665051`, IAM `renewable-energy-app`, bucket family `solarlayout-{local,dev,prod}-projects`).
- **V2 envelope**: `{success: true, data: T}` / `{success: false, error: {code, message, details?}}`.
- **V2ErrorCode union** (locked exhaustive): `UNAUTHORIZED`, `VALIDATION_ERROR`, `PAYMENT_REQUIRED`, `CONFLICT`, `NOT_FOUND`, `S3_NOT_CONFIGURED`, `INTERNAL_SERVER_ERROR`.
- **`licensed`/`entitlementsActive` branch table** for P10 surfaces.
- **Project quotas (concurrent)**: Free=3, Basic=5, Pro=10, Pro Plus=15.
- **PAYG-only at v1**: $1.99 / $4.99 / $14.99 packs. No subscriptions.
- **Idempotency**: UUID v4 per "Generate Layout" intent, threads through entire B16 → sidecar → S3 PUT chain.
- **Multi-tab model**: tab metadata only `{id, projectId, projectName}`. Switch tabs = re-load via P2's B12 + S3 GET. ~1s switch latency accepted; only ONE project's state in memory at a time. **+ S1-08 fix:** auto-select most-recent run on project open so canvas hydrates with prior layout.
- **Home tab + wordmark click** for "go home" navigation (S1-10 v2 — ships at `d973274`).
- **Inspector hidden when no project loaded** (S1-04 — ships at `57f49ba`).
- **Tauri HTTP capability scope** allows S3 origins for local + dev + prod buckets (S1-02 — ships at `f6cab16`).
- **OS File menu listener** registered exactly once (S1-11 — ships at `4d10004`).
- **`runs[]` slice reset on P1 create** + **stale-mutation guard in `useOpenRun.onSuccess`** (S1-12 + S1-13 — ships at `d046729` + `8e8f481`).
- **MapCanvas ResizeObserver-driven refit** for inspector-animation race (S1-09 — ships at `2ecbc51`).

## Process discipline reminders

- **Backlog-driven** per CLAUDE.md §2 — work proceeds row-by-row through PLAN.md. New work earns a row before code starts.
- **Cross-repo plan rows** require a paste-block before either side commits. Pattern documented in SMOKE-LOG.md.
- **Smoke session** triggers a Session-N entry in SMOKE-LOG.md with metadata + observations table + threads.
- **HMR limitation** — patches touching `@tauri-apps/api/event` always require a full Tauri dev restart to verify.
- **Bite-sized verification** during smoke — one check per prompt, wait for response.
- **Cleanup via curl loop** documented in SMOKE-LOG.md "Smoke reset" section. zsh-safe variable name: use `code`, not `status`.
- **Push after every commit** — backend session pulls to read; latency target ~10 min.

## Active artifacts (re-read these as needed)

- [docs/PLAN.md](docs/PLAN.md) — active backlog. SP1/SP2/SP3/SP4 in Phase 6.
- [docs/post-parity/SMOKE-LOG.md](docs/post-parity/SMOKE-LOG.md) — smoke log + coordination protocol + smoke-reset procedure. Session 1 closed; coordination protocol locked at v2; cross-repo plan extension live.
- [docs/post-parity/findings/2026-04-30-001-run-thumbnail-pipeline.md](docs/post-parity/findings/2026-04-30-001-run-thumbnail-pipeline.md) — SP1 design memo v2. ~580 lines after §14 addition. Path A locked. Awaiting backend re-review.

## Standing by

When the backend session's reply lands, paste it verbatim into the
resumed chat. Likely outcomes:

- **Q1 always-sign accepted** + Q2-Q6 unchanged → memo v2 is final.
  Backend kicks off B23 execution (4-step Path A sequence). I stand
  by until B23 ships, then start the desktop adapter.
- **Q1 null-cutoff preferred** → memo v3 small update + commit; rest
  flows the same.
- **Other pushback** on Q2-Q6 → small memo iteration, same flow.

After backend acks v2, the natural next move is **Session 2 smoke**
(in parallel with backend executing B23+B24). Pre-flight: re-seed
fixtures + Tauri full restart + follow the smoke-reset doc.

--- END PROMPT ---
