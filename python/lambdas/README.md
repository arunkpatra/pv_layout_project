# Lambdas

This directory holds AWS Lambda container-image source for cloud-offload compute. One folder per Lambda. Each Lambda is its own deployment artifact with its own dependency graph and its own memory/timeout config (D10).

**Spec source of truth:** `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md` (rows C3 + C4 onward; locked decisions D5, D10, D22).

## Folder layout

```
python/lambdas/<purpose>/
├── pyproject.toml              # uv package, depends on pvlayout_core via [tool.uv.sources] path dep
├── Dockerfile                  # build context = REPO ROOT (per D5)
├── .dockerignore
├── README.md                   # one-paragraph purpose + lifecycle note
├── <purpose>_lambda/
│   ├── __init__.py
│   └── handler.py              # entry point: handler(event, context) → dict
└── tests/
    ├── __init__.py
    └── test_handler.py
```

`<purpose>` is `kebab-case` for the directory; `<purpose>_lambda` is `snake_case` for the Python package (Python identifiers can't contain hyphens).

## Naming convention (per spec §9 row C3 v1.2)

| Surface | Pattern | Example |
|---|---|---|
| Lambda function | `solarlayout-<purpose>-<env>` | `solarlayout-parse-kmz-staging` |
| ECR repository | `solarlayout/<purpose>` | `solarlayout/parse-kmz` |
| SQS queue | `solarlayout-<purpose>-jobs` (+ `-dlq`) | `solarlayout-compute-layout-jobs` |
| Image tag | `<git-sha>` (always); `latest` (only on `main`) | `solarlayout/parse-kmz:6c42eb6...` |

`<env>` ∈ `{staging, prod}` (today; future ladder may add others). `<git-sha>` is the full GitHub Actions `${{ github.sha }}` (40 hex chars).

## Architecture

All Lambdas run on **AWS Graviton (arm64)** — base image `public.ecr.aws/lambda/python:3.12` (multi-arch manifest; `--platform linux/arm64` selects the arm64 variant). Justification: cost-per-invocation lower at equal performance for the workloads in this arc; matches the existing `layout_engine_lambda_prod` legacy stack's choice; locks the platform once for the whole arc so we don't re-debate per Lambda.

## Dependency on `pvlayout_core`

Every Lambda in this arc consumes the standalone `pvlayout_core` package (extracted in C2) — the engineering asset (D4 + D6).

**Locally** (`uv sync` for dev + tests): the Lambda's `pyproject.toml` declares an editable path-dep:

```toml
[project]
name = "<purpose>-lambda"
requires-python = ">=3.12"
dependencies = [
  "pvlayout-core",
  # ...handler-specific deps
]

[tool.uv.sources]
pvlayout-core = { path = "../../pvlayout_core", editable = true }
```

**In Docker** (per D5 — no wheel registry): build context is the repo root; the Dockerfile `COPY`s `python/pvlayout_core` into the image and `pip install`s it. See template below.

## Dockerfile template (canonical)

Copy this body into `python/lambdas/<purpose>/Dockerfile` and adjust the `<purpose>` placeholders. The file MUST be built from the repo root (`docker buildx build -f python/lambdas/<purpose>/Dockerfile .`) — never from the Lambda's own directory — because we COPY `python/pvlayout_core` from a sibling path.

```dockerfile
# syntax=docker/dockerfile:1
# Base: AWS Lambda Python 3.12 runtime, arm64 (Graviton)
FROM public.ecr.aws/lambda/python:3.12

# Build context is repo root (per D5). COPY pvlayout_core sibling and install.
COPY python/pvlayout_core /opt/pvlayout_core
RUN pip install --no-cache-dir /opt/pvlayout_core

# Lambda-specific code into LAMBDA_TASK_ROOT (/var/task by default).
COPY python/lambdas/<purpose>/<purpose>_lambda ${LAMBDA_TASK_ROOT}/<purpose>_lambda
COPY python/lambdas/<purpose>/pyproject.toml ${LAMBDA_TASK_ROOT}/pyproject.toml

# Install Lambda's own deps (excluding pvlayout-core which is already installed above).
RUN pip install --no-cache-dir --no-deps -r <(python -c "import tomllib; print('\n'.join(d for d in tomllib.loads(open('${LAMBDA_TASK_ROOT}/pyproject.toml','rb').read().decode()).get('project',{}).get('dependencies',[]) if not d.startswith('pvlayout-core')))") || true

# Bake the git SHA at build time so the running container can report engineVersion (D21).
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

CMD [ "<purpose>_lambda.handler.handler" ]
```

The `pip install --no-deps` line uses `tomllib` to parse `pyproject.toml` and extract dependency strings, skipping `pvlayout-core` (already installed). The `|| true` is defensive in case `[project.dependencies]` is empty.

## Adding a new Lambda

1. `mkdir python/lambdas/<purpose>` and create the layout above.
2. Edit `<purpose>` placeholders in the Dockerfile.
3. Add the matrix entry in `.github/workflows/build-lambdas.yml` (auto-discovery via `find python/lambdas -mindepth 1 -maxdepth 1 -type d` is also acceptable — see workflow comments).
4. `aws ecr create-repository --repository-name solarlayout/<purpose> --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true --region ap-south-1`.
5. Update `docs/AWS_RESOURCES.md` with the new ECR entry.

## Build context rule (D5)

The Dockerfile's build context is **always the repo root**. Always run `docker buildx build` from the repo root with `-f python/lambdas/<purpose>/Dockerfile`. The CI workflow enforces this. Building from inside `python/lambdas/<purpose>/` will fail because `COPY python/pvlayout_core` won't be reachable.

## Why this shape

- **One folder per Lambda** (D10): each Lambda is independently versionable, deployable, and reasoned-about. No mono-image dispatch.
- **`COPY` from monorepo, no wheel registry** (D5): we own the engine; we control its source tree; a wheel registry would add ceremony with no upside.
- **arm64 Graviton everywhere**: cost; consistency.
- **`<git-sha>` as the canonical image tag** (D21): every Run records its `Run.engineVersion` from the SHA the Lambda was built from. `latest` is a convenience; SHA is the truth.
- **Build context = repo root**: required for `COPY python/pvlayout_core`. Documented here so it isn't re-debated in every Lambda's Dockerfile review.
