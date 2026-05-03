# Cloud-Offload Compute Architecture — Master Spec

**Status:** Locked (2026-05-03). Living document — updated per row close.
**Owner:** Arun (engineering authority) + Prasanta (solar-domain authority).
**Supersedes:** `docs/post-parity/PRD-cable-compute-strategy.md`, `docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md`, the architectural framing of `docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md` §B.6, and the halted plan at `docs/superpowers/plans/2026-05-02-b32-failed-runs-path.md`. See §14 for the full disposition.
**Cross-references:** `docs/initiatives/post-parity-v2-backend-plan.md`, `docs/PLAN.md`, `CLAUDE.md`.

> **Cold-session reader:** if you arrived here via a fresh Claude Code session, skip to §13 for the prompt that launched you, then read this document end-to-end **before any code action**. Locked decisions (D1–D22) are non-negotiable; row scopes (C1–C20) are bounded; reality wins over spec on the verifications.

---

## 1. Executive Summary

We are moving the entire heavy compute path of SolarLayout off the user's machine and into AWS. The Python sidecar (`python/pvlayout_engine/`) dies; its domain-knowledge core (`pvlayout_core/`) lives on as a standalone library packaged into Lambda container images. The Tauri desktop becomes a thin HTTP+UI client identical in shape to the future Expo/React-Native mobile app. Heavy compute runs in SQS-triggered Lambdas that write directly to RDS via psycopg2; fast operations run in synchronously-invoked Lambdas. Compute artifacts (layout JSON + DXF + PDF + KMZ + thumbnail) are pre-rendered together inside one Lambda invocation per Run; download buttons are pure presigned-GET URL fetches.

This is the architectural reset that unblocks mobile, retires the PyInstaller bundling burden, gives us a single execution path and a single engine-version source of truth, and provides honest horizontal-scale headroom under SQS at-least-once semantics. The trade is ~3-15s of network latency on operations that are instant locally today, accepted in exchange for one engine, one contract, one form-factor-agnostic compute path.

## 2. Goals & Non-Goals

**Goals (v1):**
- Single execution path for heavy compute, runnable from desktop and mobile clients identically.
- Sidecar deletion as a first-class outcome (not a vague "eventually").
- Clean cancel + fail + refund semantics with `Run.status` as the single lifecycle truth.
- Retry-safe at every layer: SQS at-least-once + idempotent UPDATE patterns + DLQ from day 1.
- Pre-paid-pack reliability — never lose a calc to infrastructure flakiness.

**Non-goals (v1, explicitly):**
- Per-plot fan-out (`Slice` table). Future ladder only — see §10.
- Functional split of energy from layout into separate Lambdas. Future ladder only.
- Fargate / ECS deployment. Same Docker image is portable to ECS via `CMD` change; not built.
- IaC (Terraform / CDK). Manual `aws` CLI provisioning is acceptable v1.
- Server-side rate limiting. Client-side debounce + idempotency is sufficient.
- DLQ replay tooling in mvp_admin. Manual-CLI replay is acceptable v1.
- Wasm / Pyodide client-side parsing. One execution path; KMZ parses in cloud.
- Telemetry endpoint (`B22`). Deferred.
- Provisioned concurrency on Lambdas. Cold start absorbed by spinner UX.

## 3. Locked Architectural Decisions

These came out of the brainstorm captured in this session (transcript-level notes superseded by this file). Cite by ID in implementation rows. Spec amendments require a dedicated commit with the changed D-ID and rationale.

- **D1 — Cloud-offload model.** Heavy compute moves to AWS Lambda containers. Tauri and future Expo/RN apps are thin HTTP+UI clients.
- **D2 — Sidecar dies.** `python/pvlayout_engine/` is removed in C18. No sidecar in the end state on any form factor.
- **D3 — Figma-style edits.** Drawing obstructions / adding roads / overriding ICR positions are client-side state mutations on `Project.edits` (autosaved via existing B13). The server only ever receives `(KMZ, edits, params) → fresh Run`. There are no incremental-edit endpoints in the cloud world.
- **D4 — One engine, one knowledge asset.** `pvlayout_core/` is the single source of solar-domain truth. Prasanta is the authoritative reviewer for that surface. Lambdas + handlers + glue are SWE-side.
- **D5 — Lambda Dockerfile `COPY` from monorepo.** No wheel registry. Build context is the repo root; Dockerfiles `COPY python/pvlayout_core` + `pip install` it directly. Image tag = git SHA.
- **D6 — `pvlayout_core/` extracted standalone.** New location: `python/pvlayout_core/` (sibling to the dying `pvlayout_engine/`), own `pyproject.toml`, own `tests/`, own CI gate. C2.
- **D7 — Sync invoke for sub-2s workloads.** Only `parse-kmz` qualifies in v1. mvp_api invokes via `LambdaClient.Invoke({InvocationType: "RequestResponse"})` and blocks on the response.
- **D8 — SQS async for minutes-long workloads.** `compute-layout` and `detect-water` are SQS-triggered. Standard queues (not FIFO). DLQ from day 1 with `RedrivePolicy.maxReceiveCount = 3`. Visibility timeout = Lambda timeout × 1.2.
- **D9 — Lambda direct-to-RDS, no callbacks.** Lambdas hold the RDS connection string in env and write `Run.status` + `UsageRecord` rows directly via psycopg2. There are no internal HTTP callback endpoints, no internal-secret middleware, no `MVP_INTERNAL_SHARED_SECRET`. The halted B32 plan was wrong on this axis; it is deleted in C1.
- **D10 — One Lambda = one image = one package.** No mono-image dispatch. Each `python/lambdas/<purpose>/` is its own deployment artifact with its own dependency graph and memory/timeout config.
- **D11 — Per-Run unit of compute (v1).** One SQS message per Run, one Lambda invocation per Run, one Run row, one S3 layout result blob. No `Slice` table. Per-plot fan-out is v3 (§10), not built.
- **D12 — Pre-render all artifacts inside `compute-layout`.** A single Lambda invocation produces layout JSON + DXF + PDF + KMZ + thumbnail and PUTs all five to S3 at deterministic key paths. Conditional content (energy section, cable layers) is decided by the rendering functions inside `pvlayout_core/exporters/`. There are no separate `export-*` Lambdas.
- **D13 — Energy rolled into `compute-layout` (v1).** No separate `compute-energy` Lambda. Functional split is v2 future ladder.
- **D14 — Idempotent slice-update SQL.** Lambdas update `Run` with `WHERE status IN ('RUNNING')` so SQS at-least-once redelivery is harmless. Even though there's no `Slice` table v1, the pattern is established for v3 forward-compat.
- **D15 — `Run.status` is the single lifecycle truth.** Lifecycle: `QUEUED` (mvp_api creates) → `RUNNING` (Lambda picks up) → `DONE | FAILED | CANCELLED`. No separate `Job` table. Status enum already supports this post-B29 (RUNNING/DONE/CANCELLED/FAILED — adding QUEUED needs verification, see §11).
- **D16 — Cancel: B30 + Lambda cancel-marker check.** Desktop calls B30 `cancelRunV2` (already shipped). Lambda's completion path does `SELECT … FOR UPDATE` on `Run.status` immediately before flipping to DONE; if status is CANCELLED, abort the upload (best-effort S3 cleanup; orphan tolerable).
- **D17 — Fail: Lambda direct write.** Lambda's exception handler runs the same transactional pattern as the cancel endpoint: `BEGIN → UPDATE Run SET status='FAILED', failedAt=NOW(), failureReason=<text> + INSERT UsageRecord (count=-1, kind='refund', refundsRecordId=<original>) → COMMIT`. No HTTP callback. The B27 memo §B.6 is amended in C1.
- **D18 — Stuck-RUNNING reconciler.** A scheduled job (mvp_api cron, or Vercel Cron, or admin-triggered to start) sweeps Runs in `RUNNING` state older than N minutes (default 30) and flips them to `FAILED` with `failureReason='reconciler:timeout'` + refund row. Catches Lambdas that crash before writing FAILED.
- **D19 — Orchestrator publish-then-commit.** mvp_api opens a DB tx → entitlement debit + UsageRecord (charge) + Run create (status=QUEUED) → SQS SendMessage → COMMIT. SQS failure rolls the tx back. Outbox pattern deferred until observed need.
- **D20 — Lambda credentials via env.** RDS connection string + AWS region in Lambda env vars. Rotate via Secrets Manager when compliance asks. No IAM-database-auth in v1.
- **D21 — Engine version recorded per Run.** `compute-layout` writes the git SHA of its image to a new column `Run.engineVersion: String?` (added in C7's mvp_api migration row). Mid-deploy drift is observable by post-hoc query.
- **D22 — Lambda → ECS portability.** Same Docker image works for ECS via `CMD` change. Documented escape hatch; not built v1.

## 4. Architecture Overview

```
            ┌────────────┐                       ┌────────────┐
            │   Tauri    │                       │   Expo /   │
            │  desktop   │                       │ RN mobile  │
            └─────┬──────┘                       └─────┬──────┘
                  │   HTTPS (license-key bearer)        │
                  └──────────────┬──────────────────────┘
                                 ▼
                        ┌─────────────────┐
                        │     mvp_api     │   Hono/Bun on Vercel
                        │  (orchestrator) │
                        └───┬─────┬───┬───┘
                            │     │   │
       ┌────────────────────┘     │   └──────────────────┐
       │                          │                       │
       ▼                          ▼                       ▼
┌──────────────┐         ┌────────────────┐      ┌────────────────┐
│ parse-kmz    │         │  SQS queue     │      │  RDS Postgres  │◄──┐
│ Lambda       │         │ compute-layout │      │  (mvp_db)      │   │
│ (sync invoke)│         │  + DLQ         │      └────────────────┘   │
└──────────────┘         └───────┬────────┘                           │
                                 │                                    │
                                 ▼                                    │
                        ┌────────────────┐    psycopg2: UPDATE Run    │
                        │ compute-layout │ ───────────────────────────┘
                        │ Lambda image   │
                        │ (pvlayout_core │
                        │  inside)       │
                        └───────┬────────┘
                                │
                                ▼
                          ┌──────────┐
                          │   S3     │  layout.json, exports/{dxf,pdf,kmz},
                          │ projects │  thumbnail.webp
                          │  bucket  │
                          └──────────┘
```

**Generate-Layout flow (canonical):**

1. Desktop POST `/v2/projects/:id/runs` (B16) with `{params, edits, idempotencyKey}`.
2. mvp_api opens tx → debit entitlement + UsageRecord(charge) + Run.create(status=QUEUED) → SQS SendMessage to `pvlayout-compute-layout-jobs` → COMMIT (D19).
3. mvp_api returns `{run, ...}` immediately. Desktop starts polling `GET /v2/projects/:id/runs/:runId` (B17) every ~2s.
4. SQS triggers `compute-layout` Lambda. Lambda's first action: `UPDATE Run SET status='RUNNING' WHERE id=$1 AND status='QUEUED'` (idempotent against redelivery, D14).
5. Lambda fetches KMZ from S3 (already there from B6 at project create), runs `pvlayout_core.run_layout(...)`, then renders DXF + PDF + KMZ + thumbnail inline (D12). All artifacts PUT to S3 at deterministic keys.
6. Before flipping DONE, Lambda re-reads `Run.status` `FOR UPDATE` (D16). If CANCELLED, abort upload + S3 cleanup. Else `UPDATE Run SET status='DONE', engineVersion=<git_sha>, exports_blob_urls=[...]`. COMMIT.
7. Desktop's poll sees `status='DONE'`, fetches presigned-GET URLs for layout + thumbnail, renders. Download buttons each fetch their own presigned URL on click.

**Cancel flow:** Desktop POST B30 (`cancelRunV2`, already shipped). mvp_api flips status + inserts refund + decrements entitlement in one tx (D16). In-flight Lambda's `FOR UPDATE` check sees CANCELLED at completion and aborts (D16).

**Fail flow:** Lambda's top-level try/except catches engine errors, runs the transactional refund pattern directly via psycopg2 (D17). DLQ catches Lambdas that crash before writing FAILED. Reconciler (D18) sweeps any remaining stuck-RUNNING.

## 5. Schema State

**Already in place (no migrations required v1):**
- `Run` with status enum (RUNNING, DONE, CANCELLED, FAILED), `cancelledAt`, `failedAt`, `failureReason` (B29).
- `UsageRecord` with `kind`, `count`, `refundsRecordId` self-relation (B29).
- `Project.boundaryGeojson`, `Project.edits` (B3, B26).
- Idempotency on `(userId, idempotencyKey)` (B2).
- `Run.exportsBlobUrls Json @default("[]")` (B4) — slot for the artifact array populated by D12.

**Adds in C7:**
- `Run.engineVersion: String?` — git SHA of the Lambda image that produced the result.
- `Run.status` enum extended to include `QUEUED` (verify whether the existing string column accepts this without migration; new index entry).

**Future-ladder (not built):**
- `Slice` table (per-plot fan-out, v3 only, §10).

## 6. Wire Contracts

| Surface | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| Project create | POST | `/v2/projects` (B11) | desktop / mobile | unchanged |
| KMZ upload URL | POST | `/v2/blobs/kmz-upload-url` (B6) | desktop / mobile | unchanged |
| Project KMZ parse | POST | `/v2/projects/:id/parse-kmz` | desktop / mobile | **NEW** (C4) — sync invokes parse-kmz Lambda |
| Run create + dispatch | POST | `/v2/projects/:id/runs` (B16) | desktop / mobile | **AMENDED** (C7) — adds SQS publish |
| Run poll | GET | `/v2/projects/:id/runs/:runId` (B17) | desktop / mobile | unchanged shape; carries new status states |
| Run cancel | POST | `/v2/projects/:id/runs/:runId/cancel` (B30) | desktop / mobile | already shipped; desktop wires in C10 |
| Run delete | DELETE | `/v2/projects/:id/runs/:runId` (B18) | desktop / mobile | unchanged |
| Export download URL | GET | `/v2/projects/:id/runs/:runId/exports/:type` | desktop / mobile | **NEW** (C17) — mints presigned-GET; `type ∈ {dxf, pdf, kmz}` |
| Water-detect dispatch | POST | `/v2/projects/:id/water-detect` | desktop / mobile | **NEW** (C16) — publishes to SQS |
| Stuck-run reconciler | (cron) | internal | Vercel Cron / equivalent | **NEW** (C13) |

All routes use license-key bearer auth (`Authorization: Bearer sl_live_*`) via the existing `licenseKeyAuth` middleware. No new auth scheme.

## 7. Repo Layout (target end state)

```
pv_layout_project/
├── apps/
│   ├── desktop/                            (Tauri + React; thinner)
│   ├── mvp_api/                            (Hono/Bun + new SQS lib + new Lambda invoke)
│   ├── mvp_web/
│   └── mvp_admin/
├── packages/
│   ├── entitlements-client/                (extended in C9, C17)
│   ├── mvp_db/                             (one migration in C7 for engineVersion)
│   ├── shared/
│   ├── sidecar-client/                     (DELETED in C18)
│   └── ui/, ui-desktop/, ...
└── python/
    ├── pvlayout_core/                      ← extracted in C2; the engineering asset
    │   ├── pyproject.toml
    │   ├── pvlayout_core/
    │   └── tests/
    ├── pvlayout_engine/                    ← DELETED in C18
    └── lambdas/                            ← new in C3
        ├── parse-kmz/
        │   ├── pyproject.toml
        │   ├── parse_kmz_lambda/
        │   ├── Dockerfile
        │   └── tests/
        ├── compute-layout/
        │   ├── pyproject.toml
        │   ├── compute_layout_lambda/
        │   │   ├── handler.py
        │   │   └── db.py
        │   ├── Dockerfile
        │   └── tests/
        └── detect-water/
            └── (same shape)
```

`pvlayout_core` consumed by Lambdas via `[tool.uv.sources]` path dep locally; via Dockerfile `COPY` at image build (D5).

## 8. Migration Sequencing

**Sidecar coexists with Lambdas during the cutover** so we never have both desktops broken at once. Per route, the desktop has a feature flag (`USE_CLOUD_PARSE`, `USE_CLOUD_LAYOUT`, etc.) that toggles between sidecar and cloud paths. We flip flags one at a time after each Lambda lands and is verified.

Order:
1. Doc cleanup (C1) — clear contradictions before writing new code.
2. `pvlayout_core` extracted (C2) — domain code is now independently versionable.
3. Lambda monorepo scaffolding + first Lambda (C3, C4) — `parse-kmz` cuts over via flag.
4. SQS + heavy Lambda (C5, C6, C7, C8) — `compute-layout` builds and tests in isolation, then wires.
5. Desktop migration off sidecar (C9) — flag flip; sidecar still runs but is unused for layout.
6. Cancel + fail wiring (C10, C11, C12, C13).
7. Visibility (C14, C15).
8. Remaining workloads (C16, C17).
9. Sidecar deletion (C18) — when every flag is permanently flipped.
10. Mobile parity verification (C19) — no new code; confirm forms.
11. Production cutover signoff (C20).

## 9. Implementation Rows

Each row is one cold-session unit. Status is one of `todo | in-progress | done | blocked`. Rows reference locked-decision IDs (D1–D22) to constrain re-debate. Child sessions invoke `superpowers:writing-plans` per row, then `superpowers:executing-plans` (TDD).

### Phase A — Foundation

#### C1 — Doc cleanup

```
Status:   todo
Depends:  none
Tier:     T1

Goal
  Delete or annotate every contradictory / superseded doc so the
  codebase has one source of truth for cloud-offload (this spec).
  See §14 for the full disposition table.

Locked
  D1, D2, D9 (the halted B32 plan is wrong; delete it)

Open verifications
  - Read each doc in the §14 kill list before acting.
  - Confirm referenced-from links (e.g., post-parity-v2-backend-plan.md
    rows B27-B34) are updated to point at this spec.

Acceptance
  - Halted plan file deleted (`docs/superpowers/plans/2026-05-02-b32-failed-runs-path.md`).
  - Cable PRD + offload-feasibility memo annotated SUPERSEDED with link
    to this spec in their headers.
  - B27 memo §B.6 amended (the "internal endpoint sidecar callback"
    paragraph rewritten to point at D9 + D17).
  - post-parity-v2-backend-plan.md B28-B34 row group amended to
    redirect at this spec's C-rows.
  - Atomic commit: `docs: cloud-offload spec lockin + kill stale docs`.

Out of scope
  - Code changes.
  - Deleting historical findings (`docs/post-parity/findings/*` stays).
```

#### C2 — Extract `pvlayout_core` to standalone

```
Status:   todo
Depends:  C1
Tier:     T2

Goal
  Move `python/pvlayout_engine/pvlayout_core/` to
  `python/pvlayout_core/` with its own pyproject.toml, tests, and CI
  gate. The engine layer (`pvlayout_engine/`) keeps depending on it as
  a path dep so the existing sidecar continues to work during cutover.

Locked
  D4, D6

Open verifications
  - Inventory all `from pvlayout_core...` imports across the repo;
    none should break post-move.
  - Verify pytest + uv configs work standalone in the new location.
  - Verify the existing sidecar tests still pass after re-pointing
    its dep path.

Acceptance
  - `python/pvlayout_core/pyproject.toml` exists; `uv sync` clean.
  - All existing tests under `pvlayout_core/tests/` pass under
    `cd python/pvlayout_core && uv run pytest`.
  - `python/pvlayout_engine/pyproject.toml` updated to reference
    `pvlayout_core` as `{path = "../pvlayout_core", editable = true}`.
  - All sidecar tests still pass.
  - CI gate added: `python/pvlayout_core/` has its own pytest job.

Out of scope
  - Code changes inside pvlayout_core (move only).
  - Lambda use of pvlayout_core (that's C3+).
```

### Phase B — First Lambda end-to-end (proves the pattern)

#### C3 — Lambda monorepo scaffolding

```
Status:   todo
Depends:  C2
Tier:     T2

Goal
  Establish `python/lambdas/` with the conventions, shared Dockerfile
  template, CI matrix workflow, and ECR repo naming. The first
  Lambda (parse-kmz, C4) lands using this scaffolding.

Locked
  D5, D10, D22

Open verifications
  - Confirm AWS account `378240665051` + region `ap-south-1` is the
    target (per CLAUDE.md §4.2).
  - Verify GitHub Actions has OIDC role for ECR push; check existing
    workflows for the pattern (likely none post-merge — needs setup).
  - Decide ECR repo prefix (`pvlayout/` recommended; document choice).

Acceptance
  - `python/lambdas/README.md` documents the convention (one folder
    per Lambda, pyproject.toml + Dockerfile + handler/ + tests/).
  - Shared Dockerfile template documented or symlinked.
  - `.github/workflows/build-lambdas.yml` matrix workflow scaffolded;
    initially empty matrix or with parse-kmz only.
  - Naming convention recorded:
      Lambda fn:  pvlayout-<purpose>-<env>
      ECR repo:   pvlayout/<purpose>
      SQS queue:  pvlayout-<purpose>-jobs + -dlq

Out of scope
  - Any Lambda code (that's C4).
  - IaC.
```

#### C4 — `parse-kmz` Lambda end-to-end

```
Status:   todo
Depends:  C3
Tier:     T2 (build + integration test against real Lambda + mvp_api)

Goal
  Ship the first cloud Lambda. Replaces sidecar /parse-kmz behind a
  feature flag. Sync HTTP-invoked from mvp_api. Validates the entire
  monorepo Lambda mechanism on the simplest workload before scaling
  to compute-layout.

Locked
  D2, D5, D7, D10

Open verifications
  - Confirm C2 is done (pvlayout_core extracted standalone).
  - Verify Vercel function timeout for apps/mvp_api accommodates ~2s
    sync wait + Lambda cold start (~3-5s first call); see §11.
  - Verify @aws-sdk/client-lambda is NOT already in apps/mvp_api;
    install if missing.
  - Read current sidecar parse-kmz handler in pvlayout_engine/routes/
    to capture exact request/response contract; mirror it.

Acceptance
  - python/lambdas/parse-kmz/ exists with full structure.
  - Lambda pvlayout-parse-kmz-staging deployed and invokeable.
  - New mvp_api route POST /v2/projects/:id/parse-kmz invokes Lambda
    sync, returns parsed boundaries in V2 envelope.
  - Desktop's useCreateProject flow swaps from sidecar.parseKmz to
    mvp_api parseKmzV2 behind feature flag USE_CLOUD_PARSE (default
    off).
  - Integration test: real KMZ → mvp_api → Lambda → parsed JSON.
  - Sidecar's /parse-kmz STAYS alive (deletion is C18).

Out of scope
  - Production deployment (staging only at this row).
  - Lambda timeout tuning beyond defaults.
  - IaC.
  - Cache layer.
```

### Phase C — Heavy compute Lambda + orchestrator changes

#### C5 — SQS infrastructure for compute-layout

```
Status:   todo
Depends:  C3
Tier:     T1

Goal
  Provision the SQS queue + DLQ + IAM for compute-layout in staging
  + prod, manually via aws CLI. Document the provisioning steps for
  the eventual IaC migration.

Locked
  D8

Open verifications
  - Verify IAM user `renewable-energy-app` (CLAUDE.md §4.2) has
    SQS permissions; extend the inline policy if not.
  - Verify VPC requirements for the Lambda → RDS connection
    (probably needs VPC config to reach RDS; check existing infra).

Acceptance
  - SQS queues: pvlayout-compute-layout-jobs-{staging,prod} +
    pvlayout-compute-layout-jobs-dlq-{staging,prod}.
  - RedrivePolicy: maxReceiveCount = 3; visibility timeout = 1020s
    (Lambda 14min × 1.2 + buffer).
  - CloudWatch alarm on DLQ ApproximateNumberOfMessages > 0 for >5min.
  - `docs/AWS_RESOURCES.md` updated with the new queue ARNs +
    provisioning commands.
  - IAM policy updated additively; verified by aws sts.

Out of scope
  - Any Lambda code.
  - IaC.
```

#### C6 — `compute-layout` Lambda (handler + Dockerfile + tests, no SQS trigger yet)

```
Status:   todo
Depends:  C2, C3
Tier:     T2 (golden-test gate against pvlayout_core)

Goal
  Build the compute-layout Lambda image with the all-in-one handler:
  fetches KMZ from S3, runs pvlayout_core.run_layout, renders DXF +
  PDF + KMZ + thumbnail inline, PUTs all artifacts to S3, writes
  status/engineVersion via psycopg2. Initially testable in isolation
  (no SQS); tests invoke the handler directly with mock event.

Locked
  D5, D9, D10, D11, D12, D13, D14, D17, D20, D21

Open verifications
  - Confirm the existing sidecar /export-{dxf,pdf,kmz} routes use the
    same pvlayout_core exporters we'll call from Lambda (no
    sidecar-only logic in the export path).
  - Confirm thumbnail rendering uses the existing pvlayout_core
    thumbnail module per memo v3.
  - Verify the Run schema columns (status, engineVersion to be
    added in C7, exportsBlobUrls) match the Lambda's UPDATE
    statement.
  - Test golden-equivalence: same KMZ → same layout JSON whether
    run via sidecar today or via Lambda image (cross-engine
    consistency, modulo engineVersion).

Acceptance
  - python/lambdas/compute-layout/ full structure with Dockerfile
    that COPYs pvlayout_core.
  - Image builds locally via docker build.
  - Handler implements the full lifecycle:
      START → SELECT FOR UPDATE → if CANCELLED abort
                                → if QUEUED flip to RUNNING
                                → fetch KMZ from S3
                                → run_layout
                                → render dxf, pdf, kmz, thumbnail
                                  (each in its own try/except)
                                → PUT all artifacts to S3
                                → SELECT FOR UPDATE again (D16)
                                → if CANCELLED abort + S3 cleanup
                                → else UPDATE status=DONE,
                                       engineVersion=git_sha,
                                       exports_blob_urls=[...]
      EXCEPTION → UPDATE status=FAILED + INSERT refund row (D17).
  - Unit tests cover all branches with mocked S3 + DB.
  - Golden test: against complex-plant-layout.kmz fixture, output is
    byte-equal (modulo engineVersion field) to current sidecar output.

Out of scope
  - SQS trigger wiring (C8).
  - mvp_api orchestrator changes (C7).
  - Production deploy.
```

#### C7 — mvp_api orchestrator: SQS publish + engineVersion column

```
Status:   todo
Depends:  C5, C6
Tier:     T2 (integration test mocks SQS)

Goal
  Extend B16 (createRunV2) to publish to SQS after Run.create within
  the same transaction (publish-then-commit, D19). Add migration for
  Run.engineVersion. Add Run.status='QUEUED' as a valid initial
  state.

Locked
  D14, D15, D19, D21

Open verifications
  - Verify Run.status enum's current values; if string column without
    enum constraint, no DDL needed for QUEUED — confirm in schema.
  - Verify @aws-sdk/client-sqs is NOT yet a mvp_api dep; install.
  - Verify the existing reportUsage transaction in B16 — extend it,
    don't replace.
  - Verify Vercel function timeout includes margin for SQS SendMessage
    (~50-100ms typical, fine).

Acceptance
  - Migration adds Run.engineVersion: String? column.
  - apps/mvp_api/src/lib/sqs.ts publishes to compute-layout queue.
  - B16 wraps existing tx + SQS publish; rollback on SQS error.
  - Integration test: mock SQS → POST /v2/projects/:id/runs creates
    Run with status=QUEUED + publishes 1 message; if SQS throws, no
    Run row created.
  - Run.status='QUEUED' returned in the response on success.

Out of scope
  - Lambda actually consuming the message (C8).
  - Outbox pattern.
```

#### C8 — Wire `compute-layout` Lambda to SQS trigger (end-to-end)

```
Status:   todo
Depends:  C5, C6, C7
Tier:     T2 (integration: real SQS + real Lambda + real RDS)

Goal
  Connect the compute-layout Lambda to the SQS queue as event source.
  End-to-end: mvp_api creates Run + publishes → Lambda picks up →
  writes RDS + S3 → desktop polling sees DONE. Staging only.

Locked
  D8, D9, D14

Open verifications
  - Confirm Lambda's IAM execution role has sqs:ReceiveMessage,
    sqs:DeleteMessage on the queue + s3:* on the projects bucket
    + RDS connectivity (VPC).
  - Verify visibility timeout is correct given Lambda timeout.
  - Verify max batch size = 1 (each Run is one message; we don't want
    Lambda batching multiple Runs into one invocation).

Acceptance
  - Lambda function pvlayout-compute-layout-staging deployed with SQS
    event source mapping.
  - End-to-end staging test: trigger via Tauri (or curl), observe
    Run.status transitions QUEUED → RUNNING → DONE, observe S3
    artifacts.
  - DLQ stays empty under normal traffic.

Out of scope
  - Production deploy.
  - Cancel-marker check (C11) — Lambda just runs to DONE in this row.
  - Fail handling integration (C12).
  - Desktop UI changes (C9).
```

#### C9 — Desktop migration off sidecar `/layout/jobs`

```
Status:   todo
Depends:  C8
Tier:     T2 (live verification on staging fixtures)

Goal
  Switch useGenerateLayout from sidecar /layout/jobs polling to
  mvp_api Run.status polling. Behind feature flag USE_CLOUD_LAYOUT.
  Remove per-plot progress UI from RunningPin (D11 implication).

Locked
  D1, D11

Open verifications
  - Read current useGenerateLayout.ts and inventory every reference
    to sidecarClient.startLayoutJob/getLayoutJob/cancelLayoutJob.
  - Identify what RunningPin reads from useCurrentLayoutJobStore
    (LayoutJobState.plots[]) and what its replacement looks like
    (a single status + elapsed timer).
  - Verify B17's response carries status field (post-B30: yes).
  - Verify polling cadence ~2s is fine for mvp_api (no rate-limit
    concern at single-user volume).

Acceptance
  - useGenerateLayout: when USE_CLOUD_LAYOUT, skips sidecar entirely;
    polls mvp_api getRunV2 every 2s until DONE/FAILED/CANCELLED.
  - LayoutJobState reduced to {status, elapsed_estimated_pct?}.
  - RunningPin renders simplified progress (single bar or spinner).
  - All existing tests pass; new tests cover the cloud-flag branch.
  - Live: staging end-to-end verified.

Out of scope
  - Sidecar deletion (C18).
  - Cancel wiring (C10).
```

### Phase D — Cancel + Fail semantics

#### C10 — Desktop cancel modal + cancelRunV2 wiring (was B33)

```
Status:   todo
Depends:  C9
Tier:     T2

Goal
  When user clicks Cancel: show confirmation modal (B27 §B.7), call
  cancelRunV2 (B30, already shipped), let polling loop see CANCELLED.
  Replace the parity-era best-effort deleteRunV2 cleanup.

Locked
  D3 (no incremental edit endpoints), D16

Open verifications
  - Verify B30 endpoint shape from runs.service.ts:cancelRun.
  - Verify entitlements-client doesn't yet have cancelRunV2 method;
    add per the same shape as deleteRunV2.
  - Verify the existing LayoutJobCancelledError handling in
    useGenerateLayout still applies (it should).

Acceptance
  - entitlements-client.cancelRunV2(projectId, runId) added with V2
    envelope handling.
  - Confirmation modal: "Cancel this generation? You'll lose work
    in progress. Your calculation will be refunded." Two buttons.
  - On confirm → cancelRunV2 → polling loop sees CANCELLED → throws
    LayoutJobCancelledError as before.
  - The pre-existing deleteRunV2 cleanup is removed.
  - Tests cover modal + cancel + refund visible in subsequent
    /v2/entitlements call.

Out of scope
  - Lambda-side cancel-marker check (C11).
  - RunsList rendering of CANCELLED state (C14).
```

#### C11 — Lambda cancel-marker check

```
Status:   todo
Depends:  C10
Tier:     T2 (race-test deterministically)

Goal
  In compute-layout Lambda, before flipping Run.status to DONE, do
  SELECT...FOR UPDATE on Run.status. If CANCELLED, abort the upload
  and best-effort delete any S3 objects already PUT. Implements
  D16's "cancel always wins until DONE committed."

Locked
  D16

Open verifications
  - Confirm C6's handler structure already has the post-compute
    transactional block; this row adds the FOR UPDATE re-read.
  - Verify S3 DeleteObject IAM permission on Lambda role.

Acceptance
  - Handler does FOR UPDATE re-read; on CANCELLED, S3 cleanup +
    return without flipping status (status stays CANCELLED from B30).
  - Race test: parallel run that issues B30 cancel mid-handler;
    final state is CANCELLED + no DONE update + S3 best-effort
    cleanup.
  - Integration test confirms refund row exists exactly once
    (B30's, not duplicated by Lambda).

Out of scope
  - Mid-run cancel polling (Lambda checks ONLY at completion, per
    D16 — keeps cost low).
```

#### C12 — Lambda fail path

```
Status:   todo
Depends:  C8
Tier:     T2

Goal
  Top-level try/except in compute-layout handler runs the
  transactional FAILED + refund pattern via psycopg2 (D17). Mirrors
  B30's cancel transaction.

Locked
  D9, D17

Open verifications
  - Read B30 cancelRun service to mirror its tx pattern in Python.
  - Verify failureReason column accepts up to 500 chars (defensive
    cap on stack-trace text).
  - Confirm Lambda's role can write UsageRecord rows.

Acceptance
  - Handler-level try/except wraps everything; on exception:
      BEGIN
      SELECT Run, UsageRecord (charge) FOR UPDATE
      UPDATE Run SET status='FAILED', failedAt=NOW(),
                     failureReason=<stringified>
      INSERT UsageRecord (count=-1, kind='refund',
                          refundsRecordId=<charge.id>)
      UPDATE Entitlement SET usedCalculations -= 1
      COMMIT
  - Tests inject a fault (e.g., mock pvlayout_core.run_layout to
    throw); verify status flip, refund row, entitlement decrement.
  - Idempotent on redelivery: WHERE status IN ('RUNNING') guards.

Out of scope
  - Failure-type taxonomy (one badge per B27 §A.1).
  - Stuck-RUNNING reconciler (C13).
```

#### C13 — Stuck-RUNNING reconciler

```
Status:   todo
Depends:  C12
Tier:     T1

Goal
  Scheduled job sweeps Runs in RUNNING state older than N minutes
  (default 30) and flips them to FAILED with reason
  'reconciler:timeout' + refund row. Catches Lambdas that crash
  before writing FAILED.

Locked
  D18

Open verifications
  - Decide host: Vercel Cron, mvp_api manual admin trigger, or
    standalone scheduler. Vercel Cron preferred; verify availability
    on the project's plan.
  - Decide N (default 30 min; configurable via env).
  - Verify the cron handler can run the same transactional pattern
    as C12 (call shared service function).

Acceptance
  - apps/mvp_api/src/modules/runs/reconciler.ts shared function.
  - Cron route (or admin route) wraps the reconciler.
  - Test: insert a Run with status=RUNNING + createdAt 60min ago →
    invoke reconciler → status flipped, refund written.
  - Logging: counts of swept Runs per invocation.

Out of scope
  - Configurable per-tier timeout (one global value v1).
  - Auto-retry on stuck Run (just FAILED + refund; user retries).
```

### Phase E — Visibility + history

#### C14 — Visible cancelled / failed runs in RunsList + RecentsView (was B28)

```
Status:   todo
Depends:  C10
Tier:     T2

Goal
  RunsList renders status-aware cards: DONE (existing card),
  CANCELLED (Ban icon + "Cancelled" badge), FAILED (AlertCircle +
  "Layout failed"), QUEUED/RUNNING (spinner). RecentsView's
  project-card honors status for thumbnail fallback.

Locked
  D15

Open verifications
  - Confirm RunSummary wire shape carries status (post-B30: extended
    on RunWire; verify it's also on RunSummary used by B12/B15).
  - Read RunsList component to find the existing card variants.
  - Read RecentsView's thumbnail fallback chain.

Acceptance
  - RunsList renders 4 status variants distinctly.
  - Cancelled/failed runs are NOT selectable (no canvas hydration).
  - RecentsView project-card respects last-run status for thumbnail
    placeholder.
  - Tests cover all status branches.

Out of scope
  - Re-running a failed run (deferred).
```

#### C15 — `/dashboard/usage` status badges (was B34)

```
Status:   todo
Depends:  C12
Tier:     T1

Goal
  mvp_web's calc-history table joins Run for status, renders three
  badges (Completed / Cancelled / Failed). Refund rows hidden;
  charge rows show with status. Quota math reflects refunds via
  invisible math.

Locked
  D17

Open verifications
  - Read existing /dashboard/usage page in apps/mvp_web/.
  - Verify the listing endpoint filters or can be extended to filter
    WHERE kind='charge'.
  - Verify Run-join wire shape.

Acceptance
  - Listing endpoint filters kind='charge' + joins Run.status.
  - mvp_web table renders 3 badges.
  - Refund rows invisible to customer; quota number shows correctly.
  - Tests cover all three states.

Out of scope
  - Customer-visible refund history.
  - Notifications on Failed.
```

### Phase F — Remaining workloads

#### C16 — `detect-water` Lambda

```
Status:   todo
Depends:  C5, C8 (pattern reuse)
Tier:     T2

Goal
  Port sidecar /detect-water to a SQS-triggered Lambda. Reuses the
  Lambda monorepo + SQS + RDS-direct patterns from compute-layout.
  Writes water polygons to Project.edits.water_obstructions[].

Locked
  D8, D9, D14

Open verifications
  - Read current sidecar detect_water route + satellite tile fetch.
  - Verify Project.edits schema accommodates water_obstructions
    array (already opaque Json, fine).
  - Decide trigger endpoint shape: POST /v2/projects/:id/water-detect
    returns immediately with a "detection job started" status?
    Or wire into the Run lifecycle? Likely separate from Run.

Acceptance
  - python/lambdas/detect-water/ full structure.
  - SQS queue + DLQ provisioned.
  - mvp_api route POST /v2/projects/:id/water-detect publishes msg.
  - Lambda fetches KMZ, runs satellite detection, writes polygons
    via psycopg2 to Project.edits.
  - Desktop swaps from sidecar to mvp_api behind flag.
  - Sidecar route stays alive (deletion is C18).

Out of scope
  - Lifecycle table for detection jobs (write-through is sufficient).
  - Caching detected water polygons.
```

#### C17 — Download endpoints + desktop export migration

```
Status:   todo
Depends:  C8
Tier:     T2

Goal
  mvp_api routes that mint presigned-GET URLs for the pre-rendered
  artifacts (D12). Desktop export buttons swap from sidecar
  /export-* to mvp_api download endpoints behind feature flag.

Locked
  D12

Open verifications
  - Confirm Run.exportsBlobUrls is populated by C6's compute-layout
    Lambda.
  - Verify the deterministic key path:
    `projects/<userId>/<projectId>/runs/<runId>/exports/run.<type>`.
  - Read existing Tauri export buttons + their sidecar calls.

Acceptance
  - GET /v2/projects/:id/runs/:runId/exports/:type returns
    {downloadUrl, expiresAt, sha256?, size?} or 404.
  - Desktop export buttons (DXF/PDF/KMZ) call mvp_api endpoint
    behind USE_CLOUD_EXPORTS flag.
  - Browser/Tauri shell handles the actual download via the URL.
  - Tests cover happy path + missing artifact (404) + expired URL.

Out of scope
  - Re-render export on demand (artifacts are pre-rendered; if
    missing, user re-runs Generate).
  - Cache layer.
```

#### C18 — Sidecar deletion

```
Status:   todo
Depends:  C4, C9, C16, C17 (every flag must be permanently flipped)
Tier:     T3 (decision memo + multi-file deletion)

Goal
  Delete python/pvlayout_engine/, packages/sidecar-client/,
  apps/desktop/src-tauri/src/sidecar.rs (the process management),
  Tauri sidecar config, the USE_CLOUD_* feature flags, and every
  remaining sidecar reference. The end-state code reflects D2.

Locked
  D2

Open verifications
  - Verify every USE_CLOUD_* feature flag has been on (true) in
    production for at least 1 release cycle without rollback.
  - Inventory every remaining import of @solarlayout/sidecar-client
    or sidecar functions; expect zero in production code paths.
  - Confirm Tauri build still works without the sidecar bundling.
  - Confirm CI no longer needs the sidecar pytest gate (it does —
    keep python/pvlayout_core/ tests; drop python/pvlayout_engine/
    tests).

Acceptance
  - python/pvlayout_engine/ deleted.
  - packages/sidecar-client/ deleted.
  - Tauri Rust sidecar process management removed.
  - tauri.conf.json sidecar entries removed.
  - All feature flags removed; cloud paths are the only paths.
  - CI gates updated; pre-commit gate from CLAUDE.md §8 still green.
  - Decision memo at docs/initiatives/findings/YYYY-MM-DD-NNN-
    sidecar-deletion.md documenting the switchover dates and
    rollback context.
  - Atomic commit: `chore: delete sidecar; cloud paths are canonical`.

Out of scope
  - Rolling back to the sidecar (forward-only).
  - mvp_admin observability of cloud Lambdas (separate concern).
```

### Phase G — Closeout

#### C19 — Mobile contract verification

```
Status:   todo
Depends:  C18
Tier:     T1 (no new code; documentation row)

Goal
  Verify and document that every desktop-facing contract is
  form-factor-agnostic. The mobile (Expo/RN) team — when they exist
  — should be able to consume the same API + auth + polling +
  download surfaces with no backend changes.

Locked
  D1

Open verifications
  - Walk every endpoint exercised by the desktop end-to-end and
    confirm: license-key bearer auth (not browser cookies), no
    Tauri-specific headers, no mailto-style URLs that don't work
    on mobile.
  - Confirm S3 presigned URLs work for the mobile fetch layer
    (no IAM-signed-host weirdness).
  - Confirm KMZ upload (B6 → S3 PUT) is doable from a mobile HTTP
    client (presigned URL is the abstraction; it's fine).

Acceptance
  - docs/initiatives/findings/YYYY-MM-DD-NNN-mobile-contract-
    parity.md documents the endpoint matrix.
  - No code changes in this row.

Out of scope
  - Building the mobile app.
  - Mobile-specific UX considerations.
```

#### C20 — Production cutover + V1 retirement signoff

```
Status:   todo
Depends:  C18
Tier:     T3 (decision memo)

Goal
  Final production cutover: every Run on prod runs through the
  cloud path. V1 endpoints (the legacy desktop install's
  `EntitlementSummary` etc.) can now be retired per V2-plan §2's
  "Legacy retirement criterion."

Locked
  none new

Open verifications
  - Confirm prod has been on cloud-paths for ≥2 weeks with DLQ
    empty and reconciler not catching anything pathological.
  - Confirm Prasanta's legacy install user-journey is supported by
    the cloud path or that user has migrated.

Acceptance
  - V1 endpoint frozen-markers (B21) → "deleted" markers.
  - Marketing site download CTA reflects desktop-app-cloud-only.
  - Retirement memo at docs/initiatives/findings/.

Out of scope
  - Deleting the V1 endpoints themselves (separate row, post-launch).
```

## 10. Future Ladder (v2 / v3 — explicitly NOT BUILT)

These are documented to keep current decisions honest about future-proofing, NOT as backlog. Add only when telemetry proves the constraint.

**v2 — functional split.** Energy yield separates from compute-layout into its own Lambda + SQS queue. Triggered when a Run has `billedFeatureKey ∈ {energy_yield, generation_estimates}`. Layout completes first; energy publishes a follow-on message; rollup waits for both before flipping DONE. Adds: `compute-energy/` Lambda dir; `pvlayout-compute-energy-jobs` queue; rollup logic. Justification trigger: Lambda cost tells us energy network-wait is wasting CPU minutes, OR energy-only re-runs become a feature.

**v3 — per-plot fan-out.** Add `Slice` table (one row per boundary in a multi-plot Run). mvp_api publishes N SQS messages. Each Lambda handles one Slice. Rollup: when all Slices terminal, flip Run.status. Adds: `Slice` table + semantic-ID prefix; idempotent slice-update SQL becomes per-slice; result aggregation across N S3 blobs into one combined response; per-slice progress UI option re-enabled. Justification trigger: a real customer hits Lambda 15-min timeout, or worst-plot wall-clock > acceptable user-wait.

**Escape hatches (no row, no work):**
- ECS Fargate via `CMD` change on the same Docker image (D22). For Runs estimated > 14 minutes.
- Provisioned concurrency on first-of-day cold-start mitigation if metrics demand.
- Outbox pattern instead of publish-then-commit if SQS reliability ever surprises us.

## 11. Cross-cutting Verifications (one-time, before C-rows)

These need a green checkmark before the rows that depend on them start. Recommend doing them all in a single short verification session at the top of C1 / C2 work.

| # | Check | Required by | Where |
|---|---|---|---|
| V1 | Vercel function timeout for `apps/mvp_api` (Hobby = 10s, Pro = 60s, Enterprise = 300s). PDF generation in compute-layout runs as Lambda not mvp_api so this only matters for sync invokes (parse-kmz, exports endpoint). 60s ample if Pro. | C4, C7, C17 | `vercel.json` or Vercel dashboard |
| V2 | OIDC role for ECR push from GitHub Actions | C3 | `.github/workflows/` |
| V3 | RDS connection from Lambda — VPC config or public-via-creds | C5, C6, C8 | aws lambda get-function-configuration on existing dormant fn if any |
| V4 | IAM user `renewable-energy-app` has SQS/Lambda/SNS perms in addition to S3 | C5, C8 | IAM console / inline policy |
| V5 | mvp_api package.json has neither `@aws-sdk/client-sqs` nor `@aws-sdk/client-lambda` (likely both missing) | C4, C7 | grep |
| V6 | `Run.status` column type permits `QUEUED` (string column → yes; enum → migration needed) | C7 | schema.prisma |
| V7 | Vercel Cron availability on the project's plan | C13 | Vercel dashboard |

## 12. Tracking Protocol

This spec is a living document. The Implementation Rows section (§9) is the source of truth for what's done, in-progress, todo, blocked across the entire cloud-offload arc.

**Status states:**
- `todo` — not yet started.
- `in-progress` — a session is actively working it.
- `done` — merged to main; live-verified where applicable.
- `blocked` — explicitly halted; row notes name the blocker.

**Update cadence:**
- Row claimed: `todo → in-progress` in same commit as first WIP.
- Row completed: `in-progress → done` in same commit as merge (or final row commit).
- Row blocked: `in-progress → blocked` immediately on discovery; notes name blocker + resume conditions.

**Cross-references appended to a row on close:**
```
Plan:     docs/superpowers/plans/YYYY-MM-DD-<row-id>-<slug>.md
Shipped:  <PR URL or commit SHA>
```

**Spec amendments:**
If a child session discovers a locked decision (D-id) is wrong — architectural reality has changed, or a decision turned out to be unworkable — the spec is amended in a dedicated commit BEFORE the row's implementation commit. The amendment commit message names the D-id changed and why. **Never silently work around a locked decision.**

**Atomic commit per row** (matches `docs/PLAN.md` convention).

## 13. Cold-Session Prompt Template

Paste verbatim into a fresh Claude Code session. Replace `<ROW-ID>` and `<ROW-NAME>` with the target.

```
We are continuing the cloud-offload-compute architecture project.
This is a cold Claude Code session; you have NO prior context.

Before doing ANYTHING ELSE — including clarifying questions — read
this spec end-to-end:

  docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md

This spec is the primary source of truth for the entire cloud-offload
arc. It contains numbered locked decisions (D1–D22) and numbered
implementation rows (C1–C20). I will reference IDs throughout our
session.

I want to execute row: <ROW-ID>: <ROW-NAME>

Operating rules:

1. Locked decisions are non-negotiable. If you think one is wrong,
   STOP and surface to me explicitly — do not work around silently.
   We amend the spec via a dedicated commit; that's a separate
   conversation.

2. Code reality wins over spec. Run every check in the row's "Open
   verifications" against the current codebase before proceeding.
   The codebase has likely moved since the spec was written; if
   reality contradicts a spec assumption materially, surface the
   conflict before continuing.

3. Stay inside the row's Goal + Acceptance + Out of scope. Do not
   silently expand.

4. Use superpowers in order:
   - Open design questions inside scope → superpowers:brainstorming first.
   - Otherwise → superpowers:writing-plans → my sign-off →
     superpowers:executing-plans (TDD).
   - Standard pre-commit gate per CLAUDE.md §8 plus any row-specific
     gates.

5. On completion: flip the row's Status from todo/in-progress → done
   in the spec, append a one-line PR/commit reference, commit as
   part of the row's atomic commit.

Begin by reading:
  - The full spec
  - The row's own entry (§9)
  - All "Open verifications" surfaces in current code
  - All "Depends" rows already marked done in §9

Then propose your plan to me before writing any code.
```

## 14. Doc Kill List

Disposition table for every existing doc that touches cloud offload, Spike 1/2, cable compute, run cancellation, or refund policy. Owned by row C1.

| Path | Disposition | Rationale |
|---|---|---|
| `docs/superpowers/plans/2026-05-02-b32-failed-runs-path.md` | **DELETE** | Halted plan based on wrong architecture (Spike-2 internal-secret callback). Superseded by D9 + D17 + C12. |
| `docs/post-parity/PRD-cable-compute-strategy.md` | **ANNOTATE SUPERSEDED** + link to this spec in header | Spike 1 shipped (preserve as historical context). Spike 2 architecture is fully replaced by this spec. |
| `docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md` | **ANNOTATE SUPERSEDED** + link | Backend-side feasibility assessment; useful history; architecture replaced. |
| `docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md` | **AMEND §B.6** | Decisions A through B.5 stand. §B.6's "internal endpoint sidecar callback" framing is wrong — replace with reference to D9 + D17. |
| `docs/initiatives/post-parity-v2-backend-plan.md` rows B27-B34 | **AMEND** | B27 stays as decision row. B28-B34 redirect to this spec's C-rows (B28 → C14; B29 done; B30 done; B31 → C11; B32 → C12; B33 → C10; B34 → C15). |
| `docs/post-parity/PLAN.md` references to "renewable_energy session" / Spike 2 | **AMEND** | Post-merge; redirect at this spec for cloud-offload work. |
| `docs/post-parity/RESUME-*.md` | **KEEP** | Historical session logs. Not load-bearing. |
| `docs/post-parity/SMOKE-LOG.md` | **KEEP** | Active session log. |
| `docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md` | **KEEP** | Real perf data; informs §1 motivation. |
| `docs/post-parity/findings/2026-05-01-001-cable-perf-architecture-research.md` | **KEEP** | Research input; informs the architecture choices in this spec. |
| `docs/historical/*` | **KEEP** | Audit trail of superseded plans (CLAUDE.md §2 forbids modification). |

---

*End of spec. This is the source of truth for cloud-offload compute architecture work. Cold sessions: §13. Live status of rows: §9. Decision IDs cited by rows: §3.*
