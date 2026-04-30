# Resume prompt — post-compaction handoff (mid-S4, 2026-04-30)

Copy the block between `--- BEGIN PROMPT ---` markers as the first
message in the resumed session. Reads in ~3 minutes.

The full prompt is also reproduced inline in the current chat.

---

--- BEGIN PROMPT ---

# Resuming post-parity desktop work — 2026-04-30 mid-S4

You're resuming a multi-week post-parity build on the
`pv_layout_project` repo. Context was compacted at this checkpoint
mid-way through S4 (account menu).

## Branch state

Working directory: `/Users/arunkpatra/codebase/pv_layout_project`.
Branch: `post-parity-v1-desktop` (DO NOT push directly to main).
HEAD: `6c5d6bc feat(desktop): S2 — multi-tab top bar` (pushed).

Plan status: **18 / 52 rows done** in [docs/PLAN.md](docs/PLAN.md).

Recent commits (newest first):

```
6c5d6bc S2  — multi-tab top bar
6ee56b6 P10 — quota indicator + upsell branch table in TopBar
33493f7 P9  — soft-delete runs (multi-select toolbar)
bc90427 P7  — run detail view (B17 + S3 GET + canvas reload)
b1b5123 P5  — runs list view (gallery + list toggle)
80773f0 S3  — recents view (default startup screen)
3735b57 P4  — auto-save edits (debounced PATCH)
576bc56 P3  — rename + soft-delete project
d44a8a0 P6  — Generate Layout flow (B16 + sidecar + S3 PUT)
c87b61f P2  — open-existing-project flow (B12 + S3 GET)
```

Earlier sweep also includes F1–F6, S1, P1, lockstep `entitlementsActive`,
and the fixture-session smoke (`d545bec`). All ahead of the previous
checkpoint at `cd9b0ea`.

Test totals at HEAD: **519 across 3 packages green** (176 entitlements-
client + 28 ui + 315 desktop). All four gates green every commit.

## What I was in the middle of

**S4 — Account menu (license, sign-out, quota indicator).** Tier T1,
deps F2 ✓. The user interrupted right as I was reading TopBar.tsx's
DropdownMenu structure.

Current state of the account menu (in
`packages/ui/src/compositions/TopBar.tsx`):

```
[avatar button]
  ↓
DropdownMenu:
  - User name + email
  - --- separator ---
  - "Account" label
  - Settings           (Cmd-,)
  - View license       (opens LicenseInfoDialog)
  - Clear license
  - --- separator ---
  - About SolarLayout
```

What S4 needs (per the row spec):
- **Masked license key** displayed in the menu (e.g. `sl_live_…XYZ4`)
- **Inline quota summary** — calcs + projects remaining, mirrors what
  P10's QuotaIndicator surfaces in the TopBar chip
- **Sign-out** — already exists as "Clear license"
- **"Buy more"** menu item → opens marketing site via `@tauri-apps/
  plugin-shell.open` (same pattern QuotaIndicator + LicenseKeyDialog use)

Acceptance: Menu visible; quota numbers accurate; sign-out clears
keychain + reloads to F1 sign-in.

## Implementation plan for S4

**TopBar prop additions** (in `packages/ui/src/compositions/TopBar.tsx`):
```ts
maskedLicenseKey?: string         // e.g. "sl_live_…XYZ4"
quotaSummary?: ReactNode          // small text node, app provides
onBuyMore?: () => void            // optional; if set, render menu item
```

Render order in the dropdown:
1. User name + email block (existing)
2. **NEW**: license key + quota summary block
3. --- separator ---
4. "Account" label
5. Settings
6. View license / Clear license
7. **NEW**: "Buy more"
8. --- separator ---
9. About SolarLayout

**App.tsx wiring**:
```ts
const maskedKey = savedKey
  ? `${savedKey.slice(0, 8)}…${savedKey.slice(-4)}`
  : undefined
const quotaSummary = (
  <span className="text-[11px] text-[var(--text-muted)]">
    {entitlements.remainingCalculations} calcs ·{" "}
    {entitlements.projectsRemaining} projects remaining
  </span>
)
const handleBuyMore = useCallback(() => {
  const url = "https://solarlayout.in/pricing"
  if (inTauri()) void openExternalUrl(url)
  else window.open(url, "_blank", "noopener,noreferrer")
}, [])
```

**TopBar tests**: extend `packages/ui/src/compositions/TopBar.test.tsx`
to assert the new menu items render when their props are supplied.

**Sign-out flow** is already correct — `onClearLicense` clears the
keyring and the entitlements query resets to the no-license splash;
no work needed.

**No new client method, no new hook, no new fixture-session work** —
S4 is pure UI composition.

## Locked architectural decisions — DO NOT relitigate

These hold across F1–F6, P1–P10, S2, S3:

- **Cloud-first**: no internet → no app. Project state in Postgres + S3.
- **TS-extension architecture**: `@tauri-apps/plugin-http` delegates to
  native Rust HTTP — no separate Rust client crate.
- **License-key bearer auth** (`sl_live_*`); never Clerk on the desktop.
- **AWS S3 in `ap-south-1`** (account `378240665051`, IAM user
  `renewable-energy-app`). Bucket family `solarlayout-{env}-projects`.
- **V2 envelope**: `{success: true, data: T}` / `{success: false,
  error: {code, message, details?}}`. V1 routes use the looser
  `{error: {message, code?}}` shape.
- **V2ErrorCode union** (locked exhaustive): `UNAUTHORIZED`,
  `VALIDATION_ERROR`, `PAYMENT_REQUIRED`, `CONFLICT`, `NOT_FOUND`,
  `S3_NOT_CONFIGURED`, `INTERNAL_SERVER_ERROR`.
- **`licensed`/`entitlementsActive` branch table** (P10 surfaces this):
  - 401 → bad key
  - 200 + licensed=true → normal
  - 200 + licensed=false && entActive=true → exhausted (Buy more)
  - 200 + licensed=false && entActive=false → deactivated (Contact support)
- **Project quotas (concurrent)**: Free=3, Basic=5, Pro=10, Pro Plus=15.
- **PAYG-only at v1**: $1.99 / $4.99 / $14.99 packs. No subscriptions.
- **Idempotency**: UUID v4 per "Generate Layout" intent, reused across
  retries. Server's `@@unique(userId, idempotencyKey)` dedupes.
- **Multi-tab model**: tab metadata only (`{id, projectId, projectName}`).
  Switch tabs = re-load via P2's B12 + S3 GET. ~1s switch latency
  accepted; only ONE project's state in memory at a time.

## Backend status (last known)

Branch `post-parity-v2-backend` in `/Users/arunkpatra/codebase/renewable_energy`.

**Feature-complete for V2 launch** except **B20** (mvp_web download
pause — held by design until end-to-end ready).

Done: B1–B19 + B21 + post-fixture extensions (`entitlementsActive` on
B8, `kmzDownloadUrl` on B12, `RunWire`/`RunUploadDescriptor`/
`CreateRunResult` still service-local in `mvp_api/runs.service.ts`,
backend offered to move to `packages/shared/src/types/project-v2.ts`
on request — not asked yet, no urgency).

Local mvp_api on `http://localhost:3003`. Desktop's local-dev
override is `VITE_SOLARLAYOUT_API_URL=http://localhost:3003` in
`apps/desktop/.env.local`.

## Test fixture license keys (stable)

Re-seed in the backend repo:
`bun run packages/mvp_db/prisma/seed-desktop-test-fixtures.ts`

| Scenario     | License key                                   |
|--------------|-----------------------------------------------|
| FREE         | `sl_live_desktop_test_FREE_stable`            |
| BASIC        | `sl_live_desktop_test_BASIC_stable`           |
| PRO          | `sl_live_desktop_test_PRO_stable`             |
| PRO_PLUS     | `sl_live_desktop_test_PRO_PLUS_stable`        |
| MULTI        | `sl_live_desktop_test_MULTI_stable`           |
| EXHAUSTED    | `sl_live_desktop_test_EXHAUSTED_stable`       |
| DEACTIVATED  | `sl_live_desktop_test_DEACTIVATED_stable`     |
| QUOTA_EDGE   | `sl_live_desktop_test_QUOTA_EDGE_stable`      |

B7 fixture IDs (PRO_PLUS owns these):
- `projectId = prj_b7fixturePROPLUS00000000000000000000`
- `runId = run_b7fixturePROPLUS00000000000000000000`

## Last fixture-session run

`bun run apps/desktop/scripts/fixture-session.ts` against
`localhost:3003` produced **27 pass / 0 fail / 2 warn** (P9-era;
extends with B10/B12/B13/B14/B16/B17/B18 round-trips). The 2 carry-
over warnings from P6:

1. B16 idempotency replay returns observably-IDENTICAL upload URL
   (AWS SigV4 determinism — same signing inputs within the same second
   produce the same signature). Not a bug.
2. B16 EXHAUSTED → 402 path covered by hook unit test, not by live
   fixture sweep — the EXHAUSTED fixture also has `projectQuota=0` so
   couldn't pre-create a project to drive B16 against.

## Key files for re-reading

- [docs/PLAN.md](docs/PLAN.md) — active backlog. Each row carries a
  detailed implementation note.
- [packages/entitlements-client/src/types-v2.ts](packages/entitlements-client/src/types-v2.ts)
  — V2 wire-shape mirrors. Lockstep update obligation in the header.
- [packages/entitlements-client/src/client.ts](packages/entitlements-client/src/client.ts)
  — V2 client methods (B6/B7/B8/B9/B10/B11/B12/B13/B14/B16/B17/B18).
- [apps/desktop/src/App.tsx](apps/desktop/src/App.tsx) — orchestrator.
- [apps/desktop/src/state/](apps/desktop/src/state/) — slices:
  project, runs (in project), tabs, layoutResult (with resultRunId),
  layerVisibility, layoutParams, editingState, projectEdits.
- [apps/desktop/src/auth/](apps/desktop/src/auth/) — hooks for every
  V2 mutation + queries (useEntitlements, useReportUsage,
  useCreateProject, useOpenProject, useGenerateLayout, useOpenRun,
  useDeleteRun, useRenameProject, useDeleteProject,
  useAutoSaveProject, useProjectsList).
- [apps/desktop/src/recents/RecentsView.tsx](apps/desktop/src/recents/RecentsView.tsx)
- [apps/desktop/src/runs/RunsList.tsx](apps/desktop/src/runs/RunsList.tsx)
- [apps/desktop/src/tabs/TabsBar.tsx](apps/desktop/src/tabs/TabsBar.tsx)
- [apps/desktop/scripts/fixture-session.ts](apps/desktop/scripts/fixture-session.ts)
  — runtime smoke against live mvp_api.
- [packages/ui/src/compositions/TopBar.tsx](packages/ui/src/compositions/TopBar.tsx)
  — has the DropdownMenu I'm extending for S4.
- [packages/ui/src/compositions/AppShell.tsx](packages/ui/src/compositions/AppShell.tsx)
  — has the new `tabsBar` slot (S2).

## What's left after S4

- **P8** (Compare 2 runs) — deferred. Depends on R1 (Phase 4 summary
  table) which isn't done yet. Not blocking.
- **Phase 4** (Legacy GUI parity) — most of it shipped via the parity
  sweep; the row entries in the post-parity plan track incremental
  polish. Not actively scheduled.
- **Phase 5** (X1–X5 polish — settings dialog, dark theme, auto-update,
  crash reporting, telemetry).

The desktop V2 backend integration is now feature-complete. Remaining
UX debt: the interim `window.prompt()` / `window.confirm()` patches in
P2 + P3 (proper inline rename + Dialog confirms when polish lands).

## Process discipline reminders

- TDD-first per row: failing test → minimal impl → green → commit.
- Atomic commit per row: `feat(scope): description`. Intra-row
  checkpoints use `wip:` and squash at row close.
- Pre-commit gate from repo root:
  `bun run lint && bun run typecheck && bun run test && bun run build`
  (skip Python pytest unless touching the sidecar).
- Mark row done in PLAN.md in the same commit that closes it; bump
  the status counter at the top.
- Use TodoWrite for multi-step rows.
- For UI components: token-driven, hover surfaces, `data-tauri-drag-region`
  on draggable surfaces in TopBar (already wired).
- Backend session is in a separate Claude Code on the
  `renewable_energy` repo. Coordinate via paste-ready messages when
  contracts cross — no automated linkage.

## Standing by

Read this prompt + scan the four most recent commits + PLAN.md's
recently-closed rows. Then proceed with **S4 — finish the account
menu**: prop additions to TopBar + App.tsx wiring + tests. After S4,
options are P8 (waits on R1), Phase 4 polish, or Phase 5.

--- END PROMPT ---
