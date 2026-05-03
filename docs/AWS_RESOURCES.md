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
downloads/pv_layout.zip             ← PV Layout desktop app (single zip for all tiers)
```

### V2 Projects Buckets (post-parity desktop app)

| Environment | Bucket Name | Purpose |
|---|---|---|
| local | `solarlayout-local-projects` | KMZ uploads + run-result artifacts (V2) — local dev |
| staging | `solarlayout-staging-projects` | Same — staging |
| prod | `solarlayout-prod-projects` | Same — production |

**Key layout within each V2 projects bucket:**
```
projects/<userId>/kmz/<kmzSha256>.kmz                              ← KMZ uploads (B6, content-addressed at user level)
projects/<userId>/<projectId>/runs/<runId>/layout.json             ← layout result (B16)
projects/<userId>/<projectId>/runs/<runId>/energy.json             ← energy result (B16, when computed)
projects/<userId>/<projectId>/runs/<runId>/exports/<filename>      ← DXF / PDF / KMZ exports (B16)
```

**Configuration (V2 projects buckets):**
- Public access fully blocked
- No versioning (content-addressed via sha256 in the key — overwrites are idempotent)
- Lifecycle: abort incomplete multipart uploads after 7 days; orphan-cleanup of soft-deleted projects/runs is a deferred backlog item, not v1
- No CORS — the Tauri desktop's Rust shell makes native HTTP requests, no browser origin involved
- Encryption: S3 default SSE-S3
- Decision memo: `docs/initiatives/findings/2026-04-30-001-v2-s3-buckets.md`

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
- **Purpose:** Runtime credentials for mvp_api (and future services that read/write artifacts or invoke Lambdas)
- **Inline policies:**
  - `renewable-energy-app-s3` — S3 access (artifact buckets + downloads + V2 projects)
  - `renewable-energy-app-sqs` — legacy SQS perms from C3-era stack
  - `renewable-energy-app-lambda-invoke` — Lambda invoke (added 2026-05-03 per C4 Task 9)

**`renewable-energy-app-s3` grants:**
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `/*` of artifact + downloads + V2 projects buckets
- `s3:ListBucket` on those buckets

**`renewable-energy-app-lambda-invoke` grants** (per C4):
- `lambda:InvokeFunction` on `arn:aws:lambda:ap-south-1:378240665051:function:solarlayout-parse-kmz-prod`

Future Lambdas (compute-layout C6, detect-water C16, compute-energy C18) extend this policy additively when their prod function ARNs land. Staging Lambda invoke ARN added when a staging environment is provisioned.

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

### Repository: `solarlayout/parse-kmz` (V2 cloud-offload arc)

- **URI:** `378240665051.dkr.ecr.ap-south-1.amazonaws.com/solarlayout/parse-kmz`
- **Status:** Active. Created 2026-05-03 in C4 Task 1.
- **Image-tag mutability:** MUTABLE (per fix(c3) at commit `645907f`; CI re-pushes `latest` on every merge to main; SHA tags remain per-commit-unique for traceability).
- **Scan-on-push:** enabled
- **Architecture:** arm64 (single-arch image manifest)
- **Tags:**
  - `<git-sha>` per CI run (audit / `Run.engineVersion` source of truth, per spec D21).
  - `latest` re-tagged on every merge to `main` (convenience tag).
  - `prod` (env-state pointer) re-tagged each time `platform-deployment.yml` runs with `environment=Production`. The prod Lambda function is configured with image-uri ending in `:prod`; the deploy job calls `aws lambda update-function-code` so the function picks up the new digest behind the same tag. Future `staging` Lambda will use `:staging` tag the same way.
  - Env tags are produced ONLY by `platform-deployment.yml` — never by the build's `push:` / `pull_request:` / `workflow_dispatch:` triggers. Semantically: env tags mean "this image is what's running in env X", so they only exist when an operator has actively triggered a deploy.
  - Both staging and prod Lambda functions consume from this single repo (the function ARN is the cut, not the image).
- **Placeholder:** Tag `placeholder` was pushed at provisioning time so the Lambda function shells could be created. Replaced by CI on first deploy.

### Future repositories (created per row by the implementing agent)

| Row | Repository | Purpose |
|---|---|---|
| C6/C8 | `solarlayout/compute-layout` | Heavy compute (SQS-triggered) |
| C16 | `solarlayout/detect-water` | Water-body satellite detection (SQS) |

All `solarlayout/*` ECR repos use MUTABLE tags + scan-on-push + arm64 image manifests.

---

## Lambda Functions (V2 cloud-offload arc)

The post-parity V2 desktop relies on a fan-out of small Lambda functions for cloud-offloaded compute. Each function is built as a single arm64 container image, pushed to a per-feature `solarlayout/<feature>` ECR repo (shared across staging and prod — the function ARN is the cut, not the image), and updated by GitHub Actions on merges to `main`.

### parse-kmz

First function in the arc. Validates a KMZ uploaded under `projects/<userId>/kmz/<sha256>.kmz` and returns parsed boundary geometry (sync invoke from `mvp_api`).

| Environment | Function Name                             | Memory | Timeout | Architecture |
|-------------|-------------------------------------------|--------|---------|--------------|
| local       | (no AWS Lambda function; runs natively)   | n/a    | n/a     | host machine |
| staging     | `solarlayout-parse-kmz-staging`           | 512 MB | 30s     | arm64        |
| prod        | `solarlayout-parse-kmz-prod`              | 512 MB | 30s     | arm64        |

**Local tier (no AWS resources).** Local dev runs `python/lambdas/parse-kmz/parse_kmz_lambda/server.py` natively via `uv run python -m parse_kmz_lambda.server` (port 4101) per the C3.5 D24 pattern. `mvp_api` with `USE_LOCAL_ENVIRONMENT=true` routes to `localhost:4101`. The natively-running `server.py` uses the dev's AWS profile to `s3:GetObject` from `solarlayout-local-projects` (the bucket already exists per the V2 Projects Buckets table above). No new AWS resources for local; no Lambda function; no IAM role.

**Staging + prod tier.** Both functions consume images from the shared `solarlayout/parse-kmz` ECR repository documented under `## ECR` above. The function ARN per environment is the boundary; the image is the same artifact promoted from staging to prod.

#### Execution roles (minimum-privilege per spec C4 sec 4)

Two IAM roles, one per environment, each with the same shape but scoped to the corresponding S3 projects bucket:

- `arn:aws:iam::378240665051:role/solarlayout-parse-kmz-staging-execution`
- `arn:aws:iam::378240665051:role/solarlayout-parse-kmz-prod-execution`

**Trust policy (both roles, identical):**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

**Inline policy (`parse-kmz-{staging|prod}-permissions`):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::solarlayout-{env}-projects/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:ap-south-1:378240665051:*"
    }
  ]
}
```

`{env}` is `staging` or `prod` for the corresponding role. **No KMS, no SSM, no SQS, no other S3 buckets, no Lambda invoke chain** — this is the locked minimum-privilege scope per spec C4 sec 4.

#### CI deployment path

GitHub Actions in `SolarLayout/solarlayout` builds the parse-kmz container, pushes to `solarlayout/parse-kmz`, and calls `lambda:UpdateFunctionCode` against both staging and prod function ARNs. The OIDC role (`solarlayout-github-actions`) was extended in C4 Task 1 to grant `lambda:UpdateFunctionCode` + `lambda:GetFunction` on the two function ARNs and `iam:PassRole` on the two execution role ARNs — see the GitHub Actions OIDC section below for the full inline policy.

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

### Role: `solarlayout-github-actions` (post-merge, NEW REPO)

- **ARN:** `arn:aws:iam::378240665051:role/solarlayout-github-actions`
- **Policy:** `solarlayout-github-actions-ecr-push` (inline; ECR push on `solarlayout/*` repos)
- **Trust:** GitHub OIDC (`token.actions.githubusercontent.com`), scoped to `repo:SolarLayout/solarlayout:*`

**Trust policy (verbatim):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::378240665051:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:SolarLayout/solarlayout:*"
        }
      }
    }
  ]
}
```

**Inline policy (`solarlayout-github-actions-ecr-push`):**

The policy retains its original `solarlayout-github-actions-ecr-push` name for continuity, but its scope grew in C4 Task 1 (2026-05-03) to also cover Lambda code update + iam:PassRole on the parse-kmz execution roles. Future Lambda rows (C6/C8/C16) will append additional statements following the same pattern.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuthToken",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECRPushOnSolarlayoutRepos",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:CompleteLayerUpload",
        "ecr:CreateRepository",
        "ecr:DescribeImages",
        "ecr:DescribeRepositories",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:TagResource",
        "ecr:UploadLayerPart"
      ],
      "Resource": [
        "arn:aws:ecr:ap-south-1:378240665051:repository/solarlayout/*"
      ]
    },
    {
      "Sid": "LambdaUpdateParseKmz",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction"
      ],
      "Resource": [
        "arn:aws:lambda:ap-south-1:378240665051:function:solarlayout-parse-kmz-staging",
        "arn:aws:lambda:ap-south-1:378240665051:function:solarlayout-parse-kmz-prod"
      ]
    },
    {
      "Sid": "PassRoleParseKmzExecution",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::378240665051:role/solarlayout-parse-kmz-staging-execution",
        "arn:aws:iam::378240665051:role/solarlayout-parse-kmz-prod-execution"
      ]
    }
  ]
}
```

**GitHub Actions configuration on `SolarLayout/solarlayout`:**

- Secret `AWS_ROLE_ARN` = `arn:aws:iam::378240665051:role/solarlayout-github-actions`
- Variable `AWS_ACCOUNT_ID` = `378240665051` (already set; verify)
- Variable `AWS_REGION` = `ap-south-1` (already set; verify)

### Legacy `renewable-energy-github-actions` role (orphaned, leave alone)

The pre-merge `arn:aws:iam::378240665051:role/renewable-energy-github-actions` role still exists in the account. Its trust policy is scoped to `repo:arunkpatra/renewable_energy:*` (the OLD GitHub repo, archive-pending) so it is not assumable from `SolarLayout/solarlayout`. Per Arun's call (2026-05-03): leave it untouched. It causes no harm; teardown is a separate, post-launch concern.
