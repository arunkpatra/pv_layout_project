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
- The S3 local bucket `solarlayout-local-projects` (ap-south-1,
  account `378240665051`) is reachable; IAM user
  `renewable-energy-app` has put/get/delete via the V2 read-write
  policies
- B12's `kmzDownloadUrl` extension + B8's `entitlementsActive` field
  + B19's `Entitlement.projectQuota` propagation are live on the
  running branch

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
(B16 idempotency-replay URL shape + EXHAUSTED-can't-create-project
gap — both documented as intentional by the backend session). Treat
any **hard fail** as P0 (surface to backend immediately). If the
**carry-over warns change shape** vs the previous run, surface to
backend — that's a contract drift signal, not steady state.

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

## Smoke reset

When backend state has been polluted mid-session — most commonly a
stuck listener that created N duplicate projects, an over-debited
quota from a runaway loop, or a soft-deleted project you want truly
gone — use one of the two paths below. Pick the smallest path that
gets the state you need.

### Quick reset — current user only (~5s)

Use when **only** projects/runs for the active fixture user are
stale and entitlements + quota are still where you want them.
Doesn't touch S3 (orphans are harmless; see "Note on S3" below).
Doesn't bounce `mvp_api`.

```bash
KEY="sl_live_desktop_test_PRO_stable"   # or whichever fixture you're on
API="http://localhost:3003"

# List, then DELETE each. B14 is soft-delete + cascade to runs.
curl -sS "$API/v2/projects" -H "Authorization: Bearer $KEY" \
  | jq -r '.data[].id' \
  | while read -r id; do
      code=$(curl -sS -o /dev/null -w "%{http_code}" -X DELETE \
        "$API/v2/projects/$id" -H "Authorization: Bearer $KEY")
      echo "  deleted $id → $code"
    done

# Verify list is empty:
curl -sS "$API/v2/projects" -H "Authorization: Bearer $KEY" | jq '.data | length'
```

(zsh-safe: avoid `$status` as a variable name — it's reserved.)

### Full reset — re-seed all 8 fixture users (~3s)

Use when entitlements/quota are wrong (over-debited, deactivated
state stuck), or when more than one fixture user is dirty, or "I
just want to know everything's pristine." The seed script wipes
and recreates rows scoped to `clerkId LIKE '_desktop_test_%'` only
— **non-fixture data is untouched**.

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run packages/mvp_db/prisma/seed-desktop-test-fixtures.ts
```

The script prints a markdown table of the 8 license keys + seeded
state. License keys are stable across re-runs (suffix `stable`),
so any hardcoded test fixtures keep working. PRO_PLUS gets its B7
Project + Run re-created with the hardcoded IDs.

### Post-reset verification

Sanity-check both halves of the contract — entitlements and project
list — before resuming the smoke. If either looks wrong, the reset
didn't take and a deeper issue is in play (`mvp_api` not pointed at
the right DB; stale Prisma client; etc.).

```bash
KEY="sl_live_desktop_test_PRO_stable"
API="http://localhost:3003"

curl -sS "$API/v2/entitlements" -H "Authorization: Bearer $KEY" \
  | jq '{licensed, entitlementsActive, remainingCalculations, projectsRemaining}'
# Expected for PRO post-reset: licensed=true, entitlementsActive=true,
# remainingCalculations=10, projectsRemaining=10.

curl -sS "$API/v2/projects" -H "Authorization: Bearer $KEY" | jq '.data | length'
# Expected: 0 after either reset path.
```

### Tauri restart requirement (read first when fixing event-listener bugs)

Vite HMR replaces JS modules but **cannot** unregister listeners
that the old module bound on the Rust-side event bus. After **any**
patch that touches `@tauri-apps/api/event` (`listen` / `once` /
`emit`) or files that register such listeners (currently only
`apps/desktop/src/App.tsx`'s `menu:file/open_kmz` wiring), HMR-
verified behavior is meaningless. The Rust event plugin keeps the
prior listener entries live until the process restarts.

Restart with **full** Tauri dev cycle:

```bash
# Ctrl-C the dev tab, then:
cd apps/desktop && bun run tauri dev
```

The bug appears fixed only after the restart drains the Rust event
plugin's listener table. The listener-stacking bug fixed in commit
`4d10004` (S1-11) was rediscovered three times in one session
because HMR-after-fix kept the old listeners alive.

### Note on S3 orphans

B14 `DELETE /v2/projects/:id` is **soft-delete only** —
`Project.deletedAt` + cascade to `Run.deletedAt`, no S3 calls. KMZ
blobs at `projects/<userId>/kmz/<sha>.kmz` and run-result blobs at
`projects/<userId>/runs/<runId>/…` are orphaned in
`solarlayout-local-projects` (ap-south-1, account `378240665051`).

This is intentional: KMZs are content-addressed by sha256, so
re-creating a project from the same KMZ silently re-uses (or
no-op-overwrites) the orphan blob. No functional impact during
smoke.

If you want truly-clean S3 (rare; e.g. before recording a
screencast):

```bash
USER_ID="<get from mvp_db for the fixture user>"
aws s3 rm "s3://solarlayout-local-projects/projects/${USER_ID}/" \
  --recursive --profile renewable-energy-app
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
| FREE         | `sl_live_desktop_test_FREE_stable`            | Free tier, 5 calcs, 3-project quota                    |
| BASIC        | `sl_live_desktop_test_BASIC_stable`           | Basic plan, 5-project quota                            |
| PRO          | `sl_live_desktop_test_PRO_stable`             | Pro plan, 10-project quota                             |
| PRO_PLUS     | `sl_live_desktop_test_PRO_PLUS_stable`        | Pro Plus plan, 15-project quota, energy-yield gated on |
| MULTI        | `sl_live_desktop_test_MULTI_stable`           | Free 3/5 + Pro 8/10 (cheapest-first wallet fixture)    |
| EXHAUSTED    | `sl_live_desktop_test_EXHAUSTED_stable`       | `licensed=false`, `entitlementsActive=true` → "Buy more" chip + dropdown gating |
| DEACTIVATED  | `sl_live_desktop_test_DEACTIVATED_stable`     | `licensed=false`, `entitlementsActive=false` → "Contact support" |
| QUOTA_EDGE   | `sl_live_desktop_test_QUOTA_EDGE_stable`      | Project quota exhausted; B11 returns 402 PAYMENT_REQUIRED |

### B7 fixture IDs (PRO_PLUS owns these)

- `projectId = prj_b7fixturePROPLUS00000000000000000000`
- `runId = run_b7fixturePROPLUS00000000000000000000`

These are the canonical IDs the fixture-session script chains against.
Useful for cross-user 404 verification (FREE asking for the PRO_PLUS
project). **NOT for P2 (open-existing-project) tests** — the fixture
has DB rows but no S3 KMZ blob, so B12 → S3 GET will 404. For P2,
chain off a fresh P1 the way `fixture-session.ts` does.

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
6. **Owner** = `fe` / `be` / `both`. At-a-glance "whose court is this
   in." Flips during the back-and-forth.
7. **Status** values: `open` / `investigating` / `fixed` / `dropped`
   / `deferred`. `fixed` requires a commit SHA in the **Thread**
   column's final entry.
8. **Thread** = append-only conversation log. Each entry is prefixed
   `[FE 2026-MM-DD HH:MM]` or `[BE 2026-MM-DD HH:MM]`. The first
   entry is always the **suggested action** the originator wants the
   other side to take.

---

## Coordination protocol with the backend session

This file lives in `pv_layout_project`. The backend Claude Code session
lives in a separate repo (`renewable_energy`). Arun is the human
courier between sessions. The mechanics below are designed so each
side can move at full speed without a synchronous channel and so the
smoke log is the **single source of truth** for the conversation.

### Setup (one-time)

1. **Backend session clones (or already has) `pv_layout_project` for
   read access.** The simplest path: a sibling clone next to
   `renewable_energy` so the backend session can `git pull origin
   post-parity-v1-desktop` and `cat docs/post-parity/SMOKE-LOG.md`
   directly. No new tools — just a checkout.
2. **Frontend session pushes after every smoke-log commit.** That
   guarantees backend sees a stable state when they pull.
3. **Both sides use ISO date + 24h local time** (`2026-04-30 14:30`)
   in `[FE …]` / `[BE …]` thread prefixes.

### Per-observation flow

```
   FE                                   BE
    │                                     │
    1. observe + log row to SMOKE-LOG     │
       (Status=open, Owner=fe|be|both)    │
       commit + push                      │
    │                                     │
    2. (if Owner ∈ {be, both})            │
       Arun pastes the row block ──────►  │
    │                                     3. BE pulls + reads context
    │                                        from latest SMOKE-LOG
    │                                     │
    │                                     4. BE investigates;
    │  ◄────────── Arun pastes BE reply      drafts a `[BE date] …`
    │              block to FE               thread entry +
    │                                        suggested status/owner
    │                                        update
    5. FE integrates BE's entry into     │
       the row's Thread; updates Status   │
       + Owner; commit + push             │
    │                                     │
    6. Loop until Status ∈ {fixed,        │
       dropped, deferred}                 │
```

### What Arun ships (and doesn't)

**Arun ships:**

- A single observation row block (the markdown table row + its full
  thread to date) when FE wants BE to act.
- A single `[BE date] …` thread entry block when BE wants to update
  the row.
- A whole-section block when one side has notes that span multiple
  observations.

**Arun doesn't:**

- Ship the entire SMOKE-LOG.md doc — the other side pulls it.
- Paraphrase or rewrite content. Both sides see verbatim text. If
  something's unclear, Arun asks the originator to rephrase before
  relay.

### Block formats Arun forwards

**FE → BE — request for action:**

````
SMOKE-LOG: requesting action on S1-04

| ID    | Sev | Surface  | Owner | Title                          | Status |
|-------|-----|----------|-------|--------------------------------|--------|
| S1-04 | P1  | backend  | be    | B11 quota ceiling not enforced | open   |

Repro: …
Acceptance: …

Thread:
[FE 2026-04-30 14:00] Action requested: verify B11 enforces
projectQuota=3 on FREE — observed 4th create succeeds despite
EntitlementSummary.projectQuota=3.
````

**BE → FE — investigation finding / fix landed / disagreement:**

````
SMOKE-LOG: update on S1-04

[BE 2026-04-30 14:30] Investigated. Root cause: B11 was reading
projectQuota from the wrong source. Fixed at SHA 9a3b1c2 on
post-parity-v2-backend. Suggest Status → fixed once FE re-runs the
repro.
````

### Status & Owner cheatsheet

| Status         | Owner       | Meaning                                                 |
|----------------|-------------|---------------------------------------------------------|
| open           | fe / be     | Logged, not yet picked up.                              |
| investigating  | fe / be     | Side named in Owner is actively digging.                |
| open           | both        | Cross-cutting — both sides need to look together.       |
| fixed          | (last fixer)| Resolved; final thread entry includes commit SHA.       |
| dropped        | (last actor)| Decided not a real issue; final entry says why.         |
| deferred       | (last actor)| Real but won't fix this session; linked to a PLAN row. |

### What stays inside one repo

- **Frontend fixes** — commit lands in `pv_layout_project` only.
  Update the row's Thread + Status.
- **Backend fixes** — commit lands in `renewable_energy` only. The
  backend session may keep its own audit trail there
  (`docs/initiatives/...`); the SMOKE-LOG row references the backend
  SHA in the final thread entry.
- **Contract / wire-shape changes** — both repos commit. The smoke
  row's Thread captures both SHAs.

### When a finding spawns a row in the BE plan

If a smoke observation surfaces something larger than a one-shot fix
(new endpoint, schema migration, refactor across modules), the
backend session may add a new row to
`renewable_energy/docs/initiatives/post-parity-v2-backend-plan.md`
(e.g. B23) rather than absorb it as an inline fix.

Mechanics:

- BE adds the row to the V2 plan and references the SMOKE-LOG ID
  (`S1-04`) in the row's Files / Notes column.
- BE's `[BE date]` thread entry on the SMOKE-LOG row says: "Spawned
  as B23 in V2 plan. Status stays `open`, Owner=be, until B23 lands."
- When B23 commits, BE's final thread entry includes the B23-commit
  SHA + the row reference: "Closed via B23 (SHA `9a3b1c2` on
  `post-parity-v2-backend`)."
- The SMOKE-LOG row flips to `fixed` in that final entry.

Why: keeps SMOKE-LOG as the human-readable conversation timeline and
the V2 plan as the canonical row tracker. Avoids duplicate trackers;
either repo's git log can resolve the other.

### SHA & branch reference convention

Backend thread entries use **7-char short SHAs + branch name** (e.g.
`9a3b1c2 on post-parity-v2-backend`) so a future reader can resolve
the ref even after a rebase. Frontend follows the same convention
(`d11163b on post-parity-v1-desktop`). Contract changes that touch
both `apps/mvp_api` and `packages/shared` in the `renewable_energy`
monorepo are still one commit, one SHA — no special syntax needed.
The "both repos commit" line above only applies when the desktop
side also needs to commit a schema mirror in
`packages/entitlements-client/src/types-v2.ts` (the lockstep pattern).

### Cross-repo plan coordination

Per-finding coordination flows through this SMOKE-LOG file (see the
flow diagram + block formats above). Plan-level coordination — i.e.
when a row in one repo's plan has a partner row in the other — uses
the same paste-block courier model **before either side commits the
row**, so both rows land linked from t=0 instead of catching up
later.

**When to send a cross-repo row request:**

A row request is needed when adding a row whose work **requires** the
other side. Heuristic for the FE → BE direction (BE-side rows that
need a desktop mirror are symmetric):

| Trigger                                              | Mirror? |
|------------------------------------------------------|---------|
| New FE row depends on a wire-shape extension         | yes     |
| New FE row depends on a new backend endpoint         | yes     |
| New FE row uses a new `V2ErrorCode` value            | yes     |
| New FE row is desktop-only (UX, polish, refactor)    | no      |
| New FE row is sidecar-only (parity port, performance)| no      |

A row that "needs a partner" means the FE row's acceptance can't be
met until the partner row ships. If the FE row is fully
self-contained (e.g. SP2 in-place loading state, SP3 Dialog modals
replacing `window.prompt` interims), no request needed.

**Block format — FE → BE request:**

````markdown
Cross-repo row request: SP<N> ↔ B<M>

| # | Feature | Tier | Cross-repo? | Source |
|---|---------|------|-------------|--------|
| SP<N> | <title> | T<X> | YES — needs your B<M> | <SMOKE-LOG ID or other source> |

Acceptance / scope (looser pre-memo, tight if memo-locked): …

Asking before I commit. Two questions:
1. Add B<M> now (status `todo`, awaiting memo / details), or wait?
2. Row number — B<M> OK or different?
````

**Block format — BE → FE request:**

````markdown
Cross-repo row request: B<N> ↔ <SP/P/F><M>

| # | Feature | Tier | Cross-repo? | Source |
|---|---------|------|-------------|--------|
| B<N> | <title> | T<X> | YES — needs your <SP/P/F><M> | <source> |

Acceptance / scope (looser pre-memo, tight if memo-locked): …

Asking before I commit.
````

**Sequence after the receiving side acks:**

1. Receiving side commits the partner row in their own plan.
2. Receiving side reports back the SHA + branch (for downstream
   reference).
3. Originating side commits their row referencing the partner row's
   SHA.
4. Both sides push.
5. If the row is T3 (needs a design memo), the originating side
   drafts the memo as the row's first deliverable; backend refines
   acceptance after the memo lands.

**Mirror-or-not heuristic — BE side (provided by backend session):**

- Wire-shape changes → mirror always
  (`packages/entitlements-client/src/types-v2.ts` schema validation
  depends on the contract being kept in sync).
- New endpoints the desktop will consume → mirror always.
- New `V2ErrorCode` values → mirror always (the desktop's error-
  mapping switches need the case).
- Schema migrations that don't change wire shape → don't mirror.
- Backend-only refactors (helper extraction, perf optimizations,
  internal cleanup) → don't mirror.
- Decisions log entries / audit trail → don't mirror; backend-side
  log is enough.

**First two exercises of this protocol:**

1. **`SP1 ↔ B23`** — Run gallery thumbnails (server-side pipeline,
   the larger T3 design-memo work). FE sent the request before
   committing SP1; backend acked + committed B23 at `555890e` on
   `post-parity-v2-backend`; FE then committed
   `SP1`/`SP2`/`SP3` to `docs/PLAN.md` referencing B23. Memo at
   `docs/post-parity/findings/2026-04-30-001-run-thumbnail-pipeline.md`
   — v1 recommended Path B (DB column + register endpoint);
   backend pushed back; v2 flipped to Path A (deterministic key,
   no DB column). Path A locked.
2. **`SP4 ↔ B24`** — RecentsView project card thumbnails (T1
   follow-on to SP1, leverages the same per-run thumbnail asset
   at a different visual surface). FE sent the request mid-memo
   draft after the user observed the symmetric UX gap on
   project cards; backend acked + committed B24 at `dfd0c48` on
   `post-parity-v2-backend`; FE added SP4 to PLAN.md alongside
   the memo v2 update (§14 covers the SP4 surface).

Both exercises validated the paste-block format end-to-end: ~5s
turnaround per ack, no merge conflicts, both repos' plans linked
from t=0. Backend logged the protocol extension as a Decisions
entry in V2 plan §9 dated 2026-04-30; this subsection is the
FE-side mirror.

### Push cadence

- **FE pushes after every smoke-log commit.** Even mid-session.
- **BE never edits this file directly.** All BE updates flow through
  Arun → FE → commit → push. This avoids merge conflicts and keeps
  one source of truth.
- If the FE session is mid-flight on something else, batch is fine —
  but push within ~10 minutes of a smoke-log change so backend never
  pulls a >10-minute-stale view.

### When the protocol gets in the way

If a finding needs a real-time conversation (rare), Arun bridges
voice / chat between sessions and the resulting decisions get
backfilled into the row's Thread as `[FE+BE 2026-MM-DD HH:MM]
synchronous decision: …`. Don't let the protocol block urgent fixes
— but always close the loop in the doc afterward.

---

## Sessions

### Session 1 — first smoke after S4

**Date:** _to fill_
**App HEAD:** _to fill (`git rev-parse --short HEAD`)_
**Backend HEAD:** `3ee6f05` on `post-parity-v2-backend`
**Sidecar build:** _dev (`uv run`) / packaged_

#### Backend-supplied spot-check anchors (this session only)

The backend session flagged these as "things naturally exercised by
the smoke flow that I'd value a human eye on." Not new flows — just
extra-attention items inside flows already on the route.

1. **`projectQuota` per-tier matches the snapshot.** When each fixture
   key creates projects, the ceiling enforced by B11 must match:
   `FREE=3 / BASIC=5 / PRO=10 / PRO_PLUS=15`. Sourced from
   `Entitlement.projectQuota` (snapshotted at creation since B19).
   **Wrong ceiling = backend regression** → P0/P1 backend.

2. **`kmzDownloadUrl` past-expiry behavior.** Presigned URL has
   `X-Amz-Expires=3600` (1h). A re-attempt past 1h should 403 →
   desktop's `EXPIRED_URL` branch should re-call B12 for a fresh URL.
   **A retry that "just works" without re-calling B12 = contract
   bug** → P1 contract.

3. **B16 idempotency replay.** Same `idempotencyKey` (Generate Layout
   retry on the same project + intent) must return the **same Run row**
   with a **fresh upload URL**, **no double-debit**.
   - Two debits = **P0 backend**
   - Two Run rows = **P0 backend**
   - Same upload URL bytes (no fresh sig) = **P1 contract** (backend
     clarified: SigV4 should produce fresh signatures per call;
     observably-identical URLs across replays = drift to surface)

4. **B17 `exportsBlobUrls: []`.** Unused at v1. Desktop must not
   render anything from it. Non-empty in the response = drift to
   surface (P2 contract).

#### Guardrails — fixtures we DO NOT touch in this session

- **B7 fixture project / run** (`prj_b7fixturePROPLUS…` /
  `run_b7fixturePROPLUS…`) — soft-deleting via P3 forces a re-seed
  and breaks the next fixture-session sweep.
- **DEACTIVATED key** — its state IS the test (`deactivatedAt` set,
  `licensed=false`, `entitlementsActive=false`). Switching to it is
  fine; mutating it is not.
- **QUOTA_EDGE key** — at 3/3 by design. Use it to verify B11 → 402
  only. Deleting any of its projects flips the fixture below quota
  and breaks the test contract.
- **EXHAUSTED key** — already at 0 calcs; further reports just 402.
  Don't try to "exhaust further."
- **MULTI key** — Free 3/5 + Pro 8/10 is the cheapest-first wallet
  fixture. Don't deliberately drain its remaining Free calcs (3) via
  Generate Layout — usage reports debit Free first, and consuming all
  3 flips the wallet test state. One Generate-on-MULTI is fine; four+
  starts mutating the fixture.

#### Things to NOT log as findings

- **mvp_web download path still works** (B20 held by design until V2
  launch — legacy install still needs the route).
- **mvp_admin Transaction ledger empty during smoke** — fixtures land
  via `adminPrisma`, not Stripe checkout. Real-purchase flows are a
  separate test track.
- **No `/v2/usage/history` endpoint exists yet.** V1 `/usage/history`
  serves the legacy desktop's account view; V2 doesn't replicate it
  because the new desktop's account menu reads `/v2/entitlements`
  instead. Don't log "no V2 history endpoint" as a finding — it's by
  design.

#### Session close summary

**Closed:** 2026-04-30 15:38. **App HEAD at close:** `88e10ae`.
**Backend HEAD:** `3ee6f05` on `post-parity-v2-backend` (unchanged
through the session — no backend findings).

**Headline counts**
- 13 observations logged
- 2 P0 — both fixed live (S1-02 Tauri HTTP scope, S1-11 menu listener stacking)
- 4 P1 — all fixed live (S1-08 tab-switch state restore, S1-12 runs slice carry-over on P1, S1-13 stale-mutation race in useOpenRun)
- 4 P2 — 2 fixed inline (S1-04 inspector hide, S1-09 + S1-10 held with proposed fixes)
- 5 P3 — 2 fixed inline (S1-03 statusbar count, S1-05 ⌘K pill removal); 3 deferred (S1-01 license button gating, S1-06 run thumbnails to new row, S1-07 run-switch loading to new row)

**Surfaces exercised cleanly**
F1 license entry · F2 entitlements · S1 TopBar chrome · S2 multi-tab
+ tab-switch state hydration · S3 RecentsView · S4 account dropdown
+ masked key + Buy more · P1 new project (B6 + S3 PUT + B11) · P2
open existing (B12 + S3 GET) · P5 runs gallery · P6 generate layout
(B16 + sidecar + S3 PUT) · P7 open run on canvas (B17 + S3 GET) ·
P10 quota chip on PRO (licensed=true branch only).

**Surfaces NOT yet exercised (Session 2 candidates)**
- P3 rename / delete project (interim window.prompt UX)
- P4 auto-save edits (debounced PATCH)
- P9 delete run (multi-select)
- Other tier license keys: FREE quota enforcement, BASIC, PRO_PLUS,
  MULTI cheapest-first, EXHAUSTED → P10 upsell branch, DEACTIVATED →
  P10 contact-support branch, QUOTA_EDGE → B11 402
- Backend spot-check anchors: projectQuota per-tier under FREE / BASIC
  / PRO_PLUS, kmzDownloadUrl past-1h-expiry behaviour, B16 idempotency
  replay live, B17 exportsBlobUrls=[] always
- Sidecar restart resilience, OS file menu under FREE quota
- Session 2 should also verify the 2 held P2 fixes (S1-09, S1-10)
  once they ship.

**Process learnings folded into SMOKE-LOG.md this session**
- New top-level section "Smoke reset" (`ca09243`) — quick / full
  reset paths + post-reset verification + Tauri-restart-required-for-
  listener-fixes rule + S3-orphans note.
- Coordination protocol with the backend session is locked at v2
  (`07ff024`); worked smoothly throughout.

**Backend coordination footprint**
- Zero backend rows opened this session (no contract bugs, no S3
  bugs, no schema drift). Backend session was kept informed at
  preflight + close; all 4 spot-check anchors and 4 guardrail
  fixtures honored.
- One backend-bound deferral: S1-06 (server-side run thumbnails,
  Option B) earns its own backend B-row when the design memo lands.
  Not active.

**Held / queued — both shipped post-close**
- ~~S1-09 P2 — camera over-zoom~~ → **shipped post-close** with the
  ResizeObserver-based refit in `MapCanvas`. See S1-09 thread.
- ~~S1-10 P2 — wordmark click-to-home~~ → **shipped post-close** as a
  persistent Home tab + bonus wordmark click (v2; user redesign call).
  See S1-10 thread.

**Deferred to new rows (when polish phase opens)**
- RP1 — Run thumbnail previews (Option B server-side; cross-repo
  with backend, design memo first).
- RP2 — In-place loading feedback for run-switch (Option A: card
  spinner + StatusBar load text).
- NP1 — Cmd-K palette: Recents submenu + project rename / delete
  via Dialog modals (replaces current `window.prompt` interims).

**Net commits this session**
S2-era → close: `6c5d6bc → 88e10ae`. ~30 commits including the smoke
preamble, protocol v1+v2, 4 P0/P1 fixes, 4 inline P2/P3 fixes, and
the smoke-reset doc. Pushed to `origin/post-parity-v1-desktop`.

#### Observations

| ID    | Sev | Surface  | Owner | Title                                                       | Repro                                                                                                | Acceptance                                                              | Status | Linked | Thread (see below per ID) |
|-------|-----|----------|-------|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|--------|--------|---------------------------|
| S1-01 | P3  | frontend | fe    | License submit button enables on any non-empty input        | 1. Clean launch → F1 splash. 2. Type `test` (any non-empty value). 3. Submit button is enabled.       | Decision deferred — revisit at end of session.                          | deferred | F1     | see S1-01 below           |
| S1-02 | P0  | frontend | fe    | Tauri HTTP capability scope blocks all S3 origins           | 1. Sign in with PRO. 2. Click "+ New project". 3. Pick any KMZ. 4. Tauri shows error popup: "Couldn't open KMZ — url not allowed on the configured scope: https://solarlayout-local-projects.s3.ap-south-1.amazonaws.com/…" | tauriFetch PUT/GET against `solarlayout-{local,dev,prod}-projects.s3.ap-south-1.amazonaws.com` succeeds; new-project / open-project / generate-layout / open-run flows complete. | fixed  | F6     | see S1-02 below           |
| S1-03 | P3  | frontend | fe    | StatusBar drops the line-obstruction count                  | 1. Open `phaseboundary2.kmz` (which contains a TL line obstruction). 2. StatusBar reads `1 boundary · 0 obstacles` despite the TL being clearly rendered as a red dashed polyline on the canvas. | StatusBar text includes the line-obstructions count when non-zero (or shows it always for symmetry).                          | fixed  | F4     | see S1-03 below           |
| S1-04 | P2  | frontend | fe    | Inspector renders project-shape forms when no project loaded | 1. Sign in. 2. Close active project (or land on RecentsView fresh). 3. Right-side Inspector still shows Layout/Energy yield/Runs tabs + populated Module/Table/Spacing/Site/Inverter forms with editable defaults. Breadcrumb correctly reads "No project open." | When no project is loaded: Inspector panel is hidden entirely + the TopBar Inspector toggle button is hidden. Inspector restores on next project open with the user's prior `inspectorOpen` preference.        | fixed  | inline  | see S1-04 below           |
| S1-05 | P3  | frontend | fe    | Redundant `Press ⌘K for commands` pill above the canvas      | 1. Sign in. 2. RecentsView (or any canvas state). 3. Floating `Press ⌘K for commands` pill renders top-left of canvas, duplicating the TopBar's palette button. | Floating hint removed; TopBar's palette button is the canonical entry point.                                                                                                                                  | fixed  | inline  | see S1-05 below           |
| S1-06 | P3  | frontend, backend | both | Run gallery cards show empty thumbnail placeholder           | 1. Open project + Generate Layout. 2. Inspector → Runs tab. 3. Run card renders with title + type chip + timestamp but a blank gray placeholder where a layout preview thumbnail would help orient. | Thumbnail shows a recognizable preview of the run's layout. User-preferred path: server-side pipeline (Option B) subject to a detailed impact-analysis memo when the row is picked up.                       | deferred | new-row | see S1-06 below           |
| S1-07 | P3  | frontend | fe    | No loading feedback during run-switch                        | 1. Open project + generate ≥2 runs (or open a project with multiple existing runs). 2. Inspector → Runs tab. 3. Click a non-active run card. 4. ~1–2s elapses during B17 fetch + S3 GET; canvas shows old run; no visible "loading" indication. 5. Canvas eventually updates; click felt unacknowledged. | While B17 + S3 GET are in flight: clicked card shows a subtle spinner in the thumbnail slot + StatusBar `leftMeta` reads `Loading run [timestamp]…`. Both clear when the canvas hydrates. No toast — the canvas update IS the success signal.                                       | deferred | new-row | see S1-07 below           |
| S1-08 | P1  | frontend | fe    | Layout state lost on tab-switch round-trip (S2 regression)   | 1. Open project A; Generate Layout (run_A produced + canvas shows panels/ICRs). 2. Open a second project B (with no runs). Tab opens; canvas shows just B's boundary. 3. Click back on tab A. 4. Canvas shows only A's boundary — no panels, no ICRs. The previously-generated run is gone visually but still exists in `runs[]` (visible in Inspector → Runs tab if you check). | Switching back to a tab whose project has runs auto-restores the most-recent run on canvas. The P7 selectedRunId-driven effect fires B17 + S3 GET + setLayoutResult during the B12-driven hydration. Mental model: opening a project shows the prior work, not blank boundary + manual click. | fixed  | S2, P2  | see S1-08 below           |
| S1-09 | P2  | frontend | fe    | Camera over-zooms on first project open (Inspector-animation race) | 1. Tauri restart with a key already in keychain. 2. RecentsView shows 2 projects. 3. Click `complex-plant-layout` (multi-plot KMZ). 4. KMZ parses + canvas hydrates, but camera fits to a sub-region — only ~half the plots visible at ~500m scale. 5. Manual zoom-out shows full extent (~1km scale, 6 plots). | First-open camera fits to encompass all boundaries regardless of Inspector animation timing.                                                                                                                                                                       | fixed  | P2, S1-04 | see S1-09 below           |
| S1-10 | P2  | frontend | fe    | No in-app navigation back to RecentsView when a project is open | 1. Sign in with a key that has ≥2 projects. 2. Open project A from RecentsView. 3. Try to switch to project B without going through "new project from KMZ." | A clear in-chrome affordance returns the user to RecentsView (tabs preserved); from there they can pick the other project. v2: persistent leading Home tab in TabsBar (icon + "Projects" label) + bonus wordmark-click in TopBar — both fire `tabs.goHome()`.        | fixed  | inline  | see S1-10 below           |
| S1-11 | P0  | frontend | fe    | OS File menu → "Open KMZ…" stacks 5–6 file pickers          | 1. Open a project (any). 2. Click OS-level menu `File → Open KMZ…`. 3. File picker opens; multiple OS-click sounds heard. 4. Click `Cancel` on the picker; another picker pops in. 5. Repeat: 5–6 pickers stacked, dismissed one-by-one with Cancel.                                                                     | Single menu click opens exactly one file picker. Cancelling closes it cleanly with no further pickers queued.                                                                                                                                                                          | fixed  | F4-era menu wiring | see S1-11 below           |
| S1-12 | P1  | frontend | fe | Runs list rendering inconsistent across tab switches      | 1. Open project A; Generate Layout (run A1 created). 2. Open project B; Generate Layout (run B1 created). 3. Inspector → Runs tab on B shows **2 runs**. 4. Switch back to A, then back to B (or just switch tabs). 5. Inspector → Runs tab on B now shows **1 run**.                                                | Each project's Runs tab renders only that project's runs, consistently across tab switches. Run counts match server state (B12's runs[] / B15 if used).                                                                                                                                | fixed  | P5, P6, S2 | see S1-12 below           |
| S1-13 | P1  | frontend | fe | Canvas shows another project's layout despite no runs (stale-mutation race) | 1. Open project A (`phaseboundary2`); Generate Layout. 2. Click `+` to open project B (`phaseboundary`) — pick KMZ; tab opens. 3. Canvas shows panels + ICR-1 + ICR-2 even though Inspector → Runs tab on B is correctly empty ("Generate a layout to see it here"). 4. Server confirms B has 0 runs.            | When user navigates away from a project before its `useOpenRunMutation` resolves, the late onSuccess must NOT write the result into the global layoutResult slice. Canvas of a runs-empty project should never display a layout.                                                       | fixed  | S1-08, P7 | see S1-13 below           |

_Fill in observations during the session; triage at the end. Use the
**Coordination protocol** section above for any row whose Owner
becomes `be` or `both`._

##### S1-01 thread

[FE 2026-04-30 13:18] Found while running the pre-flight UX checks
on the F1 splash. Read the code at
`apps/desktop/src/dialogs/LicenseKeyDialog.tsx:154` — button is
gated on `value.trim().length === 0` (i.e. enabled on any non-empty
input). The `sl_live_*` shape check runs in `handleSubmit` (line 62)
via `isPlausibleLicenseKey`, and surfaces an inline `formatError`
when the prefix doesn't match. So the actual UX is: type anything →
submit attempt → inline error if shape is wrong → no network call.

This is a deliberate pattern, not a defect. Tradeoff:

- **Current (validation-on-submit)** — submit-attempt surfaces the
  `sl_live_` requirement contextually. Disabled buttons are a known
  UX anti-pattern (users don't know why a button is dead).
- **Alternative (gate-button-by-shape)** — stronger guarantee that
  no network call fires for malformed input; foot-gun against
  password-manager autofill into the wrong field.

Recommendation: **drop** (keep current behavior). Reasoning: backend
401s on a bad key anyway, and the on-submit validation is more
accessible than gray-button silence. If pre-flight scripts care, the
narration should match the code, not the other way round.

If you'd rather move to gate-by-shape: it's a one-line change at
line 154 (`disabled={submitting || !isPlausibleLicenseKey(value.trim())}`).
Roughly P3-inline.

[FE 2026-04-30 13:20] User opted to defer. Status → `deferred`. Will
revisit at end of session alongside other P3 polish items.

##### S1-02 thread

[FE 2026-04-30 13:30] First user-facing regression caught by smoke.
Tauri's HTTP capability scope at
`apps/desktop/src-tauri/capabilities/default.json` allowlists exactly
three URL patterns:

```
http://127.0.0.1:*/*
http://localhost:*/*
https://api.solarlayout.in/*
```

S3 endpoints are absent. `tauriFetch` (delegating to native Rust
HTTP under the hood) refuses any URL outside the allowlist with the
exact "url not allowed on the configured scope" error. So every flow
that PUTs or GETs against the presigned S3 URL fails:

- B6 + S3 PUT (new-project KMZ upload — what we hit)
- B7 + S3 PUT (run-result upload — P6 Generate Layout)
- B12 + S3 GET (open-existing-project download)
- B17 + S3 GET (open-run download)

**Why fixture-session.ts didn't catch this:** the script runs under
Bun's native fetch — no Tauri capability layer between the request
and the network. Wire-contract harness, not runtime-environment
harness. This gap is structural; no fixture-session assertion can
catch it without launching Tauri.

**Why F6 didn't catch this:** F6 covered the upload helpers + S3
upload status-code matrix via mocked fetch. The capability scope is
a runtime/security boundary that's invisible to unit tests. The
deferral note from F6 ("end-to-end runtime verification rolls into
the P1 fixture session") was where this was supposed to surface —
the fixture session ran under Bun (not Tauri) so it slipped through
to the smoke session here.

**Fix (proposed):** add three explicit S3 bucket hosts to the
`http:default` allowlist. Tighter than `*.s3.*.amazonaws.com` (which
would let any compromised presigned URL outside our bucket family
exfiltrate through the desktop) but covers our three envs:

```diff
 {
   "identifier": "http:default",
   "allow": [
     { "url": "http://127.0.0.1:*/*" },
     { "url": "http://localhost:*/*" },
-    { "url": "https://api.solarlayout.in/*" }
+    { "url": "https://api.solarlayout.in/*" },
+    { "url": "https://solarlayout-local-projects.s3.ap-south-1.amazonaws.com/**" },
+    { "url": "https://solarlayout-dev-projects.s3.ap-south-1.amazonaws.com/**" },
+    { "url": "https://solarlayout-prod-projects.s3.ap-south-1.amazonaws.com/**" }
   ]
 }
```

Note: capability changes require restarting `bun run tauri dev` —
the Rust shell reads capabilities once at startup.

**Regression-debt note:** fixture-session can't catch this (no Tauri
in the loop). Considered options:
1. Pre-launch lint that scans the capability JSON for required hosts
2. Playwright-on-Tauri smoke (heavyweight)
3. Document the capability rule in F6's notes + this smoke log entry

Picking option 3 for now — the smoke session itself is the
authoritative runtime check, and the rule "all S3 hosts the desktop
talks to must appear in capabilities/default.json" is a single
sentence to remember. If we add a fourth env or rotate buckets,
we'll touch this file anyway. Revisit if a different surface
introduces this class of bug.

Recommendation: **inline-fix now** — restart Tauri dev after the edit
+ patch lands, repeat the new-project step. This is a P0 block, fix
takes ~1 minute, restart is fine since smoke is fresh.

[FE 2026-04-30 13:32] Patched. Three S3 bucket hosts added to
`http:default` allowlist in `apps/desktop/src-tauri/capabilities/default.json`.
Typecheck + build green; will be confirmed end-to-end after Tauri
restart + new-project retry. Status → `fixed` pending live retry.
Will close fully once user confirms the new-project flow completes
through to canvas hydration.

[FE 2026-04-30 13:34] Live retry confirmed. After Tauri restart, user
re-ran new-project flow with `phaseboundary2.kmz`: KMZ uploaded to
S3 (B6 mint + PUT), project created (B11), tab opened with project
name `phaseboundary2` in the new S2 tabs bar, canvas hydrated.
Status → `fixed`. Closed via `f6cab16` on
`post-parity-v1-desktop`.

##### S1-03 thread

[FE 2026-04-30 13:42] User flagged a red dashed line on canvas;
verified in Google Earth as a transmission-line ("TL") layer in
`phaseboundary2.kmz`. The KMZ parser correctly extracts it as a
`lineObstruction` and `countKmzFeatures` at
`apps/desktop/src/project/kmzToGeoJson.ts:92` already returns a
`lines` count alongside `boundaries` + `obstacles`. The StatusBar
string in `apps/desktop/src/App.tsx:1296` only renders
`boundaries` + `obstacles` — drops `lines` entirely. So the data is
computed but never displayed.

Visible inconsistency: canvas shows the TL polyline, status text
reads `0 obstacles`. A user glancing at the count to verify KMZ
parse-completeness will think the TL was missed. P3 polish nit.

Fix is one line in App.tsx — add `· ${plural(projectCounts.lines,
"line obstruction", "line obstructions")}` to the status string.

Recommendation: **inline-fix now**. ~30s edit, no restart needed
(Vite HMR picks up App.tsx). Closes the visible inconsistency before
moving to the next P1 acceptance check.

[FE 2026-04-30 13:43] Patched. App.tsx:1294 leftMeta now builds the
status string from a `[boundaries, obstacles, lines]` array, with
the line-obstructions segment conditionally included only when
`lines > 0` (keeps the bar tidy for KMZs without TL/road
obstructions). Typecheck green; will refresh via HMR. Status →
`fixed` pending live confirmation in the next visual check.

[FE 2026-04-30 13:48] Live confirmed — user reports the StatusBar
now reads "1 line obstruction" for `phaseboundary2.kmz`. Closed via
`edb9876` on `post-parity-v1-desktop`.

##### S1-04 thread

[FE 2026-04-30 13:48] User noticed during the post-S1-03 verify
screenshot. After closing the active project (also reproducible on
fresh app start with zero open projects), the Inspector panel still
renders all three tabs (Layout / Energy yield / Runs) with the Layout
tab's full parameter form populated by defaults from the
`useLayoutParamsStore` Zustand slice (`Module 2.38m × 1.13m / 580Wp`,
`Modules per row: 28`, `Rows per table: 2`, etc.). Breadcrumb
correctly reads "No project open" — only the Inspector hasn't gated
on `project !== null`.

Code path: `apps/desktop/src/App.tsx:1246` renders the Inspector
unconditionally. `panels/LayoutPanel.tsx` already takes a `noProject`
prop (line 54), but currently uses it only to disable the Generate
button + change its label to "Open a KMZ to generate" (line 288).
The form fields themselves stay editable.

The form writes to a **global** layoutParams Zustand slice — values
typed with no project loaded would persist into whatever project
opens next, which conflicts with the multi-tab + per-project params
model.

**Why this isn't a 1-line fix:** the right answer requires a design
call across three options:
1. Empty-state — Layout tab body renders an "Open a project to
   configure layout" hint when no project. Cleanest UX, mirrors the
   RecentsView empty state on the canvas side.
2. Auto-collapse — `inspectorOpen` forced to `false` when no
   project. Simpler but flaps if the user manually toggles it.
3. Disabled-but-visible — gray-out all form inputs. Familiar but
   loud (lots of disabled state).

Each has design implications around per-project params, params
hydration when a project finally opens, and how the Inspector
behaves during the project-switch transition.

**Recommendation: defer to a new Phase 4 polish row.** Reason: the
fix is design-shaped, not bug-shaped — the parity-era inspector
predates the project/run model, and the gap is a structural one that
deserves a proper row + acceptance criterion in PLAN.md, not an
inline patch during smoke. New-row name suggestion: `IP1 — Inspector
empty state when no project loaded` (`IP` for Inspector Polish).
Tier T1, depends F4, source = this S1-04 thread.

Awaiting user pick: defer-to-new-row / inline-fix / drop.

[FE 2026-04-30 13:50] User chose: hide the Inspector entirely when
no project loaded. Reasonable + doable + correct UX (matches IDE /
design-tool conventions for empty-selection state). Inline-fix:
`apps/desktop/src/App.tsx` — `inspector={project ? <…> : undefined}`
and `onToggleInspector={project ? handler : undefined}`. The
TopBar already hides its toggle button when the handler prop is
absent (existing pattern), so the chrome stays clean. The user's
prior `inspectorOpen` preference survives close/reopen because it
lives in App-level `useState`, not derived from `project`.

Typecheck green; HMR refresh. Status → `fixed` pending live confirm.

[FE 2026-04-30 13:55] Live confirmed by user via screenshot — no
inspector panel and no inspector toggle while on RecentsView.
Closed via `57f49ba` on `post-parity-v1-desktop`.

##### S1-05 thread

[FE 2026-04-30 13:55] User flagged a redundant floating "Press ⌘K
for commands" pill at the top-left of the canvas (visible above
RecentsView when no project loaded; also above the map when a
project is loaded). Code comment at
`packages/ui/src/compositions/MapCanvas.tsx:496` reads "kept here
for proximity; unchanged from S6" — it predates S1's TopBar palette
button. Now the TopBar has its own `Press ⌘K for commands` control,
so the floating hint is redundant.

User initially read the floating pill as "unclickable text," but
it's actually a `<button>` wired to `openPalette` — the styling
reads label-y rather than button-y. That's its own UX issue, but
the cleaner fix is to remove the hint entirely since the TopBar
button is the canonical entry point.

Removed `<CommandBarHint onClick={openPalette} />` from
`apps/desktop/src/App.tsx` + dropped the `CommandBarHint` import.
The component definition stays in `packages/ui` as dead-but-harmless
code; a Phase 4 polish row can remove the export when convenient.
Typecheck green; HMR refresh. Status → `fixed` pending live confirm.

[FE 2026-04-30 13:57] Live confirmed by user — pill gone. Closed via
`abe3290` on `post-parity-v1-desktop`.

##### S1-06 thread

[FE 2026-04-30 14:03] User flagged the empty placeholder thumbnail
on run gallery cards. Already a known gap from P5 (locked decision:
"thumbnail-as-placeholder; real pipeline later — P-row or polish
phase"). User explicitly asked whether previews are worth the cost.

Two implementation paths:

**A) Client-side capture (cheap, partial coverage):**
After canvas hydrates a run (P6 generate / P7 open), capture the
deck.gl/MapLibre composite via `map.getCanvas().toDataURL()`,
cache as base64 in the run slice (or IndexedDB for persistence
across reloads). Render in the gallery card via plain `<img>`.
Cost: ~half a day. Covers runs the user has rendered at least
once; older runs stay placeholder until next open. No backend
changes.

**B) Server-side pipeline (proper, full coverage):**
Backend generates a PNG thumbnail at run creation (e.g. headless
matplotlib render or sidecar-generated PNG); stores in S3
alongside the result JSON; B17 returns a `thumbnailBlobUrl: string
| null`; desktop fetches via S3 GET. Cost: backend B-row + S3
storage + sidecar work + desktop adapter — probably 1–2 days
across both repos. Covers all runs immediately, including ones
not yet opened.

**Recommendation: defer to a new Phase 4 polish row, pick option
A.** Reasoning:
- P3 nit, no functional gap.
- Option A unblocks the common case (user revisits runs they've
  recently opened) at a fraction of the cost.
- The "older runs show placeholder" gap is acceptable because
  runs are typically opened-then-revisited; the cache hits the
  common case.
- Option B's server-side work earns a real B-row in the V2 plan
  if/when user demand surfaces.

New-row name suggestion: `RP1 — Run thumbnail previews
(client-side capture)`. Tier T1, depends P6 + P7, source = this
S1-06 thread.

Awaiting user pick: defer-to-new-row / inline-fix / drop / pick
option B over A.

[FE 2026-04-30 14:05] User chose: **defer with strong inclination
toward Option B**, subject to a detailed analysis on product
complexity before locking the path. Surface flipped to
`frontend, backend` + Owner to `both` to reflect Option B's
cross-repo footprint.

When picked up, the row should produce a T3 design memo at
`docs/post-parity/findings/YYYY-MM-DD-NNN-run-thumbnail-pipeline.md`
covering at minimum:

- **Backend impact** — new B-row in `renewable_energy/docs/initiatives/post-parity-v2-backend-plan.md`:
  schema extension on B17 (`thumbnailBlobUrl: string | null`),
  PUT-on-create flow, S3 storage cost projection for thumbnail blobs
  at projected run volume, backfill strategy for runs that predate
  the pipeline (null is fine; placeholder remains for those).
- **Sidecar impact** — render-layout-to-PNG capability. Legacy
  matplotlib PDF renderer (`pvlayout_core`) already produces a 2D
  drawing of the layout; a reduced-resolution PNG export reuses the
  same primitives. Image size ~5–20KB per run.
- **Desktop impact** — schema mirror in
  `packages/entitlements-client/src/types-v2.ts`; new S3 GET helper
  reuse via `downloadBytesFromS3GetUrl`; `RunsList` card swaps the
  placeholder div for an `<img>` with the placeholder as fallback.
- **Generate-flow impact** — P6's `useGenerateLayoutMutation`
  becomes B16 → sidecar `/layout` → S3 PUT (result JSON) → sidecar
  `/layout/thumbnail` → S3 PUT (thumbnail PNG) → return. Two PUTs
  per run; idempotency key threads through both.
- **S3 storage / cost** — additional `thumbnails/` prefix in the
  bucket; ap-south-1 storage cost is ~$0.025/GB/mo, so 100k runs
  × 10KB avg = ~1GB = ~$0.30/mo. Negligible.
- **Backwards compat** — runs created before the pipeline ships
  get `thumbnailBlobUrl: null` from B17; the desktop's `<img>`
  fallback handles null cleanly via the existing placeholder.

Status `deferred`; will revisit when Phase 4 polish bucket is
picked up and the memo is written. The memo + the desktop-side row
+ the backend B-row will all land together (lockstep pattern).

##### S1-07 thread

[FE 2026-04-30 14:10] User flagged that clicking a run card with no
canvas-state change (no-op for already-active run) felt
unacknowledged, and suggested a toast on click. Discussed three
feedback patterns:

A) In-place loading state on the card + StatusBar reads `Loading
   run [timestamp]…`. No toast. Recommended pick.
B) Toast on success only ("Loaded [run name]", 2s auto-dismiss).
C) Toast on click + no-toast for the already-active no-op case
   (user's original suggestion).

Why A wins:
- Canvas hydration is already the success signal — the toast on B17
  resolve is redundant once the user sees the layout change.
- Toast spam risk under rapid run-switching (comparing 4–5 runs).
- The actual UX gap is the 1–2s loading window where canvas hasn't
  caught up; a card-spinner + StatusBar status is more native to the
  existing chrome than a floating toast.
- Toast infrastructure (`@solarlayout/ui` Radix Toast primitive)
  stays available for events that genuinely deserve a transient
  float (undo prompts, background errors, multi-step summaries).

User chose: **defer to new row, option A**.

Scope when picked up — touches three surfaces:
- `apps/desktop/src/runs/RunsList.tsx` — card-level loading state
  driven by `useOpenRunMutation.isPending` matched against
  `selectedRunId`. Render a tiny spinner inside the placeholder
  thumbnail slot when the run is loading; faint card pulse.
- `apps/desktop/src/App.tsx` — extend StatusBar `leftMeta` to read
  `Loading run [timestamp]…` while the open-run mutation is in
  flight; restore the boundary/obstacle/lines string when done.
- The no-op case (clicking the already-active run) does nothing
  visually — by design. Confirming the active state is noise.

New-row name suggestion: `RP2 — In-place loading feedback for
run-switch`. Tier T1, depends P5 + P7, source = this S1-07 thread.

Status `deferred`; will revisit when Phase 4 polish bucket is
picked up.

##### S1-08 thread

[FE 2026-04-30 14:18] Real P1 bug — confirmed via code trace. Tab
switch round-trip loses canvas layout state. Root cause is a contract
mismatch between P2 (open-existing-project) and S2 (multi-tab):

State flow that creates the bug:

1. User on `phaseboundary2` with `selectedRunId=run_A`,
   `runs=[run_A]`, layoutResult populated.
2. User switches to `complex` —
   `apps/desktop/src/App.tsx:621` `handleOpenProjectById` fires:
   - `clearLayoutResult()` wipes layoutResult slice (line 633).
   - `setRuns(complex.runs)` where `complex.runs=[]`. The slice's
     `setRuns` at `apps/desktop/src/state/project.ts:129` drops
     `selectedRunId` to `null` because the prior run_A isn't in the
     new (empty) array.
3. User switches back to `phaseboundary2` — same
   `handleOpenProjectById`:
   - `setRuns([run_A])` with current `selectedRunId=null`. `null`
     doesn't match anything, so it stays null.
   - P7's effect at `App.tsx:518` bails on null
     (`if (!selectedRunId) return`) → never fires B17 → layout never
     restores.

Why this didn't repro the first time the user switched back: that
switch happened immediately after P6 generate, where `selectRun(run.id)`
had just fired. `selectedRunId` carried through that round-trip.
Going via a runs-empty tab is what nulls it.

Why this is the wrong contract for S2:
`handleOpenProjectById`'s comment at App.tsx:629–632 explicitly notes
"open-existing doesn't hydrate a previous layout result yet (P7 will,
when the user picks a specific run from the runs list)." That contract
was set by P2 *before* S2 landed. With multi-tab in scope, the user's
mental model is "tab = workspace state restored on switch," not
"tab = blank canvas + manual run pick."

**Fix proposed:** auto-select the most-recent run when opening a
project that has any. One block in `handleOpenProjectById` after
`setRuns`:

```ts
if (opened.detail.runs.length > 0) {
  const mostRecent = [...opened.detail.runs].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )[0]!
  selectRun(mostRecent.id)
}
```

The sort uses `createdAt` (ISO string) descending → pick first.
Fires P7's effect → B17 + S3 GET + `setLayoutResult(result, runId)`.

This fixes both:

- The S2 tab-switch round-trip case (this bug).
- The P2 cold-open case (currently: click project from RecentsView →
  see boundary only → manually click a run from the gallery; should:
  see prior layout immediately).

Edge cases handled by the existing code:

- Empty `runs[]` → block skipped → canvas stays empty boundary.
  Correct.
- `createdAt` is required by the wire schema (RunSummaryV2Wire), so
  no null-handling needed.
- If user explicitly cleared selection via P9 (delete run), the
  most-recent remaining run becomes active automatically — feels
  natural.

Ship-or-defer: **recommend ship inline now.** This is a P1 — breaks
S2's core promise. ~2 minute fix. Will require the existing P2 unit
tests + add a new "auto-selects most-recent run when runs present"
test case. Then tab-switch round-trip should pass cleanly.

Awaiting user go-ahead per their explicit pause.

[FE 2026-04-30 14:21] User said ship. Patched
`apps/desktop/src/App.tsx`: added `selectRun` from
`useProjectStore` and a sort-by-createdAt-desc + selectRun block
right after `setRuns(opened.detail.runs)` in
`handleOpenProjectById`. `selectRun` added to the deps array.

Gates green: typecheck + test + build all clean. Existing 315
desktop tests still pass — no regression. Status → `fixed` pending
live confirmation. Will close fully once user verifies the
tab-switch round-trip restores the layout.

[FE 2026-04-30 14:23] Live confirmed by user — tab-switch round-trip
restores the prior layout. Closed via `7e24e36` on
`post-parity-v1-desktop`.

##### S1-09 thread

[FE 2026-04-30 14:38] User reports camera over-zooming on first
project-open from RecentsView. Code trace shows
`fitToBoundariesIfNew` at `packages/ui/src/compositions/MapCanvas.tsx:416`
correctly walks all features in the boundaries FeatureCollection
via `computeBounds` — multi-plot bbox math is fine.

**Race root cause (per user's sharper hypothesis):** when the
project flips from null to non-null, S1-04's Inspector visibility
gate triggers Framer Motion's AnimatePresence to animate the
inspector slot from `width: 0` to `var(--size-inspector, 320px)`
over `durations.base` (~180ms). At the *same render*,
`boundariesGeoJson` populates and the MapCanvas effect at
`MapCanvas.tsx:230` calls `fitBounds`. MapLibre computes the fit
against the *current* container dimensions — which are still wider
than they'll be after the inspector finishes animating. Result: a
zoom level that's correct for "no inspector" but over-zoomed once
the inspector takes 320px of the canvas width.

This is consistent with the user's observation that the camera
shows roughly half the multi-plot extent: the canvas is briefly
~1.4× wider than its post-animation final width (1280 vs 960px on
a typical Tauri window). fitBounds picks zoom Z such that bbox fits
in 1280px; once container narrows to 960px, the same camera/zoom
shows only ~75% of the bbox horizontally.

User explicitly identified this race after I mistakenly attributed
it to RecentsView dismounting. The dominant signal is the
inspector-slot growing from 0 to 320px.

**Fix (proposed):** wrap the `fitBounds` call so it fires after the
inspector animation completes. Two implementation paths:

1. `setTimeout(map.resize() + map.fitBounds(...), durations.base
   in ms + 50)` — defers refit until after the animation, calls
   `resize()` first so MapLibre re-measures the now-final container
   width. Hardcoded delay; works but couples MapCanvas to the
   inspector animation duration.
2. Listen to a `ResizeObserver` on the map container and refit
   when dimensions stabilize. More robust; no animation-duration
   coupling. Covers other layout reflows too (window resize, etc.).

Recommendation: ship option 2 (ResizeObserver), guarded so we don't
re-fit on every micro-pixel reflow — only when bounds-key changes
OR container width changed >50px from the last fit's basis. The
ResizeObserver approach also fixes any future layout thrash from
ToolRail toggle or window resize without bespoke handling.

Severity: P2 — has manual workaround (zoom out) but materially
hurts first impression on every project open. Worth fixing inline
during smoke; the regression shows up consistently and the fix
covers a class of future bugs.

Awaiting user go-ahead: ship option 2 / option 1 / defer.

[FE 2026-04-30 16:03] Shipped Option 2 (ResizeObserver) per
recommendation. Patched
`packages/ui/src/compositions/MapCanvas.tsx`:175–215 — added a
ResizeObserver inside the init effect that watches the canvas
container, fires on size deltas >50px on either axis (threshold
prevents jitter from sub-pixel reflows), and on each meaningful
change calls `map.resize()` then `map.fitBounds(...)` against the
current `propsRef.current.boundariesGeoJson` (computed bounds via
the existing `computeBounds` helper). `animate: false` on the
resize-driven refit so snapping is the right feel during a layout
reflow rather than fighting the inspector animation with a
600ms ease.

Cleanup added to the init effect's return: `ro.disconnect()`
before `map.remove()`.

Coverage of the fix:
- Inspector animation race (the original S1-09 trigger): width
  changes by 320px when project goes null→non-null; ResizeObserver
  fires post-animation, refits to the now-narrower container.
- ToolRail toggle: 52px width change — under 50px threshold by 2px;
  doesn't trigger refit (acceptable since ToolRail open/close is a
  user-initiated action and the user likely doesn't expect a
  camera adjustment). If this becomes annoying, drop threshold to
  30px.
- Window resize: any meaningful resize triggers refit.
- Tab switches: irrelevant — those go through `boundariesGeoJson`
  changes and are handled by the existing data-update effect.

Gates: typecheck + tests green. 324 desktop tests + 36 ui tests
pass unchanged (no new tests for this fix — it's a runtime
DOM-observer behavior; happy-dom doesn't fire ResizeObserver
deterministically, and writing a meaningful test would require a
heavy headless-browser harness. The behavior is verifiable live
during smoke).

Status → `fixed` pending live verification: open
`complex-plant-layout` (multi-plot KMZ) from RecentsView; expect
the camera to fit all 6 plots at ~1km scale on first render, no
manual zoom-out needed.

[FE 2026-04-30 16:06] Live verified by user — camera now fits the
full extent on first render. Closed via `2ecbc51` on
`post-parity-v1-desktop`. Held P2 queue is empty.

##### S1-10 thread

[FE 2026-04-30 14:44] User flagged that with a project loaded, there
is no in-chrome way to navigate to RecentsView and pick a different
project. Current options for switching projects all fall short:

- **Tabs `+` button** opens KMZ picker → creates a new project (and
  burns a quota slot). Wrong: industry convention is `+` = "new,"
  not "open existing."
- **Cmd-K palette → "Open existing project…"** uses
  `window.prompt("Project ID:")` from P3-era interim. Demands the
  user know the opaque project ID. Unusable for the actual mental
  model.
- **Close the active tab** drops back to RecentsView via the
  S2 closeTab "fall-back to null" path — but it's non-obvious
  navigation (close-to-go-home is destructive-feeling), and
  triggers the "Unsaved edits?" confirm if P4 auto-save is mid-
  flight.
- **Sign out + sign back in** would work but is absurd.

Three viable design patterns considered:

1. **Wordmark-click-to-home.** Click `SolarLayout` in the topbar
   breadcrumb → switches to home (RecentsView). Tabs preserved (the
   tab strip remains; `activeTabId = null`). Same pattern as
   Figma's home button, Linear's logo click, every browser. RecentsView
   already renders correctly when `!project`.
2. **Cmd-K palette → "Recents" submenu.** `⌘K → "Open project →"`
   shows the user's projects inline (same data feeding the
   RecentsView grid). Quick-switch without leaving keyboard.
   Replaces the interim `window.prompt`. Separate row from #1.
3. **Persistent left rail of projects.** Linear / Slack pattern.
   Powerful but adds chrome real estate — not recommended for v1
   (the design bar wants the canvas as the protagonist).

`+` button stays as "new from KMZ" — keeping `+` as create matches
industry convention; conflating create and open here would muddy
the affordance.

**Recommendation:** ship #1 as a small inline fix this session
(~5–10 min: `onClick` on the wordmark span in TopBar, plus a tabs
slice action that sets `activeTabId = null` while preserving the
tabs[] array). Defer #2 to a Phase 4 polish row that also tackles
rename / delete via proper Dialog modals (the existing
`window.prompt` / `window.confirm` interims from P3).

New-row name suggestion (for #2 + dialog work): `NP1 — Cmd-K
palette: Recents submenu + project rename / delete dialogs`.

Severity: P2 — functional gap with non-obvious workaround.
Strongly worth fixing before Session 1 closes since the gap blocks
the basic "I have multiple projects, let me switch between them"
flow.

Awaiting user go-ahead on #1: ship inline / defer / drop. (#2 stays
deferred regardless.)

[FE 2026-04-30 15:59] Post-Session-1-close design discussion + ship.

User pushed back on the wordmark-click-only v1 design as
non-intuitive for SolarLayout's audience (solar engineers, not
power-users of design tools). Counter-proposal: a persistent leading
**Home tab** (icon + "Projects" label) at the start of the tabs bar
— mobile-pattern-familiar, no user training needed. Wordmark click
kept as a bonus secondary affordance for power users.

Design call: both ship together (belt + suspenders, no real
downside; ~5 extra lines for the wordmark path on top of the Home
tab build).

**v2 design specifics:**
- Home tab: leftmost, fixed position, not in `tabs[]` array.
  Lucide-style inline `<svg>` home icon + "Projects" label. Active
  when `activeTabId === null`. No close button. 1px divider after it
  (visual separation from project tabs).
- Wordmark: becomes a `<button type="button">` with `onHome` prop
  supplied; subtle hover (text-primary → text-secondary), focus
  ring, `aria-label="Home — Recent projects"`.
- Wiring: both `TopBar.onHome` and `TabsBar.onHome` point at the
  tabs slice's new `goHome()` action.
- New tabs slice action: `goHome()` sets `activeTabId = null`
  without touching `tabs[]`. Existing App.tsx tab-switch effect at
  line 801–810 already handles `activeTabId === null` correctly
  (clears project + layoutResult + per-domain transient state),
  so no App.tsx state-handling changes needed.

**Files touched:**
- `apps/desktop/src/state/tabs.ts` — `goHome` action + interface.
- `apps/desktop/src/state/tabs.test.ts` — 2 new tests for the
  action (sets null, preserves tabs[]; no-op when already home).
- `apps/desktop/src/tabs/TabsBar.tsx` — `onHome` prop, leading
  `<HomeTab>` component (active-state via aria-selected, no close
  button, divider).
- `apps/desktop/src/tabs/TabsBar.test.tsx` — 6 new tests covering
  Home tab rendering, conditional render, aria-selected on null
  activeTabId, click fires onHome, no close button.
- `packages/ui/src/compositions/TopBar.tsx` — `onHome` prop,
  conditional wordmark-as-button render. Drag-region attribute
  drops from the wordmark when interactive (Tauri auto-excludes
  buttons anyway); plenty of drag surface in the rest of the
  TopBar.
- `packages/ui/src/compositions/TopBar.test.tsx` — 2 new tests
  (wordmark click fires onHome, plain span when onHome absent).
- `apps/desktop/src/App.tsx` — pulled in `tabsGoHome` from store,
  passed to `TopBar.onHome` + `TabsBar.onHome`.

Gates: typecheck + lint + test green. 324 desktop tests (was 316,
+8 from S1-10 v2). 36 ui tests (was 34, +2). Status → `fixed`
pending live verification of the Home tab UX.

[FE 2026-04-30 16:01] Live verified by user — Home tab renders
cleanly, divider weight is right, "Projects" label reads correctly,
hover/active states + click navigation all work. Wordmark click
also confirmed. Closed via `d973274` on `post-parity-v1-desktop`.

##### S1-11 thread

[FE 2026-04-30 14:47] Devastating P0 confirmed via code trace.
Classic Tauri `listen()` async-cleanup race in
`apps/desktop/src/App.tsx:840–851`:

```ts
useEffect(() => {
    if (!inTauri()) return
    let unlisten: (() => void) | undefined
    void listen("menu:file/open_kmz", () => { void handleOpenKmz() })
      .then((fn) => { unlisten = fn })   // ← async; resolves later
    return () => { unlisten?.() }        // ← if cleanup runs before the
                                         //   .then resolves, no-op;
                                         //   listener stays registered
  }, [handleOpenKmz])
```

**Why it stacks N times:**

1. `handleOpenKmz` is a `useCallback` whose deps change as the user
   works (sidecar state, opening flag, current project, etc.). Each
   change → effect re-runs.
2. Each effect run kicks off a fresh `listen(...)` promise.
3. Cleanup fires *before* the prior `.then()` resolved, so
   `unlisten` is still `undefined` and the old listener is never
   unregistered.
4. After N re-renders since the last successful unregister, N
   listeners are stacked.
5. One OS-menu click → N invocations of `handleOpenKmz` → N file
   pickers queued. Cancelling one just reveals the next.

The user's "5–6 pickers" matches typical re-render churn during a
project session (sidecar boot transitions + project state updates +
opening overlay flips).

**Fix (textbook pattern — `cancelled` flag + immediate-unregister-on-late-resolve):**

```ts
useEffect(() => {
    if (!inTauri()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen("menu:file/open_kmz", () => { void handleOpenKmz() })
      .then((fn) => {
        if (cancelled) fn()         // cleanup ran first → unregister now
        else unlisten = fn
      })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [handleOpenKmz])
```

Now the cleanup handles both timings:
- Promise resolved before cleanup → `unlisten?.()` runs.
- Cleanup ran before promise → resolution sees `cancelled=true` and
  immediately calls `fn()` to unregister.

Severity: P0 — File menu is broken in any session that re-renders
even once. Ship inline immediately.

Side note: this same pattern can occur for any other `listen(...)`
call elsewhere in the app — would be worth grep-checking. Quick
audit of the codebase suggests this is the only `listen` in
`App.tsx`. Will verify before shipping.

Awaiting user go-ahead.

[FE 2026-04-30 14:49] User said ship. Patched
`apps/desktop/src/App.tsx`:840–851 with the ref-pattern variant
(stronger than the textbook `cancelled`-only fix because it
eliminates the race entirely rather than patching it):

- New `handleOpenKmzRef` ref, kept current via a small effect that
  watches `handleOpenKmz`.
- Listener-registration effect now has `[]` deps — fires once per
  App mount, not per `handleOpenKmz` change.
- Listener body invokes `handleOpenKmzRef.current()` so it always
  calls the latest closure without re-registering.
- `cancelled` flag retained as belt-and-suspenders for the original
  mount/unmount-during-promise-resolution race path.

Typecheck green. Status → `fixed` pending live confirmation. Will
close fully once user verifies a single File menu click opens
exactly one file picker.

[FE 2026-04-30 14:55] User reported the bug still reproed after the
fix landed in dev. Diagnosis: **HMR limitation — Tauri listener
registrations persist across hot reloads on the Rust side**. Vite's
HMR can swap the React module but it cannot unregister listeners
that were bound by the *old* JS module against Tauri's Rust event
bus. Net effect after HMR: stacked listeners from before the patch
are still alive AND a new one (from the patched module) is added
on top. The fix can only take effect after a full Tauri process
restart.

Lesson for future smoke sessions: **patches that touch
`@tauri-apps/api/event` listener registration always require a
Tauri dev restart (not just HMR) to verify.** Worth adding to the
smoke session preamble for next time.

User collateral: each of the stacked file pickers fired a separate
B11 (no idempotency key on B11 — every successful POST creates a
row), so PRO ended up with 5–6 duplicate projects. Proposed
cleanup: curl loop using B14 to soft-delete all of PRO's projects:

```bash
KEY="sl_live_desktop_test_PRO_stable"
curl -sS http://localhost:3003/v2/projects -H "Authorization: Bearer $KEY" \
| jq -r '.data[].id' | while read -r id; do
    curl -sS -X DELETE "http://localhost:3003/v2/projects/$id" \
      -H "Authorization: Bearer $KEY"
  done
```

Then Tauri restart + re-sign in to verify the fix on a clean
PRO state.

[FE 2026-04-30 15:11] Live confirmed by user after full Tauri
restart on a clean PRO state. File menu opens exactly one picker
per click, no stacking, no further pickers queued after Cancel.
S1-11 closed via `4d10004` on `post-parity-v1-desktop`. The
HMR-cannot-verify-event-listener-fixes lesson is now captured in
the new `## Smoke reset` section of this doc (`ca09243`).

##### S1-12 thread

[FE 2026-04-30 15:15] User reports inconsistent runs-list rendering
across tab switches. Sequence:

1. Two projects open in tabs.
2. Generate Layout on project A → run A1 added.
3. Generate Layout on project B → Inspector → Runs tab shows
   **2 runs** in B's gallery.
4. Switch tabs (away then back, or just away). Returning to B's
   Runs tab now shows **1 run**.

Initial hypothesis space:

- **State leak across projects** — the project slice's `runs[]`
  is global ("current project's runs"); P6's `addRun` appends to
  whatever the slice currently holds. If a tab switch from A to B
  doesn't reset `runs[]` cleanly before B's Generate fires, A's
  prior run could appear in B's gallery temporarily; then on the
  next tab-switch round-trip, B12's authoritative server-side
  runs[] for B would replace and "fix" the count. This matches
  the symptom of "saw 2, then 1."
- **Tab-create flow vs tab-switch flow inconsistency** — opening a
  fresh project via P1 might bypass the `setRuns([])` call that a
  tab-switch via `handleOpenProjectById` performs. P1's
  `useCreateProjectMutation` may not call `setRuns` since the
  project starts with zero runs by definition; if so, whatever
  was in the slice carries over.
- **B16 onSuccess race with another project loading** — if B16's
  promise resolves while the user has already started a tab-
  switch, `addRun` could append to the wrong project's slice
  state.

Severity: P1 — functional bug, breaks user trust in the runs list.
Surface: frontend (likely; backend is unlikely to return duplicate
runs from B16). Owner: fe.

Sub-agent dispatched 2026-04-30 15:15 to investigate end-to-end
across P1, P5, P6, S2's tab-switch effect, and the project slice's
runs-management invariants. Awaiting findings before proposing a
fix.

[FE 2026-04-30 15:18] Sub-agent confirmed H1 with bit-exact
reproduction trace. Root cause:

`handleOpenKmz` at `apps/desktop/src/App.tsx:574` calls
`setCurrentProject(persisted)` but never resets `runs[]`. B11's
`ProjectV2Wire` deliberately doesn't carry `runs` (only B12's
`ProjectDetailV2Wire` does), so the create-project flow has no
source of `[]` runs to set. Slice keeps the prior project's
runs[] until something else overwrites it.

Tab-switch effect at `App.tsx:805` dedupes when
`tab.projectId === currentProject?.id` — exactly true after the
just-completed create, so no B12 re-fetch fires. First Generate on
B then `addRun(B1)` appends to slice's `[A1]` → gallery shows 2.
The next tab-switch round-trip eventually re-fetches via B12 and
overwrites with the authoritative `[B1]` from server, masking the
issue.

**Fix shipped:** one-line addition in `App.tsx`:

```ts
setCurrentProject(persisted)
setRuns([])  // S1-12 — explicit reset; B11 doesn't carry runs[]
```

`setRuns([])` also drops a stale `selectedRunId` per the slice
invariant at `state/project.ts:135–138`, so no separate
`selectRun(null)` call needed.

Defensive opportunities the agent flagged (NOT shipping with this
fix; logged for future):

- `addRun(projectId, run)` with assertion → would catch any
  future `addRun` that fires while a tab switch is in flight.
- Atomic `enterProject(persistedProject, runs?)` slice action →
  eliminates the "set one but forget the other" class of bug.
- Tab-switch effect always re-fetches when `tab.projectId !==
  prior currentProject.id`, removing the dedupe fast-path.

Worth shipping the `enterProject` action as a follow-up Phase 4
polish row if more entry points appear. For S1-12 itself, the
one-line fix is sufficient.

Gates green: typecheck + 525 tests still pass. Status → `fixed`
pending live confirmation. Will close fully once user verifies the
post-fix repro: create A → Generate → create B → Runs tab on B
shows 0 (not 1) → Generate on B → Runs shows 1 (not 2) → tab
round-trip → still 1.

[FE 2026-04-30 15:30] Live confirmed by user — runs list correctly
shows 0 on freshly-created project B and stays consistent across
tab-switch round-trips. Closed via `d046729` on
`post-parity-v1-desktop`.

##### S1-13 thread

[FE 2026-04-30 15:27] Caught while user was verifying S1-12. Same
class of state-leak but in a different code path —
`useOpenRunMutation`'s onSuccess at
`apps/desktop/src/auth/useOpenRun.ts:118–123` blindly calls
`setResult(layoutResult, vars.runId)` without checking whether
the user is still on the project that owns the run. Stale-resolve
race that S1-08's auto-select-most-recent-run made reachable.

**Sequence (verified against backend state at 15:25):**

Backend snapshot at the time of bug:
- `phaseboundary` (active project): `runsCount: 0`
- `phaseboundary2` (inactive tab): `runsCount: 1`
- Inspector → Runs tab on `phaseboundary` correctly shows empty
- Canvas on `phaseboundary` incorrectly shows `phaseboundary2`'s
  layout (panels + ICR-1 + ICR-2)

State-mutation trace:

1. User on `phaseboundary2` with `selectedRunId = pb2_run` (set by
   S1-08's auto-select after open).
2. P7's effect at `App.tsx:518` fires on `selectedRunId` change →
   `openRunMutate({ projectId: pb2, runId: pb2_run })` → B17 +
   S3 GET begins (~500ms–1s round-trip).
3. **While B17 is in flight**, user clicks `+` to create
   `phaseboundary` → `handleOpenKmz` fires.
4. `clearLayoutResult()` (App.tsx:557) → layoutResult=null.
5. `setRuns([])` (App.tsx:583, the S1-12 fix) → selectedRunId=null
   via slice invariant.
6. `setCurrentProject(pb)` → currentProject=pb.
7. `tabsOpenTab(pb)` → activeTabId=pb's tab. Tab-switch effect
   dedupes on `tab.projectId === currentProject.id` → no-op.
8. **B17 from step 2 resolves.** `useOpenRunMutation`'s onSuccess
   blindly calls `setResult(pb2_layout, pb2_run.id)` —
   rehydrating layoutResult with the wrong project's data.
9. Canvas re-renders pb's boundary + pb2's panels overlaid.

Why this only surfaced now: pre-S1-08, project-open didn't
auto-fire B17 — runs were only loaded when the user clicked one in
the gallery, which the user wouldn't do before navigating away.
S1-08's auto-select-most-recent-run kicks off B17 on every project
open with runs, creating the in-flight window where the race can
land.

**Fix proposed:** guard the onSuccess against stale project
identity. In `useOpenRun.ts`:

```ts
onSuccess: (data, vars) => {
  // Guard against a stale-resolve race: if the user navigated to a
  // different project while B17 was in flight, drop the result
  // rather than poisoning the global layoutResult slice.
  const currentProjectId = useProjectStore.getState().currentProject?.id
  if (currentProjectId !== vars.projectId) return
  setResult(data.layoutResult, vars.runId)
},
```

Adds a small import of `useProjectStore` (vanilla `getState()`
access — no subscription needed).

**Companion concern (not in this fix's scope):** the same race
class might bite `useGenerateLayoutMutation`'s onSuccess (P6) if
the user clicks `+` between Generate-click and result. Less
likely (user typically waits for solver) but worth a similar
guard if it ever surfaces. Logged but not patched here. If a
future smoke session catches it, it gets its own row + fix.

Severity: P1 — functional bug; user sees a layout for a project
that has never been run. Confusing + violates data-integrity
expectations.

Recommendation: ship inline now. Awaiting user go-ahead.

[FE 2026-04-30 15:33] User said ship. Patched
`apps/desktop/src/auth/useOpenRun.ts`:118–135: added a small
`useProjectStore.getState().currentProject?.id` check at the top of
the mutation's onSuccess. If `vars.projectId` doesn't match the
current project id, the result is dropped before reaching
`setResult`. Imported `useProjectStore` from `../state/project`.

Test coverage: extended
`apps/desktop/src/auth/useOpenRun.test.tsx` —
- New `beforeEach` line: `useProjectStore.setState({ currentProject:
  { id: "prj_xyz" } as never })` so all happy-path tests have a
  matching `currentProject.id`. Existing tests now pass cleanly
  through the guard.
- New test "(S1-13) skips setResult when user has navigated to a
  different project" — overrides `currentProject` to
  `{id: "prj_other"}` while keeping `mutate({projectId: "prj_xyz"})`,
  expects mutation to succeed but slice to stay null. Direct
  validation of the guard.

316 tests pass across 3 packages (was 315). Status → `fixed`
pending live confirmation. Will close fully once user verifies
the post-fix repro: sequence-A-Generate → click + → B opens →
canvas should show only B's boundary, no panels.

[FE 2026-04-30 15:38] Live confirmed by user — newly-created
project B's canvas shows only its boundary, no panels leaked from
A. Closed via `8e8f481` on `post-parity-v1-desktop`.

---

### Session 2 — post-S1 polish + tier-edge coverage

**Date:** 2026-04-30
**App HEAD:** `e45c253` on `post-parity-v1-desktop`
**Backend HEAD:** `dfd0c48` on `post-parity-v2-backend` (B23 + B24
rows live; backend just started B23 4-step execution against
locked memo v3)
**Sidecar build:** dev (`uv run`)

Pre-flight (per resume doc procedure): fixtures re-seeded clean
via `seed-desktop-test-fixtures.ts` (all 8 stable keys); full
Tauri restart (not HMR — drains Rust event listeners per S1-11
post-mortem).

Coverage targets:

- **Desktop polish rows from PLAN.md:** P3 rename/delete project
  (interim window.prompt UX → SP3 replaces with Dialog later),
  P4 auto-save edits (debounced PATCH), P9 delete run
  (multi-select).
- **Tier-switching across all 8 fixture keys:** FREE quota,
  BASIC, PRO, PRO_PLUS, MULTI cheapest-first, EXHAUSTED → P10
  upsell, DEACTIVATED → P10 contact-support, QUOTA_EDGE → B11 402.
- **Backend spot-check anchors (carried forward from Session 1):**
  projectQuota per-tier, kmzDownloadUrl past-1h-expiry, B16
  idempotency replay, B17 `exportsBlobUrls=[]`.
- **S1 regression sweep:** verify all 13 S1-row fixes still hold
  after Session 2 features land — especially S1-08 auto-select,
  S1-12 runs reset on Open, S1-13 stale-mutation guard, S1-09
  ResizeObserver refit.

#### Guardrails — fixtures we DO NOT touch in this session

- **B7 fixture project / run** (`prj_b7fixturePROPLUS…` /
  `run_b7fixturePROPLUS…`) — soft-deleting via P3 forces a re-seed
  and breaks the next fixture-session sweep. Do NOT delete.
  Clicking it as P7 → B12 → S3 GET will 404 (fixture seed has DB
  row but no S3 KMZ blob); that's expected behavior, not a bug.
- **DEACTIVATED key** — its state IS the test (`deactivatedAt` set,
  `licensed=false`, `entitlementsActive=false`). Switching to it is
  fine; mutating it is not.
- **QUOTA_EDGE key** — at 3/3 by design. Use it to verify B11 → 402
  only. Deleting any of its projects flips the fixture below quota.

#### Observations

| ID | Surface | Severity | Owner | Status |
|---|---|---|---|---|
| S2-01 | TopBar calc pill display | P3 (defer) | FE | open |
| S2-02 | P3 rename / delete via Cmd-K — UX broken on three counts | P1 | FE | **closed** (SP3 shipped + live-verified 2026-04-30) |

---

**S2-01** — Calc pill display: top-bar shows `50/50 calcs` for the
PRO_PLUS fixture, which has `Free 0/5 + Pro Plus 50/50 remaining`
seeded. The displayed value reflects the highest-tier wallet only,
not the sum across active wallets (`50/55` would also be a
defensible read). Current behavior is plausibly intentional (only
surface wallets with remaining calcs, suppress the 0/5 Free wallet
to reduce visual noise) and not a blocker for any flow today —
the underlying entitlements summary still drives quota gating
correctly. Logged for revisit during MULTI scenario testing
(`sl_live_desktop_test_MULTI_stable` has Free 3/5 + Pro 8/10, both
non-zero), where the display semantics will be more meaningful.

[FE 2026-04-30] Logged. No fix proposed; user said "current
behaviour seems ok, but we will revisit this in detail later."
Status `open` to surface during MULTI scenario testing later in
this session.

---

**P1 verified clean (S2-baseline)** — From the Recents view,
`+ New project` opened native file picker; user selected
`phaseboundary2.kmz`; project loaded, canvas rendered, inspector
appeared with Layout / Energy yield / Runs tabs. Same path as
Session 1's canonical project-open.

---

**S2-02** — P3 rename / delete via Cmd-K palette is broken on
three counts; the affordance is itself the wrong surface
regardless of whether the bugs are fixed.

When the user tried to drive P3 verification (rename + delete the
freshly-created `phaseboundary2` project) through Cmd-K (the only
documented entry point per PLAN.md row P3 notes), three failures
surfaced in succession:

1. **Cmd-K discoverability gap.** With no project in the user's
   prior mental model and no on-screen affordance pointing to the
   palette, the user couldn't locate the rename/delete entry
   points at all. Cmd-K being the sole path is itself a P1 UX
   bug — discoverability against a non-power-user is essentially
   zero. Tab-bar context menu and Recents card menu would both
   solve this; SP3 ships both.

2. **Rename palette item not firing.** Once located, the "Rename
   project…" item doesn't surface its `window.prompt` (or the
   prompt fires but the PATCH silently fails). Root cause unknown
   — diagnosis deferred since SP3 deletes this code path entirely.
   Coding it twice (fix → delete) is wasted work.

3. **Delete palette item skips confirmation.** PLAN.md row P3's
   notes specify `window.confirm()` as the interim guard, but
   live behavior triggers B14 immediately on click without any
   confirmation dialog. Either a regression or the confirm was
   never wired in the first place. Same diagnosis-deferred
   reasoning as bug 2.

4. **Post-delete fallback shows 404.** When the deleted project
   was the active tab, the tab is NOT dropped from the `tabs[]`
   slice. After `currentProject` clears and the user lands on
   Recents, the tab-switch effect re-fires B12 against the
   now-deleted project ID → backend returns 404 → user sees a
   "project not found" overlay on what should be a clean Recents
   view. **This is a real bug that lives in the delete *handler*,
   not the trigger surface** — SP3 has to fix it because both new
   affordances (Recents card ⋯ menu, tab right-click ContextMenu)
   would inherit the same problem otherwise.

**Resolution: SP3.** Bugs 1-3 are deleted along with the Cmd-K
palette items in SP3's "remove existing palette items" step.
Bug 4 (post-delete tab cleanup) is fixed inside SP3's shared
delete-handler refactor. No standalone bug-fix row warranted —
SP3 is the proper fix for the entire surface.

[FE 2026-04-30] Logged. SP3 row in PLAN.md to be expanded with
locked design (5-surface table + 2 shared Dialog modals + delete-
handler tab cleanup). Implementation begins after SP3 row update
is committed.

---

#### Session 2 — paused (inconclusive)

**Reason:** P3's interim Cmd-K affordance is unusable in three
distinct ways (S2-02 above). Driving smoke through a broken
trigger surface generates false signals — a "rename failed" smoke
note doesn't distinguish "B13 wire is broken" from "the palette
item never opened the prompt." Without confidence in the trigger,
the smoke produces noise instead of evidence.

**Decision (FE + user, 2026-04-30):** pause Session 2; complete
SP3 (which deletes the broken Cmd-K affordance, ships the proper
Recents-card-⋯ + tab-context-menu UX, fixes the post-delete tab
cleanup); resume smoke as **Session 3** against an actually-
complete feature surface.

**Coverage carry-forward to Session 3:**
- P3 rename / delete (via SP3's new Dialog modal flow) — primary
- P4 auto-save edits (debounced PATCH)
- P9 delete run (multi-select via "Delete N" button)
- Tier-switching across all 8 fixture keys: FREE / BASIC / PRO /
  PRO_PLUS / MULTI / EXHAUSTED / DEACTIVATED / QUOTA_EDGE
- Backend spot-check anchors (carried from Session 1):
  projectQuota per-tier, kmzDownloadUrl past-1h-expiry, B16
  idempotency replay, B17 `exportsBlobUrls=[]`
- S1 regression sweep (13 row-fixes from Session 1)
- S2-01 calc-pill display semantics revisit during MULTI scenario

**Session 2 status: closed inconclusive.** No fixes flowed from
this session; the only artifact is S2-02's diagnostic + the
Session 3 coverage list above.

---

#### S2-02 closeout — SP3 shipped + live-verified (2026-04-30)

SP3 implementation landed at `2d38d97` on `post-parity-v1-desktop`
+ a follow-up polish commit (icons, cursor-pointer, drop ellipsis
suffix, stopPropagation on menu content, type-to-confirm gate on
Delete dialog). Live verification flow on `localhost:3003`:

1. **Rename via Recents card ⋯ menu** — Pencil icon left-aligned
   in dropdown, hover-bg muted, cursor-pointer. Click → Dialog
   opens with current name pre-filled. Save → B13 PATCH lands +
   tab title syncs (when project has an open tab) + dialog
   closes. Confirmed via `GET /v2/projects` — response shows new
   name + bumped `updatedAt`.
2. **Rename via tab right-click ContextMenu** — same Pencil icon,
   same dialog component instance per tab, same persistence.
   `GET /v2/projects` confirms second rename also persisted.
3. **Delete via Recents card ⋯ menu** — Trash2 icon, error-tone
   red text, hover-bg `--error-muted` (token-correct), cursor-
   pointer. Click → confirm Dialog opens. Delete button starts
   **disabled**; Type-to-confirm input below the warning copy
   gates the destructive action (must type literal `delete`,
   case-insensitive). After typing → button enables → click
   fires B14 + clears slice + closes any tab pointing at the
   project (tab cleanup in `useDeleteProject.onSuccess` runs
   BEFORE clearAll, so the tab-switch effect doesn't fire B12
   against the deleted ID — bug 4 fixed).
4. **Delete via tab right-click ContextMenu** — same dialog, same
   gate, same B14 path, same tab cleanup.
5. **Cmd-K palette** — verified the previous broken Rename /
   Delete items are gone. Recents submenu shows the user's
   projects (alphabetical from B10's `updatedAt DESC`); click
   navigates via the existing `handleOpenProjectById` flow.
6. **Click-bubble fix verified** — clicking Rename/Delete items
   no longer cascades through the card's onClick (which would
   have navigated to project detail). `stopPropagation` on
   DropdownMenuContent + ContextMenuContent (covers the React
   synthetic-event bubble through portaled menu trees).

**Bonus discovery during verification.** While confirming the
rename persisted via `GET /v2/projects`, the response surfaced
backend's `mostRecentRunThumbnailBlobUrl` field on every project
card — meaning **backend already shipped B24 (B10 projection
extension) AND B23 (the wire shape + B17 deterministic-sign +
RUN_RESULT_SPEC.thumbnail)**. URLs are signed against the
locked Path A deterministic key path
`projects/<userId>/<projectId>/runs/<runId>/thumbnail.webp` and
return signed-but-blob-missing 404s right now (the sidecar
`/layout/thumbnail` endpoint isn't built yet, so no blobs have
been PUT). The always-sign + `<img onError>` fallback contract
is working as designed — exactly what memo v3 §10 Q1 locked.

This unblocks SP1's desktop adapter work as soon as the sidecar
endpoint ships (matplotlib reuse + Pillow WebP encoding per memo
§5). SP4's adapter unblocks immediately — the wire field is
already on B10 responses.

**S2-02 status:** closed. Resolution path was correct
(replace-the-surface, not patch-the-bugs). No regression smoke
needed against the original Cmd-K bugs since the code path
that exhibited them is gone from the codebase.

---

