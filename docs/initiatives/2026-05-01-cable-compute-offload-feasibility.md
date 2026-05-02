# Cable Compute Cloud Offload — Feasibility Audit

**Date:** 2026-05-01
**Audience:** sister desktop session at `pv_layout_project` (cable-compute spike)
**Repo at audit time:** `renewable_energy` @ `59c4e30` on `post-parity-v2-backend`
**Scope:** Inventory existing experimental Lambda/SQS/compute infra; assess `mvp_api`/`mvp_db` readiness for a Job + Slice job system; recommend SQS / Lambda / Fargate patterns; sketch end-to-end flow; raise unknowns.

This report is a backend-side feasibility input. The desktop session merges its findings (compute side) and this audit into one strategic PRD covering both spikes.

---

## TL;DR

1. **Existing Lambda+SQS infra is real, deployed, and currently dormant** — `apps/api` (TypeScript Hono on Vercel) publishes to SQS; `apps/layout-engine` (Python 3.13 container on Lambda, arm64, 512 MB, 3 min) consumes one SQS message at a time, runs the **PV solar-layout** engine, writes artifacts to S3, and updates `LayoutJob` rows in RDS via raw psycopg2. **Wired in prod, no live traffic** (per V2 plan §9).
2. **The compute domain is wrong, but the pattern is gold.** The Lambda runs PV layout (Shapely, simplekml, ezdxf), not cable computation. The desktop's cable-compute engine lives in `pv_layout_project/pvlayout_core/`, not in this repo. So we **don't** reuse the engine — we **do** reuse the SQS publisher, the container-on-Lambda packaging, the GitHub Actions OIDC build/deploy pipeline, the S3-artifact-prefix convention, and the architectural decision to let workers update RDS directly.
3. **`mvp_api` is structurally ready** for `/v2/jobs/*` endpoints. License-key bearer auth, V2 envelope, presigned-URL helpers, and idempotency-key plumbing all exist and are exercised by B6–B26. Adding a Job + Slice module would mirror the existing `/v2/projects/:id/runs` (B16) pattern almost line-for-line.
4. **`mvp_db` has the right shape.** `UsageRecord.@@unique([userId, idempotencyKey])` proves the idempotency pattern works under load. Job + Slice tables fit cleanly alongside `Project` + `Run`. No FK to existing tables is strictly required at v1; loose coupling via `licenseKey + projectId + runId` columns is enough.
5. **No Fargate / ECS infrastructure exists.** Greenfield work for v2 (slices that exceed Lambda's 15-min ceiling). Recommend deferring until empirical evidence shows a slice ≥ 14 min in prod.
6. **No IaC.** AWS resources (SQS queue, Lambda function, ECR repo, IAM role, RDS cluster) were provisioned by CLI per the Spike 3 plan and are not version-controlled. Recommend Terraform or CDK if scope grows; for now the GitHub Actions deploy workflows pin tag-based image deploys to a known function name.
7. **Effort estimate (broken down):** 4–5 weeks calendar with one engineer, assuming the desktop session ships the cable-compute Python package as a deployable wheel/sdist by end of week 2.

---

## 1. EXISTING EXPERIMENTAL INFRA AUDIT

### 1.1 Repo layout (compute-relevant directories only)

```
apps/
├── api/                  # Older non-MVP Hono API (Clerk auth, Vercel) — uses SQS+Lambda for layout
├── layout-engine/        # Python 3.13 Lambda container — PV solar layout compute
├── mvp_api/              # NEW V2 API (license-key auth, the desktop talks to this)
├── mvp_admin/            # Admin Next.js app (manual purchases, customer mgmt)
└── mvp_web/              # Marketing site (frozen)

packages/
├── db/                   # OLDER Prisma schema (User, Project, Version, LayoutJob, EnergyJob)
├── mvp_db/               # NEWER Prisma schema (Project + Run + UsageRecord + Entitlement + ...)
├── shared/               # Shared TS types (V2 wire shapes)
└── api-client/           # Type-safe HTTP client (older API)

.github/workflows/
├── build-layout-engine.yml      # arm64 ECR push (currently manual-only)
└── deploy-layout-engine.yml     # update-function-code to :prod tag

docs/superpowers/
├── plans/2026-04-19-spike3-lambda-sqs.md
├── plans/2026-04-22-mvp-spike2-db-api-download.md
└── specs/2026-04-19-spike3-lambda-deployment-design.md
```

**Last commit dates** (relative to audit at 2026-05-01):

| Path | Last touched | Status |
|---|---|---|
| `apps/api/` | 2026-04-20 (`5f60735`) | Stable; not actively developed |
| `apps/layout-engine/` | 2026-04-20 (`65019f3`) | Stable; not actively developed |
| `apps/api/src/lib/sqs.ts` | 2026-04-20 (`87e436b`) | Stable |
| `.github/workflows/build-layout-engine.yml` | 2026-04-27 (`8581e67`) | Build trigger explicitly disabled (commented) |

**Interpretation:** the SQS+Lambda stack landed in mid-April, was wired to prod, then the team pivoted to V2 (`mvp_api`/`mvp_db`/desktop sidecar). The Spike 3 infrastructure stayed on the shelf — operational, not deleted, but not consumed.

### 1.2 What did it do?

**`apps/api`** is a Hono v4 / Bun API that owns `Project` and `Version` entities and drives PV-layout computation. The flow is documented in `apps/api/CLAUDE.md` and traced below.

**Routes** (`apps/api/src/modules/projects/projects.routes.ts`): `POST /projects/:projectId/versions` creates a new `Version` row with the user-uploaded KMZ at S3 key `projects/{projectId}/versions/{versionId}/input.kmz`, then dispatches a layout job.

**Dispatch** (`apps/api/src/modules/projects/projects.service.ts:283-297` — paraphrased from agent audit; not re-verified line-for-line):
- `USE_LOCAL_ENV=true` → `dispatchLayoutJobHttp(versionId)` → fire-and-forget HTTP POST to `${LAYOUT_ENGINE_URL}/layout` (10s abort signal). See `apps/api/src/lib/layout-engine.ts:1-14`.
- `USE_LOCAL_ENV=false` → `publishLayoutJob(versionId)` → SQS `SendMessageCommand`. See `apps/api/src/lib/sqs.ts:16-29`.

**`apps/api/src/lib/sqs.ts:1-30`** is the production publisher. Standard SQS (no FIFO), single-record body `{ version_id: versionId }`, no `MessageGroupId`/`MessageDeduplicationId`, no batch send. Region defaults to `ap-south-1`; credentials come from `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env vars or fall through to the Lambda execution role.

**Auth**: `apps/api` uses **Clerk** (`@clerk/backend`), NOT license-key. From `apps/api/CLAUDE.md`: "Auth Middleware (`middleware/auth.ts`) — Dev mode: auto-creates a mock user; Production: verifies Bearer JWT via `@clerk/backend.verifyToken`". The desktop's V2 traffic goes to `apps/mvp_api`, which uses license-key bearer auth — see §2 below.

**Job/Slice equivalents**: `apps/api` has `Version` (one-to-one with one layout/energy run) but **no Slice concept**. It's a single-message-per-job model. Per-plot fan-out would require adding a Slice table or repurposing `Version` (lossy — Version isn't naturally per-plot).

**Production status**: deployed to Vercel as a serverless Hono app (`apps/api/CLAUDE.md`: "Framework Preset must be **'Other'** in Vercel dashboard"). Vercel project → RDS Aurora PostgreSQL → SQS → Lambda → S3 → RDS callback (via psycopg2 from inside the Lambda). The full loop works; it's just dormant.

### 1.3 `apps/layout-engine` inventory

**Entry point** (`apps/layout-engine/src/lambda_handler.py:30-44`):
```python
def handler(event, context):
    records = event["Records"]
    if len(records) != 1:
        raise RuntimeError(f"Expected batch size 1, got {len(records)}")
    payload = json.loads(records[0]["body"])
    version_id = payload["version_id"]
    ...
    handle_layout_job(version_id)
```

**Cold-start diagnostics** (`apps/layout-engine/src/lambda_handler.py:19-27`) — logs Shapely/GEOS/Python/arch on first invocation. Useful: confirms `arm64` image actually runs on `arm64` Lambda.

**Dockerfile** (`apps/layout-engine/Dockerfile:1-17`):
```dockerfile
FROM public.ecr.aws/lambda/python:3.13           # AWS-managed Lambda Python 3.13 base, arm64-compatible
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR ${LAMBDA_TASK_ROOT}
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-emit-project -o requirements.txt \
    && uv pip install --system -r requirements.txt \
    && rm requirements.txt
COPY src/ ./
CMD ["lambda_handler.handler"]
```

Container-image Lambda (not zip), uv-managed deps, arm64 (per the GitHub Actions build at line 52: `platforms: linux/arm64`).

**Pinned dependency list** (`apps/layout-engine/pyproject.toml:5-14`):

| Dep | Pin | Notes |
|---|---|---|
| `shapely` | `>=2.0` | Same major as desktop sidecar (Shapely 2.1.2 per desktop audit) — **parity ✓** |
| `pyproj` | `>=3.5` | Coordinate transforms — **parity ✓** |
| `matplotlib` | `>=3.7` | Pulls numpy transitively |
| `simplekml` | `>=1.3` | KMZ export — **parity ✓** |
| `ezdxf` | unpinned | DXF export — **parity ✓** |
| `requests` | `>=2.28` | HTTP client (unused in Lambda path) |
| `boto3` | `>=1.35` | S3 helpers |
| `psycopg2-binary` | `>=2.9` | Direct DB writes — **see §1.5** |

**Missing vs desktop sidecar's runtime** (per the desktop's brief): no explicit `Pillow` or `numpy` pin. `numpy` enters transitively via matplotlib/shapely; `Pillow` is **absent** — if cable-compute imaging needs it, add the pin. The desktop's brief lists Pillow as a sidecar requirement; verify whether cable-compute proper actually depends on it before assuming a parity gap.

**Source tree** (per agent audit, not re-verified module-by-module):

```
apps/layout-engine/src/
├── lambda_handler.py         # SQS handler entry
├── handlers.py               # handle_layout_job(version_id) orchestration
├── db_client.py              # Raw psycopg2 SQL — UPDATE layout_jobs / versions
├── s3_client.py              # download_from_s3 / upload_to_s3
├── core/
│   ├── layout_engine.py      # run_layout_multi() — PV layout algorithm
│   ├── kmz_parser.py         # parse_kmz()
│   ├── kmz_exporter.py       # export_kmz()
│   ├── svg_exporter.py       # export_svg()
│   ├── dxf_exporter.py       # export_dxf()
│   ├── string_inverter_manager.py
│   ├── la_manager.py         # Lightning arresters
│   └── models/project.py     # LayoutParameters, LayoutResult dataclasses
└── tests/                    # pytest, fixtures
```

The compute domain is **PV solar layout**, not cable. The cable-compute engine lives in `pv_layout_project/pvlayout_core/` (sibling repo). So we ship the desktop's package — not this engine — when wiring cable jobs.

### 1.4 IaC / Deployment surface

**Direct finding:** there is no `terraform/`, `cdk.json`, `serverless.yml`, `samconfig.toml`, or `pulumi/` in the repo. Glob searches returned no matches. AWS resources were provisioned by AWS CLI per the Spike 3 plan (`docs/superpowers/plans/2026-04-19-spike3-lambda-sqs.md:1-15`) and **are not version-controlled**.

**GitHub Actions** (`.github/workflows/`):

- **`build-layout-engine.yml`**:
  - Lines 3-8 (commented-out `on: push/pull_request`) and line 11 (`on: workflow_dispatch`): build trigger is **manual only**. Comment says: "Disabling for now to avoid triggering builds on every push/PR".
  - Lines 31-35: AWS credentials via OIDC (`role-to-assume: ${{ secrets.AWS_ROLE_ARN }}`).
  - Lines 40-43: QEMU + arm64 emulation (because GH-hosted runners are x86_64).
  - Lines 48-59: `docker/build-push-action@v6` — `platform: linux/arm64`, dual tag `:{sha}` + `:prod`, registry-based buildcache.

- **`deploy-layout-engine.yml`**:
  - Lines 28-31: `aws lambda update-function-code --function-name layout_engine_lambda_prod --image-uri ...:prod`. Hardcoded function name — no env-vared.
  - Lines 33-39: `aws lambda wait function-updated` for the function-updated waiter.
  - Lines 41-48: confirm deployed image URI by querying.

**IAM/OIDC**: per `docs/superpowers/plans/2026-04-19-spike3-lambda-sqs.md` task 4, an OIDC trust policy was set up between GitHub and a per-environment AWS role. From the memory note "GitHub environments pattern": environment-scoped secrets (`AWS_ROLE_ARN`) are read via GitHub environments, mirroring the Journium CI pattern.

**Honest assessment of the IaC gap:** workable for one-Lambda. As soon as we add a second Lambda (cable-compute) or an SQS queue per environment, the manual-CLI approach breaks. Recommend Terraform/CDK before the cable-compute Lambda lands in staging.

### 1.5 How the pieces wire together

```
Desktop / mvp_web                    apps/api (Vercel)              SQS (standard)         Lambda (apps/layout-engine)        S3 + RDS
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
1. Upload KMZ ──────────────────────► PUT /projects/:pid/versions
                                      ├─ creates Version + LayoutJob (status=QUEUED)
                                      ├─ uploads KMZ → projects/{pid}/versions/{vid}/input.kmz
                                      └─ publishLayoutJob(vid) ─────────►
                                                                          {version_id}
                                                                          ────────────────►
                                                                                            handler(event)
                                                                                            ├─ get_version(vid) ──────────────► SELECT FROM versions
                                                                                            ├─ mark_layout_processing(vid) ────► UPDATE layout_jobs/versions
                                                                                            ├─ download_from_s3(input.kmz)
                                                                                            ├─ parse_kmz / run_layout_multi
                                                                                            ├─ place_string_inverters / la
                                                                                            ├─ export_kmz / svg / dxf
                                                                                            ├─ upload_to_s3 (3 artifacts)
                                                                                            └─ mark_layout_complete(vid, ...) ─► UPDATE
2. Poll GET /projects/:pid/versions/:vid (status QUEUED → PROCESSING → COMPLETE)
3. Download artifacts via signed URLs.
```

**Key architectural choice** (`apps/layout-engine/src/db_client.py:1-115`): the Lambda writes to RDS directly via psycopg2 raw SQL, **bypassing `apps/api`**. Rationale: avoids a second hop, removes auth complexity, and keeps the Lambda fully autonomous (no need to authenticate as a service to the API). Trade-off: Lambda needs RDS network access (VPC config) and DB credentials (`DATABASE_URL` env var); schema drift between `apps/api` and the Lambda's hand-written SQL is invisible until runtime.

**Status callback channel:** none. The Lambda writes `status='COMPLETE'` directly to `layout_jobs.status`; the API polls. There's no SQS-result-queue, no SNS notification, no webhook. Status is read by polling. (For our Job/Slice model this is fine — the desktop polls anyway.)

### 1.6 Reusability scorecard

| Subsystem | File:line | Cable-compute reuse |
|---|---|---|
| `publishLayoutJob` SQS sender | `apps/api/src/lib/sqs.ts:16-29` | **REUSABLE pattern.** Copy verbatim into `apps/mvp_api/src/lib/sqs.ts` with `publishSliceJob(sliceId)`. The shape (single-message body, optional creds, env-var queue URL) is correct. |
| `dispatchLayoutJobHttp` (local fallback) | `apps/api/src/lib/layout-engine.ts:1-14` | **REUSABLE pattern.** For local-sidecar dispatch (cable-compute via the desktop's local Python sidecar instead of a Lambda), the same fire-and-forget shape works. |
| `apps/layout-engine` Dockerfile | `apps/layout-engine/Dockerfile:1-17` | **REUSABLE template.** Copy structure, change `pyproject.toml` to depend on the desktop's `pvlayout_core` package, change `CMD` to a new `cable_handler.handler`. arm64 + uv pattern is right. |
| Lambda entry-point shape | `apps/layout-engine/src/lambda_handler.py:30-44` | **REUSABLE template.** Same SQS event parsing; payload becomes `{slice_id}` instead of `{version_id}`. |
| `db_client.py` raw psycopg2 pattern | `apps/layout-engine/src/db_client.py:1-115` | **SALVAGEABLE.** The "Lambda writes to RDS directly" choice is sound; the table names need updating (`slices` instead of `layout_jobs`). Hand-written SQL is fine for ~10 columns; consider switching to SQLAlchemy core if column count grows. |
| `handle_layout_job` orchestration shape | `apps/layout-engine/src/handlers.py:116-221` | **REUSABLE template.** Copy structure: get → mark_processing → S3 download → run engine → S3 upload → mark_complete (or mark_failed in except). Replace internals with cable-compute calls. |
| `Version`/`LayoutJob` Prisma models | `packages/db/prisma/schema.prisma:52-99` | **DELETE for cable.** Wrong schema (PV-layout-specific columns: `kmzArtifactS3Key`, `svgArtifactS3Key`, `dxfArtifactS3Key`, `irradianceSource`, `pdfArtifactS3Key`). Cable Job + Slice belongs in `mvp_db`, not `db`. |
| `apps/api` route handlers (`POST /projects/:pid/versions`) | `apps/api/src/modules/projects/projects.routes.ts` | **DELETE for cable.** `apps/api` is Clerk-auth domain, separate from desktop V2 traffic on `mvp_api`. New endpoints belong on `mvp_api`. |
| `build-layout-engine.yml` GH Actions | `.github/workflows/build-layout-engine.yml:1-59` | **REUSABLE template.** Copy as `build-cable-engine.yml`, change ECR repo name, change context dir. Re-enable `on: push` triggers (the layout-engine's "disabled for now" comment is ours to revisit). |
| `deploy-layout-engine.yml` GH Actions | `.github/workflows/deploy-layout-engine.yml:1-49` | **REUSABLE template.** Copy as `deploy-cable-engine.yml`, change function name. Same OIDC role works if scoped IAM permits both functions. |
| Vercel + RDS + S3 + ECR account | (AWS console) | **REUSABLE infra.** Same account `378240665051`, same region `ap-south-1`. New SQS queue + Lambda function are additive; no infra rework. |

**Vestigial / actively unused:**
- `apps/api/src/modules/projects/projects.routes.ts` — currently zero live traffic. Decision deferred per V2 plan: "post-V2 cleanup".
- `EnergyJob` model (`packages/db/prisma/schema.prisma:86-98`) — table exists but no handler ships. Vestigial.
- The `LAYOUT_ENGINE_URL` / `USE_LOCAL_ENV` toggle in `apps/api/env.ts` — won't transfer to `mvp_api` cleanly because `mvp_api` doesn't have a local Python HTTP fallback. Replaced in cable-compute world by the desktop sidecar route (no API involvement) for local execution.

---

## 2. MVP_API READINESS FOR JOBS

`apps/mvp_api/` is the V2 backend the desktop talks to. It's the right home for `/v2/jobs/*`. This section confirms it.

### 2.1 Routing structure

`apps/mvp_api/src/app.ts:1-113` — Hono v4 on Bun, single `app` instance, modules mounted at root via `app.route("/", <module>Routes)`. Each module declares its own `licenseKeyAuth` middleware scope. Adding a `jobsRoutes` would be one import + one `app.route("/", jobsRoutes)` line at `apps/mvp_api/src/app.ts:24,63`.

Existing V2 endpoints (the relevant ones for pattern reference):
- `POST /v2/projects` (B11), `GET /v2/projects` (B10), `GET /v2/projects/:id` (B12), `PATCH /v2/projects/:id` (B13), `DELETE /v2/projects/:id` (B14)
- `POST /v2/projects/:id/runs` (B16), `GET /v2/projects/:id/runs` (B15), `GET /v2/projects/:id/runs/:runId` (B17), `DELETE /v2/projects/:id/runs/:runId` (B18)
- `POST /v2/blobs/kmz-upload-url` (B6), `POST /v2/blobs/run-result-upload-url` (B7)
- `GET /v2/entitlements` (B8), `POST /v2/usage/report`

New endpoints would slot in as a sibling module:

```
modules/jobs/
├── jobs.routes.ts      # POST /v2/jobs, GET /v2/jobs/:id, GET /v2/jobs/:id/slices
├── jobs.service.ts
└── jobs.test.ts
```

Plus a callback path (Lambda → mvp_api or Lambda → RDS direct; see §5).

### 2.2 License-key bearer auth

Pattern: every `/v2/*` route uses `licenseKeyAuth` middleware (`apps/mvp_api/src/middleware/license-key-auth.ts`). It looks up the `LicenseKey` row, sets `c.var.user` and `c.var.licenseKey`, and 401s on miss.

`apps/mvp_api/src/modules/runs/runs.routes.ts:19` — example mount:
```ts
runsRoutes.use("/v2/projects/*", licenseKeyAuth)
```

A new `jobs.routes.ts` would do `jobsRoutes.use("/v2/jobs/*", licenseKeyAuth)` and inherit auth identically. **No swap needed** — `mvp_api` already speaks the desktop's auth scheme.

### 2.3 V2 envelope + error codes

Pattern: every response uses `ok(data)` (success) or throws `AppError` subclasses (failure), and the error handler (`apps/mvp_api/src/middleware/error-handler.ts`) formats the V2 envelope:

```ts
{ success: true,  data: T }
{ success: false, error: { code: V2ErrorCode, message: string, details?: unknown } }
```

`V2ErrorCode` is an enum exported from `@renewable-energy/shared` (`packages/shared/src/types/api-v2.ts`) with values like `VALIDATION_ERROR`, `NOT_FOUND`, `PAYMENT_REQUIRED`, `S3_NOT_CONFIGURED`. Add a new code (e.g. `JOB_NOT_FOUND`, `SLICE_NOT_FOUND`) at the same place when the time comes — single-line addition.

**Inheritance is automatic.** A new `jobsRoutes` module gets the envelope, error formatting, request-logging middleware (`apps/mvp_api/src/app.ts:43`), and CORS without writing any new middleware code.

### 2.4 Presigned-URL helpers

`apps/mvp_api/src/lib/s3.ts:31-81` is the existing helper module:

- `getPresignedDownloadUrl(key, filename, expiresIn=3600, bucket?)` — used by B6/B12/B17/B23/B24 to mint 1h GET URLs. Optional `bucket` arg lets it sign against the V2 projects bucket OR the legacy downloads bucket.
- `getPresignedUploadUrl(key, contentType, expiresIn=900, contentLength?)` — used by B6/B7 to mint 15-min PUT URLs. Optional `contentLength` enforces the cap at S3.

For Job/Slice the same helpers cover both directions:

- **Input KMZ upload:** desktop already uses B6 (`POST /v2/blobs/kmz-upload-url`) at create-project time. `Job` rows reference the existing `Project.kmzBlobUrl` (no new upload path needed).
- **Per-slice result upload from Lambda:** the Lambda calls `getPresignedUploadUrl` indirectly — it uses its own `boto3.client("s3").put_object()`, with bucket+key derived deterministically. No URL signing roundtrip needed; the Lambda has IAM perms already.
- **Per-slice result download from desktop:** mirror B17's pattern. `GET /v2/jobs/:id/slices/:idx` returns a `resultBlobUrl: string | null` signed against the conventional key path (`projects/<userId>/<projectId>/runs/<runId>/slices/<idx>/result.json`).

### 2.5 Idempotency-key pattern

Already shipped twice in `mvp_api`:

1. `POST /v2/usage/report` — `apps/mvp_api/src/modules/usage/usage.routes.ts:17-21` defines `UsageReportV2Schema` with `idempotencyKey: z.string().min(1)` and the service stores it on `UsageRecord`.
2. `POST /v2/projects/:id/runs` (B16) — `apps/mvp_api/src/modules/runs/runs.routes.ts:43-49` uses the same pattern; `UsageRecord.@@unique([userId, idempotencyKey])` enforces atomic dedup at the DB level (`packages/mvp_db/prisma/schema.prisma:149`).

The "concurrent retry race" recovery in B16 (`apps/mvp_api/src/modules/runs/runs.service.ts:175-217` — `await db.$transaction` + `P2002` catch + lookup) is **the canonical pattern to reuse for `POST /v2/jobs`**. Same shape:

```ts
// Pre-lookup: same idempotencyKey → return existing Job row
const existing = await db.job.findFirst({
  where: { userId, idempotencyKey },
  include: { slices: true },
})
if (existing) return existing

// Create + race-recover
try {
  return await db.$transaction(async (tx) => {
    return tx.job.create({ data: { ..., idempotencyKey } })
  })
} catch (e) {
  if ((e as {code?:string}).code === "P2002") {
    // Concurrent retry won the race; return their row
    return db.job.findFirstOrThrow({ where: { userId, idempotencyKey }, include: { slices: true } })
  }
  throw e
}
```

Add `Job.@@unique([userId, idempotencyKey])` to the Prisma schema and the race-safety is automatic. **Half a service file is already written.**

---

## 3. RDS + MVP_DB SCHEMA

### 3.1 Where Job + Slice fit

`packages/mvp_db/prisma/schema.prisma:180-220` defines the relevant existing tables:

- `Project` (line 180) — id, userId, name, kmzBlobUrl, kmzSha256, edits, boundaryGeojson, deletedAt
- `Run` (line 203) — id, projectId, name, params, inputsSnapshot, layoutResultBlobUrl, energyResultBlobUrl, exportsBlobUrls, billedFeatureKey, usageRecordId, deletedAt
- `UsageRecord` (line 135) — id, userId, licenseKeyId, productId, featureKey, idempotencyKey (with `@@unique([userId, idempotencyKey])` at line 149)

**Job + Slice belong in this same schema** (not `packages/db/`). They're V2-domain, license-key-auth domain, desktop-domain — same boundary as Project/Run.

### 3.2 Sketch (column-level, not final DDL)

```prisma
enum JobStatus {
  QUEUED
  RUNNING
  DONE
  FAILED
  CANCELLED
}

enum SliceStatus {
  QUEUED
  RUNNING
  DONE
  FAILED
}

enum SliceExecutor {
  LOCAL_SIDECAR     // desktop ran it
  LAMBDA            // cloud Lambda
  FARGATE           // cloud Fargate (>15min)
}

model Job {
  id               String      @id @default("")
  userId           String
  user             User        @relation(fields: [userId], references: [id])
  licenseKeyId     String
  licenseKey       LicenseKey  @relation(fields: [licenseKeyId], references: [id])
  projectId        String
  project          Project     @relation(fields: [projectId], references: [id])
  runId            String?     @unique  // optional FK to Run for the desktop's existing run-tracking surface
  run              Run?        @relation(fields: [runId], references: [id])
  kmzBlobUrl       String      // copied from Project at submit-time so a Project edit doesn't change history
  kmzSha256        String      // same
  paramsJson       Json
  status           JobStatus   @default(QUEUED)
  executorDefault  SliceExecutor @default(LAMBDA)  // hint for slice dispatch; per-slice can override
  idempotencyKey   String
  engineVersion    String      // e.g. pvlayout-core@1.4.2
  errorPayload     Json?
  slices           Slice[]
  createdAt        DateTime    @default(now())
  startedAt        DateTime?
  completedAt      DateTime?

  @@unique([userId, idempotencyKey])
  @@index([userId, createdAt(sort: Desc)])
  @@index([projectId])
  @@map("jobs")
}

model Slice {
  id              String        @id @default("")
  jobId           String
  job             Job           @relation(fields: [jobId], references: [id], onDelete: Cascade)
  boundaryIndex   Int           // 0-indexed within the parent KMZ
  boundaryName    String        // user-meaningful label from KMZ Placemark
  status          SliceStatus   @default(QUEUED)
  executor        SliceExecutor // chosen at dispatch time (may differ from job.executorDefault)
  resultBlobUrl   String?       // s3:// URI; signed-GET minted at read time (derived key + helper)
  startedAt       DateTime?
  endedAt         DateTime?
  errorPayload    Json?
  engineVersion   String        // recorded again at slice level — Lambda may run a newer image than was current at job submit
  attemptCount    Int           @default(1)

  @@unique([jobId, boundaryIndex])
  @@index([status])
  @@map("slices")
}
```

**Notes on the sketch:**

1. `Job.runId` is optional — gives the desktop a clean way to attach a Job to its existing Run row (so RunDetail's existing `inputsSnapshot` and `params` stay authoritative on Run, and Job carries the cloud-execution metadata only). If the desktop prefers Run-and-Job to be entirely separate primitives, drop this FK and let the Run column carry `jobId String?` instead. Either direction works; pick once based on UI flow.
2. `Job.kmzBlobUrl` + `Job.kmzSha256` are **copied from Project at submit-time**, not joined via FK. Rationale: a user editing Project KMZ later (B6 PUT to the same content-addressed key) shouldn't change the historical Job's input. Snapshot-on-submit is the standard pattern (mirrors `Run.inputsSnapshot`).
3. `Job.@@unique([userId, idempotencyKey])` reuses the pattern from `UsageRecord:149`. Race-safe by construction.
4. `Slice.@@unique([jobId, boundaryIndex])` makes per-boundary results addressable by stable index. SQS message payload carries `(jobId, boundaryIndex)`; Lambda writes to the addressed Slice.
5. `Slice.executor` is per-slice, not per-job — supports the heuristic dispatcher in §6 ("table-count > N → use Fargate for this one slice").
6. `Slice.engineVersion` + `Job.engineVersion`: both record the engine SHA. Job records it at submit; Slice records what the Lambda actually ran (which may differ if a deploy lands mid-job). Reconciliation belongs in observability, not the schema.
7. **No schema migration to existing tables required.** `Run` could optionally gain a `jobId String?` reverse-FK for query convenience, but it's not load-bearing.
8. Migration order: add `JobStatus`/`SliceStatus`/`SliceExecutor` enums, then `Job`, then `Slice`. One migration file. The semantic-ID extension needs `Job: "job"` and `Slice: "slc"` registered in `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts` (per `packages/db/CLAUDE.md` step 2 — same pattern applies in mvp_db).

### 3.3 Data retention for result blobs

Existing pattern (`packages/mvp_db/prisma/schema.prisma:210-212`): `Run.layoutResultBlobUrl`, `Run.energyResultBlobUrl`, `Run.exportsBlobUrls` are stored URLs, but in practice (per B17) the URLs are **derived deterministically at read time** from `(userId, projectId, runId)` against a known key prefix. The DB columns are vestigial.

For Slice result blobs, **apply Path A (the same pattern locked in for thumbnails per memo v3 §2)**: don't store the URL on Slice; mint it at read time from `projects/<userId>/<projectId>/runs/<runId>/slices/<idx>/result.json`. Then `Slice.resultBlobUrl` is just a flag (set when the Lambda PUT lands; null until then).

S3 lifecycle: match existing run-result patterns. No abort-multipart older than 7d (already on the bucket), no expiration on result objects (they're tied to the user's data lifetime, not cron-deleted).

---

## 4. SQS PATTERN

### 4.1 FIFO vs Standard

**Recommendation: Standard.**

Reasoning:
- FIFO buys ordering and dedup-by-`MessageGroupId`. We need neither: per-slice fan-out is **embarrassingly parallel** (the desktop confirmed: zero shared mutable state post-`run_layout_multi`); and idempotency lives in the API layer (`Job.@@unique([userId, idempotencyKey])`), not at the queue.
- FIFO has a 300-msg/sec throughput cap per `MessageGroupId` and 3000/sec per queue without batching. Standard is unlimited.
- FIFO costs ~50% more per message.
- Existing `apps/api/src/lib/sqs.ts:22-26` uses Standard already; we'd get free pattern parity.

The only argument for FIFO would be "we need exactly-once". SQS Standard is at-least-once, but **DB-level idempotency on `Slice.@@unique([jobId, boundaryIndex])` plus an `INSERT ... ON CONFLICT DO NOTHING` semantics in the Lambda's mark-processing call gives us exactly-once-effect** without paying for FIFO.

### 4.2 Dead-letter queue

**Required from day one.** Memory note from prior work: "Failed Lambda + 1200s visibility timeout blocks new messages; manual re-send workaround; needs DLQ." That bug is the canonical "no DLQ" failure mode.

Recommended config:
- DLQ = separate Standard queue, same region, name `cable-jobs-dlq` (or similar).
- Source queue's `RedrivePolicy.maxReceiveCount = 3`. After 3 failed attempts, the message moves to DLQ.
- Visibility timeout on source queue: see §4.3.
- DLQ alarm: CloudWatch alarm on `ApproximateNumberOfMessages > 0` for >5 min → SNS topic → email/Slack.

The Lambda raising on failure (`apps/layout-engine/src/lambda_handler.py:42-44`) already triggers SQS to redeliver; with DLQ wired this becomes auto-graceful.

### 4.3 Visibility timeout sizing

**Lambda timeout × ~1.1 + buffer.**

For a slice that runs up to 14 min on Lambda (under the 15-min hard ceiling), set:
- Lambda timeout: 14 min (840s)
- SQS visibility timeout: **17 min (1020s)** — buffer covers cold start + Lambda's own grace period

For Fargate slices (see §6): no SQS-driven trigger, so visibility timeout doesn't apply. Fargate is dispatched directly by the API.

**Per-job concurrency cap:** Lambda reserved concurrency at the function level (e.g., 50 concurrent invocations) gives a per-account ceiling. Per-job concurrency is inherent: a 6-plot job creates 6 messages and SQS+Lambda fan them out as fast as the function's reserved concurrency allows. No explicit per-job throttling needed at v1.

### 4.4 Message size

256 KB SQS hard limit. Slice spec payload should be bounded:

```json
{
  "slice_id": "slc_...",
  "job_id": "job_...",
  "boundary_index": 3,
  "kmz_blob_url": "s3://bucket/projects/.../kmz/<sha>.kmz",
  "params_json": { ... }   // LayoutParameters, ~200 bytes
}
```

Total: well under 1 KB. No risk.

**Result payload goes to S3, never SQS.** Confirmed pattern from `apps/layout-engine/src/handlers.py:189-209` — Lambda PUTs the result file to S3, then UPDATEs the DB row to mark complete. There is no result-back-via-SQS channel today and we shouldn't introduce one.

### 4.5 Per-slice fan-out from `mvp_api`

When `POST /v2/jobs` creates a Job with N slices, the API publishes N SQS messages. Up to 10 messages, sequential `SendMessage` calls in `Promise.all` (small overhead, fine). Beyond 10, use `SendMessageBatch` (10 messages per batch).

Realistic N: per the desktop's brief, "a typical user KMZ has up to 6 plots" — usually N ≤ 10. Above ~30 plots, batching matters; below that it's noise. Implement single-send first, switch to batch if profiling says so.

---

## 5. LAMBDA EXECUTION LAYER

### 5.1 Packaging: container image

`apps/layout-engine/Dockerfile:1-17` proves the container-image-Lambda model works for arbitrary Python deps. Cable-compute should ship the same way.

**New Dockerfile** (`apps/cable-engine/Dockerfile`, sketch):

```dockerfile
FROM public.ecr.aws/lambda/python:3.13
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR ${LAMBDA_TASK_ROOT}

# Install pvlayout_core from a versioned wheel (built by the desktop session's CI)
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-emit-project -o requirements.txt \
    && uv pip install --system -r requirements.txt \
    && rm requirements.txt

COPY src/ ./
CMD ["cable_handler.handler"]
```

The `pyproject.toml` would depend on `pvlayout-core==X.Y.Z` from a private registry (CodeArtifact, or a GitHub Packages release). The desktop session ships the wheel; the backend pins the version.

**Alternatives considered:**

- **Lambda Layer**: dep size limit is 250 MB unzipped per layer. Shapely + numpy + pyproj alone push 200 MB. Cable-compute's `pvlayout_core` likely sits comfortably under the layer cap, but every dep update requires a new layer version. Container image scales better. **Pass.**
- **SnapStart**: Python SnapStart launched in 2024. It would help cold start, but reqs Lambda zip packaging (not container), which we don't want for this dep size. **Pass for v1.**
- **Zip with vendored deps**: 50 MB zip limit, 250 MB unzipped — same dep-size problem as Layer. **Pass.**

### 5.2 Cold start mitigation

`apps/layout-engine/src/lambda_handler.py:19-27` logs "COLD_START" with shapely/geos/python/arch on every cold start. Useful diagnostic; suggests cold start was painful enough during Spike 3 to instrument it.

**Recommendation for v1: live with it.** Reasoning:
- Cable-compute job is fire-and-forget from the desktop. The user clicked "Generate" 30s ago and is reading a progress bar — a 5s extra cold start on the first slice is invisible.
- Subsequent slices in the same job warm up the function rapidly.
- Provisioned concurrency costs $0.000004167/GB-second × 512 MB × 3600s/hour × 24h = ~$0.18/Lambda/day idle. Cheap if needed but not urgent.

**v2 if needed:** provisioned concurrency = 2 instances during business hours (6 AM – 10 PM IST), 0 overnight. Auto-scaling rule based on CloudWatch metric `ConcurrentExecutions`.

Alternative: scheduled CloudWatch event ("warm ping" every 5 min during business hours) — cheaper but cruder.

### 5.3 Versioning between Lambda runtime and desktop sidecar

The desktop sidecar and the Lambda will both run `pvlayout_core`. Drift between the two is the canonical correctness risk.

**Recommendation:** the desktop session publishes `pvlayout_core` as a versioned wheel (semantic versioning on every merge to main). Both consumers pin the same version. CI gate: a check that fails the build if the desktop sidecar's pinned version doesn't match the Lambda Dockerfile's pinned version.

`Slice.engineVersion` records the actually-executed version. Discrepancies show up in observability, not in correctness.

### 5.4 Per-plot fan-out — concretely

In `mvp_api/src/modules/jobs/jobs.service.ts` (sketch):

```ts
async function createJob(userId, licenseKeyId, input) {
  const project = await db.project.findFirstOrThrow({ where: { id: input.projectId, userId, deletedAt: null } })

  // Idempotency pre-lookup (same shape as B16)
  const existing = await db.job.findFirst({
    where: { userId, idempotencyKey: input.idempotencyKey },
    include: { slices: true },
  })
  if (existing) return existing

  // Parse boundary count from the project's stored boundaryGeojson (B26)
  // Or, if the desktop sends boundary_count in the request, trust it.
  const boundaryCount = input.boundaryCount

  const job = await db.$transaction(async (tx) => {
    const j = await tx.job.create({
      data: {
        userId,
        licenseKeyId,
        projectId: project.id,
        kmzBlobUrl: project.kmzBlobUrl,
        kmzSha256: project.kmzSha256,
        paramsJson: input.paramsJson,
        idempotencyKey: input.idempotencyKey,
        engineVersion: input.engineVersion,
      },
    })
    await tx.slice.createMany({
      data: Array.from({ length: boundaryCount }, (_, i) => ({
        jobId: j.id,
        boundaryIndex: i,
        boundaryName: input.boundaryNames[i],
        executor: chooseExecutor(input, i), // see §6
        engineVersion: input.engineVersion,
      })),
    })
    return j
  })

  // Fan-out SQS publish (after the tx commits, so idempotency is safe even on partial failure)
  const slices = await db.slice.findMany({ where: { jobId: job.id }, orderBy: { boundaryIndex: "asc" } })
  await Promise.all(slices.map((s) =>
    publishSliceJob({ slice_id: s.id, job_id: job.id, boundary_index: s.boundaryIndex, kmz_blob_url: job.kmzBlobUrl, params_json: job.paramsJson })
  ))

  return { ...job, slices }
}
```

**SDK call**: `@aws-sdk/client-sqs` `SendMessageCommand`, batch via `SendMessageBatch` if N > 10.

### 5.5 Auth from Lambda back to RDS (or to mvp_api)

**Two options:**

1. **Lambda writes to RDS directly** (current pattern, `apps/layout-engine/src/db_client.py:1-115`).
   - Pros: simpler, fewer moving parts, no auth complexity.
   - Cons: schema drift risk; Lambda needs VPC config + RDS network access + DB credentials.
   - Implementation: Lambda env var `DATABASE_URL`. IAM role allows reading the secret from AWS Secrets Manager (preferred over plaintext env var).

2. **Lambda calls back to `mvp_api`** with a service-account license-key.
   - Pros: schema is owned by Prisma in one place; auth uniformity; Lambda doesn't need RDS network.
   - Cons: extra HTTP hop; need to issue + rotate a service-account license key; `mvp_api` becomes a dependency for slice completion.

**Recommendation: option 1 (Lambda → RDS direct).** Rationale:
- Already proven by `apps/layout-engine`.
- The schema-drift concern is real but mitigatable: ship the Lambda's psycopg2 SQL alongside the Prisma migration in the same PR. CI gate to grep for `UPDATE slices` references in Python code when `Slice` columns change.
- Service-account license keys add operational complexity (rotation, scoping) that we don't need.

The "Lambda calls back to mvp_api" pattern is a reasonable v2 if we end up with multiple workers writing to the same row and need stricter consistency than `UPDATE WHERE id = ... AND status IN (...)`.

---

## 6. FARGATE / ECS EXECUTOR (FUTURE)

### 6.1 Existing ECS infrastructure

**None.** No ECS cluster, no task definition, no Fargate service in the repo. Glob for `task-definition.json`, `ecs-params.yml`, etc. → no matches.

### 6.2 When Fargate is needed

Lambda's hard ceiling is 15 min. The desktop's brief: "some plots may run >15 min on huge user KMZs". A single slice running >14 min on Lambda is at risk of hitting the timeout, getting killed mid-write, leaving the Slice row in `RUNNING` until the visibility timeout retries it on a new Lambda — which will probably also time out.

Realistic estimate: how often will a slice take >14 min? Per the desktop's perf POC ("multi-plot KMZs were taking 7+ minutes locally, now down to ~4 min"), the 4-min number is the cumulative job. A single slice is ~4min/N. **Even with N=1 (single huge plot) the slice is well under 14 min today.** Fargate's only motivation is future user KMZs we haven't seen.

**Recommendation: defer.** Wire it after we observe a real timeout. Until then, all slices go to Lambda.

### 6.3 If we do build it: selection logic

`mvp_api` decides at job-submit time per slice. Inputs: parsed-KMZ heuristics (vertex count, table count, area). Output: `SliceExecutor` enum.

```ts
function chooseExecutor(input, boundaryIndex) {
  const heuristic = estimateSliceCost(input, boundaryIndex)
  if (heuristic.estimatedSeconds > 12 * 60) return SliceExecutor.FARGATE
  return SliceExecutor.LAMBDA
}
```

The heuristic doesn't need to be precise. Conservative (always-Lambda) is the v1 default; switch to Fargate only when the heuristic is dialed in against real data.

### 6.4 Fargate task lifecycle

Same shape as Lambda: task starts → updates `Slice.status='RUNNING'` → runs the engine → uploads result blob to S3 → updates `Slice.status='DONE'`. Same `db_client.py`-style direct RDS writes.

Container image: **same** as the Lambda image (no separate Dockerfile). The task definition just specifies a different platform. The `lambda_handler.handler` entry doesn't run on Fargate; we'd use a sibling `cli_handler.py` that takes args from env or CLI flags and calls the same `handle_slice_job` function.

Image registry: same ECR repo. Tag conventions: `:lambda-prod` and `:fargate-prod` if they ever diverge; otherwise `:prod` for both.

### 6.5 Dispatch from mvp_api

For Fargate slices, no SQS — instead, `mvp_api` calls `ECS.RunTask` directly via the SDK. Cluster ARN + task definition ARN come from env vars.

For job-level concurrency: ECS service-level `desiredCount` is wrong here (we're not running a long-lived service); use one-shot tasks via `RunTask`. Concurrency cap: AWS account-level Fargate vCPU limit (default 8 per region; raise if needed).

---

## 7. END-TO-END FLOW SKETCH

For the desktop's "6-plot KMZ Generate click" walkthrough.

### 7.1 Today (post B26, pre cable-offload)

```
Desktop ────────────────────────► sidecar /layout (HTTP, sync)
                                  └─ runs full 6-plot layout in-process, ~4 min
                                  ◄─ returns LayoutResponse (large JSON)
Desktop renders.
```

Cable-compute happens inline inside the layout pipeline. There's no Job/Slice tracking on the backend. The desktop is blocked for the full duration.

### 7.2 Target (post cable-offload spike 1+2)

```
T+0    Desktop: clicks Generate.
T+0    Desktop: KMZ already in S3 (B6 PUT happened at project-create time, content-addressed).
T+0    Desktop: POST /v2/jobs (mvp_api)
       │  body: { projectId, paramsJson, idempotencyKey, boundaryCount: 6, boundaryNames, engineVersion }
       │  auth: Bearer <license-key>
       └► mvp_api:
          ├─ license-key auth
          ├─ ownership check (Project belongs to caller)
          ├─ idempotency pre-lookup (Job.@@unique([userId, idempotencyKey]))
          ├─ db.$transaction:
          │    ├─ Job.create({ status: QUEUED, ... })
          │    └─ Slice.createMany([6 rows, status: QUEUED, executor: LAMBDA])
          ├─ SendMessageBatch to cable-jobs SQS queue (6 messages)
          └─ 201 { job: {...}, slices: [6...] }
T+0.05s Desktop: starts polling GET /v2/jobs/:id (every 2s)
T+1s   Lambda 1 (cold start ~2-5s on first message; warm <1s subsequent):
       ├─ SQS event → handler({ records: [{body: {slice_id, job_id, boundary_index, kmz_blob_url, params_json}}] })
       ├─ db_client.mark_slice_running(slice_id)
       ├─ s3_client.download_from_s3(kmz_blob_url, /tmp/input.kmz)
       ├─ pvlayout_core.parse_kmz(/tmp/input.kmz) → boundaries
       ├─ pvlayout_core.run_slice(boundaries[boundary_index], params_json) → SliceResult
       ├─ s3_client.upload_to_s3(/tmp/result.json,
       │     "projects/{userId}/{projectId}/runs/{runId}/slices/{boundary_index}/result.json")
       └─ db_client.mark_slice_done(slice_id, /* metadata: run_seconds, etc */)
       (Lambdas 2-6 run in parallel, each ~30-60s for typical slices)
T+30s  Lambda 1 done → mvp_api poll sees Slice 0 status=DONE
T+30s  Desktop UI: per-slice progress bar updates
T+90s  All 6 slices done → mvp_api updates Job.status=DONE in a "rollup" check
       (rollup: triggered on each slice update — `if (allSlicesDone) job.update(status: DONE)`)
T+92s  Desktop polls → Job.status=DONE
       Desktop fetches each slice's result.json via signed-GET URL (mvp_api signs at read time per Path A)
       Desktop reconstructs LayoutResponse from 6 slice results.
       Renders.
```

### 7.3 What's missing from current state vs target

| Component | Status | Missing work |
|---|---|---|
| KMZ S3 upload (B6) | DONE | none |
| Project + Run primitives | DONE | none |
| `POST /v2/jobs` route + service | TODO | new module, follows B16 pattern |
| `GET /v2/jobs/:id` (poll endpoint) | TODO | new route |
| `GET /v2/jobs/:id/slices` (per-slice detail) | TODO | new route |
| `Job` + `Slice` Prisma models | TODO | one migration |
| SQS publisher for `mvp_api` (`publishSliceJob`) | TODO | copy `apps/api/src/lib/sqs.ts:1-30` shape |
| SQS queue (`cable-jobs`) | TODO | provision via AWS CLI for now (see IaC gap, §1.4) |
| SQS DLQ (`cable-jobs-dlq`) | TODO | provision + RedrivePolicy on source queue |
| Cable Lambda function (`cable_engine_lambda_prod`) | TODO | provision via CLI |
| ECR repo (`renewable-energy/cable-engine`) | TODO | provision |
| Cable Lambda Dockerfile | TODO | copy `apps/layout-engine/Dockerfile:1-17` template |
| Cable Lambda handler (`cable_handler.py`) | TODO | copy `apps/layout-engine/src/lambda_handler.py:30-44` shape |
| Cable Lambda orchestration (`handle_slice_job`) | TODO | copy `apps/layout-engine/src/handlers.py:116-221` shape with cable engine inside |
| `db_client.py` for slice (mark_slice_running/done/failed) | TODO | copy `apps/layout-engine/src/db_client.py:1-115` shape |
| GitHub Actions build/deploy workflows | TODO | copy `.github/workflows/build-layout-engine.yml`/`deploy-layout-engine.yml` |
| Job-level rollup logic ("when all slices DONE → job DONE") | TODO | service method called on each slice-status update |
| Result blob signing (mvp_api → desktop) | TODO | mirror B17 pattern, deterministic key |
| Sidecar local-execute path (`SliceExecutor.LOCAL_SIDECAR`) | TODO | desktop side |
| IaC for new resources | TODO (deferred) | manual CLI for v1; Terraform if scope grows |
| CloudWatch alarms (DLQ depth, Lambda errors) | TODO | add with the queue |

### 7.4 Effort estimate

**Reusing experimental infra (the realistic path):** ~4-5 weeks calendar with one engineer, assuming the desktop session ships `pvlayout_core` as a wheel by end of week 2.

| Phase | Calendar | Output |
|---|---|---|
| **Week 1** | mvp_db schema + migration; `Job`/`Slice` semantic-id prefixes; `POST /v2/jobs` skeleton with idempotency + ownership; tests against mocked SQS. SQS queue + DLQ provisioned in dev. | First green test: API creates Job + 6 Slices + publishes 6 mock SQS messages. No real Lambda yet. |
| **Week 2** | `apps/cable-engine/` Dockerfile + handler skeleton; ECR repo; first manual `docker build && docker push` to ECR; manual Lambda function creation pointing at the image with a no-op handler. | First green test: `aws lambda invoke` against the function returns 200 with stub response. |
| **Week 3** | Wire the pvlayout-core wheel from the desktop session; `handle_slice_job` orchestration; `db_client.py` writes; round-trip a real slice from `mvp_api` → SQS → Lambda → S3 → RDS in dev. | First green test: end-to-end 1-slice job in dev. |
| **Week 4** | `GET /v2/jobs/:id` polling endpoint with rollup logic; result-blob signing; desktop adapter polling loop; live test of 6-slice job. GitHub Actions build+deploy workflows. | First green test: 6-slice job runs end-to-end, desktop UI reflects per-slice progress. |
| **Week 5** | Hardening: DLQ alarm, DLQ replay tooling, Lambda timeout tuning, cold-start measurement, error-payload formatting, retry semantics, observability. CloudWatch dashboards. | Spike sign-off. |

**Greenfield path (ignore experimental infra):** ~6-7 weeks calendar. Adds 1-2 weeks for: container packaging from scratch, OIDC/IAM setup, GitHub Actions Docker pipeline, first ECR push debugging. The experimental infra reuse is **substantial** — at least 1.5 weeks of pipeline plumbing already exists.

---

## 8. UNKNOWNS / RISKS

### 8.1 Hard unknowns

1. **`pvlayout_core` packaging.** The desktop session's compute lives in `pv_layout_project/pvlayout_core/`. We can't pip-install from a GitHub URL inside a Lambda Dockerfile easily (auth tokens + cache invalidation). Recommendation: desktop session publishes the package to **GitHub Packages (PyPI registry)** or **AWS CodeArtifact** as part of CI. Backend Dockerfile pins `pvlayout-core==X.Y.Z` from that registry. This is a desktop-side spike-1 deliverable, not a backend ask, but it gates spike-2.

2. **VPC config for Lambda.** The current `apps/layout-engine` Lambda accesses RDS — that means it's in a VPC with NAT or a VPC endpoint to S3. **Confirm or refute** by running `aws lambda get-function-configuration --function-name layout_engine_lambda_prod --query 'VpcConfig'`. If the existing Lambda is in a VPC, the cable Lambda must be in the same VPC (or a sibling) with the same RDS access. If it's not, we need to add VPC config (adds cold start time by ~3-5s due to ENI attachment).

3. **`pvlayout_core` deps vs `apps/layout-engine` deps overlap.** Both will end up shipping shapely, pyproj, numpy, etc. If the cable engine Dockerfile uses a different `requirements.txt` from `apps/layout-engine`, we'll have version skew at the AWS account level (two Lambda functions running different shapely versions). Decision: do we share a base image? Recommend **no** for spike — each engine pins its own deps. Revisit if cold start metrics show shared-base would help.

4. **SQS exactly-once semantics under retry.** SQS Standard delivers at-least-once. The Lambda must be idempotent on `(slice_id, attempt_count)`. If the Lambda starts running, writes `mark_slice_running`, then the container dies before completion, SQS redelivers and the next handler sees `Slice.status=RUNNING` from the previous attempt. Recommend `mark_slice_running` use `UPDATE slices SET status='RUNNING', startedAt=NOW(), attemptCount=attemptCount+1 WHERE id=$1 AND status IN ('QUEUED','RUNNING')` so re-entries are safe and the row reflects retry count.

5. **Engine version drift.** If the Lambda image at `:prod` is updated mid-job (deploy lands while slice 3 of 6 is in flight), slices 1-3 may run on different engine versions than 4-6. `Slice.engineVersion` records what was used; **but the desktop's reconstruction logic must tolerate this** (i.e., results stitched from multiple engine versions must still be coherent). This is more a desktop concern than a backend one; flagging.

### 8.2 Soft risks

6. **Lambda 15-min timeout vs realistic slice runtime.** The desktop's 4-min cumulative figure is for 6 plots on a typical KMZ on a typical PC. A heavy KMZ slice on cold-start Lambda may be 2-3× slower (Lambda's 512 MB CPU is slower than a desktop). Recommend: in week 3, instrument actual slice durations on Lambda and set `Lambda timeout = max(p99 × 1.5, 14 min)`. If p99 > 12 min, prioritize Fargate.

7. **Cost.** 100k slices/month × ~30s avg × 512 MB × $0.0000166667/GB-s = ~$25/month for compute. Plus SQS (~$0.40/month per million messages), Lambda invocations ($0.20/M), S3 storage, NAT (if VPC). Order of magnitude $50-100/month at projected v1 volume. Negligible vs developer time.

8. **Cold starts on user-perceived first-click latency.** First Generate of the day = cold start ~5-10s on the first slice (Python + shapely + GEOS init). User experience: "loading 0/6" sits for 10s before the first slice flips to RUNNING. Ugly. Mitigations (any one):
   - "Provisioned concurrency = 1" during business hours: ~$0.18/day. 0 cold starts.
   - Pre-warm via scheduled CloudWatch event hitting the function every 5min during business hours.
   - UX: optimistic "queued" state in the UI so the loading bar is honest.
   Pick one in week 4.

9. **DB write contention.** 6 simultaneous Lambdas calling `mark_slice_running` then `mark_slice_done` for slices of the same job → 12 RDS writes in ~1 min. Negligible at this scale; Aurora handles thousands of TPS. Flagging only because we should monitor `aurora_replica_lag_p99` once we're in steady state.

10. **DLQ replay tooling.** When a slice goes to DLQ, someone (or some operator) needs to:
    - Read the DLQ message
    - Inspect `errorPayload` from `Slice.errorPayload`
    - Decide: bug fix + redeploy + manual re-send vs ignore vs refund the calc
    - Re-publish the SQS message to the source queue
    Build this as a `mvp_admin` page (the admin app already has customer support tooling). Half a day.

11. **Idempotency-key UX from the desktop.** B16's pattern: desktop generates a UUID at job-submit time, retries always send the same UUID. If the user clicks Generate twice in quick succession → two different UUIDs → two jobs created → 2× billing. The desktop must dedup at the UI level (disable Generate button until the first response lands or 5s of network silence). This is desktop-side, but flagging.

12. **`run_layout_multi` purity claim.** The desktop session asserts: "Each plot in a multi-plot KMZ is fully independent post-`run_layout_multi` (zero shared mutable state)." Backend takes this at face value. **Recommend a CI test** in `pvlayout_core` that runs the same 6-plot KMZ as 6 sequential single-plot calls and as one multi-plot call, and asserts byte-equal LayoutResponse. If this test isn't already in place, week 1 is a good time.

13. **Cancel button.** The desktop session's spike-1 mentions a Cancel button. Backend implication: `POST /v2/jobs/:id/cancel` would mark `Job.status=CANCELLED` and ideally signal in-flight Lambdas to abort. Lambda has no clean abort signal — best we can do is mark-cancelled in DB, let in-flight Lambdas finish (their writes are idempotent and harmless), and refuse to dispatch any not-yet-published slices. Implement as a soft-cancel only.

14. **Refund semantics.** **AMENDED 2026-05-02** — supersedes the original "no refund" stance below. Per B27 decision memo at [`docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md`](./findings/2026-05-02-002-refund-on-cancel-policy.md): **cancel and failed jobs DO refund the calc.** Cancel mark is persisted at `Run.status = CANCELLED` synchronously with a `kind = 'refund'` `UsageRecord` row (single Postgres transaction, `SELECT … FOR UPDATE` for serialization). Sidecar / Lambda completion path re-reads `Run.status` before committing `DONE` and aborts on `CANCELLED` (best-effort S3 blob cleanup; orphan blobs tolerable). Cancel-after-DONE → 409 (Run is terminal; user uses B18 delete instead, which still does not refund). Cancel UI shows confirmation modal with refund copy (cancel is destructive; modal matches user mental model). Failed runs follow the same refund mechanism — orchestrator-detected failure flips `Run.status = FAILED` + writes refund row in one transaction.

   Original stance (now superseded): *"If a user cancels a job mid-flight, do we refund the calc? Existing pattern (per B18 / V2-plan §2): 'Run delete does NOT refund the calc'. Apply same: cancelling a job after submission charges the user the full calc. Document this in the cancel-confirm dialog."*

15. **`Engine version` recorded in Job but heterogeneous in Slices.** If `Job.engineVersion = 1.4.2` but `Slice[3].engineVersion = 1.4.3` (because deploy landed mid-job), what does the desktop trust? Recommend: `Slice.engineVersion` is authoritative for that slice's result; `Job.engineVersion` is informational ("the version the user submitted with"). UI: show `Job.engineVersion` in the sidebar; reconciliation is the desktop's call.

---

## Appendix A: Quick reference — files cited

| File | Path | Cited for |
|---|---|---|
| Lambda SQS publisher | `apps/api/src/lib/sqs.ts:1-30` | §1.2, §1.6, §5.4 |
| Local HTTP fallback | `apps/api/src/lib/layout-engine.ts:1-14` | §1.2, §1.6 |
| Lambda Dockerfile | `apps/layout-engine/Dockerfile:1-17` | §1.3, §5.1 |
| Lambda pyproject | `apps/layout-engine/pyproject.toml:1-21` | §1.3 |
| Lambda handler entry | `apps/layout-engine/src/lambda_handler.py:1-44` | §1.3, §1.5, §5.2 |
| Lambda orchestration | `apps/layout-engine/src/handlers.py:1-221` | §1.5, §1.6, §4.4 |
| Lambda DB client | `apps/layout-engine/src/db_client.py:1-115` | §1.5, §1.6, §5.5 |
| Older Prisma schema | `packages/db/prisma/schema.prisma:1-99` | §1.6, §3.1 |
| New Prisma schema | `packages/mvp_db/prisma/schema.prisma:135-220` | §3.1, §3.2 |
| `mvp_api` app routing | `apps/mvp_api/src/app.ts:1-113` | §2.1 |
| `mvp_api` runs route | `apps/mvp_api/src/modules/runs/runs.routes.ts:1-91` | §2.5 |
| `mvp_api` S3 helpers | `apps/mvp_api/src/lib/s3.ts:1-82` | §2.4 |
| `mvp_api` usage route (idempotency) | `apps/mvp_api/src/modules/usage/usage.routes.ts:17-21` | §2.5 |
| Build CI | `.github/workflows/build-layout-engine.yml:1-59` | §1.4 |
| Deploy CI | `.github/workflows/deploy-layout-engine.yml:1-49` | §1.4 |
| Spike 3 plan | `docs/superpowers/plans/2026-04-19-spike3-lambda-sqs.md:1-80` | §1.1, §1.4 |

---

## Appendix B: Things this report did not investigate

- Detailed cost model with multiple traffic scenarios.
- Specific shapely/pyproj/numpy version pins on `apps/layout-engine` vs cable-compute (verify before week 2).
- `apps/api/src/modules/projects/projects.service.ts` end-to-end (only the dispatch logic at lines 283-297 was cited via the Explore agent's audit; not re-verified).
- Vercel-side env var configuration for the new SQS_CABLE_QUEUE_URL.
- mvp_admin UI for DLQ replay tooling — would need its own design pass.
- Authorization: what happens when a license expires mid-job? Current pattern: license-key auth happens at job-submit; once the Job exists, slices run regardless. Confirm acceptable.

---

*End of report. Save target met: `/Users/arunkpatra/codebase/renewable_energy/docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md`*
