# Post-Parity Smoke Log

Single-source-of-truth for human smoke-test observations against the new
SolarLayout desktop app + V2 backend + sidecar stack. Complements the
automated coverage in `apps/desktop/scripts/fixture-session.ts` (wire
contracts) — this log is for everything a human notices that the
fixture script can't surface (UX, timing, focus, error overlays, copy,
multi-tab race conditions, …).

**Process:** observations land here during a smoke session. Triage
follows the rule below. Status flips to `fixed` only when the linked
PLAN.md row's commit lands, so this file's commit history is the
triage timeline.

---

## How to start a clean smoke session

Run these from `/Users/arunkpatra/codebase/pv_layout_project` unless
noted. The goal is "everything fresh, every gate green, no stale
processes" before you launch the UI.

### 1. Kill any stale dev processes

```bash
# Stale Tauri dev / Vite / sidecar / mvp_api processes will silently
# bind ports and confuse the next launch.
pkill -f "tauri dev"            || true
pkill -f "vite"                 || true
pkill -f "pvlayout_engine"      || true
pkill -f "uvicorn"              || true
pkill -f "mvp_api"              || true
```

### 2. Confirm backend is up (mvp_api on localhost:3003)

The backend Claude Code session in `/Users/arunkpatra/codebase/renewable_energy`
owns this. Before starting the desktop smoke, verify with the backend
session that:

- `mvp_api` dev server is running on `http://localhost:3003`
- Postgres + `mvp_db` is up; migrations current
- Desktop test fixtures are seeded (see "Test license keys" below)
- The S3 dev bucket (`solarlayout-dev-projects` or equivalent) is
  reachable from the IAM user
- B12's `kmzDownloadUrl` extension + B8's `entitlementsActive` field
  are live on the running branch

Spot-check:

```bash
curl -sS http://localhost:3003/v2/entitlements \
  -H "Authorization: Bearer sl_live_desktop_test_PRO_stable" | jq .
```

Expected: `{success: true, data: {...licensed: true, entitlementsActive: true...}}`.

### 3. Verify desktop env points at local backend

```bash
cat apps/desktop/.env.local
```

Expected:

```
VITE_SOLARLAYOUT_API_URL=http://localhost:3003
```

If the file is missing, create it. (Without the override, the desktop
hits production `api.solarlayout.in` — almost never what you want
during smoke.)

### 4. Refresh deps + run all four gates from a clean slate

```bash
bun install
bun run lint
bun run typecheck
bun run test
bun run build
```

All four must be green before you fire up the UI. If any gate is red,
fix that first — the smoke session can't tell apart "real bug" from
"existing breakage" and you'll waste the session's signal.

The Python sidecar gate (only when touching `python/pvlayout_engine`):

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q
```

### 5. Fixture-session wire smoke (optional but recommended)

Validates the full V2 wire surface end-to-end against the live backend
in ~10 seconds. Run before the human smoke so any backend regression
surfaces early.

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
bun run apps/desktop/scripts/fixture-session.ts
```

Expected (as of 2026-04-30): ~28 pass / 0 fail / 2 carry-over warns
(AWS SigV4 determinism + EXHAUSTED-can't-create-project gap — both
documented; not bugs).

### 6. Launch the desktop app

```bash
cd apps/desktop
bun run tauri dev
```

Wait for:

- Tauri shell window opens
- Sidecar boots ("Sidecar ready" or equivalent in the StatusBar)
- License-key splash appears (or, if a key is already in the OS
  keychain, the entitlements query fires automatically)

If the sidecar fails to boot, check:

- `python/pvlayout_engine/` has `uv sync --extra dev` run at least once
- The Tauri Rust shell logs (`apps/desktop/src-tauri/src/sidecar.rs`
  is the boot path)

### 7. Reset between scenarios

Switching between test license keys: open the account dropdown
(top-right) → **Clear license** → re-enter the next key in the splash.
The keychain entry is cleared by the Rust shell; the entitlements
query resets; the splash re-renders.

To completely wipe local desktop state (keychain + app data):

```bash
# macOS — keychain entry is "com.solarlayout.app" service.
security delete-generic-password -s "com.solarlayout.app" 2>/dev/null || true
# App-data directory (Tauri default):
rm -rf ~/Library/Application\ Support/com.solarlayout.app/
```

---

## Test license keys (stable, seeded by backend)

Re-seed in the backend repo if any key is missing or has stale state:

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run packages/mvp_db/prisma/seed-desktop-test-fixtures.ts
```

| Scenario     | License key                                   | Expected behavior                                      |
|--------------|-----------------------------------------------|--------------------------------------------------------|
| FREE         | `sl_live_desktop_test_FREE_stable`            | Free tier, 3 calcs, 3-project quota                    |
| BASIC        | `sl_live_desktop_test_BASIC_stable`           | Basic plan, 5-project quota                            |
| PRO          | `sl_live_desktop_test_PRO_stable`             | Pro plan, 10-project quota                             |
| PRO_PLUS     | `sl_live_desktop_test_PRO_PLUS_stable`        | Pro Plus plan, 15-project quota, energy-yield gated on |
| MULTI        | `sl_live_desktop_test_MULTI_stable`           | Multiple stacked plans                                 |
| EXHAUSTED    | `sl_live_desktop_test_EXHAUSTED_stable`       | `licensed=false`, `entitlementsActive=true` → "Buy more" chip + dropdown gating |
| DEACTIVATED  | `sl_live_desktop_test_DEACTIVATED_stable`     | `licensed=false`, `entitlementsActive=false` → "Contact support" |
| QUOTA_EDGE   | `sl_live_desktop_test_QUOTA_EDGE_stable`      | Project quota exhausted; B11 returns 402 PAYMENT_REQUIRED |

### B7 fixture IDs (PRO_PLUS owns these)

- `projectId = prj_b7fixturePROPLUS00000000000000000000`
- `runId = run_b7fixturePROPLUS00000000000000000000`

These are the canonical IDs the fixture-session script chains against.
Useful to verify a specific cross-user 404 or to test "open existing
project" flows without first creating one.

---

## Severity definitions

| Sev | Meaning |
|-----|---------|
| P0  | **Blocker.** Smoke can't proceed until fixed (app won't start, license entry breaks, every project flow 500s). Drop everything and fix. |
| P1  | **Functional bug.** A documented flow is broken or returns wrong data. Block the next PLAN row from starting. |
| P2  | **Visible issue with workaround.** UX feels wrong, copy is off, focus rings missing, debounce timing feels long. User can still complete the flow. |
| P3  | **Polish nit.** Spacing off by a few px, hover state slightly muted, icon weight inconsistent. Roll up into the next polish row. |

When unsure, err one severity higher and demote during triage.

---

## Surface routing

| Surface     | Where it lives                                         | Routing                                              |
|-------------|--------------------------------------------------------|------------------------------------------------------|
| `frontend`  | This repo (`apps/desktop`, `packages/{ui,*-client}`)   | Direct fix in this session.                          |
| `backend`   | `renewable_energy/apps/mvp_api`                        | Paste-ready message to the backend Claude Code session. |
| `sidecar`   | `python/pvlayout_engine/`                              | Direct fix in this session.                          |
| `contract`  | Wire shape between desktop ↔ backend ↔ sidecar         | Both sides — coordinate via paste-ready message + add the missing assertion to `fixture-session.ts`. |

---

## Triage rule (locked)

- **P0 / P1** — fix before the next PLAN.md row starts. If
  `surface = backend | contract`, surface to the backend session via
  paste-ready message and **wait** for confirmation before assuming
  fix-side-of-the-wall.
- **P2** — inline-fix during the current row if cheap, OR add a row
  to PLAN.md (Phase 4 polish bucket). Don't let P2s stack into a
  silent backlog.
- **P3** — batch into a "polish sweep" row at the end of the phase
  OR drop. A P3 that can't justify a 5-line PLAN entry should drop.

**Coherence rules:**

- A frontend fix lands as a PLAN.md row commit. The smoke-log entry
  flips `open → fixed` in the *same* commit. No orphan trackers.
- A backend / contract fix lands in the backend repo's plan + commit
  history. The smoke-log entry here records the paste-ready message
  date + the backend commit SHA when fixed.
- A contract bug that should have been caught by the fixture-session
  script gets a **new assertion in `fixture-session.ts`** as part of
  the fix. No regression debt.
- T3 finding memos (`docs/post-parity/findings/YYYY-MM-DD-NNN-<slug>.md`)
  apply when an observation surfaces a solar-domain or architectural
  decision worth preserving — not for routine bug entries.

---

## How to log an observation

1. Pick the next free `S{N}-{NN}` ID (session number + sequential).
2. One row per distinct observation. Don't bundle.
3. **Repro** = numbered steps that reproduce on a clean smoke launch.
   "Open project from recents → click Generate" is fine; "broken" is
   not.
4. **Acceptance** = how we know it's fixed. Tied to the linked PLAN
   row's acceptance criterion when possible.
5. **Linked** = PLAN.md row ID (`P3`, `S2`, `B14`) if part of one;
   `new-row` if it earns its own; `inline` for cheap-fix-during-current-row.
6. After triage, set **Status**: `open` / `in-progress` / `fixed` /
   `dropped` / `deferred`. `fixed` requires a commit SHA in the
   **Notes** column.

---

## Sessions

### Session 1 — TBD (first smoke after S4)

**Date:** _to fill_
**App HEAD:** _to fill (`git rev-parse --short HEAD`)_
**Backend HEAD:** _to fill (ask backend session)_
**Sidecar build:** _dev (`uv run`) / packaged_

| ID    | Sev | Surface | Title | Repro | Acceptance | Status | Linked | Notes |
|-------|-----|---------|-------|-------|------------|--------|--------|-------|
|       |     |         |       |       |            |        |        |       |

_Fill in observations during the session; triage at the end._

---
