# Spike 3 — Lambda + SQS (prod) + Local HTTP Wiring: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the layout engine as an AWS Lambda triggered by SQS for production, while wiring the Hono API to call the layout engine directly via HTTP in local dev.

**Architecture:** `USE_LOCAL_ENV=true` → Hono fire-and-forgets to `http://localhost:8000/layout`; `USE_LOCAL_ENV=false` → Hono publishes `{version_id}` to SQS, Lambda reads version from DB, runs layout, writes artifacts and DB status. Lambda is prod-only — no local Lambda environment exists.

**Tech Stack:** Python 3.13, AWS Lambda (arm64, 512 MB, 180s), AWS SQS (standard queue), AWS ECR, `@aws-sdk/client-sqs` in Hono API, GitHub Actions + OIDC, `uv` for Python deps, Docker Buildx for arm64 image.

**Branch:** `feat/spike3-lambda-sqs`

**Spec:** `docs/superpowers/specs/2026-04-19-spike3-lambda-deployment-design.md`

---

## Definition of Done (per sub-spike)

Every sub-spike is complete only when:
1. Failing tests written first — no implementation before the test
2. All static gates pass from repo root: `bun run lint && bun run typecheck && bun run test && bun run build`
3. Committed to `feat/spike3-lambda-sqs`, pushed, CI passes
4. Human has verified runtime behaviour step-by-step in a real environment

---

## File Structure

### Python — `apps/layout-engine/`

| File | Action | Responsibility |
|------|--------|----------------|
| `src/db_client.py` | Modify | Add `get_version(version_id)` — reads `projectId`, `kmzS3Key`, `inputSnapshot` from `versions` |
| `src/handlers.py` | Modify | Change `handle_layout_job(version_id)` to read from DB; fix output S3 prefix to `projects/{projectId}/versions/{versionId}/` |
| `src/server.py` | Modify | POST body now only needs `version_id`; pass only that to thread |
| `src/lambda_handler.py` | Create | Lambda entrypoint — iterates SQS records, calls `handle_layout_job(version_id)` |
| `src/tests/test_db_client.py` | Modify | Add `get_version` tests |
| `src/tests/test_handlers_prod.py` | Modify | Update to new `handle_layout_job(version_id)` signature, mock `get_version` |
| `src/tests/test_server.py` | Modify | Update POST body (remove `kmz_s3_key`, `parameters`) |
| `src/tests/test_lambda_handler.py` | Create | Unit test for SQS event parsing |
| `Dockerfile` | Create | Lambda container image (Python 3.13, arm64, uv-installed deps) |
| `.dockerignore` | Create | Exclude `__pycache__`, tests, `.env` |

### Hono API — `apps/api/src/`

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/sqs.ts` | Create | `publishLayoutJob(versionId)` — SQS send wrapper (prod path) |
| `lib/layout-engine.ts` | Create | `dispatchLayoutJobHttp(versionId)` — fire-and-forget HTTP POST (local path) |
| `env.ts` | Modify | Add `USE_LOCAL_ENV`, `LAYOUT_ENGINE_URL`, `SQS_LAYOUT_QUEUE_URL` |
| `modules/projects/projects.service.ts` | Modify | Fix KMZ S3 path to `versions/{versionId}/input.kmz`; add dispatch after job creation |
| `modules/projects/projects.test.ts` | Modify | Mock dispatch modules; add dispatch tests |

### GitHub Actions — `.github/workflows/`

| File | Action | Responsibility |
|------|--------|----------------|
| `build-layout-engine.yml` | Create | Build arm64 Docker image, push to ECR on every push/PR |
| `deploy-layout-engine.yml` | Create | Manual workflow_dispatch to update `layout_engine_lambda_prod` |

### Docs — `docs/`

| File | Action | Responsibility |
|------|--------|----------------|
| `docs/AWS_RESOURCES.md` | Modify | Add Lambda, SQS, ECR, execution role, OIDC role provisioning commands |
| `docs/iam-policy-github-actions.json` | Create | IAM policy JSON for the GitHub Actions OIDC role |

---

## Task 1 (Sub-spike 3a): Dockerfile + ECR + First Image Push

**Scope:** Build the Lambda container image locally and push it to ECR manually. CI/CD is not wired yet — this is the first manual push to verify the build works end-to-end.

**Files:**
- Create: `apps/layout-engine/Dockerfile`
- Create: `apps/layout-engine/.dockerignore`

---

- [ ] **Step 1.1: Create `.dockerignore`**

File: `apps/layout-engine/.dockerignore`

```
src/__pycache__
src/**/__pycache__
src/tests
.env
.env.*
*.pyc
*.pyo
.ruff_cache
```

- [ ] **Step 1.2: Create `Dockerfile`**

File: `apps/layout-engine/Dockerfile`

```dockerfile
FROM public.ecr.aws/lambda/python:3.13

# Copy uv binary from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR ${LAMBDA_TASK_ROOT}

# Install production dependencies from lock file
COPY pyproject.toml uv.lock ./
RUN /uv export --frozen --no-dev --no-emit-project -o requirements.txt \
    && /uv pip install --system -r requirements.txt \
    && rm requirements.txt

# Copy application source
COPY src/ ./

CMD ["lambda_handler.handler"]
```

Note: `lambda_handler.py` does not exist yet — that's fine for the build test. The image will build successfully because `CMD` is just metadata.

- [ ] **Step 1.3: Verify Docker build (local arm64)**

Run from repo root:
```bash
docker buildx build \
  --platform linux/arm64 \
  --load \
  -t layout-engine:local-test \
  apps/layout-engine/
```

Expected: build completes with no errors. Final line: `Successfully tagged layout-engine:local-test` (or equivalent). Python dependencies install without error.

- [ ] **Step 1.4: Create ECR repository**

```bash
aws ecr create-repository \
  --repository-name renewable-energy/layout-engine \
  --region ap-south-1
```

Expected output contains: `"repositoryUri": "378240665051.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine"`

- [ ] **Step 1.5: Login to ECR**

```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  378240665051.dkr.ecr.ap-south-1.amazonaws.com
```

Expected: `Login Succeeded`

- [ ] **Step 1.6: Tag and push image**

```bash
docker tag layout-engine:local-test \
  378240665051.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine:prod

docker push \
  378240665051.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine:prod
```

Expected: push completes, layers uploaded.

- [ ] **Step 1.7: Verify image in ECR**

```bash
aws ecr describe-images \
  --repository-name renewable-energy/layout-engine \
  --region ap-south-1
```

Expected: response contains an image with tag `prod`.

- [ ] **Step 1.8: Run all gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all four pass.

- [ ] **Step 1.9: Commit**

```bash
git add apps/layout-engine/Dockerfile apps/layout-engine/.dockerignore
git commit -m "feat(3a): add Lambda Dockerfile and .dockerignore for layout engine"
```

---

**Sub-spike 3a Definition of Done (human verification):**
- [ ] Image visible in ECR console at `renewable-energy/layout-engine` with `prod` tag
- [ ] All static gates pass
- [ ] Commit on `feat/spike3-lambda-sqs`

---

## Task 2 (Sub-spike 3b): AWS Resources — SQS, Lambda, Roles, Event Source Mapping

**Scope:** Provision all AWS infrastructure for the prod Lambda pipeline. All steps are AWS CLI commands — no code changes. Document everything in `docs/AWS_RESOURCES.md`.

**Files:**
- Modify: `docs/AWS_RESOURCES.md`
- Create: `docs/iam-policy-github-actions.json`

---

- [ ] **Step 2.1: Add SQS inline policy to Lambda execution role**

First, create the Lambda execution role:

```bash
# Create trust policy
cat > /tmp/lambda-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name renewable-energy-lambda-execution \
  --assume-role-policy-document file:///tmp/lambda-trust-policy.json \
  --region ap-south-1
```

Expected: role ARN in response: `arn:aws:iam::378240665051:role/renewable-energy-lambda-execution`

- [ ] **Step 2.2: Attach managed policies to execution role**

```bash
# CloudWatch Logs
aws iam attach-role-policy \
  --role-name renewable-energy-lambda-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# S3 artifacts access (reuse existing policy)
aws iam attach-role-policy \
  --role-name renewable-energy-lambda-execution \
  --policy-arn arn:aws:iam::378240665051:policy/renewable-energy-app-s3
```

- [ ] **Step 2.3: Add SQS inline policy to execution role**

```bash
cat > /tmp/lambda-sqs-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:ap-south-1:378240665051:re_layout_queue_prod"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name renewable-energy-lambda-execution \
  --policy-name sqs-layout-queue-prod \
  --policy-document file:///tmp/lambda-sqs-policy.json
```

- [ ] **Step 2.4: Create SQS queue**

```bash
aws sqs create-queue \
  --queue-name re_layout_queue_prod \
  --region ap-south-1
```

Expected: `"QueueUrl": "https://sqs.ap-south-1.amazonaws.com/378240665051/re_layout_queue_prod"`

Get queue ARN (needed for Lambda event source mapping):
```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.ap-south-1.amazonaws.com/378240665051/re_layout_queue_prod \
  --attribute-names QueueArn \
  --region ap-south-1
```

Note the ARN: `arn:aws:sqs:ap-south-1:378240665051:re_layout_queue_prod`

- [ ] **Step 2.5: Create Lambda function**

Replace `<PROD_DATABASE_URL>` with the actual prod RDS connection string (find in Vercel dashboard or `.env.production`). Include `?sslmode=no-verify` at the end.

```bash
aws lambda create-function \
  --function-name layout_engine_lambda_prod \
  --package-type Image \
  --code ImageUri=378240665051.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine:prod \
  --role arn:aws:iam::378240665051:role/renewable-energy-lambda-execution \
  --architectures arm64 \
  --memory-size 512 \
  --timeout 180 \
  --region ap-south-1 \
  --environment "Variables={DATABASE_URL=<PROD_DATABASE_URL>,S3_BUCKET=renewable-energy-prod-artifacts,AWS_REGION=ap-south-1}"
```

Expected: Lambda function state = `Active` (may take up to 60s to activate — poll with `aws lambda get-function --function-name layout_engine_lambda_prod --region ap-south-1`).

- [ ] **Step 2.6: Wait for Lambda to become active**

```bash
aws lambda wait function-active \
  --function-name layout_engine_lambda_prod \
  --region ap-south-1
```

Expected: command returns (no output) when Lambda is active.

- [ ] **Step 2.7: Create SQS event source mapping**

```bash
aws lambda create-event-source-mapping \
  --function-name layout_engine_lambda_prod \
  --event-source-arn arn:aws:sqs:ap-south-1:378240665051:re_layout_queue_prod \
  --batch-size 1 \
  --region ap-south-1
```

Expected: mapping with `"State": "Creating"` → will become `"Enabled"` within a minute.

- [ ] **Step 2.8: Create GitHub Actions IAM policy JSON**

File: `docs/iam-policy-github-actions.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECRRepoAccess",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeRepositories",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "arn:aws:ecr:ap-south-1:378240665051:repository/renewable-energy/layout-engine"
    },
    {
      "Sid": "LambdaDeploy",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction"
      ],
      "Resource": "arn:aws:lambda:ap-south-1:378240665051:function:layout_engine_lambda_prod"
    }
  ]
}
```

- [ ] **Step 2.9: Create OIDC provider (if not already exists)**

Check first:
```bash
aws iam list-open-id-connect-providers --region ap-south-1
```

If `token.actions.githubusercontent.com` is not listed:
```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

- [ ] **Step 2.10: Create GitHub Actions OIDC role**

```bash
cat > /tmp/github-oidc-trust.json << 'EOF'
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
          "token.actions.githubusercontent.com:sub": "repo:arunkpatra/renewable_energy:*"
        }
      }
    }
  ]
}
EOF

aws iam create-role \
  --role-name renewable-energy-github-actions \
  --assume-role-policy-document file:///tmp/github-oidc-trust.json

aws iam create-policy \
  --policy-name renewable-energy-github-actions-policy \
  --policy-document file://docs/iam-policy-github-actions.json

aws iam attach-role-policy \
  --role-name renewable-energy-github-actions \
  --policy-arn arn:aws:iam::378240665051:policy/renewable-energy-github-actions-policy
```

Note the role ARN: `arn:aws:iam::378240665051:role/renewable-energy-github-actions` — this goes into GitHub secret `AWS_ROLE_ARN`.

- [ ] **Step 2.11: Set GitHub repository variables and secret**

In GitHub → repository → Settings → Secrets and variables → Actions:

Variables (not secrets — visible in logs):
- `AWS_ACCOUNT_ID` = `378240665051`
- `AWS_REGION` = `ap-south-1`

Secrets:
- `AWS_ROLE_ARN` = `arn:aws:iam::378240665051:role/renewable-energy-github-actions`

- [ ] **Step 2.12: Update `docs/AWS_RESOURCES.md`**

Add the following section after the existing IAM section:

```markdown
## Lambda

### Function: `layout_engine_lambda_prod`

- **ARN:** `arn:aws:lambda:ap-south-1:378240665051:function:layout_engine_lambda_prod`
- **Package type:** Container image from ECR
- **Architecture:** arm64
- **Memory:** 512 MB
- **Timeout:** 180 s
- **Execution role:** `arn:aws:iam::378240665051:role/renewable-energy-lambda-execution`
- **Environment variables:**
  - `DATABASE_URL` — prod RDS (gitignored, set via AWS console / CLI)
  - `S3_BUCKET` = `renewable-energy-prod-artifacts`
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

Standard queue, batch size 1, visibility timeout default (30s — Lambda processes in < 180s).

---

## ECR

Repository: `renewable-energy/layout-engine`
URI: `378240665051.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine`

Tags:
- `prod` — latest prod image (updated by CI on push to main)
- `{git-sha}` — per-commit tag (pushed by CI)
- `buildcache` — Docker layer cache (managed by CI)

---

## GitHub Actions OIDC

### OIDC Provider

URL: `https://token.actions.githubusercontent.com`
Client ID: `sts.amazonaws.com`

### Role: `renewable-energy-github-actions`

- **ARN:** `arn:aws:iam::378240665051:role/renewable-energy-github-actions`
- **Policy:** `renewable-energy-github-actions-policy` (ECR push + Lambda update)
- **Trust:** GitHub OIDC, scoped to `repo:arunkpatra/renewable_energy:*`

**GitHub Actions configuration:**
- Secret `AWS_ROLE_ARN` = `arn:aws:iam::378240665051:role/renewable-energy-github-actions`
- Variable `AWS_ACCOUNT_ID` = `378240665051`
- Variable `AWS_REGION` = `ap-south-1`

### Reprovisioning OIDC role from scratch

```bash
aws iam create-role \
  --role-name renewable-energy-github-actions \
  --assume-role-policy-document file://docs/iam-policy-github-actions-trust.json

aws iam attach-role-policy \
  --role-name renewable-energy-github-actions \
  --policy-arn arn:aws:iam::378240665051:policy/renewable-energy-github-actions-policy
```
```

- [ ] **Step 2.13: Commit**

```bash
git add docs/AWS_RESOURCES.md docs/iam-policy-github-actions.json
git commit -m "feat(3b): provision SQS queue, Lambda, execution role, OIDC role; document AWS resources"
```

---

**Sub-spike 3b Definition of Done (human verification):**
- [ ] Lambda `layout_engine_lambda_prod` visible in AWS console, state = Active
- [ ] SQS queue `re_layout_queue_prod` visible in AWS console
- [ ] Event source mapping visible on Lambda → Configuration → Triggers
- [ ] GitHub variables/secret set (`AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_ROLE_ARN`)
- [ ] All static gates pass

---

## Task 3 (Sub-spike 3c): Python — `lambda_handler.py`, `db_client.get_version`, updated `handlers.py`

**Scope:** All Python-side Spike 3 changes: `get_version` in db_client, refactored `handle_layout_job` (reads from DB, correct S3 prefix), `lambda_handler.py`, and updated tests. Also updates `server.py` for the simplified POST body.

**Files:**
- Modify: `apps/layout-engine/src/db_client.py`
- Modify: `apps/layout-engine/src/handlers.py`
- Modify: `apps/layout-engine/src/server.py`
- Create: `apps/layout-engine/src/lambda_handler.py`
- Modify: `apps/layout-engine/src/tests/test_db_client.py`
- Modify: `apps/layout-engine/src/tests/test_handlers_prod.py`
- Modify: `apps/layout-engine/src/tests/test_server.py`
- Create: `apps/layout-engine/src/tests/test_lambda_handler.py`

---

- [ ] **Step 3.1: Write failing tests for `db_client.get_version`**

Add to `apps/layout-engine/src/tests/test_db_client.py` (after existing imports and `_mock_conn` helper):

```python
import pytest
from db_client import get_version, mark_layout_complete, mark_layout_failed, mark_layout_processing
```

Replace the existing import line with the above (adds `get_version` and `pytest`).

Then add at the end of the file:

```python
def test_get_version_returns_project_id_kmz_key_and_snapshot():
    conn, cur = _mock_conn()
    cur.fetchone.return_value = (
        "prj_abc123",
        "projects/prj_abc123/versions/ver_xyz/input.kmz",
        {"tilt_angle": 18.0, "modules_in_row": 28},
    )
    with patch("db_client._connect", return_value=conn):
        project_id, kmz_s3_key, snapshot = get_version("ver_xyz")

    assert project_id == "prj_abc123"
    assert kmz_s3_key == "projects/prj_abc123/versions/ver_xyz/input.kmz"
    assert snapshot == {"tilt_angle": 18.0, "modules_in_row": 28}
    assert cur.execute.call_count == 1
    sql = cur.execute.call_args_list[0][0][0]
    assert "versions" in sql
    assert "projectId" in sql
    assert "kmzS3Key" in sql


def test_get_version_raises_if_not_found():
    conn, cur = _mock_conn()
    cur.fetchone.return_value = None
    with patch("db_client._connect", return_value=conn):
        with pytest.raises(ValueError, match="Version not found"):
            get_version("ver_nonexistent")
```

- [ ] **Step 3.2: Run new tests — verify they fail**

```bash
cd apps/layout-engine && uv run pytest src/tests/test_db_client.py::test_get_version_returns_project_id_kmz_key_and_snapshot src/tests/test_db_client.py::test_get_version_raises_if_not_found -v
```

Expected: `FAILED` — `ImportError: cannot import name 'get_version'`

- [ ] **Step 3.3: Implement `db_client.get_version`**

Add to `apps/layout-engine/src/db_client.py` after the existing `_connect` function and before `mark_layout_processing`:

```python
def get_version(version_id: str) -> tuple[str, str, dict]:
    """
    Returns (project_id, kmz_s3_key, input_snapshot) for the given version.
    Raises ValueError if version not found.
    """
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT "projectId", "kmzS3Key", "inputSnapshot"
                   FROM versions
                   WHERE id = %s""",
                (version_id,),
            )
            row = cur.fetchone()
    if row is None:
        raise ValueError(f"Version not found: {version_id}")
    project_id, kmz_s3_key, input_snapshot = row
    if isinstance(input_snapshot, str):
        input_snapshot = json.loads(input_snapshot)
    return project_id, kmz_s3_key, input_snapshot
```

- [ ] **Step 3.4: Run `get_version` tests — verify they pass**

```bash
cd apps/layout-engine && uv run pytest src/tests/test_db_client.py -v
```

Expected: all 5 tests pass (3 existing + 2 new).

- [ ] **Step 3.5: Write failing tests for updated `handle_layout_job` and `server.py`**

Replace the entire content of `apps/layout-engine/src/tests/test_handlers_prod.py`:

```python
"""
Tests for handle_layout_job — Spike 3 signature: handle_layout_job(version_id) only.

Reads project_id, kmz_s3_key, input_snapshot from DB via get_version.
Output S3 prefix: projects/{project_id}/versions/{version_id}/
"""
import os
from unittest.mock import MagicMock, call, patch

import pytest

from handlers import handle_layout_job


def _make_parse_result():
    r = MagicMock()
    r.boundaries = []
    r.centroid_lat = 12.0
    r.centroid_lon = 77.0
    return r


_VERSION_ID = "ver_abc"
_PROJECT_ID = "prj_xyz"
_KMZ_KEY = f"projects/{_PROJECT_ID}/versions/{_VERSION_ID}/input.kmz"
_EXPECTED_PREFIX = f"projects/{_PROJECT_ID}/versions/{_VERSION_ID}"


def _base_patches(extra_patches=None):
    """Common context managers for all tests."""
    patches = [
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})),
        patch("handlers.mark_layout_processing"),
        patch("handlers.mark_layout_complete"),
        patch("handlers.mark_layout_failed"),
        patch("handlers.download_from_s3"),
        patch("handlers.upload_to_s3"),
        patch("handlers.parse_kmz", return_value=_make_parse_result()),
        patch("handlers.run_layout_multi", return_value=[]),
        patch("handlers.place_string_inverters"),
        patch("handlers.place_lightning_arresters"),
        patch("handlers.export_kmz"),
        patch("handlers.export_svg"),
        patch("handlers.export_dxf"),
        patch.dict(os.environ, {"S3_BUCKET": "test-bucket"}),
    ]
    return patches


def test_handle_layout_job_reads_version_from_db():
    """get_version is called with the version_id."""
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})) as mock_gv,
        patch("handlers.mark_layout_processing"),
        patch("handlers.mark_layout_complete"),
        patch("handlers.download_from_s3"),
        patch("handlers.upload_to_s3"),
        patch("handlers.parse_kmz", return_value=_make_parse_result()),
        patch("handlers.run_layout_multi", return_value=[]),
        patch("handlers.place_string_inverters"),
        patch("handlers.place_lightning_arresters"),
        patch("handlers.export_kmz"),
        patch("handlers.export_svg"),
        patch("handlers.export_dxf"),
        patch.dict(os.environ, {"S3_BUCKET": "test-bucket"}),
    ):
        handle_layout_job(_VERSION_ID)

    mock_gv.assert_called_once_with(_VERSION_ID)


def test_handle_layout_job_transitions_processing_then_complete():
    """Happy path: marks PROCESSING before work, COMPLETE after."""
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})),
        patch("handlers.mark_layout_processing") as mock_proc,
        patch("handlers.mark_layout_complete") as mock_complete,
        patch("handlers.mark_layout_failed") as mock_failed,
        patch("handlers.download_from_s3"),
        patch("handlers.upload_to_s3"),
        patch("handlers.parse_kmz", return_value=_make_parse_result()),
        patch("handlers.run_layout_multi", return_value=[]),
        patch("handlers.place_string_inverters"),
        patch("handlers.place_lightning_arresters"),
        patch("handlers.export_kmz"),
        patch("handlers.export_svg"),
        patch("handlers.export_dxf"),
        patch.dict(os.environ, {"S3_BUCKET": "test-bucket"}),
    ):
        handle_layout_job(_VERSION_ID)

    mock_proc.assert_called_once_with(_VERSION_ID)
    mock_complete.assert_called_once()
    assert mock_complete.call_args[0][0] == _VERSION_ID
    mock_failed.assert_not_called()


def test_handle_layout_job_uploads_three_artifacts_with_correct_prefix():
    """Three S3 uploads go to projects/{project_id}/versions/{version_id}/."""
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})),
        patch("handlers.mark_layout_processing"),
        patch("handlers.mark_layout_complete"),
        patch("handlers.download_from_s3"),
        patch("handlers.upload_to_s3") as mock_ul,
        patch("handlers.parse_kmz", return_value=_make_parse_result()),
        patch("handlers.run_layout_multi", return_value=[]),
        patch("handlers.place_string_inverters"),
        patch("handlers.place_lightning_arresters"),
        patch("handlers.export_kmz"),
        patch("handlers.export_svg"),
        patch("handlers.export_dxf"),
        patch.dict(os.environ, {"S3_BUCKET": "test-bucket"}),
    ):
        handle_layout_job(_VERSION_ID)

    assert mock_ul.call_count == 3
    uploaded_keys = [c[0][2] for c in mock_ul.call_args_list]
    assert f"{_EXPECTED_PREFIX}/layout.kmz" in uploaded_keys
    assert f"{_EXPECTED_PREFIX}/layout.svg" in uploaded_keys
    assert f"{_EXPECTED_PREFIX}/layout.dxf" in uploaded_keys


def test_handle_layout_job_marks_failed_and_reraises_on_error():
    """If any step raises, job is marked FAILED and the exception propagates."""
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})),
        patch("handlers.mark_layout_processing"),
        patch("handlers.mark_layout_failed") as mock_failed,
        patch("handlers.mark_layout_complete") as mock_complete,
        patch(
            "handlers.download_from_s3",
            side_effect=RuntimeError("bucket not found"),
        ),
        patch.dict(os.environ, {"S3_BUCKET": "test-bucket"}),
    ):
        with pytest.raises(RuntimeError, match="bucket not found"):
            handle_layout_job(_VERSION_ID)

    mock_failed.assert_called_once()
    assert mock_failed.call_args[0][0] == _VERSION_ID
    assert "bucket not found" in mock_failed.call_args[0][1]
    mock_complete.assert_not_called()
```

Update `apps/layout-engine/src/tests/test_server.py` — change `test_post_layout_returns_202_accepted` to send only `version_id`:

```python
def test_post_layout_returns_202_accepted():
    """POST /layout dispatches a background job and returns 202 immediately."""
    server = HTTPServer(("127.0.0.1", 0), LayoutEngineHandler)
    port = server.server_address[1]

    t = threading.Thread(target=server.handle_request)
    t.daemon = True
    t.start()

    body = json.dumps({"version_id": "ver_abc123"}).encode()

    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/layout",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )

    with patch("server.handle_layout_job"):
        with urllib.request.urlopen(req, timeout=10) as resp:
            assert resp.status == 202
            data = json.loads(resp.read())
            assert data == {"accepted": True}

    t.join(timeout=3)
```

- [ ] **Step 3.6: Write failing test for `lambda_handler`**

Create `apps/layout-engine/src/tests/test_lambda_handler.py`:

```python
"""
Tests for lambda_handler — SQS event parsing and dispatch.
"""
import json
from unittest.mock import MagicMock, patch

import lambda_handler


def test_handler_calls_handle_layout_job_once_per_record():
    """Each SQS record results in one handle_layout_job call with correct version_id."""
    event = {
        "Records": [
            {"body": json.dumps({"version_id": "ver_abc123"})},
        ]
    }
    with patch("lambda_handler.handle_layout_job") as mock_job:
        lambda_handler.handler(event, MagicMock())

    mock_job.assert_called_once_with("ver_abc123")


def test_handler_processes_multiple_records():
    """Two records → two calls, each with the correct version_id."""
    event = {
        "Records": [
            {"body": json.dumps({"version_id": "ver_aaa"})},
            {"body": json.dumps({"version_id": "ver_bbb"})},
        ]
    }
    with patch("lambda_handler.handle_layout_job") as mock_job:
        lambda_handler.handler(event, MagicMock())

    assert mock_job.call_count == 2
    mock_job.assert_any_call("ver_aaa")
    mock_job.assert_any_call("ver_bbb")
```

- [ ] **Step 3.7: Run new tests — verify they fail**

```bash
cd apps/layout-engine && uv run pytest \
  src/tests/test_handlers_prod.py \
  src/tests/test_server.py::test_post_layout_returns_202_accepted \
  src/tests/test_lambda_handler.py \
  -v
```

Expected: `FAILED` — handlers tests fail due to wrong `handle_layout_job` signature; lambda_handler tests fail due to missing module.

- [ ] **Step 3.8: Update `handlers.py` — new `handle_layout_job` signature**

Replace the entire `handle_layout_job` function in `apps/layout-engine/src/handlers.py`.

First, update the import line at the top (add `get_version`):

```python
from db_client import get_version, mark_layout_complete, mark_layout_failed, mark_layout_processing
```

Then replace the `handle_layout_job` function body:

```python
def handle_layout_job(version_id: str) -> None:
    """
    Spike 3 production contract.

    Reads project_id, kmz_s3_key, and input_snapshot from DB via get_version.
    Downloads input KMZ from S3, runs layout, uploads artifacts to S3,
    and updates layout_jobs + versions status in DB.

    Output S3 prefix: projects/{project_id}/versions/{version_id}/

    Raises the original exception after marking the job FAILED.

    Env:
      S3_BUCKET — bucket for both input and output
    """
    project_id, kmz_s3_key, input_snapshot = get_version(version_id)
    bucket = os.environ["S3_BUCKET"]
    output_prefix = f"projects/{project_id}/versions/{version_id}"

    mark_layout_processing(version_id)

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            kmz_local = os.path.join(tmpdir, "input.kmz")
            download_from_s3(bucket, kmz_s3_key, kmz_local)

            params = _params_from_dict(input_snapshot)
            parse_result = parse_kmz(kmz_local)
            results = run_layout_multi(
                parse_result.boundaries,
                params,
                parse_result.centroid_lat,
                parse_result.centroid_lon,
            )

            for r in results:
                place_string_inverters(r, params)
                place_lightning_arresters(r, params)

            kmz_out = os.path.join(tmpdir, "layout.kmz")
            svg_out = os.path.join(tmpdir, "layout.svg")
            dxf_out = os.path.join(tmpdir, "layout.dxf")

            export_kmz(results, params, kmz_out)
            export_svg(results, svg_out)
            export_dxf(results, params, dxf_out)

            kmz_key = f"{output_prefix}/layout.kmz"
            svg_key = f"{output_prefix}/layout.svg"
            dxf_key = f"{output_prefix}/layout.dxf"

            upload_to_s3(bucket, kmz_out, kmz_key)
            upload_to_s3(bucket, svg_out, svg_key)
            upload_to_s3(bucket, dxf_out, dxf_key)

            stats = _build_stats(results)

        mark_layout_complete(version_id, kmz_key, svg_key, dxf_key, stats)

    except Exception as exc:
        mark_layout_failed(version_id, str(exc))
        raise
```

- [ ] **Step 3.9: Update `server.py` — simplified POST body**

In `apps/layout-engine/src/server.py`, replace the `do_POST` handler body for the `/layout` path:

```python
    def do_POST(self):
        if self.path == "/layout":
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))

            version_id = payload["version_id"]

            t = threading.Thread(
                target=handle_layout_job,
                args=(version_id,),
                daemon=True,
            )
            t.start()

            body = json.dumps({"accepted": True}).encode()
            self.send_response(202)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()
```

- [ ] **Step 3.10: Create `lambda_handler.py`**

Create `apps/layout-engine/src/lambda_handler.py`:

```python
"""Lambda entrypoint for SQS-triggered layout jobs.

Each SQS record body is a JSON object: {"version_id": "ver_..."}
One record per invocation (batch size = 1 on the event source mapping).
"""
import json

from handlers import handle_layout_job


def handler(event, context):
    for record in event["Records"]:
        payload = json.loads(record["body"])
        handle_layout_job(payload["version_id"])
```

- [ ] **Step 3.11: Run all Python tests — verify they pass**

```bash
cd apps/layout-engine && uv run pytest -v
```

Expected: all tests pass. Confirm test count includes the new tests.

- [ ] **Step 3.12: Run lint**

```bash
cd apps/layout-engine && uv run ruff check src/
```

Expected: `All checks passed.`

- [ ] **Step 3.13: Run all gates from repo root**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all four pass.

- [ ] **Step 3.14: Commit**

```bash
git add \
  apps/layout-engine/src/db_client.py \
  apps/layout-engine/src/handlers.py \
  apps/layout-engine/src/server.py \
  apps/layout-engine/src/lambda_handler.py \
  apps/layout-engine/src/tests/test_db_client.py \
  apps/layout-engine/src/tests/test_handlers_prod.py \
  apps/layout-engine/src/tests/test_server.py \
  apps/layout-engine/src/tests/test_lambda_handler.py
git commit -m "feat(3c): add get_version, refactor handle_layout_job, add lambda_handler"
```

- [ ] **Step 3.15: Push and verify CI**

```bash
git push -u origin feat/spike3-lambda-sqs
```

Open PR → CI (`ci.yml`) must pass: lint, typecheck, test, build.

---

**Sub-spike 3c Definition of Done (human verification):**
- [ ] All unit tests pass locally (`uv run pytest -v`)
- [ ] All 4 gates pass from repo root
- [ ] CI passes on the PR
- [ ] Human invokes Lambda directly with a test payload to confirm it runs:
  ```bash
  aws lambda invoke \
    --function-name layout_engine_lambda_prod \
    --payload '{"Records":[{"body":"{\"version_id\":\"<real_version_id>\"}"}]}' \
    --region ap-south-1 \
    /tmp/lambda-response.json
  cat /tmp/lambda-response.json
  ```
  Use a real `version_id` with a LayoutJob in QUEUED state.
  Expected: Lambda invokes without error; DB transitions QUEUED → PROCESSING → COMPLETE; artifacts appear in S3.

---

## Task 4 (Sub-spike 3d): Hono API — Dispatch wiring (HTTP + SQS) + KMZ path fix

**Scope:** All TypeScript changes: install `@aws-sdk/client-sqs`, update `env.ts`, create `lib/sqs.ts` and `lib/layout-engine.ts`, update `projects.service.ts` with correct KMZ S3 path and dispatch logic, update tests.

**Files:**
- Modify: `apps/api/src/env.ts`
- Create: `apps/api/src/lib/sqs.ts`
- Create: `apps/api/src/lib/layout-engine.ts`
- Modify: `apps/api/src/modules/projects/projects.service.ts`
- Modify: `apps/api/src/modules/projects/projects.test.ts`

---

- [ ] **Step 4.1: Install `@aws-sdk/client-sqs`**

```bash
cd apps/api && bun add @aws-sdk/client-sqs
```

Expected: `bun.lock` and `package.json` updated with `@aws-sdk/client-sqs`.

- [ ] **Step 4.2: Update `env.ts` — add new env vars**

In `apps/api/src/env.ts`, add three new optional fields to `EnvSchema`:

```typescript
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.string().default("3001"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  CORS_ORIGINS: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  // S3 — optional for graceful degradation
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  // Layout engine dispatch
  USE_LOCAL_ENV: z.string().optional(),
  LAYOUT_ENGINE_URL: z.string().default("http://localhost:8000"),
  SQS_LAYOUT_QUEUE_URL: z.string().optional(),
})
```

- [ ] **Step 4.3: Create `lib/sqs.ts`**

Create `apps/api/src/lib/sqs.ts`:

```typescript
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { env } from "../env.js"

const client = new SQSClient({
  region: env.AWS_REGION ?? "ap-south-1",
  ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
})

export async function publishLayoutJob(versionId: string): Promise<void> {
  if (!env.SQS_LAYOUT_QUEUE_URL) {
    throw new Error("SQS_LAYOUT_QUEUE_URL is not set")
  }
  await client.send(
    new SendMessageCommand({
      QueueUrl: env.SQS_LAYOUT_QUEUE_URL,
      MessageBody: JSON.stringify({ version_id: versionId }),
    }),
  )
}
```

- [ ] **Step 4.4: Create `lib/layout-engine.ts`**

Create `apps/api/src/lib/layout-engine.ts`:

```typescript
import { env } from "../env.js"

export function dispatchLayoutJobHttp(versionId: string): void {
  const url = `${env.LAYOUT_ENGINE_URL}/layout`
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version_id: versionId }),
  }).catch((err) => {
    console.error("layout engine HTTP dispatch failed", err)
  })
  // intentionally not awaited — fire-and-forget
}
```

- [ ] **Step 4.5: Write failing tests for dispatch behaviour**

In `apps/api/src/modules/projects/projects.test.ts`, add the following at the top of the file (after the existing `mock` imports, before the existing `mock.module` calls):

```typescript
const mockDispatchLayoutJobHttp = mock(() => undefined)
const mockPublishLayoutJob = mock(() => Promise.resolve())

mock.module("../../lib/layout-engine.js", () => ({
  dispatchLayoutJobHttp: mockDispatchLayoutJobHttp,
}))

mock.module("../../lib/sqs.js", () => ({
  publishLayoutJob: mockPublishLayoutJob,
}))
```

Also add `mockVersionUpdate` to the db section. In the `mock.module("../../lib/db.js", ...)` call, add `version.update` to the version object:

```typescript
const mockVersionUpdate = mock(() => Promise.resolve(mockDbVersion))

// In the mock.module call, add to the version object:
version: {
  findUnique: mockVersionFindUnique,
  create: mockVersionCreate,
  count: mockVersionCount,
  update: mockVersionUpdate,  // ← add this line
},
```

Then add a new test suite at the end of the file:

```typescript
// ─── createVersion dispatch ────────────────────────────────────────────────────

describe("createVersion dispatch", () => {
  beforeEach(() => {
    mockProjectFindUnique.mockClear()
    mockVersionCreate.mockClear()
    mockVersionUpdate.mockClear()
    mockVersionCount.mockClear()
    mockLayoutJobCreate.mockClear()
    mockEnergyJobCreate.mockClear()
    mockDispatchLayoutJobHttp.mockClear()
    mockPublishLayoutJob.mockClear()
  })

  test("calls dispatchLayoutJobHttp when USE_LOCAL_ENV is 'true'", async () => {
    const prev = process.env.USE_LOCAL_ENV
    process.env.USE_LOCAL_ENV = "true"
    try {
      await createVersion(mockDbProject.userId, {
        projectId: mockDbProject.id,
        inputSnapshot: {},
      })
    } finally {
      process.env.USE_LOCAL_ENV = prev
    }
    expect(mockDispatchLayoutJobHttp).toHaveBeenCalledTimes(1)
    expect(mockDispatchLayoutJobHttp).toHaveBeenCalledWith(mockDbVersion.id)
    expect(mockPublishLayoutJob).not.toHaveBeenCalled()
  })

  test("calls publishLayoutJob when USE_LOCAL_ENV is not 'true'", async () => {
    const prev = process.env.USE_LOCAL_ENV
    delete process.env.USE_LOCAL_ENV
    try {
      await createVersion(mockDbProject.userId, {
        projectId: mockDbProject.id,
        inputSnapshot: {},
      })
    } finally {
      if (prev !== undefined) process.env.USE_LOCAL_ENV = prev
    }
    expect(mockPublishLayoutJob).toHaveBeenCalledTimes(1)
    expect(mockPublishLayoutJob).toHaveBeenCalledWith(mockDbVersion.id)
    expect(mockDispatchLayoutJobHttp).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4.6: Run new tests — verify they fail**

```bash
cd apps/api && bun test src/modules/projects/projects.test.ts
```

Expected: dispatch tests fail (functions not imported in service yet).

- [ ] **Step 4.7: Update `projects.service.ts` — KMZ path fix + dispatch**

Replace the entire `createVersion` function in `apps/api/src/modules/projects/projects.service.ts`:

```typescript
import { dispatchLayoutJobHttp } from "../../lib/layout-engine.js"
import { publishLayoutJob } from "../../lib/sqs.js"
```

Add these two imports at the top of the file (after the existing imports).

Then replace the `createVersion` function:

```typescript
export async function createVersion(
  userId: string,
  input: CreateVersionInput & { kmzBuffer?: Buffer },
): Promise<VersionDetail> {
  await requireProjectOwnership(input.projectId, userId)

  const count = await db.version.count({ where: { projectId: input.projectId } })

  let version: Awaited<ReturnType<typeof db.version.create>>
  try {
    version = await db.version.create({
      data: {
        projectId: input.projectId,
        number: count + 1,
        label: input.label ?? null,
        kmzS3Key: null,
        inputSnapshot: JSON.parse(JSON.stringify(input.inputSnapshot)),
      },
    })
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002"
    ) {
      throw new ConflictError("Version number conflict — please retry")
    }
    throw err
  }

  let kmzS3Key: string | null = null
  if (input.kmzBuffer) {
    kmzS3Key = `projects/${input.projectId}/versions/${version.id}/input.kmz`
    await uploadToS3(input.kmzBuffer, kmzS3Key, "application/vnd.google-earth.kmz")
    await db.version.update({
      where: { id: version.id },
      data: { kmzS3Key },
    })
  }

  const [layoutJob, energyJob] = await Promise.all([
    db.layoutJob.create({ data: { versionId: version.id } }),
    db.energyJob.create({ data: { versionId: version.id } }),
  ])

  if (process.env.USE_LOCAL_ENV === "true") {
    dispatchLayoutJobHttp(version.id)
  } else {
    publishLayoutJob(version.id).catch((err) => {
      console.error("SQS publish failed", err)
    })
  }

  return shapeVersion({ ...version, kmzS3Key, layoutJob, energyJob })
}
```

- [ ] **Step 4.8: Run all tests — verify they pass**

```bash
cd apps/api && bun test
```

Expected: all tests pass including the new dispatch tests.

- [ ] **Step 4.9: Run all gates from repo root**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all four pass.

- [ ] **Step 4.10: Update root `.env` with local dev vars for Hono API**

Add to the repo root `.env` file (gitignored):

```bash
USE_LOCAL_ENV=true
LAYOUT_ENGINE_URL=http://localhost:8000
```

Note: `SQS_LAYOUT_QUEUE_URL` is only needed in prod — do not add to local `.env`.

- [ ] **Step 4.11: Commit**

```bash
git add \
  apps/api/package.json \
  bun.lock \
  apps/api/src/env.ts \
  apps/api/src/lib/sqs.ts \
  apps/api/src/lib/layout-engine.ts \
  apps/api/src/modules/projects/projects.service.ts \
  apps/api/src/modules/projects/projects.test.ts
git commit -m "feat(3d): add SQS + HTTP dispatch, fix KMZ S3 path to versions/{versionId}/input.kmz"
```

- [ ] **Step 4.12: Push and verify CI**

```bash
git push
```

CI must pass on the PR.

---

**Sub-spike 3d Definition of Done (human verification):**
- [ ] Start layout engine locally: `cd apps/layout-engine && bun run dev`
- [ ] Start Hono API locally: `bun run dev` from repo root
- [ ] Create a project and submit a version via the API (or curl) with a real KMZ
- [ ] Confirm layout engine terminal shows it received the job (PROCESSING logged)
- [ ] Confirm DB transitions QUEUED → PROCESSING → COMPLETE (check with `bun run db:studio`)
- [ ] Confirm 3 artifacts in S3 at `projects/{projectId}/versions/{versionId}/` prefix (check with `aws s3 ls s3://renewable-energy-local-artifacts/projects/ --recursive`)
- [ ] Confirm KMZ input is at `projects/{projectId}/versions/{versionId}/input.kmz` (not old `kmz/{uuid}.kmz` path)

---

## Task 5 (Sub-spike 3e): GitHub Actions — Build and Deploy Workflows

**Scope:** Add two GitHub Actions workflows: one that builds the Docker image and pushes to ECR on every push/PR, one that manually deploys to `layout_engine_lambda_prod`.

**Files:**
- Create: `.github/workflows/build-layout-engine.yml`
- Create: `.github/workflows/deploy-layout-engine.yml`

---

- [ ] **Step 5.1: Create `build-layout-engine.yml`**

Create `.github/workflows/build-layout-engine.yml`:

```yaml
name: Build Layout Engine

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  id-token: write
  contents: read

concurrency:
  group: layout-engine-build-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: Build & Push Docker Image (arm64)
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up QEMU (arm64 emulation)
        uses: docker/setup-qemu-action@v3
        with:
          platforms: linux/arm64

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: apps/layout-engine
          platforms: linux/arm64
          push: ${{ github.event_name != 'pull_request' }}
          provenance: false
          tags: |
            ${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.${{ vars.AWS_REGION }}.amazonaws.com/renewable-energy/layout-engine:${{ github.sha }}
            ${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.${{ vars.AWS_REGION }}.amazonaws.com/renewable-energy/layout-engine:prod
          cache-from: type=registry,ref=${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.${{ vars.AWS_REGION }}.amazonaws.com/renewable-energy/layout-engine:buildcache
          cache-to: type=registry,ref=${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.${{ vars.AWS_REGION }}.amazonaws.com/renewable-energy/layout-engine:buildcache,mode=max
```

Note: `push: ${{ github.event_name != 'pull_request' }}` — on PRs, the image is built but not pushed (cache is still populated). On push to main, the image is pushed with `sha` and `prod` tags.

- [ ] **Step 5.2: Create `deploy-layout-engine.yml`**

Create `.github/workflows/deploy-layout-engine.yml`:

```yaml
name: Deploy Layout Engine

on:
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    name: Deploy to Lambda (prod)
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Update Lambda function code
        run: |
          aws lambda update-function-code \
            --function-name layout_engine_lambda_prod \
            --image-uri ${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.${{ vars.AWS_REGION }}.amazonaws.com/renewable-energy/layout-engine:prod \
            --region ${{ vars.AWS_REGION }}

      - name: Wait for Lambda update to complete
        run: |
          aws lambda wait function-updated \
            --function-name layout_engine_lambda_prod \
            --region ${{ vars.AWS_REGION }}

      - name: Confirm deployed image
        run: |
          aws lambda get-function \
            --function-name layout_engine_lambda_prod \
            --region ${{ vars.AWS_REGION }} \
            --query 'Code.ImageUri' \
            --output text
```

- [ ] **Step 5.3: Run all gates from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all four pass (workflow YAML files don't affect any gate).

- [ ] **Step 5.4: Commit**

```bash
git add \
  .github/workflows/build-layout-engine.yml \
  .github/workflows/deploy-layout-engine.yml
git commit -m "feat(3e): add GitHub Actions CI/CD for layout engine Docker image"
```

- [ ] **Step 5.5: Push and verify CI build workflow**

```bash
git push
```

On the PR, confirm that **both** CI workflows appear:
- `CI` (existing `ci.yml`) — must pass
- `Build Layout Engine` (`build-layout-engine.yml`) — must pass (build-only on PR, no push)

- [ ] **Step 5.6: Merge PR to main**

Merge `feat/spike3-lambda-sqs` → `main` via PR. After merge, confirm:
- `Build Layout Engine` runs on push to main
- Image is pushed to ECR with `prod` and `{sha}` tags

Check ECR:
```bash
aws ecr describe-images \
  --repository-name renewable-energy/layout-engine \
  --region ap-south-1 \
  --query 'sort_by(imageDetails, &imagePushedAt)[-1]'
```

Expected: image with `prod` tag pushed within the last few minutes.

- [ ] **Step 5.7: Test deploy workflow manually**

In GitHub → Actions → `Deploy Layout Engine` → Run workflow → Confirm it runs.

Expected: Lambda updated, `wait function-updated` completes, final step prints the ECR image URI.

---

**Sub-spike 3e Definition of Done (human verification):**
- [ ] PR build: `Build Layout Engine` passes (build-only, no push) on the PR
- [ ] Main branch push: image pushed to ECR with `prod` + `{sha}` tags
- [ ] Deploy workflow runs successfully, Lambda updated to latest prod image
- [ ] `aws lambda get-function --function-name layout_engine_lambda_prod --region ap-south-1` shows the new image URI

---

## Task 6 (Sub-spike 3f): Production End-to-End Verification

**Scope:** Human-led verification that the full prod pipeline works: Hono API → SQS → Lambda → S3 artifacts → DB COMPLETE.

**No code changes in this sub-spike.** This is a verification-only task.

---

- [ ] **Step 6.1: Confirm Vercel prod deployment is current**

Check Vercel dashboard — latest deployment on `main` must include the Spike 3 Hono API changes (`USE_LOCAL_ENV`, dispatch logic). If not, trigger a deployment.

- [ ] **Step 6.2: Confirm prod env vars in Vercel**

In Vercel dashboard → `@renewable-energy/api` → Settings → Environment Variables, confirm:
- `USE_LOCAL_ENV` = `false` (or not set — absence = prod path)
- `SQS_LAYOUT_QUEUE_URL` = `https://sqs.ap-south-1.amazonaws.com/378240665051/re_layout_queue_prod`
- `AWS_REGION` = `ap-south-1`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` set (for SQS publish)

If any are missing, add them and redeploy.

- [ ] **Step 6.3: Create a project via prod API**

```bash
curl -s -X POST https://<prod-api-url>/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <prod-clerk-token>" \
  -d '{"name": "Spike 3 Prod Test"}' | jq .
```

Note the returned `id` (project ID).

- [ ] **Step 6.4: Submit a version with a real KMZ**

```bash
curl -s -X POST https://<prod-api-url>/projects/<projectId>/versions \
  -H "Authorization: Bearer <prod-clerk-token>" \
  -F "kmz=@/path/to/real-site.kmz" \
  -F 'inputSnapshot={}' | jq .
```

Note the returned `id` (version ID) and confirm `status: "queued"` in the response.

- [ ] **Step 6.5: Confirm SQS message enqueued**

In AWS console → SQS → `re_layout_queue_prod` → "Send and receive messages" → Poll. Alternatively:

```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.ap-south-1.amazonaws.com/378240665051/re_layout_queue_prod \
  --attribute-names ApproximateNumberOfMessages \
  --region ap-south-1
```

Expected: `ApproximateNumberOfMessages` = 1 (briefly, before Lambda picks it up).

- [ ] **Step 6.6: Wait for Lambda to process the job (up to 3 minutes)**

Poll DB via `bun run db:studio` or:

```bash
# Check version status
psql "<prod-rds-url>" -c "SELECT id, status FROM versions WHERE id = '<versionId>';"
```

Expected transitions: `QUEUED → PROCESSING → COMPLETE`

- [ ] **Step 6.7: Confirm artifacts in prod S3**

```bash
aws s3 ls \
  s3://renewable-energy-prod-artifacts/projects/<projectId>/versions/<versionId>/ \
  --region ap-south-1
```

Expected: three files listed:
```
layout.dxf
layout.kmz
layout.svg
```

- [ ] **Step 6.8: Confirm statsJson in DB**

```bash
psql "<prod-rds-url>" -c \
  "SELECT lj.status, lj.\"statsJson\" FROM layout_jobs lj WHERE lj.\"versionId\" = '<versionId>';"
```

Expected: `status = COMPLETE`, `statsJson` contains `total_tables`, `total_capacity_mwp`, etc.

- [ ] **Step 6.9: Confirm input KMZ at correct path**

```bash
aws s3 ls \
  s3://renewable-energy-prod-artifacts/projects/<projectId>/versions/<versionId>/input.kmz \
  --region ap-south-1
```

Expected: file exists at `versions/{versionId}/input.kmz` (not at old `kmz/{uuid}.kmz` path).

- [ ] **Step 6.10: Update spike plan status**

In `docs/initiatives/pv-layout-spike-plan.md`, change Spike 3 status from `planned` to `complete` and add the date:

```markdown
**Status:** complete — 2026-04-19
```

Commit:
```bash
git add docs/initiatives/pv-layout-spike-plan.md
git commit -m "docs: mark Spike 3 complete — Lambda + SQS prod verified end-to-end"
git push
```

---

**Sub-spike 3f Definition of Done:**
- [ ] Version status = COMPLETE in prod DB
- [ ] 3 artifacts (layout.kmz, layout.svg, layout.dxf) in `renewable-energy-prod-artifacts` at correct prefix
- [ ] Input KMZ at `projects/{projectId}/versions/{versionId}/input.kmz`
- [ ] Spike 3 status updated to `complete` in spike plan and committed
