# AWS Resources

All resources live in a **single AWS account** (`378240665051`) in region **`ap-south-1`** (Mumbai).
Resources are namespaced by environment. Last verified: 2026-04-20.

---

## S3 Buckets

| Environment | Bucket Name | Purpose |
|---|---|---|
| local | `renewable-energy-local-artifacts` | Layout artifacts during local development |
| staging | `renewable-energy-staging-artifacts` | Layout artifacts for staging/CI deployments |
| prod | `renewable-energy-prod-artifacts` | Layout artifacts for production |

### MVP Download Buckets

| Environment | Bucket Name | Purpose |
|---|---|---|
| local | `solarlayout-local-downloads` | Desktop exe downloads during local development |
| staging | `solarlayout-staging-downloads` | Desktop exe downloads for staging |
| prod | `solarlayout-prod-downloads` | Desktop exe downloads for production |

**Key layout within each MVP download bucket:**
```
downloads/pv_layout.exe             ← PV Layout desktop app (single exe for all tiers)
```

**Configuration applied to all buckets:**
- Public access fully blocked (BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets)
- Region: `ap-south-1`
- No versioning (artifacts are immutable per version ID)

**Key layout within each bucket:**
```
projects/<project_id>/versions/<version_id>/input.kmz      ← uploaded by API on version create
projects/<project_id>/versions/<version_id>/layout.kmz     ← written by layout engine
projects/<project_id>/versions/<version_id>/layout.svg     ← written by layout engine
projects/<project_id>/versions/<version_id>/layout.dxf     ← written by layout engine
```

---

## IAM

### User: `renewable-energy-app`

- **ARN:** `arn:aws:iam::378240665051:user/renewable-energy-app`
- **Purpose:** Runtime credentials for the layout engine (and future services that read/write artifacts)
- **Policy:** `renewable-energy-app-s3` (inline managed policy)

**Policy grants:**
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `/*` of all three artifact buckets
- `s3:ListBucket` on all three artifact buckets

**Credentials location:** `aws-creds/renewable-energy-app.env` (gitignored — never commit)

---

## Environment Variable Reference

| Variable | local | staging | prod |
|---|---|---|---|
| `S3_ARTIFACTS_BUCKET` | `renewable-energy-local-artifacts` | `renewable-energy-staging-artifacts` | `renewable-energy-prod-artifacts` |
| `AWS_REGION` | `ap-south-1` | `ap-south-1` | `ap-south-1` |
| `AWS_ACCESS_KEY_ID` | see `aws-creds/` | set in deployment platform | set in deployment platform |
| `AWS_SECRET_ACCESS_KEY` | see `aws-creds/` | set in deployment platform | set in deployment platform |
| `DATABASE_URL` | local Postgres (see below) | staging DB connection string | prod DB connection string |

---

## Local Development Setup

### Prerequisites
- Docker running (`docker compose up -d` from repo root starts Postgres)
- AWS credentials file sourced

### Starting the layout engine locally

```bash
# From repo root
source aws-creds/renewable-energy-app.env

# From apps/layout-engine
S3_ARTIFACTS_BUCKET=renewable-energy-local-artifacts \
DATABASE_URL=postgresql://renewable:renewable@localhost:5432/renewable_energy \
PYTHONPATH=src uv run python src/server.py
```

Or using bun (picks up env from shell):
```bash
source aws-creds/renewable-energy-app.env
export S3_ARTIFACTS_BUCKET=renewable-energy-local-artifacts
export DATABASE_URL=postgresql://renewable:renewable@localhost:5432/renewable_energy

cd apps/layout-engine
bun run dev
```

### Smoke test
```bash
curl -s http://localhost:8000/health
# → {"status": "ok"}
```

### Submit a layout job

You need a `version_id` whose LayoutJob is in `QUEUED` state and a KMZ uploaded to S3.
Obtain both by creating a project + version through the Hono API (see Spike 3 onwards).
Until that integration exists, you can seed test data manually (see below).

#### Manual test data seed (local only)

```bash
# Upload a test KMZ
aws s3 cp /path/to/your.kmz \
  s3://renewable-energy-local-artifacts/projects/test_p1/versions/test_v1/input.kmz \
  --region ap-south-1

# Insert seed records via Prisma Studio
bun run db:studio   # http://localhost:5555
# Create a Project, then a Version (status=QUEUED), then a LayoutJob (status=QUEUED, versionId=<version_id>)

# Dispatch the job (server.py POST /layout accepts only version_id since Spike 3c)
curl -s -X POST http://localhost:8000/layout \
  -H "Content-Type: application/json" \
  -d '{"version_id": "<version_id>"}'
# → {"accepted": true}  HTTP 202

# Check DB — LayoutJob and Version should transition QUEUED → PROCESSING → COMPLETE
bun run db:studio
```

---

## Staging Setup

Set the following in your deployment platform (Vercel, Railway, etc.) for the layout-engine service:

```
AWS_ACCESS_KEY_ID=<same key — or rotate and create a separate key>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_REGION=ap-south-1
S3_ARTIFACTS_BUCKET=renewable-energy-staging-artifacts
DATABASE_URL=<staging DB connection string>
```

---

## Production Setup

Set the following in your deployment platform for the production layout-engine service:

```
AWS_ACCESS_KEY_ID=<same key — or rotate and create a separate key>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_REGION=ap-south-1
S3_ARTIFACTS_BUCKET=renewable-energy-prod-artifacts
DATABASE_URL=<prod DB connection string>
```

**Recommendation:** Create a separate IAM access key for prod (via `aws iam create-access-key --user-name renewable-energy-app`) and rotate the local key. This limits blast radius if a key leaks.

---

## Key Rotation

To rotate the `renewable-energy-app` credentials:

```bash
# Create a new key
aws iam create-access-key --user-name renewable-energy-app

# Update aws-creds/renewable-energy-app.env and all deployment platform env vars with the new key

# Delete the old key (replace AKIAXXXXXXXX with the old key ID)
aws iam delete-access-key --user-name renewable-energy-app --access-key-id AKIAXXXXXXXX
```

---

## Reprovisioning from Scratch

If you ever need to recreate all resources:

```bash
# Buckets
for env in local staging prod; do
  aws s3api create-bucket \
    --bucket "renewable-energy-${env}-artifacts" \
    --region ap-south-1 \
    --create-bucket-configuration LocationConstraint=ap-south-1

  aws s3api put-public-access-block \
    --bucket "renewable-energy-${env}-artifacts" \
    --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
done

# IAM user + policy
aws iam create-user --user-name renewable-energy-app
aws iam create-policy \
  --policy-name renewable-energy-app-s3 \
  --policy-document file://docs/iam-policy-re-app-s3.json
aws iam attach-user-policy \
  --user-name renewable-energy-app \
  --policy-arn arn:aws:iam::378240665051:policy/renewable-energy-app-s3
aws iam create-access-key --user-name renewable-energy-app
```

---

## Lambda

### Function: `layout_engine_lambda_prod`

- **ARN:** `arn:aws:lambda:ap-south-1:378240665051:function:layout_engine_lambda_prod`
- **Package type:** Container image from ECR
- **Architecture:** arm64
- **Memory:** 1769 MB (1 full vCPU)
- **Timeout:** 600 s (10 min)
- **Execution role:** `arn:aws:iam::378240665051:role/renewable-energy-lambda-execution`
- **Environment variables:**
  - `DATABASE_URL` — prod RDS (set via AWS console / CLI, not committed)
  - `S3_ARTIFACTS_BUCKET` = `renewable-energy-prod-artifacts`
  - `AWS_REGION` = `ap-south-1`

### Execution Role: `renewable-energy-lambda-execution`

Policies attached:
- `AWSLambdaBasicExecutionRole` (managed)
- `renewable-energy-app-s3` (managed, allows S3 read/write on artifact buckets)
- `sqs-layout-queue-prod` (inline, allows SQS receive/delete/attributes on `re_layout_queue_prod`)

---

## SQS

| Environment | Queue Name | ARN |
|---|---|---|
| prod | `re_layout_queue_prod` | `arn:aws:sqs:ap-south-1:378240665051:re_layout_queue_prod` |

Standard queue, batch size 1, visibility timeout 1200 s (2× Lambda timeout).

---

## ECR

- **Repository:** `renewable-energy/layout-engine`
- **URI:** `378240665051.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine`

Tags:
- `prod` — latest prod image (updated by CI on push to main)
- `{git-sha}` — per-commit tag
- `buildcache` — Docker layer cache (managed by CI)

---

## GitHub Actions OIDC

### Role: `renewable-energy-github-actions`

- **ARN:** `arn:aws:iam::378240665051:role/renewable-energy-github-actions`
- **Policy:** `renewable-energy-github-actions-policy` (ECR push + Lambda update)
- **Trust:** GitHub OIDC, scoped to `repo:arunkpatra/renewable_energy:*`

**GitHub Actions configuration:**
- Secret `AWS_ROLE_ARN` = `arn:aws:iam::378240665051:role/renewable-energy-github-actions`
- Variable `AWS_ACCOUNT_ID` = `378240665051`
- Variable `AWS_REGION` = `ap-south-1`
