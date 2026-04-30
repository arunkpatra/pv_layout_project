# Spike 3 — Layout Engine Lambda Deployment Design

## Goal

Deploy the layout engine as an AWS Lambda function triggered by SQS for **production**. When a version is created via the Hono API in production, a message is published to an SQS queue; Lambda picks it up, runs the layout computation, uploads artifacts to S3, and transitions the job to COMPLETE or FAILED in the DB.

In local development, the Hono API calls the layout engine HTTP server directly (fire-and-forget POST to `http://localhost:8000/layout`). No SQS, no Lambda in local dev.

## Architecture

```
Local development (USE_LOCAL_ENV=true):
Hono API (createVersion)
  → POST http://localhost:8000/layout { version_id, kmz_s3_key, parameters }
    → 202 Accepted (fire-and-forget)
      → layout engine background thread (server.py)
        → downloads KMZ from S3
        → runs layout computation
        → uploads artifacts to S3
        → marks LayoutJob + Version → COMPLETE (or FAILED) in DB

Production (USE_LOCAL_ENV=false):
Hono API (createVersion)
  → publishes {version_id} to SQS layout queue
    → Lambda (triggered by SQS event source mapping)
      → reads version from DB (projectId, kmzS3Key, inputSnapshot)
      → downloads input KMZ from S3
      → runs layout computation
      → uploads layout.kmz / layout.svg / layout.dxf to S3
           at projects/{projectId}/versions/{versionId}/
      → marks LayoutJob + Version → COMPLETE (or FAILED) in DB
```

**Local dev:** `bun run dev` in `apps/layout-engine` starts the HTTP server on port 8000. Hono API calls it at `LAYOUT_ENGINE_URL`. No Docker, no SQS, no Lambda needed locally.

## Tech Stack

- Python 3.13, Lambda container image (`public.ecr.aws/lambda/python:3.13`, arm64)
- AWS Lambda (arm64 / Graviton, 512 MB, 180s timeout)
- AWS SQS (standard queue, batch size 1)
- AWS ECR (container image registry)
- `@aws-sdk/client-sqs` in Hono API for production SQS publish
- GitHub Actions with AWS OIDC (no long-lived credentials)

---

## Infrastructure (prod only)

All resources provisioned via AWS CLI. Documented with exact commands in `docs/AWS_RESOURCES.md`.

| Resource | prod |
|---|---|
| SQS queue | `re_layout_queue_prod` |
| Lambda function | `layout_engine_lambda_prod` |
| Lambda architecture | arm64 |
| Lambda memory | 512 MB |
| Lambda timeout | 180 s |
| SQS event source mapping | batch size 1 |
| ECR repository | `renewable-energy/layout-engine` (shared) |
| OIDC IAM role | `renewable-energy-github-actions` (shared) |

### SQS Message Shape

```json
{ "version_id": "ver_abc123" }
```

Minimal — Lambda reads `projectId`, `kmzS3Key`, and `inputSnapshot` from the DB using `version_id`. The version record is immutable after creation (new KMZ or parameter changes always produce a new version), so there is no stale-data risk from reading DB at Lambda startup.

### S3 Artifact Keys

Output artifacts are written to a version-scoped prefix, derived from DB data:

```
projects/{projectId}/versions/{versionId}/layout.kmz
projects/{projectId}/versions/{versionId}/layout.svg
projects/{projectId}/versions/{versionId}/layout.dxf
```

This replaces the current `dirname(kmz_s3_key)` derivation in `handlers.py`, which produced an incorrect path (`projects/{projectId}/kmz/`).

### Environment Variables (Lambda runtime, prod)

| Variable | Value |
|---|---|
| `DATABASE_URL` | prod RDS connection string (with `?sslmode=no-verify`) |
| `S3_BUCKET` | `renewable-energy-prod-artifacts` |
| `AWS_REGION` | `ap-south-1` |

AWS credentials are provided automatically by the Lambda execution role (IAM role attached to function) — no `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` needed at runtime.

### Lambda Execution Role

A new execution role `renewable-energy-lambda-execution` is created with:
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on all artifact buckets
- `AWSLambdaBasicExecutionRole` (CloudWatch Logs)
- No DB credentials in IAM — `DATABASE_URL` passed as environment variable

### OIDC Role for CI/CD

Role: `renewable-energy-github-actions`

Permissions:
- `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:CreateRepository`, `ecr:DescribeRepositories`
- `lambda:UpdateFunctionCode`, `lambda:GetFunction` on `layout_engine_lambda_prod`

Trust policy: GitHub OIDC provider (`token.actions.githubusercontent.com`), scoped to `repo:arunkpatra/renewable_energy:*`.

---

## Code Changes

### Python — layout-engine

**New file: `src/lambda_handler.py`**

SQS event handler — Lambda entrypoint. Iterates `event['Records']`, parses `{version_id}` from each record body, calls `handle_layout_job(version_id)`.

```python
import json
from handlers import handle_layout_job

def handler(event, context):
    for record in event["Records"]:
        payload = json.loads(record["body"])
        handle_layout_job(payload["version_id"])
```

**Modified: `src/db_client.py`**

Add `get_version(version_id)` — returns `(project_id, kmz_s3_key, input_snapshot)` from a single SELECT on `versions`.

**Modified: `src/handlers.py`**

`handle_layout_job(version_id)` signature changes: `version_id` only (no `kmz_s3_key`, no `parameters`). At the start, calls `get_version(version_id)` to fetch `project_id`, `kmz_s3_key`, and `input_snapshot`. Output S3 prefix becomes:

```python
output_prefix = f"projects/{project_id}/versions/{version_id}"
```

`handle_layout` (local HTTP server contract) is unchanged.

### Hono API — apps/api

**New file: `src/lib/sqs.ts`**

Thin wrapper around `@aws-sdk/client-sqs` — production SQS publish:

```typescript
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"

const client = new SQSClient({ region: process.env.AWS_REGION ?? "ap-south-1" })

export async function publishLayoutJob(versionId: string): Promise<void> {
  await client.send(new SendMessageCommand({
    QueueUrl: process.env.SQS_LAYOUT_QUEUE_URL!,
    MessageBody: JSON.stringify({ version_id: versionId }),
  }))
}
```

**New file: `src/lib/layout-engine.ts`**

Thin HTTP fire-and-forget caller — local dev only:

```typescript
export function dispatchLayoutJobHttp(
  versionId: string,
  kmzS3Key: string,
  parameters: Record<string, unknown>
): void {
  const url = `${process.env.LAYOUT_ENGINE_URL}/layout`
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version_id: versionId, kmz_s3_key: kmzS3Key, parameters }),
  }).catch((err) => console.error("layout engine HTTP dispatch failed", err))
  // intentionally not awaited — fire-and-forget
}
```

**Modified: `src/modules/projects/projects.service.ts`**

In `createVersion`, after `layoutJob` is created, dispatch based on environment:

```typescript
if (process.env.USE_LOCAL_ENV === "true") {
  dispatchLayoutJobHttp(version.id, kmzS3Key, parameters)
} else {
  publishLayoutJob(version.id).catch((err) =>
    console.error("SQS publish failed", err)
  )
}
```

Both paths are fire-and-forget from the caller's perspective. Errors are logged but not surfaced to the API response.

### Environment Variables — Hono API

| Variable | local dev | prod |
|---|---|---|
| `USE_LOCAL_ENV` | `true` | `false` |
| `LAYOUT_ENGINE_URL` | `http://localhost:8000` | (unused) |
| `SQS_LAYOUT_QUEUE_URL` | (unused) | `https://sqs.ap-south-1.amazonaws.com/378240665051/re_layout_queue_prod` |
| `AWS_REGION` | `ap-south-1` | `ap-south-1` |

In local dev, the layout engine HTTP server must be running (`bun run dev` in `apps/layout-engine`). In prod, the Vercel deployment uses environment variables set in the Vercel dashboard.

---

## Docker Image

**Base image:** `public.ecr.aws/lambda/python:3.13` (arm64)

**Build approach:** Single-stage. Copy `src/`, install dependencies from `pyproject.toml` using `uv pip install --system`, set `CMD ["lambda_handler.handler"]`.

**ECR repository:** `renewable-energy/layout-engine`

**Image tags per build:**
- `{git-sha}` — always
- `prod` — always
- `latest` — on `main` branch only

**Layer caching:** ECR registry-based cache (`buildcache` tag, `mode=max`) — same approach as Journium.

---

## CI/CD — GitHub Actions

### `.github/workflows/build-layout-engine.yml`

**Triggers:** Push to `main`, pull requests.

**Steps:**
1. Checkout
2. Configure AWS credentials via OIDC (`aws-actions/configure-aws-credentials@v6`, `role-to-assume: ${{ secrets.AWS_ROLE_ARN }}`)
3. Login to ECR (`aws-actions/amazon-ecr-login@v2`)
4. Set up QEMU (`docker/setup-qemu-action@v4`, `platforms: linux/arm64`)
5. Set up Docker Buildx (`docker/setup-buildx-action@v4`)
6. Build and push (`docker/build-push-action@v7`, `platforms: linux/arm64`, `provenance: false`, registry cache)

**GitHub variables required:** `AWS_ACCOUNT_ID`, `AWS_REGION`
**GitHub secret required:** `AWS_ROLE_ARN`

### `.github/workflows/deploy-layout-engine.yml`

**Trigger:** Manual `workflow_dispatch` (prod only).

**Steps:**
1. Checkout
2. Configure AWS credentials via OIDC
3. Update Lambda function code:
   ```bash
   aws lambda update-function-code \
     --function-name "layout_engine_lambda_prod" \
     --image-uri "{account}.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine:prod" \
     --region ap-south-1
   ```
4. Wait for update:
   ```bash
   aws lambda wait function-updated \
     --function-name "layout_engine_lambda_prod" \
     --region ap-south-1
   ```

---

## Sub-Spike Breakdown

| Sub-spike | Scope | Definition of Done |
|---|---|---|
| **3a** | Dockerfile, ECR repo creation, first manual image push | Image visible in ECR with `prod` tag |
| **3b** | SQS queue (prod), Lambda (prod), event source mapping, Lambda execution role, OIDC role | Lambda invokable, SQS triggers Lambda |
| **3c** | `lambda_handler.py`, updated `handlers.py` (DB read, fixed S3 prefix), `db_client.get_version` | Unit tests pass, Lambda invoke with test payload works |
| **3d** | `lib/sqs.ts`, `lib/layout-engine.ts`, `createVersion` dispatch logic (HTTP or SQS), env vars | Local dev: POST /versions → HTTP → layout engine fires. Unit tests pass. |
| **3e** | `build-layout-engine.yml`, `deploy-layout-engine.yml`, GitHub variables + secret | CI builds image on PR; deploy workflow updates Lambda |
| **3f** | Production end-to-end test | Create version via prod API → Lambda fires → DB COMPLETE → artifacts in prod S3 |

---

## Testing Approach

**Unit tests (automated):**
- `test_lambda_handler.py` — mock `handle_layout_job`, verify it's called once per SQS record with correct `version_id`
- `test_db_client.py` — add test for `get_version` (mock `_connect`)
- `test_handlers_prod.py` — update to new `handle_layout_job(version_id)` signature, mock `get_version`
- Hono API — add tests for `publishLayoutJob` and `dispatchLayoutJobHttp` in `projects.test.ts` (mock SQS client and fetch)

**Human verification (local, `USE_LOCAL_ENV=true`):**
- Start layout engine: `bun run dev` in `apps/layout-engine`
- Create project + version via API → confirm HTTP call reaches layout engine → DB transitions QUEUED → PROCESSING → COMPLETE → 3 artifacts in S3

**Human verification (prod):**
- Create project + version via prod API with real KMZ
- Confirm LayoutJob in DB transitions QUEUED → PROCESSING → COMPLETE
- Confirm 3 artifacts present in `renewable-energy-prod-artifacts` S3 bucket
