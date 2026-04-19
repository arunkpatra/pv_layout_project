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

---

## Architecture Pattern Reference

Derived from the journium monorepo (`/Users/arunkpatra/codebase/journium/journium`). All spikes follow this pattern:

**Local development:**
```
apps/web → apps/api (Hono) → HTTP → apps/layout-engine (local HTTP server, Dockerfile.local)
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
- `apps/layout-engine/src/lambda_handler.py` — Lambda transport (API Gateway event ↔ handler)
- `apps/layout-engine/src/server.py` — local HTTP transport (HTTPServer ↔ handler)
- `USE_LOCAL_ENV=true` → Hono API calls layout engine via HTTP directly (no SQS)
- `USE_LOCAL_ENV=false` → Hono API enqueues to SQS; Lambda runs the engine
- Real S3 buckets in all environments (local, staging, prod). No LocalStack.
- `uv` for Python dependency management (not pip). `pyproject.toml` + `uv.lock`.

---

## Spike Overview

| # | Spike | Status | Depends On |
|---|-------|--------|------------|
| 1 | [Data Model](#spike-1--data-model) | planned | — |
| 2 | [apps/layout-engine Setup](#spike-2--appslayout-engine-setup) | planned | Spike 1 |
| 3 | [Job Pipeline: Local Mode](#spike-3--job-pipeline-local-mode) | planned | Spike 2 |
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

**Status:** planned  
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

## Spike 2 — `apps/layout-engine` Setup

**Status:** planned  
**Depends on:** Spike 1

### What we're building

The Python layout engine as a standalone app in the monorepo. This is the heart of the initiative. The compute logic from the Python desktop app (`/Users/arunkpatra/codebase/PVlayout_Advance`) is extracted, stripped of all GUI code, and packaged to run as a local HTTP server (dev) or AWS Lambda (staging/prod).

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
    handlers.py     ← NEW: shared business logic (layout + energy)
    lambda_handler.py  ← NEW: Lambda transport
    server.py          ← NEW: local HTTP transport
    s3_client.py       ← NEW: S3 upload/download helpers
  pyproject.toml
  uv.lock
  Dockerfile          ← Lambda image (multi-stage, ECR target)
  Dockerfile.local    ← Local HTTP server
  .dockerignore
```

### What Changes in the Copied Code

- **Add at top of any file that imports matplotlib:** `matplotlib.use('Agg')` before any other matplotlib import — enables headless SVG rendering with no display backend
- **`ezdxf` added to `pyproject.toml`** — currently missing from the Python app's requirements
- **No other changes** to `core/`, `models/`, `utils/` — these are already clean of Qt

### handlers.py — Shared Business Logic

Two handler functions — one for layout, one for energy:

```python
def handle_layout(payload: dict) -> dict:
    """
    Input payload:
      kmz_s3_key: str          -- S3 key of input KMZ
      version_id: str          -- used to construct output S3 keys
      parameters: dict         -- all layout + module + table + inverter params

    Returns:
      kmz_s3_key: str
      svg_s3_key: str
      dxf_s3_key: str
      stats: dict              -- all layout stats (tables, MWp, ICRs, etc.)
    """

def handle_energy(payload: dict) -> dict:
    """
    Input payload:
      version_id: str
      layout_stats: dict       -- output from handle_layout (capacity, location, etc.)
      energy_parameters: dict  -- all energy loss params + irradiance source preference

    Returns:
      pdf_s3_key: str
      stats: dict              -- energy stats (GTI, PR, CUF, Year1 MWh, 25yr, etc.)
      irradiance_source: str   -- "pvgis" | "nasa_power" | "manual"
    """
```

### lambda_handler.py

```python
def lambda_handler(event, context):
    # Parse API Gateway event body → payload dict
    # Route on event path: /layout or /energy
    # Call handle_layout or handle_energy
    # Return API Gateway response: { statusCode, headers, body }
```

### server.py

Local HTTP server (Python stdlib `http.server`) on configurable port (default 5000):
- `POST /layout` → `handle_layout`
- `POST /energy` → `handle_energy`
- `GET /health` → `{ status: "ok" }`

Same code path as Lambda — `server.py` wraps the same `handlers.py`.

### Dockerfile (Lambda, Production)

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

### Dockerfile.local (Local HTTP Server)

```dockerfile
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --no-install-project
COPY src/ ./src/
EXPOSE 5000
ENV PORT=5000
CMD ["uv", "run", "python", "src/server.py"]
```

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
]
```

### S3 Key Conventions

```
projects/{projectId}/versions/{versionId}/input.kmz      ← uploaded by API on submit
projects/{projectId}/versions/{versionId}/layout.kmz     ← written by layout engine
projects/{projectId}/versions/{versionId}/layout.svg     ← written by layout engine
projects/{projectId}/versions/{versionId}/layout.dxf     ← written by layout engine
projects/{projectId}/versions/{versionId}/report.pdf     ← written by energy engine
```

### Acceptance Criteria

- [ ] `POST /layout` with a real KMZ payload → KMZ + SVG + DXF appear in S3 → stats JSON returned
- [ ] SVG has `gid`-tagged layer groups: `boundary`, `obstacles`, `tables`, `icrs`, `inverters`, `dc-cables`, `ac-cables`, `la-footprints`, `la-circles`, `annotations`
- [ ] `GET /health` returns `{ status: "ok" }`
- [ ] Server runs correctly via `docker compose up layout-engine`
- [ ] All gates pass: `bun run lint && bun run typecheck && bun run test && bun run build` (Python linting via ruff in project.json)
- [ ] `ezdxf` is in `pyproject.toml` and DXF export works
- [ ] `matplotlib.use('Agg')` confirmed — no display errors in headless environment

---

## Spike 3 — Job Pipeline: Local Mode

**Status:** planned  
**Depends on:** Spike 2

### What we're building

Wire the Hono API to call the layout engine via HTTP in local development. No SQS. No Lambda. Full end-to-end job execution on the developer's laptop.

### Local Architecture

```
POST /projects/:id/versions
  → Upload KMZ to S3
  → Write Version + LayoutJob (status: QUEUED) to DB
  → Return { versionId } to client immediately
  → [background] Call http://localhost:5000/layout
       → Layout engine runs
       → Writes KMZ + SVG + DXF to S3
       → Returns stats JSON
  → Update LayoutJob (status: COMPLETE, artifact keys, stats)
  → Update Version (status: PROCESSING — energy job pending)
  → [background] Call http://localhost:5000/energy
       → Energy engine runs (PVGIS / NASA POWER fetch)
       → Writes PDF to S3
       → Returns energy stats JSON
  → Update EnergyJob (status: COMPLETE, pdf key, stats)
  → Update Version (status: COMPLETE)
```

### Environment Variables (Local)

```bash
USE_LOCAL_ENV=true
LAYOUT_ENGINE_URL=http://localhost:5000
S3_BUCKET_NAME=renewable-energy-local-artifacts
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...       # real AWS credentials for S3
AWS_SECRET_ACCESS_KEY=...
```

### docker-compose addition

```yaml
layout-engine:
  build:
    context: ./apps/layout-engine
    dockerfile: Dockerfile.local
  ports:
    - "5000:5000"
  environment:
    - S3_BUCKET_NAME=${S3_BUCKET_NAME}
    - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
    - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    - AWS_REGION=${AWS_REGION}
  env_file:
    - ../../.env
```

### Hono API Changes

- `modules/layout/layout.service.ts` — `dispatchLayoutJob(versionId)`:
  - If `USE_LOCAL_ENV=true`: call `LAYOUT_ENGINE_URL/layout` via HTTP, await, update DB
  - If `USE_LOCAL_ENV=false`: enqueue to SQS (Spike 4)
- Background dispatch: fire-and-forget after API returns `{ versionId }` — do not block the HTTP response

### Acceptance Criteria

- [ ] `POST /versions` returns immediately with `{ versionId, status: "queued" }`
- [ ] Layout engine runs in background; DB status transitions: `QUEUED → PROCESSING → COMPLETE`
- [ ] All three artifacts (KMZ, SVG, DXF) appear in S3 under correct keys
- [ ] `GET /versions/:versionId` returns artifact pre-signed URLs and stats once complete
- [ ] Energy job runs after layout completes; PDF appears in S3; energy stats on Version
- [ ] Full pipeline verified with a real KMZ file

---

## Spike 4 — Job Pipeline: SQS + Lambda (Staging)

**Status:** planned  
**Depends on:** Spike 3

### What we're building

Replace the local HTTP dispatch with SQS + Lambda for staging and production environments. The layout engine Docker image is pushed to ECR and runs as a Lambda function triggered by SQS.

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
  → fetch Version + inputSnapshot from DB
  → download KMZ from S3 (kmzS3Key)
  → run handle_layout(payload)
  → write artifacts to S3
  → update LayoutJob in DB (COMPLETE + artifact keys + stats)
  → update Version in DB (PROCESSING)
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
1. Fetch irradiance from PVGIS (primary): `ghi`, `gti`
2. On PVGIS failure: fallback to NASA POWER with Hay-Davies tilt correction
3. Compute PR from all loss parameters
4. Compute 25-year energy model (Year 1 with LID, Years 2–25 with annual degradation)
5. Render PDF (3 pages via `core/pdf_exporter.py`):
   - Page 1: layout drawing (SVG → matplotlib figure)
   - Page 2: summary stats table
   - Page 3: energy yield report
6. Upload PDF to S3
7. Return energy stats JSON + pdf S3 key + irradiance source used

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
| — | — | — | — |
