# PV Layout Engine — Spike Plan

**Initiative:** PV Layout Engine — Cloud Platform Port  
**Foundational document:** [pv-layout-cloud.md](./pv-layout-cloud.md)  
**Status:** Planning  
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
3. Verification covers every applicable environment — local dev, staging, and production — not just one
4. No criterion is marked complete on Claude's assertion alone — "it should work" is not done

Agent-assisted runtime testing (human leads, Claude assists) is the standard. There is no shortcut.

---

## Architecture Pattern Reference

Derived from the journium monorepo (`/Users/arunkpatra/codebase/journium/journium`). All spikes follow this pattern:

**Local development:**
```
apps/web → apps/api (Hono) → HTTP → apps/layout-engine (uv run python src/server.py)
                                           ↓
                                     Real S3 bucket (artifacts)
                                           ↓
                                     PostgreSQL (status + URLs)
```

**Staging / Production:**
```
apps/web → apps/api (Hono) → SQS → Lambda (apps/layout-engine Docker image from ECR)
                                           ↓
                                     Real S3 bucket (artifacts)
                                           ↓
                                     PostgreSQL (status + URLs)
```

**Key principles:**
- `apps/layout-engine/src/handlers.py` — shared business logic, runs identically in both modes
- `apps/layout-engine/src/lambda_handler.py` — Lambda transport (added in Spike 4, not Spike 2)
- `apps/layout-engine/src/server.py` — local HTTP transport (HTTPServer ↔ handler); run with `uv run python src/server.py`, no Docker needed in local dev
- `USE_LOCAL_ENV=true` → Hono API calls layout engine via HTTP directly (no SQS)
- `USE_LOCAL_ENV=false` → Hono API enqueues to SQS; Lambda runs the engine
- Real S3 buckets in all environments (local, staging, prod). No LocalStack.
- `uv` for Python dependency management (not pip). `pyproject.toml` + `uv.lock`.

---

## Spike Overview

| # | Spike | Status | Depends On |
|---|-------|--------|------------|
| 1 | [Data Model](#spike-1--data-model) | complete | — |
| 2a | [apps/layout-engine Scaffold](#spike-2a--appslayout-engine-scaffold) | planned | Spike 1 |
| 2b | [Layout Compute (local)](#spike-2b--layout-compute-local) | planned | Spike 2a |
| 2c | [S3 + DB Integration](#spike-2c--s3--db-integration) | planned | Spike 2b |
| 3 | [Job Pipeline: Local Mode](#spike-3--job-pipeline-local-mode) | planned | Spike 2c |
| 4 | [Job Pipeline: SQS + Lambda (Staging)](#spike-4--job-pipeline-sqs--lambda-staging) | planned | Spike 3 |
| 5 | [Project and Version UI](#spike-5--project-and-version-ui) | planned | Spike 3 |
| 6 | [SVG Preview + Stats Dashboard](#spike-6--svg-preview--stats-dashboard) | planned | Spike 5 |
| 7 | [KMZ Download](#spike-7--kmz-download) | planned | Spike 6 |
| 8 | [Energy Job](#spike-8--energy-job) | planned | Spike 4 |
| 9 | [PDF Download](#spike-9--pdf-download) | planned | Spike 8 |
| 10 | [DXF Download](#spike-10--dxf-download) | planned | Spike 9 |
| 11 | [Error Handling and Retry UX](#spike-11--error-handling-and-retry-ux) | planned | Spike 10 |
| 12 | [End-to-End Production Smoke Test](#spike-12--end-to-end-production-smoke-test) | planned | Spike 11 |

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
6. Job dispatch (HTTP or SQS) happens after response returns (Spike 3/4)

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

**Status:** planned  
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

Run directly in local dev: `uv run python src/server.py`

### Acceptance Criteria

- [ ] `uv sync` runs cleanly — no dependency resolution errors
- [ ] `GET /health` returns `{ "status": "ok" }` — human verifies with curl
- [ ] `uv run python src/server.py` starts with no errors — human confirms in terminal
- [ ] `ruff check src/` passes with zero violations
- [ ] All monorepo static gates pass: `bun run lint && bun run typecheck && bun run test && bun run build`

---

## Spike 2b — Layout Compute (local)

**Status:** planned  
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

**Status:** planned  
**Depends on:** Spike 2b

### What we're building

Replace the local-path testing contract with the real production contract: `handle_layout` downloads the input KMZ from S3, runs the pipeline, uploads artifacts to S3, and updates the DB directly (LayoutJob + Version status transitions). The Hono API never touches DB job status after the initial QUEUED write — Python owns all subsequent state.

### New Files

```
apps/layout-engine/
  src/
    s3_client.py    ← NEW: S3 download (input KMZ) + upload (layout.kmz, layout.svg, layout.dxf)
    db_client.py    ← NEW: raw psycopg2 SQL — LayoutJob and Version status transitions
```

### db_client.py

Raw psycopg2-binary — no ORM. Two responsibilities:
1. Update `LayoutJob` status: `QUEUED → PROCESSING` on start; `PROCESSING → COMPLETE` (with artifact S3 keys + statsJson) or `PROCESSING → FAILED` (with errorDetail) on finish.
2. Update `Version` status: set to `PROCESSING` when layout starts; set to `COMPLETE` or `FAILED` when layout finishes.

```python
def mark_layout_processing(version_id: str) -> None: ...
def mark_layout_complete(version_id: str, kmz_key: str, svg_key: str, dxf_key: str, stats: dict) -> None: ...
def mark_layout_failed(version_id: str, error: str) -> None: ...
```

### handlers.py — Spike 2c Version (production contract)

```python
def handle_layout(payload: dict) -> None:
    """
    Production contract (replaces Spike 2b version):
      kmz_s3_key: str          -- S3 key of input KMZ (uploaded by Hono on version submit)
      version_id: str          -- used to derive output S3 keys + DB record lookup
      parameters: dict         -- all layout + module + table + inverter params

    Returns: None
    Side effects:
      - Downloads input KMZ from S3
      - Runs full pipeline
      - Uploads layout.kmz, layout.svg, layout.dxf to S3
      - Updates LayoutJob in DB (COMPLETE + artifact keys + statsJson)
      - Updates Version in DB (COMPLETE or FAILED)
    Raises: exception on fatal error (caller updates DB to FAILED)
    """
```

### server.py — Spike 2c (production contract)

```
POST /layout → accepts JSON:
  {
    "kmz_s3_key": "projects/{projectId}/versions/{versionId}/input.kmz",
    "version_id": "ver_...",
    "parameters": { ...all layout params... }
  }
  → returns 202 Accepted immediately
  → runs handle_layout in background thread
  → handle_layout updates DB directly on completion or failure
```

The server returns 202 before compute begins. The caller (Hono API in Spike 3) fires and forgets.

### S3 Key Conventions

```
projects/{projectId}/versions/{versionId}/input.kmz      ← uploaded by Hono on version submit
projects/{projectId}/versions/{versionId}/layout.kmz     ← written by layout engine
projects/{projectId}/versions/{versionId}/layout.svg     ← written by layout engine
projects/{projectId}/versions/{versionId}/layout.dxf     ← written by layout engine
projects/{projectId}/versions/{versionId}/report.pdf     ← written by energy engine (Spike 8)
```

### Environment Variables (layout-engine)

```bash
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=renewable-energy-local-artifacts   # same bucket Hono uses for input KMZ
DATABASE_URL=postgresql://renewable:renewable@localhost:5432/renewable_energy
```

### Acceptance Criteria

- [ ] `POST /layout` with real `{kmz_s3_key, version_id, parameters}` → returns 202 immediately (human verifies with curl, no waiting)
- [ ] KMZ + SVG + DXF appear in S3 under correct keys (human verifies in AWS console or aws CLI)
- [ ] LayoutJob DB record transitions: `QUEUED → PROCESSING → COMPLETE` — human verifies with `bun run db:studio`
- [ ] Version DB record transitions: `QUEUED → PROCESSING → COMPLETE`
- [ ] `statsJson` populated correctly in LayoutJob record — human checks a sample stat value
- [ ] DXF artifact opens correctly in a DXF viewer
- [ ] Deliberate failure (invalid KMZ): LayoutJob status = `FAILED`, `errorDetail` populated
- [ ] All monorepo static gates pass

---

## Spike 3 — Job Pipeline: Local Mode

**Status:** planned  
**Depends on:** Spike 2c

### What we're building

Wire the Hono API to call the layout engine via HTTP in local development. No SQS. No Lambda. Hono fires and forgets — it does not wait for the result and it does not update DB job status. The Python engine owns all DB state after the initial QUEUED write.

### Local Architecture

```
POST /projects/:id/versions (Hono)
  → Upload KMZ to S3
  → Write Version (status: QUEUED) to DB
  → Write LayoutJob (status: QUEUED) to DB
  → Return { versionId, status: "queued" } to client immediately
  → [background, fire-and-forget] POST http://localhost:5000/layout
       { kmz_s3_key, version_id, parameters }
       → 202 Accepted (Hono ignores body, does not await completion)

Layout engine (background, runs independently):
  → Updates LayoutJob: QUEUED → PROCESSING in DB
  → Downloads KMZ from S3
  → Runs full layout pipeline
  → Uploads KMZ + SVG + DXF to S3
  → Updates LayoutJob: PROCESSING → COMPLETE (artifact keys + statsJson) in DB
  → Updates Version: COMPLETE in DB
  → On any error: LayoutJob = FAILED, Version = FAILED, errorDetail written to DB

UI polls GET /projects/:id/versions/:versionId
  → Reads status from DB → shows transitions as they happen

Note: Energy job local wiring (http://localhost:5000/energy) is added in Spike 8
when handle_energy and POST /energy exist.
```

### Environment Variables (Local — Hono API)

```bash
USE_LOCAL_ENV=true
LAYOUT_ENGINE_URL=http://localhost:5000
S3_BUCKET_NAME=renewable-energy-local-artifacts
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...       # real AWS credentials for S3
AWS_SECRET_ACCESS_KEY=...
```

### Local dev startup

In local dev, the layout engine is started directly (no Docker):
```bash
cd apps/layout-engine
uv run python src/server.py
```
The Hono API calls it at `LAYOUT_ENGINE_URL` (default `http://localhost:5000`).

### Hono API Changes

- `modules/layout/layout.service.ts` — `dispatchLayoutJob(versionId, kmzS3Key, parameters)`:
  - If `USE_LOCAL_ENV=true`: POST `LAYOUT_ENGINE_URL/layout` with `{ kmz_s3_key, version_id, parameters }`, fire-and-forget (do not await, do not handle response body)
  - If `USE_LOCAL_ENV=false`: send `{ versionId }` to SQS layout-jobs queue (Spike 4)
- Hono never updates LayoutJob or Version status after the initial QUEUED write — Python owns all subsequent DB state

### Acceptance Criteria

- [ ] `POST /versions` returns immediately with `{ versionId, status: "queued" }` — Hono does not block
- [ ] DB transitions observed: `QUEUED → PROCESSING → COMPLETE` on LayoutJob and Version — human verifies in Prisma Studio as job runs
- [ ] All three artifacts (KMZ, SVG, DXF) appear in S3 under correct keys — human verifies in AWS console
- [ ] `GET /versions/:versionId` returns artifact pre-signed URLs and layout stats once complete
- [ ] Full layout pipeline verified with a real KMZ file end-to-end (human confirmed in browser)

---

## Spike 4 — Job Pipeline: SQS + Lambda (Staging)

**Status:** planned  
**Depends on:** Spike 3

### What we're building

Replace the local HTTP dispatch with SQS + Lambda for staging and production environments. The layout engine Docker image is pushed to ECR and runs as a Lambda function triggered by SQS.

### New files added to `apps/layout-engine` in this spike

These were deliberately deferred from Spike 2 — they cannot be runtime-tested until Lambda is available:

```
apps/layout-engine/
  src/
    lambda_handler.py   ← NEW: Lambda transport (SQS event → handle_layout)
  Dockerfile            ← NEW: Lambda image (multi-stage, ECR target)
  .dockerignore         ← NEW
  scripts/
    push-to-ecr.sh      ← NEW: ECR push helper
```

**`lambda_handler.py`:**
```python
def lambda_handler(event, context):
    # Parse versionId from SQS event.Records[0].body
    # Fetch Version + inputSnapshot from DB (to get kmzS3Key + parameters)
    # Call handle_layout({ kmz_s3_key, version_id, parameters })
    #   → handle_layout owns: S3 download, compute, S3 upload, all DB updates
    # Enqueue { versionId } to energy-jobs SQS queue
```

**`Dockerfile` (Lambda, multi-stage):**
```dockerfile
# Build stage
FROM public.ecr.aws/lambda/python:3.13 AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR ${LAMBDA_TASK_ROOT}
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --no-install-project

# Runtime stage
FROM public.ecr.aws/lambda/python:3.13
COPY --from=build ${LAMBDA_TASK_ROOT}/.venv/lib/python3.13/site-packages/ ./
COPY src/ ./
CMD ["lambda_handler.lambda_handler"]
```

### AWS Resources to Provision

| Resource | Name | Config |
|----------|------|--------|
| S3 Bucket | `renewable-energy-staging-artifacts` | Private, versioned |
| ECR Repository | `renewable-energy/layout-engine` | For Docker image |
| SQS Queue | `renewable-energy-staging-layout-jobs` | Standard queue, visibility timeout 5 min |
| SQS Queue | `renewable-energy-staging-energy-jobs` | Standard queue, visibility timeout 5 min |
| SQS DLQ | `renewable-energy-staging-layout-jobs-dlq` | Max receive count: 3 |
| SQS DLQ | `renewable-energy-staging-energy-jobs-dlq` | Max receive count: 3 |
| Lambda | `renewable-energy-staging-layout-engine` | Container image, 3GB memory, 10 min timeout |

### SQS Message Format

```json
{ "versionId": "clx..." }
```

The Lambda fetches all input data from DB + S3 using `versionId`. SQS message carries only the ID — no payload duplication.

### Lambda Flow

```
SQS event → lambda_handler(event, context)
  → parse versionId from event.Records[0].body
  → fetch Version + inputSnapshot from DB (to get kmzS3Key + parameters)
  → call handle_layout({ kmz_s3_key: version.kmzS3Key, version_id, parameters: inputSnapshot })
       ↳ handle_layout internally:
            → updates LayoutJob: QUEUED → PROCESSING in DB
            → downloads KMZ from S3
            → runs full pipeline
            → uploads KMZ + SVG + DXF to S3
            → updates LayoutJob: PROCESSING → COMPLETE (artifact keys + statsJson) in DB
            → updates Version: still PROCESSING (energy job not yet run) in DB
            → on error: LayoutJob = FAILED, Version = FAILED in DB
  → enqueue { versionId } to energy-jobs SQS queue
```

### Hono API Changes

`dispatchLayoutJob(versionId)` when `USE_LOCAL_ENV=false`:
- Send `{ versionId }` to `AWS_SQS_LAYOUT_JOBS_QUEUE_URL`
- Return immediately — Lambda handles the rest

### Staging Environment Variables (API)

```bash
USE_LOCAL_ENV=false
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SQS_LAYOUT_JOBS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/.../...
AWS_SQS_ENERGY_JOBS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/.../...
S3_BUCKET_NAME=renewable-energy-staging-artifacts
```

### ECR Push Script

Add to `apps/layout-engine/scripts/push-to-ecr.sh`:
```bash
#!/bin/bash
# Usage: ./push-to-ecr.sh <staging|prod>
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-south-1
REPO=renewable-energy/layout-engine
TAG=${1:-staging}
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
docker build -t $REPO:$TAG -f apps/layout-engine/Dockerfile .
docker tag $REPO:$TAG $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO:$TAG
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO:$TAG
```

### Acceptance Criteria

- [ ] All AWS resources provisioned and accessible
- [ ] Docker image builds and pushes to ECR successfully
- [ ] Submit version in staging → SQS message enqueued → Lambda invoked → artifacts in S3 → DB updated
- [ ] DLQ receives messages after 3 failed Lambda attempts
- [ ] Energy job runs via second SQS queue after layout completes
- [ ] Version status transitions correctly in staging DB

---

## Spike 5 — Project and Version UI

**Status:** planned  
**Depends on:** Spike 3 (local pipeline works end-to-end)

### What we're building

The full user-facing UI for creating projects, submitting versions, and tracking job status. This is the first time a user can use the feature through the browser.

### Pages and Components

**Projects list** (`/dashboard/projects`):
- List of user's projects: name, created date, version count, latest version status
- "New project" button → create project modal

**Create project flow:**
1. Modal: enter project name
2. On create → redirect to project detail page

**Project detail** (`/dashboard/projects/[projectId]`):
- Project name + metadata
- "New run" button → version submission form
- Version list: version number, label, submitted date, status badge, quick link to version detail

**Version submission form** (`/dashboard/projects/[projectId]/new-version`):
- KMZ file upload (drag-and-drop + click)
- Parameter sections (accordion or tabs):
  - **Module** — long side, short side, wattage
  - **Table configuration** — orientation, modules/row, rows/table, E-W gap
  - **Layout** — tilt (auto/manual), row pitch (auto/GCR/manual), perimeter road width
  - **Inverter** — max strings per inverter
  - **Energy losses** — all 10 loss parameters + degradation + lifetime
- Every parameter has a tooltip/popover explaining it, its default, and when to override
- All defaults pre-filled matching the Python app
- Submit button → POST /versions → redirect to version detail

**Version detail** (`/dashboard/projects/[projectId]/versions/[versionId]`):
- Status banner: queued / processing layout / processing energy / complete / failed
- Polls `GET /versions/:versionId` every 3 seconds until terminal state
- On complete: SVG preview + stats dashboard (Spike 6) + download buttons (Spikes 7, 9, 10)
- Input summary: shows the parameters used for this version (from `inputSnapshot`)

### UX Requirements

- Fully responsive (desktop + tablet)
- Nova theme throughout
- Status badges: colour-coded (queued=grey, processing=amber, complete=green, failed=red)
- Tooltip/popover on every parameter — no exceptions
- Defaults pre-filled — user only changes what is non-standard

### Acceptance Criteria

- [ ] User can create a project, submit a version, and reach the version detail page
- [ ] Version detail page polls and shows correct status transitions
- [ ] All parameters have tooltips
- [ ] All defaults are pre-filled correctly (matching Python app defaults)
- [ ] KMZ file upload works (drag-and-drop + click)
- [ ] Version list shows all versions for a project in correct order
- [ ] Fully responsive on desktop and tablet

---

## Spike 6 — SVG Preview + Stats Dashboard

**Status:** planned  
**Depends on:** Spike 5

### What we're building

The results view on the version detail page once a layout job completes: an interactive SVG preview with zoom/pan and layer toggles, plus a stats dashboard with all layout and energy stats.

### SVG Preview

- Fetch SVG from S3 via pre-signed URL (from `GET /versions/:versionId`)
- Render inline in browser (not `<img>` — needs DOM access for layer toggles)
- Zoom/pan: `react-zoom-pan-pinch` or `panzoom` — evaluate at spike time
- Layer toggle controls (toggle buttons, off by default):
  - **AC Cables** — toggles visibility of `<g id="ac-cables">` in SVG DOM
  - **Lightning Arresters** — toggles visibility of `<g id="la-footprints">` and `<g id="la-circles">`
- Toggle implementation: set `display: none` / `display: ''` on SVG group elements client-side — no server round-trip, no re-fetch

### Stats Dashboard

Two sections, displayed as stat cards alongside the SVG:

**Layout stats** (visible as soon as layout job completes):

| Stat | Unit |
|------|------|
| Total area | acres |
| Tables placed | count |
| Total modules | count |
| Total capacity | MWp DC |
| Row pitch | m |
| GCR achieved | ratio |
| ICRs | count |
| String inverters | count |
| Inverter capacity | kWp |
| DC cable length | m |
| AC cable length | m |
| Lightning arresters | count |

**Energy stats** (visible once energy job completes — shown as loading/pending until then):

| Stat | Unit |
|------|------|
| Irradiance source | PVGIS / NASA POWER / manual |
| GHI | kWh/m²/yr |
| GTI (in-plane) | kWh/m²/yr |
| Performance Ratio | ratio |
| Specific yield | kWh/kWp/yr |
| Year 1 energy | MWh |
| CUF | % |
| 25-year lifetime energy | MWh |

For multi-boundary sites: per-boundary breakdown + site totals.

### Acceptance Criteria

- [ ] SVG renders correctly for a real layout job output
- [ ] Zoom/pan works smoothly
- [ ] AC Cables toggle shows/hides correct SVG group
- [ ] Lightning Arresters toggle shows/hides correct SVG groups
- [ ] All layout stats display correct values (verified against PDF summary)
- [ ] Energy stats section appears and populates once energy job completes
- [ ] Energy stats polling continues independently after layout stats appear
- [ ] Multi-boundary sites show per-boundary breakdown + totals

---

## Spike 7 — KMZ Download

**Status:** planned  
**Depends on:** Spike 6

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

## Spike 8 — Energy Job

**Status:** planned  
**Depends on:** Spike 4 (Lambda pipeline in staging)

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

- [ ] Energy job runs after layout job completes (both local and staging)
- [ ] PVGIS fetch works for an Indian site; GTI and GHI values are plausible
- [ ] NASA POWER fallback triggers correctly when PVGIS is unreachable (test with mocked failure)
- [ ] PDF has all three pages with correct content
- [ ] PDF appears in S3 under correct key
- [ ] EnergyJob DB record updated with status, pdf key, stats, irradiance source
- [ ] Energy stats appear in stats dashboard (Spike 6) once job completes

---

## Spike 9 — PDF Download

**Status:** planned  
**Depends on:** Spike 8

### What we're building

One-click download of the PDF report from the version detail page.

### Acceptance Criteria

- [ ] "Download PDF" button appears on version detail page once energy job is complete
- [ ] Downloaded PDF has correct content on all three pages
- [ ] Page 1: layout drawing matches SVG preview (same elements, LA protection circles hidden, LA rectangles shown)
- [ ] Page 2: summary stats match the stats dashboard values exactly
- [ ] Page 3: energy yield report with correct 25-year table

---

## Spike 10 — DXF Download

**Status:** planned  
**Depends on:** Spike 9

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

## Spike 11 — Error Handling and Retry UX

**Status:** planned  
**Depends on:** Spike 10

### What we're building

Graceful failure display and recovery for failed jobs. Users should always know what failed, why, and what they can do about it.

### Failure Scenarios and Handling

| Scenario | Detection | User Experience |
|----------|-----------|-----------------|
| Layout engine crash | LayoutJob status = FAILED | "Layout failed: {error detail}" — Re-run button |
| PVGIS + NASA POWER both down | EnergyJob status = FAILED | "Energy calculation failed: irradiance data unavailable. Try again later." — Re-run button |
| Lambda timeout (10 min) | SQS visibility timeout → DLQ | Version status = FAILED — same UX as above |
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
- [ ] DLQ receives messages after 3 Lambda failures (verified in staging)
- [ ] CloudWatch alarm fires when DLQ has messages

---

## Spike 12 — End-to-End Production Smoke Test

**Status:** planned  
**Depends on:** Spike 11

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
