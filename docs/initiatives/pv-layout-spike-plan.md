> **⚠️ SUPERSEDED 2026-04-29** — this spike plan was for the old "cloud-native web port" direction, now retired. PVLayout is shipping as a Tauri desktop app. The active backend initiative is **[post-parity-v2-backend-plan.md](./post-parity-v2-backend-plan.md)**. This document is preserved as historical context only — do not pick up any spike below as new work.

---

# PV Layout Engine — Spike Plan

**Initiative:** PV Layout Engine — Cloud Platform Port (superseded)
**Foundational document:** [pv-layout-cloud.md](./pv-layout-cloud.md) — also superseded
**Status:** Superseded (2026-04-29)
**Created:** 2026-04-19

---

## Living Document Policy

This document must stay current. Stale spike plans cause more confusion than no plan at all.

**Update this document when:**
- A spike status changes — update the status field and the overview table immediately
- A spike completes — record the outcome date and any decisions in the Decisions Log
- A spike's scope changes — update the spike section and note the reason
- A new spike is added — add it to the overview table and give it a full section
- A decision made during a spike affects a future spike — record it in the Decisions Log and update the affected spike's scope or acceptance criteria

**Update the foundational document ([pv-layout-cloud.md](./pv-layout-cloud.md)) when:**
- A functional requirement changes
- A technical constraint changes
- Scope changes (something added or removed)

**Rule:** Changes that affect both documents must be committed together. Never leave them inconsistent. If you update a requirement in the foundational doc, check whether any spike acceptance criteria need updating here — and vice versa.

---

## How to Use This Document

Each spike is a self-contained unit of work with a defined scope and acceptance criteria. Spikes are ordered by dependency — a spike must be verified complete before the next begins. When a spike starts, update its status. When it completes, record the outcome and any decisions made that affect downstream spikes.

**Status values:** `planned` · `in-progress` · `complete` · `blocked`

### Definition of Done (applies to every spike)

A spike is complete only when **all** of the following are true:

1. All static gates pass from the repo root: `bun run lint && bun run typecheck && bun run test && bun run build`
2. Every acceptance criterion has been verified by a human, step by step, in a running environment
3. Verification covers every applicable environment — local dev and production — not just one
4. No criterion is marked complete on Claude's assertion alone — "it should work" is not done

Agent-assisted runtime testing (human leads, Claude assists) is the standard. There is no shortcut.

---

## Architecture Pattern Reference

Derived from the journium monorepo (`/Users/arunkpatra/codebase/journium/journium`). All spikes follow this pattern:

**Local development (`USE_LOCAL_ENV=true`):**
```
apps/web → apps/api (Hono) → HTTP → apps/layout-engine (uv run python src/server.py, port 8000)
                                           ↓
                                     Real S3 bucket (artifacts)
                                           ↓
                                     PostgreSQL (status + URLs)
```

**Production (`USE_LOCAL_ENV=false`):**
```
apps/web → apps/api (Hono) → SQS → Lambda (apps/layout-engine Docker image from ECR)
                                           ↓
                                     Real S3 bucket (artifacts)
                                           ↓
                                     PostgreSQL (status + URLs)
```

**Key principles:**
- `apps/layout-engine/src/handlers.py` — shared business logic, runs identically in both modes
- `apps/layout-engine/src/lambda_handler.py` — Lambda transport (added in Spike 3)
- `apps/layout-engine/src/server.py` — local HTTP transport (HTTPServer ↔ handler); run with `uv run python src/server.py` on port 8000, no Docker needed in local dev
- `USE_LOCAL_ENV=true` → Hono API calls layout engine via HTTP directly (no SQS, no Lambda)
- `USE_LOCAL_ENV=false` → Hono API enqueues to SQS; Lambda runs the engine
- Real S3 buckets in all environments (local, prod). No LocalStack.
- `uv` for Python dependency management (not pip). `pyproject.toml` + `uv.lock`.

---

## Spike Overview

| # | Spike | Status | Depends On |
|---|-------|--------|------------|
| 1 | [Data Model](#spike-1--data-model) | complete | — |
| 2a | [apps/layout-engine Scaffold](#spike-2a--appslayout-engine-scaffold) | complete | Spike 1 |
| 2b | [Layout Compute (local)](#spike-2b--layout-compute-local) | complete | Spike 2a |
| 2c | [S3 + DB Integration](#spike-2c--s3--db-integration) | complete | Spike 2b |
| 3a | [Dockerfile + ECR + First Image Push](#spike-3a--dockerfile--ecr--first-image-push) | complete | Spike 2c |
| 3b | [AWS Resources (SQS, Lambda, Roles)](#spike-3b--aws-resources-sqs-lambda-roles) | complete | Spike 3a |
| 3c | [Python: lambda_handler, handlers, db_client](#spike-3c--python-lambda_handler-handlers-db_client) | complete | Spike 3b |
| 3d | [Hono API: Dispatch Wiring](#spike-3d--hono-api-dispatch-wiring) | complete | Spike 3c |
| 3e | [GitHub Actions CI/CD](#spike-3e--github-actions-cicd) | complete | Spike 3d |
| 3f | [Production End-to-End Test](#spike-3f--production-end-to-end-test) | complete | Spike 3e |
| 3g | [Lambda Performance Investigation](#spike-3g--lambda-performance-investigation) | complete | Spike 3f |
| 4a | [API + api-client Data Layer](#spike-4a--api--api-client-data-layer) | complete | Spike 3g |
| 4b | [Projects List + Create Project](#spike-4b--projects-list--create-project) | complete | Spike 4a |
| 4c | [Version Submission Form](#spike-4c--version-submission-form) | complete | Spike 4b |
| 4d | [Version Detail + Polling](#spike-4d--version-detail--polling) | complete | Spike 4c |
| 4e | [Pagination UI](#spike-4e--pagination-ui) | complete | Spike 4d |
| 5a | [Stats Dashboard](#spike-5a--stats-dashboard) | complete | Spike 4 |
| 5b | [SVG Fetch + Render](#spike-5b--svg-fetch--render) | complete | Spike 5a |
| 5c | [Zoom/Pan + Layer Toggles](#spike-5c--zoompan--layer-toggles) | complete | Spike 5b |
| 6 | [KMZ Download](#spike-6--kmz-download) | planned | Spike 5b |
| 7 | [Energy Job](#spike-7--energy-job) | planned | Spike 3f |
| 8 | [PDF Download](#spike-8--pdf-download) | planned | Spike 7 |
| 9 | [DXF Download](#spike-9--dxf-download) | planned | Spike 8 |
| 10 | [Error Handling and Retry UX](#spike-10--error-handling-and-retry-ux) | planned | Spike 9 |
| 11 | [End-to-End Production Smoke Test](#spike-11--end-to-end-production-smoke-test) | planned | Spike 10 |

---

## Spike 1 — Data Model

**Status:** complete — 2026-04-19  
**Depends on:** Platform foundation (Prisma + Hono API already in place)

### What we're building

The PostgreSQL schema and API surface that all subsequent spikes build on. Every project, version, and job record lives here. Get this right before touching anything else.

### DB Schema (Prisma)

```
Project
  id            String   @id @default(cuid())
  userId        String                          -- Clerk user ID (single-user for now)
  name          String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  versions      Version[]

Version
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(...)
  number        Int                             -- Sequential: 1, 2, 3 … per project
  label         String?                         -- Optional user label ("with trackers", etc.)
  status        VersionStatus                   -- overall: queued | processing | complete | failed
  kmzS3Key      String                          -- Input KMZ stored in S3 (immutable snapshot)
  inputSnapshot Json                            -- Full parameter snapshot at time of submission
  layoutJob     LayoutJob?
  energyJob     EnergyJob?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

LayoutJob
  id            String     @id @default(cuid())
  versionId     String     @unique
  version       Version    @relation(...)
  status        JobStatus  -- queued | processing | complete | failed
  kmzArtifactS3Key  String?
  svgArtifactS3Key  String?
  dxfArtifactS3Key  String?
  statsJson     Json?      -- All layout stats (tables, MWp, ICRs, cables, LAs, etc.)
  errorDetail   String?
  startedAt     DateTime?
  completedAt   DateTime?

EnergyJob
  id            String     @id @default(cuid())
  versionId     String     @unique
  version       Version    @relation(...)
  status        JobStatus  -- queued | processing | complete | failed
  pdfArtifactS3Key  String?
  statsJson     Json?      -- Energy stats (GTI, PR, CUF, Year1 MWh, 25yr MWh, etc.)
  irradianceSource  String?   -- "pvgis" | "nasa_power" | "manual"
  errorDetail   String?
  startedAt     DateTime?
  completedAt   DateTime?

enum VersionStatus { QUEUED PROCESSING COMPLETE FAILED }
enum JobStatus     { QUEUED PROCESSING COMPLETE FAILED }
```

### API Endpoints (Hono)

All routes under `/projects`. All require auth middleware.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects` | Create project (name) |
| `GET` | `/projects` | List user's projects |
| `GET` | `/projects/:id` | Get project detail |
| `DELETE` | `/projects/:id` | Delete project (and all versions) |
| `POST` | `/projects/:id/versions` | Submit new version (KMZ upload + parameters) |
| `GET` | `/projects/:id/versions` | List versions for project |
| `GET` | `/projects/:id/versions/:versionId` | Get version detail (status + stats + artifact URLs) |

The `POST /versions` endpoint:
1. Receives multipart form: KMZ file + JSON parameters
2. Uploads KMZ to S3 (`projects/{projectId}/versions/{versionId}/input.kmz`)
3. Writes Version record (`status: QUEUED`, `inputSnapshot: params`, `kmzS3Key`)
4. Writes LayoutJob record (`status: QUEUED`)
5. Returns `{ versionId, status: "queued" }`
6. Job dispatch (HTTP or SQS) happens after response returns (Spike 3)

The `GET /versions/:versionId` endpoint returns:
- Version status + job statuses
- Pre-signed S3 URLs for each artifact (valid 1 hour) — only included when artifact exists
- Stats JSON from LayoutJob and EnergyJob

### packages/api-client

Add typed request/response types for all endpoints above. TanStack Query hooks for web app consumption.

### Acceptance Criteria

- [ ] Prisma migration runs cleanly; schema matches above
- [ ] All API endpoints return correct responses with real DB
- [ ] Version number increments correctly per project (1, 2, 3 …)
- [ ] `inputSnapshot` stores complete parameter set; is immutable after creation
- [ ] Pre-signed S3 URLs generated correctly (test with a manually inserted S3 key)
- [ ] API client types compile with no errors

---

## Spike 2a — `apps/layout-engine` Scaffold

**Status:** complete — 2026-04-19  
**Depends on:** Spike 1

### What we're building

The bare minimum Python app in the monorepo: directory structure, `pyproject.toml`, `uv` environment, copied source files from the Python desktop app, and a health-check server. No compute, no S3, no DB. The goal is a fully committed, lintable Python package that starts and responds to a health check — nothing more.

### Directory Structure

```
apps/layout-engine/
  src/
    core/           ← copied from PVlayout_Advance/core/ (unchanged)
      kmz_parser.py
      layout_engine.py
      spacing_calc.py
      icr_placer.py
      string_inverter_manager.py
      la_manager.py
      road_manager.py
      energy_calculator.py
      kmz_exporter.py
      dxf_exporter.py
      pdf_exporter.py
    models/         ← copied from PVlayout_Advance/models/ (unchanged)
      project.py
    utils/          ← copied from PVlayout_Advance/utils/ (unchanged)
      geo_utils.py
    server.py       ← NEW: GET /health only; POST /layout added in Spike 2b
  pyproject.toml
  uv.lock
  ruff.toml
```

### What Changes in the Copied Code

- **Add `matplotlib.use('Agg')` at top of any file that imports matplotlib** — enables headless rendering with no display backend
- **No other changes** to `core/`, `models/`, `utils/` — these are already clean of Qt

### pyproject.toml Dependencies

```toml
[project]
requires-python = ">=3.13"
dependencies = [
    "shapely>=2.0",
    "pyproj>=3.5",
    "matplotlib>=3.7",
    "simplekml>=1.3",
    "ezdxf",
    "requests>=2.28",
    "boto3>=1.35",
    "psycopg2-binary>=2.9",
]

[tool.ruff]
line-length = 88
```

### server.py (Spike 2a scope)

```python
# GET /health → { "status": "ok" }
# POST /layout added in Spike 2b
```

Run directly in local dev: `uv run python src/server.py` (port 8000)

### Acceptance Criteria

- [ ] `uv sync` runs cleanly — no dependency resolution errors
- [ ] `GET /health` returns `{ "status": "ok" }` — human verifies with curl
- [ ] `uv run python src/server.py` starts with no errors — human confirms in terminal
- [ ] `ruff check src/` passes with zero violations
- [ ] All monorepo static gates pass: `bun run lint && bun run typecheck && bun run test && bun run build`

---

## Spike 2b — Layout Compute (local)

**Status:** complete — 2026-04-19  
**Depends on:** Spike 2a

### What we're building

The full layout compute pipeline — `svg_exporter.py`, `handlers.py`, and `POST /layout` on `server.py` — verified locally without S3 or DB. The POST body for this spike accepts a local KMZ file path so the pipeline can be tested with only a real KMZ file. The S3 and DB contract is added in Spike 2c; this spike proves the compute logic is correct first.

### New Files

```
apps/layout-engine/
  src/
    handlers.py     ← NEW: handle_layout (Spike 2b version — local paths, no S3/DB)
    svg_exporter.py ← NEW: matplotlib SVG renderer with gid-tagged layer groups
```

### handlers.py — Spike 2b Version

```python
def handle_layout(payload: dict) -> dict:
    """
    Spike 2b contract (local testing — replaced in Spike 2c):
      kmz_local_path: str      -- absolute path to local KMZ file
      parameters: dict         -- all layout + module + table + inverter params
      output_dir: str          -- absolute path to write output files

    Returns:
      stats: dict              -- all layout stats (tables, MWp, ICRs, etc.)
    Writes to output_dir:
      layout.kmz, layout.svg, layout.dxf
    """
```

This contract is intentionally simplified — no S3, no DB, no `version_id`. It exists solely to verify the compute pipeline. It is replaced in full in Spike 2c.

### server.py (Spike 2b additions)

```
POST /layout → accepts JSON:
  { "kmz_local_path": "/absolute/path/to/site.kmz", "parameters": {...}, "output_dir": "/tmp" }
  → calls handle_layout
  → returns { "stats": {...} }
```

This POST body format is a testing convenience only. It is replaced with the production contract (`kmz_s3_key`, `version_id`) in Spike 2c.

### svg_exporter.py

Port of `_draw_layout()` from `PVlayout_Advance/gui/main_window.py`. Renders all layout layers using matplotlib with `gid` attributes set on each group before export so the browser SVG DOM has named groups.

Named groups:
- `boundary` — site boundary polygon
- `obstacles` — exclusion zone polygons
- `tables` — all placed table rectangles
- `icrs` — ICR building rectangles + annotations
- `inverters` — string inverter rectangles + annotations
- `dc-cables` — DC cable routes
- `ac-cables` — AC cable routes (hidden by default in UI)
- `la-footprints` — LA rectangles (hidden by default in UI)
- `la-circles` — LA protection circles (hidden by default in UI)
- `annotations` — labels and text

### Acceptance Criteria

- [ ] `POST /layout` with a real KMZ local path → artifacts appear in `/tmp`: `layout.kmz`, `layout.svg`, `layout.dxf`
- [ ] Human opens `layout.svg` in browser, inspects DOM — all 10 `gid`-tagged groups present
- [ ] Stats dict returned in response — values are plausible for the test site
- [ ] `matplotlib.use('Agg')` in effect — no display errors when server runs headless
- [ ] `ruff check src/` passes with zero violations
- [ ] All monorepo static gates pass

---

## Spike 2c — S3 + DB Integration

**Status:** complete — 2026-04-19  
**Depends on:** Spike 2b

### What we're building

Replace the local-path testing contract with the real production contract: Python downloads the input KMZ from S3, runs the pipeline, uploads artifacts to S3, and updates the DB directly (LayoutJob + Version status transitions). The Hono API never touches DB job status after the initial QUEUED write — Python owns all subsequent state.

### New Files

```
apps/layout-engine/
  src/
    s3_client.py    ← NEW: S3 download (input KMZ) + upload (layout.kmz, layout.svg, layout.dxf)
    db_client.py    ← NEW: raw psycopg2 SQL — LayoutJob and Version status transitions
```

### db_client.py

Raw psycopg2-binary — no ORM. Two responsibilities:
1. Update `layout_jobs` table: `QUEUED → PROCESSING` on start; `PROCESSING → COMPLETE` (with artifact S3 keys + statsJson) or `PROCESSING → FAILED` (with errorDetail) on finish.
2. Update `versions` table: set to `PROCESSING` when layout starts; set to `COMPLETE` or `FAILED` when layout finishes.

```python
def mark_layout_processing(version_id: str) -> None: ...
def mark_layout_complete(version_id: str, kmz_key: str, svg_key: str, dxf_key: str, stats: dict) -> None: ...
def mark_layout_failed(version_id: str, error: str) -> None: ...
```

Note: raw SQL uses Postgres table names (`layout_jobs`, `versions`), not Prisma model names (`LayoutJob`, `Version`).

### handlers.py — Spike 2c additions (production contract)

```python
def handle_layout_job(version_id: str, kmz_s3_key: str, parameters: dict) -> None:
    """
    Production contract (called by server.py background thread):
      version_id: str          -- DB record lookup
      kmz_s3_key: str          -- S3 key of input KMZ
      parameters: dict         -- all layout params

    Side effects:
      - Downloads input KMZ from S3
      - Runs full pipeline
      - Uploads layout.kmz, layout.svg, layout.dxf to S3
      - Updates layout_jobs and versions in DB (COMPLETE or FAILED)
    """
```

Note: In Spike 3, this signature changes to `handle_layout_job(version_id)` only — the version record becomes the source of truth for `kmz_s3_key` and `parameters`.

### server.py — Spike 2c (production contract)

```
POST /layout → accepts JSON:
  {
    "kmz_s3_key": "projects/{projectId}/versions/{versionId}/input.kmz",
    "version_id": "ver_...",
    "parameters": { ...all layout params... }
  }
  → returns 202 Accepted immediately
  → runs handle_layout_job in background thread
  → handle_layout_job updates DB directly on completion or failure
```

The server returns 202 before compute begins. The caller (Hono API in Spike 3) fires and forgets.

### S3 Key Conventions

```
projects/{projectId}/versions/{versionId}/input.kmz      ← uploaded by Hono on version submit
projects/{projectId}/versions/{versionId}/layout.kmz     ← written by layout engine
projects/{projectId}/versions/{versionId}/layout.svg     ← written by layout engine
projects/{projectId}/versions/{versionId}/layout.dxf     ← written by layout engine
projects/{projectId}/versions/{versionId}/report.pdf     ← written by energy engine (Spike 7)
```

### Environment Variables (layout-engine, local dev)

```bash
DATABASE_URL=postgresql://renewable:renewable@localhost:5432/renewable_energy
S3_BUCKET=renewable-energy-local-artifacts
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Loaded via `.env` file at dev startup: `uv run --env-file .env python src/server.py`

### Acceptance Criteria

- [ ] `POST /layout` with real `{kmz_s3_key, version_id, parameters}` → returns 202 immediately (human verifies with curl, no waiting)
- [ ] KMZ + SVG + DXF appear in S3 under correct keys (human verifies in AWS console or aws CLI)
- [ ] `layout_jobs` DB record transitions: `QUEUED → PROCESSING → COMPLETE` — human verifies with `bun run db:studio`
- [ ] `versions` DB record transitions: `QUEUED → PROCESSING → COMPLETE`
- [ ] `statsJson` populated correctly in LayoutJob record — human checks a sample stat value
- [ ] DXF artifact opens correctly in a DXF viewer
- [ ] Deliberate failure (invalid KMZ): LayoutJob status = `FAILED`, `errorDetail` populated
- [ ] All monorepo static gates pass

---

## Spike 3a — Dockerfile + ECR + First Image Push

**Status:** complete — 2026-04-19  
**Depends on:** Spike 2c

### What we're building

The Lambda container image: Dockerfile, `.dockerignore`, ECR repository creation, and the first manual image push. No Lambda function yet — just proving the image builds and lands in ECR.

Full design: `docs/superpowers/specs/2026-04-19-spike3-lambda-deployment-design.md`.

### New Files

```
apps/layout-engine/
  Dockerfile        ← Lambda container image (public.ecr.aws/lambda/python:3.13, arm64)
  .dockerignore     ← exclude .venv, __pycache__, tests, .env
```

### Dockerfile

```dockerfile
FROM public.ecr.aws/lambda/python:3.13
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR ${LAMBDA_TASK_ROOT}
COPY pyproject.toml uv.lock ./
RUN /uv export --frozen --no-dev --no-emit-project -o requirements.txt \
    && /uv pip install --system -r requirements.txt \
    && rm requirements.txt
COPY src/ ./
CMD ["lambda_handler.handler"]
```

### ECR Repository (one-time, prod)

```bash
aws ecr create-repository \
  --repository-name renewable-energy/layout-engine \
  --region ap-south-1
```

### Acceptance Criteria

- [ ] `docker build --platform linux/arm64 -t layout-engine:local .` completes with no errors (human runs in `apps/layout-engine/`)
- [ ] ECR repository `renewable-energy/layout-engine` exists in `ap-south-1`
- [ ] Image pushed manually: `layout-engine:prod` tag visible in ECR console (human verifies)
- [ ] All monorepo static gates pass: `bun run lint && bun run typecheck && bun run test && bun run build`

---

## Spike 3b — AWS Resources (SQS, Lambda, Roles)

**Status:** complete — 2026-04-19  
**Depends on:** Spike 3a

### What we're building

All prod AWS infrastructure: SQS queue, Lambda function (from ECR image), SQS event source mapping, Lambda execution role, and OIDC IAM role for GitHub Actions. No code changes — pure infrastructure.

### AWS Resources (prod only)

| Resource | Name / Config |
|---|---|
| SQS queue | `re_layout_queue_prod` (standard) |
| Lambda function | `layout_engine_lambda_prod` (arm64, 512 MB, 180s timeout) |
| SQS event source mapping | batch size 1 |
| Lambda execution role | `renewable-energy-lambda-execution` |
| OIDC IAM role | `renewable-energy-github-actions` |

### Lambda Execution Role Permissions

- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on all artifact buckets
- `AWSLambdaBasicExecutionRole` (CloudWatch Logs)
- `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` on `re_layout_queue_prod`

### OIDC Role Permissions (GitHub Actions)

- ECR: `GetAuthorizationToken`, `BatchCheckLayerAvailability`, `PutImage`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`, `CreateRepository`, `DescribeRepositories`
- Lambda: `UpdateFunctionCode`, `GetFunction` on `layout_engine_lambda_prod`
- Trust policy scoped to `repo:arunkpatra/renewable_energy:*`

### Lambda Environment Variables (prod runtime)

| Variable | Value |
|---|---|
| `DATABASE_URL` | prod RDS connection string (with `?sslmode=no-verify`) |
| `S3_BUCKET` | `renewable-energy-prod-artifacts` |
| `AWS_REGION` | `ap-south-1` |

### Acceptance Criteria

- [ ] SQS queue `re_layout_queue_prod` exists — human verifies in AWS console
- [ ] Lambda `layout_engine_lambda_prod` exists, arm64, 512 MB, 180s timeout — human verifies in AWS console
- [ ] SQS event source mapping created with batch size 1 — human verifies in Lambda trigger config
- [ ] Lambda execution role attached with correct permissions — human verifies IAM
- [ ] OIDC role `renewable-energy-github-actions` exists with correct trust policy — human verifies IAM
- [ ] Manual Lambda invoke with test payload `{ "Records": [{ "body": "{\"version_id\": \"test\"}" }] }` shows invocation in CloudWatch Logs (will fail on DB lookup — that is expected at this stage)

---

## Spike 3c — Python: lambda_handler, handlers, db_client

**Status:** complete — 2026-04-19  
**Depends on:** Spike 3b

### What we're building

The Python code changes for Lambda support: new `lambda_handler.py` entrypoint, `get_version` in `db_client.py`, and the updated `handle_layout_job(version_id)` signature in `handlers.py` with corrected S3 output prefix.

### New Files

```
apps/layout-engine/
  src/
    lambda_handler.py         ← NEW: Lambda entrypoint
  src/tests/
    test_lambda_handler.py    ← NEW: unit test for Lambda handler
```

### `src/lambda_handler.py`

```python
import json
from handlers import handle_layout_job

def handler(event, context):
    for record in event["Records"]:
        payload = json.loads(record["body"])
        handle_layout_job(payload["version_id"])
```

### `src/db_client.py` addition

```python
def get_version(version_id: str) -> tuple[str, str, dict]:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "projectId", "kmzS3Key", "inputSnapshot" FROM versions WHERE id = %s',
                (version_id,),
            )
            row = cur.fetchone()
    if row is None:
        raise ValueError(f"Version not found: {version_id}")
    project_id, kmz_s3_key, input_snapshot = row
    if isinstance(input_snapshot, str):
        import json as _json
        input_snapshot = _json.loads(input_snapshot)
    return project_id, kmz_s3_key, input_snapshot
```

### `src/handlers.py` — updated `handle_layout_job`

Signature changes from `handle_layout_job(version_id, kmz_s3_key, parameters)` to `handle_layout_job(version_id)`. Fetches from DB at start. Output prefix corrected:

```python
def handle_layout_job(version_id: str) -> None:
    project_id, kmz_s3_key, input_snapshot = get_version(version_id)
    bucket = os.environ["S3_BUCKET"]
    output_prefix = f"projects/{project_id}/versions/{version_id}"
    mark_layout_processing(version_id)
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # download, compute, upload to output_prefix
            kmz_key = f"{output_prefix}/layout.kmz"
            svg_key = f"{output_prefix}/layout.svg"
            dxf_key = f"{output_prefix}/layout.dxf"
        mark_layout_complete(version_id, kmz_key, svg_key, dxf_key, stats)
    except Exception as exc:
        mark_layout_failed(version_id, str(exc))
        raise
```

`handle_layout` (local HTTP server contract) is unchanged.

### Acceptance Criteria

- [ ] `test_lambda_handler.py`: mock `handle_layout_job`, verify it is called once per SQS record with correct `version_id` — tests pass
- [ ] `test_db_client.py`: `get_version` unit test (mock `_connect`) — passes
- [ ] Updated `test_handlers_prod.py`: new `handle_layout_job(version_id)` signature, mock `get_version` — passes
- [ ] `ruff check src/` passes with zero violations
- [ ] `uv run pytest src/tests/ -v` — all tests pass
- [ ] All monorepo static gates pass

---

## Spike 3d — Hono API: Dispatch Wiring

**Status:** complete — 2026-04-20  
**Depends on:** Spike 3c

### What we're building

The Hono API changes: new `sqs.ts` (prod SQS publish), new `layout-engine.ts` (local HTTP fire-and-forget), updated `env.ts` with new variables, reordered `createVersion` (version first, then KMZ upload using versionId in path), and the `USE_LOCAL_ENV` conditional dispatch.

### New Files

```
apps/api/src/lib/
  sqs.ts            ← NEW: prod SQS publish wrapper
  layout-engine.ts  ← NEW: local HTTP fire-and-forget caller
```

### `src/lib/sqs.ts`

```typescript
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { env } from "../env.js"

const client = new SQSClient({ region: env.AWS_REGION ?? "ap-south-1" })

export async function publishLayoutJob(versionId: string): Promise<void> {
  if (!env.SQS_LAYOUT_QUEUE_URL) throw new Error("SQS_LAYOUT_QUEUE_URL is not set")
  await client.send(new SendMessageCommand({
    QueueUrl: env.SQS_LAYOUT_QUEUE_URL,
    MessageBody: JSON.stringify({ version_id: versionId }),
  }))
}
```

### `src/lib/layout-engine.ts`

```typescript
import { env } from "../env.js"

export function dispatchLayoutJobHttp(versionId: string): void {
  const url = `${env.LAYOUT_ENGINE_URL}/layout`
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version_id: versionId }),
  }).catch((err) => console.error("layout engine HTTP dispatch failed", err))
}
```

### `src/env.ts` additions

```typescript
USE_LOCAL_ENV: z.string().optional(),
LAYOUT_ENGINE_URL: z.string().default("http://localhost:8000"),
SQS_LAYOUT_QUEUE_URL: z.string().optional(),
AWS_REGION: z.string().default("ap-south-1"),
```

### `createVersion` changes (projects.service.ts)

Reorder: create Version first (`kmzS3Key: null`), upload KMZ using `version.id` in path, then `db.version.update`. After layoutJob created, dispatch:

```typescript
if (env.USE_LOCAL_ENV === "true") {
  dispatchLayoutJobHttp(version.id)
} else {
  publishLayoutJob(version.id).catch((err) =>
    console.error("SQS publish failed", err)
  )
}
```

### Environment Variables

| Variable | local dev | prod (Vercel) |
|---|---|---|
| `USE_LOCAL_ENV` | `true` | `false` |
| `LAYOUT_ENGINE_URL` | `http://localhost:8000` | (unused) |
| `SQS_LAYOUT_QUEUE_URL` | (unused) | `https://sqs.ap-south-1.amazonaws.com/378240665051/re_layout_queue_prod` |
| `AWS_REGION` | `ap-south-1` | `ap-south-1` |

### Acceptance Criteria

- [ ] Local (`USE_LOCAL_ENV=true`): `POST /versions` → layout engine HTTP server receives call → DB transitions QUEUED → PROCESSING → COMPLETE → all three artifacts in S3 (human verifies with `bun run db:studio` and AWS console)
- [ ] Unit tests for `publishLayoutJob` and `dispatchLayoutJobHttp` pass (mock SQS client and fetch)
- [ ] `bun run typecheck` passes in `apps/api`
- [ ] All monorepo static gates pass

---

## Spike 3e — GitHub Actions CI/CD

**Status:** complete — 2026-04-20  
**Depends on:** Spike 3d

### What we're building

Two GitHub Actions workflows: `build-layout-engine.yml` (builds and pushes Docker image to ECR on every push/PR) and `deploy-layout-engine.yml` (manual dispatch to update `layout_engine_lambda_prod`).

### New Files

```
.github/workflows/
  build-layout-engine.yml    ← NEW: build + push to ECR
  deploy-layout-engine.yml   ← NEW: manual Lambda update
```

### `build-layout-engine.yml` — key steps

- **Triggers:** push to `main`, pull requests
- Configure AWS credentials via OIDC (`aws-actions/configure-aws-credentials@v4`, `id-token: write` permission)
- Login to ECR (`aws-actions/amazon-ecr-login@v2`)
- Set up QEMU (`docker/setup-qemu-action@v4`, `platforms: linux/arm64`)
- Set up Docker Buildx (`docker/setup-buildx-action@v4`)
- Build and push (`docker/build-push-action@v7`, `platforms: linux/arm64`, `provenance: false`)
  - Push only on non-PR events; tags: `{sha}` and `prod`
  - ECR registry cache: `buildcache` tag, `mode=max`

**GitHub variables required:** `AWS_ACCOUNT_ID`, `AWS_REGION`  
**GitHub secret required:** `AWS_ROLE_ARN`

### `deploy-layout-engine.yml` — key steps

- **Trigger:** `workflow_dispatch` (manual only)
- Configure AWS credentials via OIDC
- Update Lambda:
  ```bash
  aws lambda update-function-code \
    --function-name "layout_engine_lambda_prod" \
    --image-uri "{account}.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine:prod" \
    --region ap-south-1
  aws lambda wait function-updated \
    --function-name "layout_engine_lambda_prod" \
    --region ap-south-1
  ```

### Acceptance Criteria

- [ ] Push to a PR branch → `build-layout-engine.yml` runs, image built but not pushed — human verifies in GitHub Actions
- [ ] Merge to `main` → `build-layout-engine.yml` runs, image pushed with `{sha}` and `prod` tags — human verifies in ECR
- [ ] Manual dispatch of `deploy-layout-engine.yml` → Lambda updated to latest `prod` image — human verifies Lambda version in AWS console
- [ ] All monorepo static gates pass

---

## Spike 3f — Production End-to-End Test

**Status:** complete — 2026-04-20  
**Depends on:** Spike 3e

### What we're verifying

A complete end-to-end layout job in production: create a version via the prod API → SQS message enqueued → Lambda fires → DB transitions to COMPLETE → all three artifacts in prod S3. This is the acceptance gate for the entire Spike 3 effort.

### Test Protocol

1. Deploy latest `prod` image to Lambda via `deploy-layout-engine.yml` dispatch
2. Create a project via prod API (or Hono API directly with curl)
3. `POST /projects/:id/versions` with a real KMZ + valid parameters
4. Confirm response: `{ versionId, status: "queued" }` returns immediately
5. Confirm SQS message visible in `re_layout_queue_prod` (or watch it disappear as Lambda picks it up)
6. Watch CloudWatch Logs for `layout_engine_lambda_prod` — confirm invocation, no errors
7. Poll `GET /projects/:id/versions/:versionId` — confirm status transitions: QUEUED → PROCESSING → COMPLETE
8. Confirm in `layout_jobs` DB record: `status = COMPLETE`, `kmzArtifactS3Key`, `svgArtifactS3Key`, `dxfArtifactS3Key` populated, `statsJson` populated
9. Confirm all three artifacts present in `renewable-energy-prod-artifacts` S3 under `projects/{projectId}/versions/{versionId}/`
10. Deliberate failure test: submit a corrupt KMZ → confirm `layout_jobs.status = FAILED`, `errorDetail` populated

### Acceptance Criteria

- [ ] `POST /versions` returns `{ versionId, status: "queued" }` immediately — no blocking
- [ ] Lambda invocation visible in CloudWatch Logs with no errors
- [ ] DB: `layout_jobs.status = COMPLETE`, all three artifact S3 keys populated
- [ ] DB: `versions.status = COMPLETE`
- [ ] All three artifacts present in prod S3 at `projects/{projectId}/versions/{versionId}/`
- [ ] Corrupt KMZ → `layout_jobs.status = FAILED`, `errorDetail` set — verified in DB

---

## Spike 3g — Lambda Performance Investigation

**Status:** complete — 2026-04-20  
**Depends on:** Spike 3f

### What we investigated

`place_string_inverters` took 563s on Lambda for a 740-table site (30s on local Mac M2). The full pipeline was functionally correct — this was a performance-only issue blocking production use.

### Root Cause

AC cable routing (inverter → ICR) had unbounded search spaces in patterns A4, B, and E. For 74 AC cables, the algorithm made **5,738,877 `_path_ok` geometry checks** (worst single cable: 1,037,117). Pattern A4 tried 113 gaps × 49 cols × 49 cols = 271,313 candidates per cable.

### Fix Applied

Capped search space in expensive patterns:
- A2/A3: nearest 8 column positions (was all 49)
- A4: nearest 5 × 5 column positions (was 49 × 49)
- B: nearest 8 × 8 gap combinations (was 113 × 113)
- E: max 15 waypoints, skip O(n²) two-waypoint if >10 (was ~150²)

### Results

| Metric | Before | After |
|---|---|---|
| `place_string_inverters` | 563.3s | **16.3s** (34x faster) |
| Total Lambda duration | 572.3s | **24.9s** (23x faster) |
| AC `_path_ok` calls | 5,738,877 | **136,715** (42x fewer) |
| AC cable total length | 19,117.4 m | 19,298.6 m (+0.95%) |

All layout stats (tables, modules, capacity, inverters, ICRs, LAs, DC cables) are identical. Only AC cable routing paths differ slightly for 16 of 74 cables. See `docs/initiatives/spike-3g-ac-cable-routing-optimization.md` for full write-up.

### Acceptance Criteria

- [x] Root cause identified with data (instrumented Lambda run, pattern distribution logged)
- [x] Fix deployed and verified in production — same KMZ completes in 25s
- [x] Layout stats identical before and after (no impact on table/module/capacity calculations)
- [x] AC cable length impact < 1% (0.95%)
- [x] Comprehensive optimization doc written for solar engineer review
- [ ] Solar engineer reviews SVG/DXF outputs and confirms cable routes are acceptable

### Documentation

- Investigation: `docs/initiatives/spike-3g-lambda-perf-investigation.md`
- Optimization: `docs/initiatives/spike-3g-ac-cable-routing-optimization.md`
- Lambda log (pre-optimization): `logs/good-but-slow-lamda.txt`

---

## Spike 4a — API + api-client Data Layer

**Status:** complete — 2026-04-20  
**Depends on:** Spike 3g

### What we built

All backend and API client changes that the UI sub-spikes (4b–4e) depend on.

- `packages/shared`: added `ProjectSummary` (extends `Project` with `versionCount`, `latestVersionStatus`) and `LayoutInputSnapshot` (27 typed fields with exact Python `_params_from_dict` key names)
- `apps/api/src/lib/paginate.ts`: `paginationArgs()` + `paginationMeta()` — single source of truth for pagination clamping; `paginationArgs` returns `{ skip, take, page, pageSize }`
- `listProjects` returns `PaginatedResponse<ProjectSummary>` via `$transaction([count, findMany])` with `_count.versions` and latest version status
- New `listVersions(projectId, userId, query)` service function
- `GET /projects` accepts `page`/`pageSize` query params
- New `GET /projects/:projectId/versions` route
- `packages/api-client`: `buildUrl()` helper, `listProjects(params?)`, `listVersions(projectId, params?)`, `PaginationParams` interface exported

### Key decisions

- `LayoutInputSnapshot` field names must exactly match Python `_params_from_dict` in `apps/layout-engine/src/handlers.py` — wrong names send silent defaults to the Lambda
- `paginationArgs` returns normalised `page`/`pageSize` to prevent duplicate inline clamping in callers

### Acceptance Criteria

- [x] `bun run lint && bun run typecheck && bun run test && bun run build` all pass from repo root
- [x] `GET /projects` returns `PaginatedResponse<ProjectSummary>` with `versionCount` and `latestVersionStatus` — verified local + production
- [x] `GET /projects/:projectId/versions?page=1&pageSize=2` returns 2 items, correct `total`, `totalPages` — verified local + production
- [x] Page 2 returns the correct offset items — verified local + production
- [x] Non-existent project returns `NOT_FOUND` 404 — verified local + production

### Implementation Plan

See `docs/superpowers/plans/2026-04-20-spike-4-project-version-ui.md` Tasks 1–6.

---

## Spike 4b — Projects List + Create Project

**Status:** complete — verified in local dev and production on 2026-04-20  
**Depends on:** Spike 4a

### What we're building

The projects list page, the "New project" modal, dynamic breadcrumbs wired to every page, and sidebar showing live projects.

**Pages and components:**
- `BreadcrumbsProvider` context + `DynamicBreadcrumbs` component — replaces hardcoded "Overview" in layout header
- `/dashboard/projects` — projects list page: shows name, version count, latest status badge; empty state with call to action
- `CreateProjectDialog` — modal with project name input; on create → redirects to `/dashboard/projects/:projectId`
- `/dashboard` — cockpit overview page (stats, quick navigation placeholder); **not** a redirect (see Decisions Log 2026-04-20 4b)
- `AppSidebar` — wired to `useProjects()` for real project data (first 5 projects, "All projects" link); skeleton footer while Clerk loads
- `NavProjects` — accepts real `ProjectSummary[]` + `isLoading` prop; skeleton state during load

### Acceptance Criteria

- [x] `bun run lint && bun run typecheck && bun run test && bun run build` all pass
- [x] `/dashboard` shows the cockpit overview page (not a redirect)
- [x] `/dashboard/projects` shows the projects list
- [x] Projects list shows real projects from API (name, version count, latest status)
- [x] Sidebar "Projects" section shows real project names with correct links
- [x] "New project" modal opens, accepts name, creates project via API, redirects to project detail
- [x] Breadcrumb shows "Projects" on the list page; updates dynamically on nested pages
- [x] Skeleton state shown while projects are loading
- [x] Sidebar footer shows skeleton while Clerk loads and during sign-out (no "User" text flash)
- [x] Verified in local dev and production

### Implementation Plan

See `docs/superpowers/plans/2026-04-20-spike-4-project-version-ui.md` Tasks 7–11.

---

## Spike 4c — Version Submission Form

**Status:** complete — verified local + production 2026-04-20  
**Depends on:** Spike 4b

### What we're building

The 27-parameter version submission form at `/dashboard/projects/[projectId]/new-version`.

**Form design:**
- Sticky left-nav on desktop (200 px) with section links (Module / Table config / Layout / Inverter / Energy losses) and "Run layout" submit button always visible
- Horizontal scrollable chip nav on tablet/mobile; submit button at bottom
- All 27 parameters pre-filled with Python app defaults; user changes only what is non-standard
- Every parameter has a tooltip/popover with explanation, default, and when to override
- KMZ file upload: drag-and-drop zone + click to browse
- Optional run label input
- On submit: `POST /projects/:projectId/versions` (multipart form with `params` JSON + optional `kmz` file) → redirect to version detail page

**27 parameters (5 sections):**
- Module (3): `module_long`, `module_short`, `wattage_wp`
- Table config (4): `orientation`, `modules_in_row`, `rows_per_table`, `table_gap_ew`
- Layout (4): `tilt_deg` (nullable/auto), `row_pitch_m` (nullable/auto), `gcr` (nullable), `road_width_m`
- Inverter (1): `max_strings_per_inverter`
- Energy losses (15): `ghi_kwh_m2_yr`, `gti_kwh_m2_yr`, `inverter_eff_pct`, `dc_loss_pct`, `ac_loss_pct`, `soiling_pct`, `temp_loss_pct`, `mismatch_pct`, `shading_pct`, `availability_pct`, `transformer_loss_pct`, `other_loss_pct`, `first_year_lid_pct`, `annual_deg_pct`, `lifetime_years`

**Error display:** Functional domain-specific messages. `[What failed]. [Reason]. [Action].` structure. Never surface HTTP error codes or TypeScript stack traces to the user.

### Acceptance Criteria

- [x] `bun run lint && bun run typecheck && bun run test && bun run build` all pass
- [x] All 27 parameters visible with correct defaults on page load
- [x] Every parameter has a tooltip — verified by clicking each one
- [x] KMZ drag-and-drop: drop a `.kmz` file → filename and size displayed
- [x] Submitting with defaults → version created → redirected to version detail page
- [x] Desktop (≥1024 px): sticky left-nav visible and scrolls to section on click
- [x] Tablet (768 px): chip nav visible, left-nav hidden
- [x] Error on failed submission: domain-specific message, not raw HTTP error

### Implementation Plan

See `docs/superpowers/plans/2026-04-20-spike-4-project-version-ui.md` Tasks 12–14.

---

## Spike 4d — Version Detail + Polling

**Status:** complete — verified local + production 2026-04-20  
**Depends on:** Spike 4c

### What we're building

The version detail page and project detail page, with live polling that follows ADR-003.

**Polling (ADR-003):**
- `createVersionPollingInterval(data)` utility: returns `false` for COMPLETE/FAILED (stops polling), `~3000 ms` with 10% jitter for QUEUED/PROCESSING
- `useVersion` hook: `refetchInterval` uses the polling utility; `staleTime` 1 s active / 2 min terminal; intelligent retry (no retry on 4xx, up to 3 retries on 5xx)

**Version detail page** (`/dashboard/projects/[projectId]/versions/[versionId]`):
- Breadcrumbs: Projects › [Project name] › v[N]
- `VersionStatusBanner`: contextual state-machine banner — queued (grey), processing (blue + spinner), complete (green + checkmark), failed (red + domain error message from `errorDetail`)
- Input summary: all 27 `inputSnapshot` parameters displayed in a grid
- Results placeholder: "SVG preview and stats coming in Spike 5" (shown only when status = COMPLETE)
- "New run" button linking to new-version page

**Project detail page** (`/dashboard/projects/[projectId]`):
- Breadcrumbs: Projects › [Project name]
- Version list: version number, optional label, submission timestamp, `VersionStatusBadge`; newest first
- Empty state with link to new-version page
- "New run" button always visible

### Acceptance Criteria

- [x] `bun run lint && bun run typecheck && bun run test && bun run build` all pass
- [x] Version detail page shows correct status for QUEUED / PROCESSING / COMPLETE / FAILED
- [x] Live polling: status transitions QUEUED → PROCESSING → COMPLETE visible in browser without page refresh
- [x] FAILED version: error message derived from `layoutJob.errorDetail ?? energyJob.errorDetail ?? generic`
- [x] Results grid shows 9 layout metrics from `layoutJob.statsJson` when COMPLETE
- [x] Breadcrumbs correct: Projects › [Project name] › Run #N
- [x] Verified in local dev and production
- [ ] Input summary (27 inputSnapshot params) — deferred to Spike 5
- [x] Project detail page (versions list) — Spike 4e

### Implementation Plan

See `docs/superpowers/plans/2026-04-20-spike-4d-version-detail-polling.md`.

---

## Spike 4e — Pagination UI

**Status:** complete  
**Depends on:** Spike 4d

### What we built

URL-based pagination (`?page=N&pageSize=N`) on both the projects list and project detail pages. Page size persisted to `localStorage` (`"re_page_size"`) and synced into URL on first mount.

**Delivered:**
- `apps/web/hooks/use-versions.ts` — `useVersions(projectId, { page, pageSize })` TanStack Query hook
- `apps/web/components/pagination-controls.tsx` — `PaginationControls` component + `getPageNumbers` pure function; shadcn `Pagination` primitives; page size `Select`; `<Suspense>` self-wrapped
- `apps/web/app/(main)/dashboard/projects/[projectId]/page.tsx` — new project detail page with versions list (loading/error/empty/list states), "New run" button, breadcrumbs
- `apps/web/app/(main)/dashboard/projects/page.tsx` — modified to add `PaginationControls` and URL pagination

### Acceptance Criteria

- [x] `bun run lint && bun run typecheck && bun run test && bun run build` all pass
- [x] Projects list: pagination controls appear when totalPages > 1; page size selector always visible
- [x] Project detail: versions list with status badges; pagination footer
- [x] Page/pageSize reflected in URL; browser back/forward preserved
- [x] Page size persists across page loads via localStorage
- [x] Verified local, CI, and production (2026-04-20)

---

## Spike 5a — Stats Dashboard

**Status:** complete  
**Depends on:** Spike 4

### What we're building

Expand the version detail page `CompleteState` to show all layout stats and add an energy stats section. No API changes — all data already flows through `statsJson`.

**Key finding:** The layout engine produces aggregated totals only across all boundaries. Multi-boundary sites are transparent at the UI level (one set of totals, same code path as single-boundary).

### Layout stats (all fields from `layoutJob.statsJson`)

| Stat | Key | Unit |
|------|-----|------|
| Total capacity | `total_capacity_mwp` | MWp DC |
| Total modules | `total_modules` | count |
| Tables placed | `total_tables` | count |
| Total area | `total_area_acres` | acres |
| Row pitch | `row_pitch_m` | m |
| GCR achieved | `gcr_achieved` | ratio |
| String inverters | `num_string_inverters` | count |
| ICRs | `num_icrs` | count |
| Lightning arresters | `num_las` | count |
| DC cable length | `total_dc_cable_m` | m |
| AC cable length | `total_ac_cable_m` | m |

### Energy stats (from `energyJob.statsJson`)

Shown once `energyJob.status === "COMPLETE"`. Shown as a "pending" card section otherwise (energy job implemented in Spike 7).

| Stat | Key | Unit |
|------|-----|------|
| Irradiance source | `irradiance_source` | PVGIS / NASA POWER / manual |
| GHI | `ghi_kwh_m2_yr` | kWh/m²/yr |
| GTI (in-plane) | `gti_kwh_m2_yr` | kWh/m²/yr |
| Performance Ratio | `performance_ratio` | ratio |
| Specific yield | `specific_yield_kwh_kwp_yr` | kWh/kWp/yr |
| Year 1 energy | `year1_energy_mwh` | MWh |
| CUF | `cuf_pct` | % |
| 25-year lifetime energy | `lifetime_energy_mwh` | MWh |

### Acceptance Criteria

- [x] `bun run lint && bun run typecheck && bun run test && bun run build` all pass
- [x] All layout stat cards display correct values (verified against a real completed run)
- [x] Energy stats section shows "pending" state when energy job not yet complete
- [ ] Energy stats section populates correctly when `energyJob.statsJson` is present (pending Spike 7)

---

## Spike 5b — SVG Fetch + Render

**Status:** complete — verified local dev, CI/CD, and production 2026-04-20  
**Depends on:** Spike 5a (built concurrently with 5c; stats dashboard deferred)

### What we're building

Add a pre-signed SVG URL to the version detail API response and render the SVG inline in the browser on the version detail page.

**Key finding:** The layout engine produces ONE composite SVG (`layout.svg`) for all boundaries — multi-boundary is transparent. SVG uses `gid` attributes for group layers (`ac-cables`, `la-footprints`, `la-circles`, etc.) ready for Spike 5c toggles.

- API: add `svgPresignedUrl: string | null` to `VersionDetail` response (touches API → shared types → api-client → web)
- Fetch SVG text client-side, sanitize with DOMPurify, render inline inside a sized container
- No zoom/pan yet (Spike 5c) — static render, fit-to-container
- Shown only when `layoutJob.status === "COMPLETE"` and `svgPresignedUrl` is non-null

### Acceptance Criteria

- [x] `bun run lint && bun run typecheck && bun run test && bun run build` all pass
- [x] SVG renders correctly for a real completed run — verified local dev and production
- [x] SVG is not shown for runs that have no SVG artifact
- [x] Pre-signed URL is correctly generated server-side
- [x] Verified in CI/CD
- [x] Verified in production

---

## Spike 5c — Zoom/Pan + Layer Toggles

**Status:** complete — verified local dev, CI/CD, and production 2026-04-20  
**Depends on:** Spike 5b

### What we're building

Add interactivity to the static SVG preview from Spike 5b: zoom/pan and layer toggle controls.

- Zoom/pan: evaluate `react-zoom-pan-pinch` vs `panzoom` at spike time; wrap SVG container
- Layer toggles (toggle buttons, off by default):
  - **AC Cables** — toggles `<g gid="ac-cables">`
  - **Lightning Arresters** — toggles `<g gid="la-footprints">` and `<g gid="la-circles">`
- Toggle implementation: set `display: none` / `display: ''` on SVG group elements via `querySelector` — no server round-trip, no re-fetch

### What we built

- `react-zoom-pan-pinch` v4 (`TransformWrapper` + `TransformComponent`) wrapping the SVG
- Reset Zoom button (toolbar, top-right of preview container)
- Rotate button with animated icon — 0° → 90° → 180° → 270° → 0° cycle; container aspect ratio swaps at 90°/270°
- Layer toggle switches below the preview (DC Cables added in addition to spec; AC Cables off by default):
  - **AC Cables** — toggles `#ac-cables`
  - **DC Cables** — toggles `#dc-cables`
  - **Lightning Arresters** — toggles `#la-footprints` and `#la-circles`
- DOM manipulation via `useRef` + `useEffect`; no re-fetch on toggle

### Acceptance Criteria

- [x] `bun run lint && bun run typecheck && bun run test && bun run build` all pass
- [x] Zoom/pan works smoothly on a real layout SVG — verified local dev and production
- [x] Reset Zoom button snaps back to default — verified local dev and production
- [x] Rotate button cycles 0 → 90 → 180 → 270 → 0 — verified local dev and production
- [x] AC Cables toggle shows/hides correct SVG group — verified local dev and production
- [x] DC Cables toggle shows/hides correct SVG group — verified local dev and production
- [x] Lightning Arresters toggle shows/hides both `#la-footprints` and `#la-circles` — verified local dev and production
- [x] Toggles default to off (layers hidden on load) — verified local dev and production
- [x] Verified in CI/CD
- [x] Verified in production

---

## Spike 6 — KMZ Download

**Status:** planned  
**Depends on:** Spike 5b

### What we're building

One-click download of the KMZ artifact from the version detail page.

### Implementation

- `GET /versions/:versionId` already returns a pre-signed S3 URL for the KMZ artifact
- Add "Download KMZ" button to version detail page, enabled when layout job is complete
- Button uses pre-signed URL — browser handles the download directly from S3

### Acceptance Criteria

- [ ] "Download KMZ" button appears on completed version detail page
- [ ] Downloaded `.kmz` file opens correctly in Google Earth
- [ ] All expected layers visible in Google Earth: boundary, exclusions, tables, ICRs, inverters, LAs, summary placemark
- [ ] Multi-boundary KMZ shows Overall Summary folder

---

## Spike 7 — Energy Job

**Status:** planned  
**Depends on:** Spike 3f (Lambda pipeline in prod)

### What we're building

The energy calculation job: irradiance fetch (PVGIS with fallback to NASA POWER), 25-year energy model, and PDF report generation. This runs as a separate job after the layout job completes.

### Energy Handler (`handle_energy` in `handlers.py`)

Input payload:
```json
{
  "versionId": "...",
  "siteLatitude": 23.5,
  "siteLongitude": 72.3,
  "tiltDeg": 18.5,
  "capacityKwp": 52400,
  "energyParameters": { ...all 14 energy params... },
  "layoutStats": { ...from layout job... }
}
```

Processing:
1. Updates EnergyJob in DB: QUEUED → PROCESSING
2. Fetch irradiance from PVGIS (primary): `ghi`, `gti`
3. On PVGIS failure: fallback to NASA POWER with Hay-Davies tilt correction
4. Compute PR from all loss parameters
5. Compute 25-year energy model (Year 1 with LID, Years 2–25 with annual degradation)
6. Render PDF (3 pages via `core/pdf_exporter.py`):
   - Page 1: layout drawing (SVG → matplotlib figure)
   - Page 2: summary stats table
   - Page 3: energy yield report
7. Upload PDF to S3
8. Updates EnergyJob in DB: PROCESSING → COMPLETE (pdf S3 key + statsJson + irradiance source)
9. Updates Version in DB: COMPLETE (both layout and energy jobs done)
Returns: None. All state written directly to DB. On any error: EnergyJob = FAILED, errorDetail set.

### PVGIS Fallback Logic

```
Try PVGIS (3 attempts, 10s timeout each)
  → Success: use PVGIS GTI + GHI
  → All attempts fail:
    Try NASA POWER (3 attempts, 10s timeout each)
      → Success: use NASA POWER GHI, apply Hay-Davies tilt model for GTI
      → All attempts fail: EnergyJob status = FAILED, error = "irradiance fetch failed"
```

### Acceptance Criteria

- [ ] Energy job runs after layout job completes (both local and prod)
- [ ] PVGIS fetch works for an Indian site; GTI and GHI values are plausible
- [ ] NASA POWER fallback triggers correctly when PVGIS is unreachable (test with mocked failure)
- [ ] PDF has all three pages with correct content
- [ ] PDF appears in S3 under correct key
- [ ] EnergyJob DB record updated with status, pdf key, stats, irradiance source
- [ ] Energy stats appear in stats dashboard (Spike 5) once job completes

---

## Spike 8 — PDF Download

**Status:** planned  
**Depends on:** Spike 7

### What we're building

One-click download of the PDF report from the version detail page.

### Acceptance Criteria

- [ ] "Download PDF" button appears on version detail page once energy job is complete
- [ ] Downloaded PDF has correct content on all three pages
- [ ] Page 1: layout drawing matches SVG preview (same elements, LA protection circles hidden, LA rectangles shown)
- [ ] Page 2: summary stats match the stats dashboard values exactly
- [ ] Page 3: energy yield report with correct 25-year table

---

## Spike 9 — DXF Download

**Status:** planned  
**Depends on:** Spike 8

### What we're building

One-click download of the DXF artifact from the version detail page.

### DXF Verification Checklist (for engineer to confirm)

The DXF must contain the following named layers with correct geometry:

| Layer | Colour | Contents |
|-------|--------|----------|
| `BOUNDARY` | Yellow | Site boundary polygon |
| `OBSTACLES` | Red | Exclusion zone polygons |
| `TABLES` | Blue | All placed table rectangles |
| `ICR` | Cyan | ICR building rectangles + annotations |
| `OBSTRUCTIONS` | Green | User-drawn obstructions (if any) |
| `INVERTERS` | Lime | String inverter rectangles + annotations |
| `DC_CABLES` | Orange | DC cable routes (table → inverter) |
| `AC_CABLES` | Magenta | AC cable routes (inverter → ICR, deduplicated) |
| `LA` | Dark red | LA rectangles + protection circles |
| `ANNOTATIONS` | White | Labels and text |

All coordinates in UTM metres (no WGS84 in DXF).

### Acceptance Criteria

- [ ] "Download DXF" button appears on version detail page once layout job is complete
- [ ] Engineer opens DXF in their CAD tool and confirms all layers are present and geometrically correct
- [ ] Coordinates are in UTM metres
- [ ] DXF version is R2010 (as per Python app)

---

## Spike 10 — Error Handling and Retry UX

**Status:** planned  
**Depends on:** Spike 9

### What we're building

Graceful failure display and recovery for failed jobs. Users should always know what failed, why, and what they can do about it.

### Failure Scenarios and Handling

| Scenario | Detection | User Experience |
|----------|-----------|-----------------|
| Layout engine crash | LayoutJob status = FAILED | "Layout failed: {error detail}" — Re-run button |
| PVGIS + NASA POWER both down | EnergyJob status = FAILED | "Energy calculation failed: irradiance data unavailable. Try again later." — Re-run button |
| Lambda timeout (3 min) | SQS visibility timeout → DLQ | Version status = FAILED — same UX as above |
| KMZ parse error (invalid file) | Caught in handler, returned as error | "Invalid KMZ: {detail}" — shown immediately on submit |
| S3 write failure | Lambda error → DLQ | "Job failed: storage error" — Re-run button |

### Re-run Behaviour

"Re-run" on a failed version:
- Creates a new Version record (same parameters + same KMZ) — does not overwrite the failed version
- Failed version remains in history with its error state
- New version increments the version number

### SQS DLQ Configuration

- Max receive count: 3 (Lambda retried 3 times before going to DLQ)
- DLQ alarm: CloudWatch alarm if DLQ depth > 0 (operational visibility)
- Failed versions in DLQ: operator can inspect message, redrive or discard

### Acceptance Criteria

- [ ] Deliberately broken KMZ → error shown immediately on submit
- [ ] Deliberately crashed layout engine → version shows "Layout failed" with error detail
- [ ] PVGIS + NASA POWER mocked to fail → energy job shows correct failure message
- [ ] Re-run button creates new version, not overwrite
- [ ] Failed version remains in version history with error state visible
- [ ] DLQ receives messages after 3 Lambda failures (verified in prod)
- [ ] CloudWatch alarm fires when DLQ has messages

---

## Spike 11 — End-to-End Production Smoke Test

**Status:** planned  
**Depends on:** Spike 10

### What we're verifying

A complete end-to-end run in the production environment using a real site KMZ. All artifacts verified by the engineer who built the Python app.

### Test Protocol

1. **Sign in** to production platform
2. **Create project** with a real site name
3. **Submit version** with a known real KMZ and default parameters
4. **Watch status** — queued → processing layout → processing energy → complete
5. **Verify SVG preview** — boundary, tables, ICRs, inverters, LAs all render correctly
6. **Verify layout stats** — match known values from the Python app run on same KMZ
7. **Verify energy stats** — CUF and specific yield plausible for site location
8. **Download KMZ** — open in Google Earth, verify all layers
9. **Download PDF** — verify all three pages, values match stats dashboard
10. **Download DXF** — engineer opens in CAD tool, verifies all layers and geometry
11. **Submit second version** — change one parameter (e.g., row pitch), verify new version created, first version unaffected
12. **Confirm version history** — both versions listed, both accessible, both artifacts downloadable

### Acceptance Criteria

- [ ] All 12 test steps pass without errors
- [ ] Engineer signs off on KMZ, PDF, and DXF correctness
- [ ] Version history works correctly (two versions, both intact)
- [ ] No regressions on existing platform functionality (auth, dashboard, etc.)

---

## Decisions Log

Record decisions made during spike execution that affect future spikes.

| Date | Spike | Decision | Rationale |
|------|-------|----------|-----------|
| 2026-04-19 | 1 | Prisma semantic ID extension does not fire on nested `create: {}` calls. LayoutJob and EnergyJob must be created as separate top-level `db.layoutJob.create` / `db.energyJob.create` calls after the Version is created. Never use nested creates for models that require semantic IDs. | Discovered during runtime testing — nested creates bypass the extension middleware. |
| 2026-04-19 | 2 | Python engine owns all DB state after the initial QUEUED write. Hono API writes Version (QUEUED) + LayoutJob (QUEUED) on submit, fires the job (HTTP or SQS), and returns immediately. All subsequent status transitions (PROCESSING, COMPLETE, FAILED), artifact S3 keys, and statsJson are written by Python directly via psycopg2. Hono never polls or updates job status again. | Layout jobs are long-running. Hono cannot hold a connection open waiting for completion. Python is already the compute authority — it is the correct owner of compute state. |
| 2026-04-19 | 2 | Spike 2 decomposed into three sub-spikes (2a Scaffold, 2b Compute, 2c S3+DB). Spike 2b uses a local-path POST contract to isolate compute verification from S3/DB dependencies. That contract is replaced in Spike 2c with the production contract. | Each sub-spike must be independently testable by a human. Bundling scaffold + compute + S3 + DB into one spike makes failures harder to isolate and requires AWS credentials and a running DB just to test compute logic. |
| 2026-04-19 | 2 | Raw psycopg2 SQL must use Postgres table names (`layout_jobs`, `versions`), not Prisma model names (`LayoutJob`, `Version`). Prisma model names are PascalCase; Postgres tables are snake_case. Using model names results in `UndefinedTable` errors at runtime. | Discovered during Spike 2c runtime testing. All db_client.py SQL and corresponding test assertions must use snake_case table names. |
| 2026-04-19 | 3 | Spike 3 combines what was originally planned as two spikes (Spike 3 local HTTP wiring + Spike 4 SQS+Lambda staging). The staging environment is skipped entirely. Local dev uses HTTP; production uses SQS+Lambda. No "local Lambda" environment exists — Lambda is prod-only. Plan reduces from 12 to 11 spikes. | Following the Journium pattern: `USE_LOCAL_ENV=true` routes to HTTP server; `USE_LOCAL_ENV=false` routes to SQS. A separate "local Lambda" environment adds complexity with no benefit — the HTTP path is sufficient for local iteration and the prod path is verified directly in prod. |
| 2026-04-20 | 3f | Standardized S3 bucket env var to `S3_ARTIFACTS_BUCKET` across API and layout engine. Previously API used `S3_BUCKET_NAME`, layout engine used `S3_BUCKET`. | Inconsistency caused silent no-ops (API upload) and runtime crashes (Lambda KeyError). Single name across all services prevents env var confusion. |
| 2026-04-20 | 3f | Lambda DATABASE_URL must use `sslmode=require` not `sslmode=no-verify`. The `no-verify` value is a Prisma/Node.js convention; psycopg2 does not recognize it. | Discovered during prod E2E test — Lambda crashed with `OperationalError: invalid sslmode value: "no-verify"`. |
| 2026-04-20 | 3f | Vercel's `@vercel/node` builder auto-detects `.ts` files in `api/` and runs its own TypeScript compilation. Renamed `api/index.ts` → `api/index.js` to bypass this rogue check. | Vercel's TypeScript check uses Node.js-style module resolution which cannot traverse bun's `node_modules/.bun/` symlink structure, causing cascading type failures on AWS SDK and Prisma types. Our own `tsc --noEmit` validates types correctly. |
| 2026-04-20 | 3f | `place_string_inverters` has pathological performance on Lambda ARM64 — 30s local vs >600s on Lambda for 740 tables. Requires dedicated investigation spike (3g). | The full pipeline (API → S3 → SQS → Lambda → DB) is functionally correct. The bottleneck is in AC cable routing (inverter → ICR) Shapely geometry operations. See `docs/initiatives/spike-3g-lambda-perf-investigation.md`. |
| 2026-04-20 | 3f | Lambda memory bumped to 1769MB (1 full vCPU), timeout to 600s, SQS visibility timeout to 1200s. | 512MB (~1/3 vCPU) was insufficient. Even at 1769MB the performance issue persists, confirming it's algorithmic not resource-bound. |
| 2026-04-20 | 3g | AC cable routing search space capped: A2/A3 nearest 8 cols, A4 nearest 5×5 cols, B nearest 8×8 gaps, E max 15 waypoints. Result: 563s → 16s for `place_string_inverters` (34x), total 572s → 25s (23x). AC cable length +0.95%, all other stats identical. | Root cause was 5.7M `_path_ok` calls for 74 cables. Unbounded nested loops in A4 (G×C²) and E (W²) caused combinatorial explosion. Fix prunes search to nearest candidates — cables route through nearby columns, not distant ones. Same algorithm used in desktop app; the engineer's code had the same unbounded search but M2/M3 brute-forced through it. |
| 2026-04-20 | 3g | SQS queue needs DLQ configuration. Failed Lambda invocations leave messages in 1200s visibility timeout, blocking new messages. Discovered when stale `ver_AxKI8NoIRCU6yblHPuSzPM69rvC0BQtbN7F3` (deleted DB record) cycled indefinitely. Workaround: manual `aws sqs send-message`. Fix: add DLQ with `maxReceiveCount: 3` in Spike 10. | No DLQ configured yet. Failed messages retry until retention period (4 days) expires. |
| 2026-04-20 | 3g | Decisions log note: `_route_ac_cable` pattern logging in investigation doc incorrectly identified DC cable routing as the bottleneck. Actual bottleneck was AC cable routing (inverter → ICR, 74 cables). DC routing (table → inverter, 740 cables) was instant because `usable_polygon` was None for DC. Corrected in investigation doc. | Important for future debugging — the `poly_verts=0` log was misleading due to a try/except swallowing the error on non-simple polygon types. |
| 2026-04-20 | 4 | Spike 4 decomposed into 5 sub-spikes: 4a (API data layer), 4b (projects list + create), 4c (version form), 4d (version detail + polling), 4e (pagination UI). Sub-spike 4a contains all API and api-client changes; subsequent sub-spikes are UI-only and can be reviewed independently. | Following the Spike 2/3 pattern: each sub-spike produces independently testable, human-verifiable software. Bundling API changes with UI changes makes failures harder to isolate. |
| 2026-04-20 | 4 | `PaginatedResponse<T>` already defined in `packages/shared/src/types/api.ts` with `{ items: T[], total, page, pageSize, totalPages }`. This is the canonical shape for all paginated API responses. API returns pagination from day one; pagination UI (4e) is deferred. | Retrofitting pagination later would require a breaking API change. The backend cost is negligible; the UI can show page 1 until 4e is implemented. |
| 2026-04-20 | 4 | Version submission form uses a sticky left-nav section-jump pattern (desktop) and horizontal chip nav (tablet/mobile) rather than accordion or tabs. | Solar engineers submit forms with ~27 fields spanning 5 logical sections. Section-jump nav lets them orient quickly, skip to the section they want to override, and keeps the submit button always visible without scrolling. Accordion/tabs hide content and require extra clicks. This pattern is standard in modern multi-section forms (Stripe, Notion). |
| 2026-04-20 | 4 | `irradiance_source` is excluded from `LayoutInputSnapshot` / the version form. It is set by the energy engine (Spike 7) based on which irradiance source (PVGIS / NASA POWER / manual) was actually used, and stored on `EnergyJob.irradianceSource`. Users do not choose the irradiance source — the engine chooses automatically with fallback logic. | Including it in the form would give the user false control: they cannot force PVGIS if it is down, and the fallback sequence is an engine implementation detail. If manual override is needed in future, it can be added as an explicit feature. |
| 2026-04-20 | 4 | `LayoutInputSnapshot` field names use Python `energy_calculator.py` `EnergyParameters` dataclass field names exactly (e.g. `inverter_eff_pct`, `dc_loss_pct`). All 27 input keys are typed fields on the interface, not `Record<string, unknown>`. | Typed snapshot catches mistakes at compile time. Using Python field names exactly means the Lambda function can deserialize `inputSnapshot` directly with zero key mapping. Consistency across the stack removes a class of bugs. |
| 2026-04-20 | 4c | `BreadcrumbSeparator` is a `<li>` element (shadcn). Placing it inside `<BreadcrumbItem>` (also `<li>`) causes a `<li>` in `<li>` hydration error. Fix: render separator as a sibling of `BreadcrumbItem` using `React.Fragment`, not as a child. | shadcn's breadcrumb component follows WAI-ARIA where separator and item are both `<li>` siblings inside `<ol>`. Nesting them breaks HTML validity and triggers React hydration mismatches. |
| 2026-04-20 | 4c | `zod@4.x` + `@hookform/resolvers@5.x` type-compatibility: `zodResolver(schema as any)` cast required. Runtime works correctly; TypeScript objects due to minor version mismatch in internal zod/v4/core types. | Cast is the minimal fix. Will resolve when hookform/resolvers ships a compatible type update. |
| 2026-04-20 | 4a | `LayoutInputSnapshot` initial draft used descriptive TypeScript names (e.g. `module_long`, `tilt_deg`, `road_width_m`) that did not match the Python Lambda's `_params_from_dict` keys. 16 of 27 fields were wrong — would have caused silent default fallbacks in production. Corrected to exact Python names: `module_length`, `tilt_angle`, `perimeter_road_width`, etc. | Cross-verified against `apps/layout-engine/src/handlers.py` `_params_from_dict` and `/Users/arunkpatra/codebase/PVlayout_Advance/models/project.py` `EnergyParameters`. Field names must be verified against Python source, not inferred. |
| 2026-04-20 | 4a | `paginationArgs` extended to return `{ skip, take, page, pageSize }` so callers use the normalised values directly. Service functions must destructure all four values — never re-derive `page` or `pageSize` inline after calling `paginationArgs`. | Duplicate inline clamping would diverge from `paginationArgs` if defaults ever change. Single source of truth prevents silent pagination bugs. |
| 2026-04-20 | 4b | `/dashboard` is the cockpit (stats, quick navigation), not a redirect to `/dashboard/projects`. The original 4b plan specified a server-side redirect, but the product intent is for `/dashboard` to be the top-level overview — a command centre the user lands on after login — with `/dashboard/projects` as one section within the app. The cockpit page will be built out with real stats and navigation in a future spike. | Raised during spike 4b local verification. A redirect wastes the route and gives the user no landing context. The cockpit pattern is standard in B2B SaaS (Stripe, Vercel, Linear all have a top-level overview distinct from sub-section lists). |
| 2026-04-20 | 4b | `NavUser` sidebar footer uses `!isLoaded \|\| !user` guard to show a skeleton rather than the "User" fallback. Clerk's `useUser()` returns `user: null` on both initial client hydration and during sign-out. Without the guard, the fallback text flashes on every page load and every sign-out. | Discovered during spike 4b local and production verification. The fix follows Clerk's recommended `isLoaded` check pattern. |
| 2026-04-20 | 4b | `SidebarMenuSkeleton` (shadcn) uses `Math.random()` inside its `useState` initializer to randomise the skeleton width. This runs on the server and again on the client during hydration, producing different values and a React hydration mismatch. Fix: the `mounted` guard must live inside the component that renders `SidebarMenuSkeleton` (`NavProjects`), not in a parent prop. When `mounted=false` (SSR and before first client paint), the skeleton branch is skipped entirely — server HTML never contains a `SidebarMenuSkeleton`. | Any shadcn component that uses `Math.random()` or `Date.now()` in a `useState` initializer will cause hydration mismatch if rendered during SSR. The guard must be co-located with the render site, not hoisted to a parent. |
| 2026-04-20 | 4 | Version detail polling follows ADR-003: `refetchInterval` is a function receiving `query.state.data`; returns `false` at terminal state (COMPLETE/FAILED), `~3000 ms` (with 10% jitter) otherwise. `staleTime` 1 s active / 2 min terminal. No retry on 4xx; up to 3 retries on 5xx. | ADR-003 establishes the project polling standard. Consistent with how Journium handles long-running process polling. Jitter prevents thundering herd from multiple browser tabs. |
| 2026-04-20 | 4d | `getVersionRefetchInterval` extracted as a pure exported function in `use-version.ts`. The polling callback itself cannot be unit-tested without timer mocks, but the interval logic can be tested directly as a function. All 5 status/undefined cases are covered by unit tests. | TanStack Query v5's `refetchInterval` callback form cannot be invoked directly in tests without mocking the query infrastructure. Extracting the logic as a pure function keeps tests simple and fast. |
| 2026-04-20 | 4d | Elapsed timer base for PROCESSING state uses `layoutJob?.startedAt ?? version.createdAt`, not `version.createdAt` alone. QUEUED state uses `version.createdAt`. | If PROCESSING used `createdAt`, the elapsed time would include queue wait time (potentially minutes in production via SQS). Users expect "time processing" not "time since submission". `startedAt` is set by the Lambda at the top of its handler; `createdAt` is the fallback if the job was never started. |
| 2026-04-20 | 4d | `VersionDetail` component calls `useVersion` internally; the page also calls `useVersion` for breadcrumbs. Two hook calls for the same `(projectId, versionId)` pair are accepted as a v1 tradeoff — TanStack Query deduplicates to a single network request via the shared query cache. | Prop-drilling `version` from the page down to `VersionDetail` would complicate the component interface and require nullable handling at call sites. The double hook call is idiomatic TanStack Query usage. Revisit if the query key changes or caching behaviour causes issues. |
| 2026-04-20 | 4d | `layoutJob.statsJson` is typed as `unknown` in `@renewable-energy/shared`. A local `LayoutStats` interface is defined in `version-detail.tsx` and used to cast the value after a runtime null check. The shared type is NOT changed to a specific type. | `statsJson` stores the Python Lambda's raw JSON output. The shape may evolve independently of the TypeScript type system; `unknown` at the shared boundary is correct. The local cast is contained and validated at runtime (null check + as cast). Changing the shared type would couple the frontend type to the Lambda output format prematurely. |
| 2026-04-20 | 4d | Input summary (all 27 `inputSnapshot` parameters) deferred from 4d to Spike 5. | Layout results are the user's primary concern immediately after job completion. The input recap is secondary — users remember what they submitted. Deferring keeps the version detail page focused and unblocks Spike 4e. Input summary can be added as a collapsible section in Spike 5 alongside the SVG preview. |
| 2026-04-20 | 5b/5c | Spikes 5b and 5c were built together before Spike 5a (Stats Dashboard). The SVG preview + interactivity were higher priority than the expanded stats grid — the version detail page already shows 9 metrics from 4d. Spike 5a will expand the stats grid in a later pass. | Deferred stats expansion keeps the user facing a working SVG preview faster. No blocking dependency in practice — the SVG section mounts above the existing stats grid with no conflict. |
| 2026-04-20 | 5c | `react-zoom-pan-pinch` v4 `TransformComponent` wrapper div has a CSS module class (`react-transform-wrapper`) that sets `width` and `height` to zero. Applying `position: absolute; inset: 0` (all four computed offsets = 0px) alone is insufficient — the CSS module's `width`/`height` rules win. Fix: explicitly pass `width: "100%", height: "100%"` in `wrapperStyle` to override. | Discovered during local dev testing — SVG was in the DOM (DOMPurify working, `data-testid="svg-wrapper"` present) but invisible. `getBoundingClientRect` showed all elements at 0×0 despite `inset: 0` being applied. CSS module rule priority, not layout collapse. |
| 2026-04-20 | 5c | `ReactZoomPanPinchContentRef` is the correct ref type for `TransformWrapper` in `react-zoom-pan-pinch` v4 (not `ReactZoomPanPinchRef`). The content ref exposes `resetTransform()`. | TypeScript compilation fails with `ReactZoomPanPinchRef` — the type no longer matches the v4 export. Always check the library's v4 export types rather than inferring from v3 docs. |
| 2026-04-20 | 5c | DC Cables layer toggle added to 5c scope. Spec listed only AC Cables and Lightning Arresters, but `#dc-cables` group exists in the SVG and the toggle is trivial to add. Three toggles (AC, DC, LA) are consistent with the SVG layer structure. | Symmetric with the SVG groups that the layout engine emits. Omitting DC Cables would be a confusing gap in the layer panel. No additional complexity. |
