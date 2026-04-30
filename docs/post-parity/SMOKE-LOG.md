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

#### Observations

| ID    | Sev | Surface  | Owner | Title                                                       | Repro                                                                                                | Acceptance                                                              | Status | Linked | Thread (see below per ID) |
|-------|-----|----------|-------|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|--------|--------|---------------------------|
| S1-01 | P3  | frontend | fe    | License submit button enables on any non-empty input        | 1. Clean launch → F1 splash. 2. Type `test` (any non-empty value). 3. Submit button is enabled.       | Decision deferred — revisit at end of session.                          | deferred | F1     | see S1-01 below           |
| S1-02 | P0  | frontend | fe    | Tauri HTTP capability scope blocks all S3 origins           | 1. Sign in with PRO. 2. Click "+ New project". 3. Pick any KMZ. 4. Tauri shows error popup: "Couldn't open KMZ — url not allowed on the configured scope: https://solarlayout-local-projects.s3.ap-south-1.amazonaws.com/…" | tauriFetch PUT/GET against `solarlayout-{local,dev,prod}-projects.s3.ap-south-1.amazonaws.com` succeeds; new-project / open-project / generate-layout / open-run flows complete. | fixed  | F6     | see S1-02 below           |
| S1-03 | P3  | frontend | fe    | StatusBar drops the line-obstruction count                  | 1. Open `phaseboundary2.kmz` (which contains a TL line obstruction). 2. StatusBar reads `1 boundary · 0 obstacles` despite the TL being clearly rendered as a red dashed polyline on the canvas. | StatusBar text includes the line-obstructions count when non-zero (or shows it always for symmetry).                          | fixed  | F4     | see S1-03 below           |
| S1-04 | P2  | frontend | fe    | Inspector renders project-shape forms when no project loaded | 1. Sign in. 2. Close active project (or land on RecentsView fresh). 3. Right-side Inspector still shows Layout/Energy yield/Runs tabs + populated Module/Table/Spacing/Site/Inverter forms with editable defaults. Breadcrumb correctly reads "No project open." | When no project is loaded: Inspector panel is hidden entirely + the TopBar Inspector toggle button is hidden. Inspector restores on next project open with the user's prior `inspectorOpen` preference.        | fixed  | inline  | see S1-04 below           |
| S1-05 | P3  | frontend | fe    | Redundant `Press ⌘K for commands` pill above the canvas      | 1. Sign in. 2. RecentsView (or any canvas state). 3. Floating `Press ⌘K for commands` pill renders top-left of canvas, duplicating the TopBar's palette button. | Floating hint removed; TopBar's palette button is the canonical entry point.                                                                                                                                  | fixed  | inline  | see S1-05 below           |

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

---
