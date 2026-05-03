# C3 — Lambda Monorepo Scaffolding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `python/lambdas/` monorepo conventions, AWS-side OIDC + ECR provisioning, and a CI matrix workflow that proves the GHA → AWS build/push plumbing end-to-end via a throwaway `smoketest` Lambda image landing in ECR with a SHA tag.

**Architecture:** Pure scaffolding row. Three concerns get bound to a clean shape that downstream rows (C4 `parse-kmz`, C5/C6/C8 `compute-layout`, C16 `detect-water`, C18 `compute-energy`) consume mechanically. (1) **Repo:** one folder per Lambda under `python/lambdas/<purpose>/`, owning its own `pyproject.toml` + `Dockerfile` + handler + tests; build context is repo root so the Dockerfile `COPY`s `python/pvlayout_core` and pip-installs it (per D5). (2) **AWS:** new GHA OIDC role `solarlayout-github-actions` (separate from the orphaned legacy `renewable-energy-github-actions`); ECR repos under `solarlayout/<purpose>` prefix; arm64 Graviton everywhere. (3) **CI:** `.github/workflows/build-lambdas.yml` matrix workflow auto-discovers Lambdas, builds arm64 images via buildx + QEMU, pushes to ECR tagged with the git SHA. The throwaway `smoketest` Lambda exercises the full plumbing in this row; C4 deletes it on its way in.

**Tech Stack:** Python 3.12, uv (path deps), Docker buildx (arm64 Graviton, base image `public.ecr.aws/lambda/python:3.12`), AWS IAM (OIDC via `token.actions.githubusercontent.com`), AWS ECR, GitHub Actions (`aws-actions/configure-aws-credentials@v4` + `aws-actions/amazon-ecr-login@v2` + `docker/setup-qemu-action@v3` + `docker/setup-buildx-action@v3` + `docker/build-push-action@v5`).

**Spec source:** `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md` row C3 (§9), locked decisions D5 + D10 + D22.

**Naming-convention reference (post v1.2 amendment, Phase 0):**
- Lambda fn: `solarlayout-<purpose>-<env>` (e.g., `solarlayout-parse-kmz-staging`)
- ECR repo: `solarlayout/<purpose>` (e.g., `solarlayout/parse-kmz`)
- SQS queue: `solarlayout-<purpose>-jobs` + `solarlayout-<purpose>-jobs-dlq`
- IAM role (GHA): `solarlayout-github-actions`

**AWS context (verified 2026-05-03 in `docs/AWS_RESOURCES.md`):**
- Account: `378240665051`
- Region: `ap-south-1` (Mumbai)
- Legacy OIDC provider for `token.actions.githubusercontent.com` is almost certainly already present (the orphaned `renewable-energy-github-actions` role uses it). Verify-then-create-if-missing.

**Operating model:** Phase 2 (AWS provisioning) is interactive — the implementing agent drafts each `aws` CLI command; **Arun pastes it into his terminal and reports back the actual output**. Agent confirms expected output before drafting the next command. Arun can hand off and let the agent run a command on his behalf at any point.

**Out of scope (per spec C3):**
- Real Lambda code (that's C4 `parse-kmz`).
- IaC (Terraform / CDK).
- SQS queue provisioning (C5).
- Lambda execution role (the runtime role each Lambda assumes — separate concern; first needed in C4 / C5).
- Production Lambda deploy.

---

## File Structure

**Create:**

- `docs/superpowers/plans/2026-05-03-c3-lambda-monorepo-scaffolding.md` — this plan
- `python/lambdas/README.md` — convention doc (folder layout, Dockerfile template, naming, dep-on-pvlayout_core pattern, build-context-is-repo-root note)
- `python/lambdas/smoketest/README.md` — one paragraph: "Throwaway. Delete in C4."
- `python/lambdas/smoketest/pyproject.toml` — uv package, depends on pvlayout_core via path
- `python/lambdas/smoketest/Dockerfile` — arm64 base, `COPY python/pvlayout_core` + `COPY python/lambdas/smoketest`, `pip install`, CMD points at handler
- `python/lambdas/smoketest/.dockerignore` — exclude `.venv`, `__pycache__`, `.pytest_cache`, `tests/`
- `python/lambdas/smoketest/smoketest_lambda/__init__.py` — empty package marker
- `python/lambdas/smoketest/smoketest_lambda/handler.py` — trivial handler
- `python/lambdas/smoketest/tests/__init__.py` — empty
- `python/lambdas/smoketest/tests/test_handler.py` — one pytest invoking handler
- `.github/workflows/build-lambdas.yml` — matrix workflow

**Modify:**

- `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md` — Phase 0 spec amendment v1.2 (C3 naming-convention prefix flip + §15 changelog row)
- `docs/AWS_RESOURCES.md` — append GHA OIDC section (new role) + ECR `solarlayout/smoketest` entry
- The C3 row itself — Status flip + `Plan:` + `Shipped:` lines on close (Phase 5)

---

## Task 1: Phase 0 — Spec amendment v1.2 (naming-convention prefix flip)

**Files:**
- Modify: `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md` (header version line; row C3 §9 Acceptance block; §15 changelog row)

This commit lands FIRST on the branch, separate from any code, per §12 protocol. No D-id is touched — this is row-text + changelog only.

- [ ] **Step 1: Update spec header version line**

In `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md`, find the header at the top:

```markdown
**Version:** v1.1 (2026-05-03 — deployment topology amendment; smoke protocol reality-aligned)
```

Replace with:

```markdown
**Version:** v1.2 (2026-05-03 — C3 naming-convention prefix flip to `solarlayout-*`)
```

- [ ] **Step 2: Update C3 row Acceptance naming-convention block**

In the same file, find the C3 row's Acceptance block (under `#### C3 — Lambda monorepo scaffolding`):

```
  - Naming convention recorded:
      Lambda fn:  pvlayout-<purpose>-<env>
      ECR repo:   pvlayout/<purpose>
      SQS queue:  pvlayout-<purpose>-jobs + -dlq
```

Replace with:

```
  - Naming convention recorded:
      Lambda fn:  solarlayout-<purpose>-<env>
      ECR repo:   solarlayout/<purpose>
      SQS queue:  solarlayout-<purpose>-jobs + -dlq
```

- [ ] **Step 3: Append v1.2 row to §15 changelog**

In §15 changelog, find the `v1.1` row in the table and append a new row directly below it:

```markdown
| **v1.2** | 2026-05-03 | Header version line; §9 row C3 Acceptance naming-convention block; this changelog. | C3 implementation discovered material spec-vs-reality drift via the `Open verifications` pass: the legacy `renewable-energy-github-actions` OIDC role + supporting AWS resources (`renewable-energy/layout-engine` ECR repo, `layout_engine_lambda_prod` Lambda, `re_layout_queue_prod` SQS) are already present in the account from the pre-merge stack — orphaned but not removed. Arun's call: leave the legacy stack alone, create a fresh `solarlayout-github-actions` OIDC role for the new repo, and unify the new-resource prefix on `solarlayout-*` for brand consistency with the existing S3 buckets. C3 row text is amended to record the new prefix on all three lines (Lambda fn, ECR, SQS); legacy resource ARNs are not touched. **No locked decision (D-id) was changed.** |
```

- [ ] **Step 4: Diff-review the spec file before committing**

Run:
```bash
git diff docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md
```

Expected: exactly three regions changed — header `Version:` line, C3 Acceptance naming-convention block (3 lines), and §15 table (one new row appended). No other diff.

- [ ] **Step 5: Commit Phase 0**

```bash
git add docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md
git commit -m "$(cat <<'EOF'
docs(spec): v1.2 — C3 naming-convention prefix to solarlayout-*

C3 implementation surfaced legacy renewable-energy/* AWS stack
already present in the account from the pre-merge era. Per Arun:
leave legacy alone, create fresh solarlayout-github-actions OIDC
role, and unify the new-resource prefix on solarlayout-* for
brand consistency with the existing S3 buckets.

C3 Acceptance naming-convention block flips:
- Lambda fn: pvlayout-<purpose>-<env> → solarlayout-<purpose>-<env>
- ECR repo:  pvlayout/<purpose>       → solarlayout/<purpose>
- SQS queue: pvlayout-<purpose>-jobs  → solarlayout-<purpose>-jobs

No locked decision (D-id) touched. Row-text + changelog only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit lands cleanly on `chore/c3-lambda-monorepo-scaffolding`. Verify with `git log -1`.

---

## Task 2: Phase 1.1 — `python/lambdas/README.md` convention doc

**Files:**
- Create: `python/lambdas/README.md`

This file is the canonical reference every downstream Lambda row consults. It documents folder layout, naming, dep pattern, Dockerfile template, build-context rule.

- [ ] **Step 1: Create `python/lambdas/` directory**

```bash
mkdir -p python/lambdas
```

- [ ] **Step 2: Write `python/lambdas/README.md`**

Create `python/lambdas/README.md` with this exact content:

````markdown
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
````

- [ ] **Step 3: Verify the README**

Run:
```bash
ls -la python/lambdas/
test -f python/lambdas/README.md && echo "README OK" || echo "MISSING"
wc -l python/lambdas/README.md
```

Expected: README present, ~100 lines.

- [ ] **Step 4: Commit Task 2**

```bash
git add python/lambdas/README.md
git commit -m "$(cat <<'EOF'
chore(c3): scaffold python/lambdas/ with convention README

Documents the per-Lambda folder layout, naming convention (post v1.2:
solarlayout-* prefixes), arm64 Graviton platform decision, dep-on-
pvlayout_core path-dep pattern (local) + COPY-into-Dockerfile pattern
(per D5), canonical Dockerfile template, and build-context-is-repo-
root rule.

Locks the shape so downstream Lambda rows (C4 parse-kmz, C6 compute-
layout, C16 detect-water) consume mechanically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Phase 1.2 — `smoketest` Lambda — pyproject.toml

**Files:**
- Create: `python/lambdas/smoketest/pyproject.toml`

- [ ] **Step 1: Create `smoketest` directory**

```bash
mkdir -p python/lambdas/smoketest/smoketest_lambda
mkdir -p python/lambdas/smoketest/tests
```

- [ ] **Step 2: Write `python/lambdas/smoketest/pyproject.toml`**

Create with this exact content:

```toml
[project]
name = "smoketest-lambda"
version = "0.0.0"
description = "Throwaway smoketest Lambda — proves the C3 build/push plumbing. Deleted in C4."
requires-python = ">=3.12"
dependencies = [
  "pvlayout-core",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["smoketest_lambda"]

[tool.uv.sources]
pvlayout-core = { path = "../../pvlayout_core", editable = true }
```

The `pvlayout-core` dep is intentional even for a smoketest — it proves the path-dep wiring works at `uv sync` time AND the Dockerfile's `COPY python/pvlayout_core` + `pip install` works at image-build time.

- [ ] **Step 3: Commit Task 3 (pyproject only — handler comes in Task 4 via TDD)**

```bash
git add python/lambdas/smoketest/pyproject.toml
git commit -m "$(cat <<'EOF'
chore(c3): smoketest pyproject.toml

Throwaway placeholder Lambda whose only job is to prove the C3
build/push plumbing end-to-end (image lands in solarlayout/smoketest
ECR with a SHA tag). pvlayout-core path-dep is intentional — exercises
the dep wiring locally and at Docker build time.

Deleted in C4 when parse-kmz arrives.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Phase 1.2 — `smoketest` handler (TDD)

**Files:**
- Create: `python/lambdas/smoketest/smoketest_lambda/__init__.py`
- Create: `python/lambdas/smoketest/tests/__init__.py`
- Create: `python/lambdas/smoketest/tests/test_handler.py` (write FIRST)
- Create: `python/lambdas/smoketest/smoketest_lambda/handler.py` (after test fails)

- [ ] **Step 1: Create empty `__init__.py` files**

```bash
touch python/lambdas/smoketest/smoketest_lambda/__init__.py
touch python/lambdas/smoketest/tests/__init__.py
```

- [ ] **Step 2: Write the failing test**

Create `python/lambdas/smoketest/tests/test_handler.py` with this exact content:

```python
"""Smoketest Lambda handler — verifies plumbing only.

This Lambda exists to prove the C3 monorepo build/push pipeline. It
imports pvlayout_core (to prove the path-dep wires correctly) and
returns a trivial JSON response carrying the GIT_SHA env var (which
the Dockerfile bakes at build time per D21's pattern).

Deleted in C4.
"""

from __future__ import annotations

import os

from smoketest_lambda.handler import handler


def test_handler_returns_ok():
    """Handler returns a dict with ok=True."""
    response = handler({}, None)
    assert isinstance(response, dict)
    assert response["ok"] is True


def test_handler_returns_engine_version_from_env():
    """Handler reads GIT_SHA from env and returns it as engine_version."""
    os.environ["GIT_SHA"] = "test-sha-abc123"
    try:
        response = handler({}, None)
        assert response["engine_version"] == "test-sha-abc123"
    finally:
        del os.environ["GIT_SHA"]


def test_handler_engine_version_defaults_to_unknown():
    """Handler returns 'unknown' when GIT_SHA is unset."""
    os.environ.pop("GIT_SHA", None)
    response = handler({}, None)
    assert response["engine_version"] == "unknown"


def test_handler_imports_pvlayout_core():
    """Handler proves pvlayout_core is importable in the runtime."""
    response = handler({}, None)
    # The handler attempts the import internally and surfaces the result.
    assert response["pvlayout_core_importable"] is True
```

- [ ] **Step 3: Run the test — verify it fails**

```bash
cd python/lambdas/smoketest
uv sync --extra dev
uv run pytest tests/ -v
```

Expected: ALL FOUR tests fail with `ModuleNotFoundError: No module named 'smoketest_lambda.handler'` (or similar import error). The package exists but `handler.py` is not yet written.

If `uv sync` itself fails (e.g., pvlayout-core path-dep not resolving), surface the error before proceeding — that's a real signal about the path-dep wiring.

- [ ] **Step 4: Write the minimal handler implementation**

Create `python/lambdas/smoketest/smoketest_lambda/handler.py` with this exact content:

```python
"""Smoketest Lambda handler — proves C3 plumbing.

Deleted in C4 when parse-kmz arrives.
"""

from __future__ import annotations

import os
from typing import Any


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    """Return a trivial JSON response.

    Reads GIT_SHA from env (baked at build time by the Dockerfile's
    ARG GIT_SHA → ENV GIT_SHA pattern). Imports pvlayout_core to prove
    the path-dep is wired into the container runtime.
    """
    try:
        import pvlayout_core  # noqa: F401

        pvlayout_core_importable = True
    except ImportError:
        pvlayout_core_importable = False

    return {
        "ok": True,
        "engine_version": os.environ.get("GIT_SHA", "unknown"),
        "pvlayout_core_importable": pvlayout_core_importable,
    }
```

- [ ] **Step 5: Run the tests — verify they pass**

```bash
cd python/lambdas/smoketest
uv run pytest tests/ -v
```

Expected: 4 passed in <1s.

- [ ] **Step 6: Commit Task 4**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/lambdas/smoketest/smoketest_lambda/ python/lambdas/smoketest/tests/
git commit -m "$(cat <<'EOF'
chore(c3): smoketest handler with TDD-tested plumbing checks

Trivial handler that reads GIT_SHA from env (baked by Dockerfile
ARG/ENV pattern) and verifies pvlayout_core imports at runtime.
Four tests cover: ok=True response, engine_version reads env,
default 'unknown', pvlayout_core importable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Phase 1.2 — `smoketest` Dockerfile + .dockerignore

**Files:**
- Create: `python/lambdas/smoketest/Dockerfile`
- Create: `python/lambdas/smoketest/.dockerignore`

- [ ] **Step 1: Write `python/lambdas/smoketest/Dockerfile`**

Create with this exact content:

```dockerfile
# syntax=docker/dockerfile:1
# AWS Lambda Python 3.12 runtime — arm64 (Graviton) selected via
# build platform; the base image is a multi-arch manifest.
FROM public.ecr.aws/lambda/python:3.12

# Per D5: build context is repo root. COPY pvlayout_core sibling
# package in and install it.
COPY python/pvlayout_core /opt/pvlayout_core
RUN pip install --no-cache-dir /opt/pvlayout_core

# Lambda-specific code into LAMBDA_TASK_ROOT.
COPY python/lambdas/smoketest/smoketest_lambda ${LAMBDA_TASK_ROOT}/smoketest_lambda

# Bake git SHA at build time. The CI workflow passes
# --build-arg GIT_SHA=${{ github.sha }}; locally use $(git rev-parse HEAD).
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

CMD [ "smoketest_lambda.handler.handler" ]
```

- [ ] **Step 2: Write `python/lambdas/smoketest/.dockerignore`**

Create with this exact content:

```
.venv/
__pycache__/
*.pyc
.pytest_cache/
tests/
*.egg-info/
.python-version
uv.lock
```

The `tests/` exclusion keeps test fixtures out of the runtime image — Lambda doesn't need them.

- [ ] **Step 3: Commit Task 5**

```bash
git add python/lambdas/smoketest/Dockerfile python/lambdas/smoketest/.dockerignore
git commit -m "$(cat <<'EOF'
chore(c3): smoketest Dockerfile (arm64 Graviton)

Build context = repo root (per D5). COPYs python/pvlayout_core,
pip-installs it, copies smoketest_lambda into LAMBDA_TASK_ROOT,
bakes GIT_SHA via ARG/ENV (per D21 pattern). CMD points at
smoketest_lambda.handler.handler.

.dockerignore excludes .venv, __pycache__, .pytest_cache, tests/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Phase 1.2 — `smoketest/README.md` (deletion-pointer)

**Files:**
- Create: `python/lambdas/smoketest/README.md`

- [ ] **Step 1: Write `python/lambdas/smoketest/README.md`**

Create with this exact content:

```markdown
# `smoketest` Lambda

**Status: throwaway. Delete in C4.**

This Lambda exists for one reason: to prove the C3 monorepo build/push
plumbing end-to-end. The CI workflow (`build-lambdas.yml`) builds it
on every push, pushes the arm64 image to ECR repo
`solarlayout/smoketest`, and tags it with the git SHA. If that pipeline
runs green, the C3 row is verified and C4 (parse-kmz) can land
mechanically without infrastructure debugging in its own brainstorm
session.

When C4 starts, this directory is deleted in the same row's first commit
along with the ECR repo (`aws ecr delete-repository --repository-name
solarlayout/smoketest --force --region ap-south-1`).

The handler does almost nothing on purpose: returns `{"ok": true,
"engine_version": "<sha>", "pvlayout_core_importable": true}`. Any
real-world functionality should land in C4+, not here.

**Spec source:** `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md`
row C3 (§9 — phase Tier T2 verification depth).
```

- [ ] **Step 2: Commit Task 6**

```bash
git add python/lambdas/smoketest/README.md
git commit -m "$(cat <<'EOF'
chore(c3): smoketest README — deletion-pointer note for C4

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Phase 1.3 — `docs/AWS_RESOURCES.md` updates

**Files:**
- Modify: `docs/AWS_RESOURCES.md` (append GHA OIDC section + ECR `solarlayout/smoketest` entry)

This documents the new resources Phase 2 will provision. Land the doc BEFORE the AWS-side work so future readers see what was set up and why.

- [ ] **Step 1: Read current `docs/AWS_RESOURCES.md` to find insertion points**

Run:
```bash
grep -n "## ECR\|## GitHub Actions OIDC\|^---$" docs/AWS_RESOURCES.md
```

Identify line ranges for the existing `## ECR` and `## GitHub Actions OIDC` sections. We'll insert new entries WITHIN these existing sections rather than creating duplicates.

- [ ] **Step 2: Append new ECR entry to the `## ECR` section**

In `docs/AWS_RESOURCES.md`, find the existing `## ECR` section (around line 271-280). The current content documents the legacy `renewable-energy/layout-engine` repo. Append a new sub-section directly after the legacy entry, BEFORE the `---` section break:

```markdown

### Repository: `solarlayout/smoketest` (throwaway)

- **URI:** `378240665051.dkr.ecr.ap-south-1.amazonaws.com/solarlayout/smoketest`
- **Status:** Throwaway. Created in C3 to verify the build/push pipeline. **Deleted in C4** when parse-kmz lands.
- **Image-tag mutability:** IMMUTABLE
- **Scan-on-push:** enabled
- **Tags:** `<git-sha>` per CI run; `latest` only on `main`.

### Future repositories (created per row by the implementing agent)

| Row | Repository | Purpose |
|---|---|---|
| C4 | `solarlayout/parse-kmz` | KMZ → parsed boundary geometry (sync invoke) |
| C6/C8 | `solarlayout/compute-layout` | Heavy compute (SQS-triggered) |
| C16 | `solarlayout/detect-water` | Water-body satellite detection (SQS) |

All `solarlayout/*` ECR repos use immutable tags + scan-on-push + arm64 image manifests.
```

- [ ] **Step 3: Append new GHA OIDC entry to the `## GitHub Actions OIDC` section**

In `docs/AWS_RESOURCES.md`, find the existing `## GitHub Actions OIDC` section (around line 283). Currently documents only the legacy `renewable-energy-github-actions` role. Append a new sub-section directly after, BEFORE the next `---` section break (or end-of-file):

```markdown

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
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart",
        "ecr:DescribeRepositories",
        "ecr:DescribeImages",
        "ecr:CreateRepository",
        "ecr:TagResource"
      ],
      "Resource": [
        "arn:aws:ecr:ap-south-1:378240665051:repository/solarlayout/*"
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
```

- [ ] **Step 4: Diff-review and commit Task 7**

```bash
git diff docs/AWS_RESOURCES.md
```

Expected: only additions in the `## ECR` section and `## GitHub Actions OIDC` section; no deletions.

```bash
git add docs/AWS_RESOURCES.md
git commit -m "$(cat <<'EOF'
docs(c3): document new solarlayout-github-actions OIDC role + ECR repos

Pre-documents the AWS resources Phase 2 of C3 will provision:
- Role: solarlayout-github-actions (trust scoped to
  repo:SolarLayout/solarlayout:*; inline policy: ECR push on
  solarlayout/*)
- ECR: solarlayout/smoketest (throwaway; C4 deletes)
- Future: solarlayout/parse-kmz, /compute-layout, /detect-water
- Notes legacy renewable-energy-github-actions as orphaned-leave-alone

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Phase 2.1 — Verify OIDC IDP exists in account

**Interactive task — agent drafts; Arun executes.**

The OIDC identity provider for `token.actions.githubusercontent.com` is what allows GitHub Actions to assume an IAM role via `sts:AssumeRoleWithWebIdentity`. The legacy `renewable-energy-github-actions` role uses it, so it almost certainly exists. Verify before drafting create-role.

- [ ] **Step 1: Agent drafts the verification command**

The agent presents this to Arun:

> Run the following in your terminal and paste the output back:
>
> ```bash
> aws iam list-open-id-connect-providers --region ap-south-1
> ```
>
> Expected: a JSON list with at least one entry whose ARN ends in `:oidc-provider/token.actions.githubusercontent.com`. If that ARN is in the list — proceed to Task 9. If the list is empty or the GitHub OIDC provider is missing — we need an extra step to create it (drafted in Task 8 Step 2 below).

- [ ] **Step 2: Branch on result**

If the GitHub OIDC provider IS present (expected case):
- Note the full ARN — it will be `arn:aws:iam::378240665051:oidc-provider/token.actions.githubusercontent.com`.
- Skip to Task 9.

If the GitHub OIDC provider is MISSING:
- Agent drafts `aws iam create-open-id-connect-provider`:
  ```bash
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
    --region ap-south-1
  ```
  (Thumbprint is the well-known GitHub Actions OIDC thumbprint; published by GitHub. As of late 2024 GitHub also operates a second thumbprint — see [GitHub docs](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect) at execution time and add `--thumbprint-list` entries as needed.)
- Arun runs; pastes the output (will return the new provider's ARN).

- [ ] **Step 3: Capture the OIDC provider ARN for use in the trust policy**

Once verified, the OIDC provider ARN is `arn:aws:iam::378240665051:oidc-provider/token.actions.githubusercontent.com`. This goes into the trust policy in Task 9.

- [ ] **Step 4: NO commit for this task** — it's read-only against AWS state.

---

## Task 9: Phase 2.2 — Create `solarlayout-github-actions` IAM role

**Interactive task — agent drafts; Arun executes.**

Files written to `/tmp/`:
- `/tmp/solarlayout-github-actions-trust-policy.json`

- [ ] **Step 1: Agent writes the trust policy file locally**

```bash
cat > /tmp/solarlayout-github-actions-trust-policy.json <<'EOF'
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
EOF
cat /tmp/solarlayout-github-actions-trust-policy.json
```

Expected: prints the JSON cleanly.

- [ ] **Step 2: Agent drafts the create-role command for Arun**

> Run the following in your terminal and paste the output back:
>
> ```bash
> aws iam create-role \
>   --role-name solarlayout-github-actions \
>   --assume-role-policy-document file:///tmp/solarlayout-github-actions-trust-policy.json \
>   --description "GHA → AWS OIDC role for SolarLayout/solarlayout monorepo. Push to ECR repos under solarlayout/*. Created 2026-05-03 in C3." \
>   --max-session-duration 3600
> ```
>
> Expected: JSON response with `Role.Arn = arn:aws:iam::378240665051:role/solarlayout-github-actions`. Save this ARN for the next step + for the GHA secret update.

If the command fails with `EntityAlreadyExists`: a prior session already created this role. Run `aws iam get-role --role-name solarlayout-github-actions` to inspect the current state. If the trust policy matches what's in `/tmp/solarlayout-github-actions-trust-policy.json`, proceed. If not, agent drafts `aws iam update-assume-role-policy` to repoint the trust.

- [ ] **Step 3: NO commit for this task** — AWS state mutation only.

---

## Task 10: Phase 2.3 — Attach inline ECR push policy

**Interactive task — agent drafts; Arun executes.**

Files written to `/tmp/`:
- `/tmp/solarlayout-github-actions-ecr-push.json`

- [ ] **Step 1: Agent writes the inline policy file**

```bash
cat > /tmp/solarlayout-github-actions-ecr-push.json <<'EOF'
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
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart",
        "ecr:DescribeRepositories",
        "ecr:DescribeImages",
        "ecr:CreateRepository",
        "ecr:TagResource"
      ],
      "Resource": [
        "arn:aws:ecr:ap-south-1:378240665051:repository/solarlayout/*"
      ]
    }
  ]
}
EOF
cat /tmp/solarlayout-github-actions-ecr-push.json
```

Note on `ecr:GetAuthorizationToken`: this action does not support resource-level permissions per AWS docs, so its `Resource` must be `*`. The push actions are scoped tightly to `solarlayout/*` so the role can ONLY push to our own prefix.

- [ ] **Step 2: Agent drafts the put-role-policy command for Arun**

> Run the following in your terminal and paste the output back:
>
> ```bash
> aws iam put-role-policy \
>   --role-name solarlayout-github-actions \
>   --policy-name solarlayout-github-actions-ecr-push \
>   --policy-document file:///tmp/solarlayout-github-actions-ecr-push.json
> ```
>
> Expected: command returns no output on success. Verify with:
>
> ```bash
> aws iam list-role-policies --role-name solarlayout-github-actions
> aws iam get-role-policy \
>   --role-name solarlayout-github-actions \
>   --policy-name solarlayout-github-actions-ecr-push
> ```

- [ ] **Step 3: NO commit for this task** — AWS state mutation only.

---

## Task 11: Phase 2.4 — Create `solarlayout/smoketest` ECR repository

**Interactive task — agent drafts; Arun executes.**

The ECR repo must exist before the workflow attempts a `docker push`. The role's `ecr:CreateRepository` permission would also let the workflow auto-create it, but we create explicitly so the immutability + scan settings are correct from day one.

- [ ] **Step 1: Agent drafts the create-repository command**

> Run the following in your terminal and paste the output back:
>
> ```bash
> aws ecr create-repository \
>   --repository-name solarlayout/smoketest \
>   --image-tag-mutability IMMUTABLE \
>   --image-scanning-configuration scanOnPush=true \
>   --region ap-south-1
> ```
>
> Expected: JSON response with `repository.repositoryUri = 378240665051.dkr.ecr.ap-south-1.amazonaws.com/solarlayout/smoketest`.

If the command fails with `RepositoryAlreadyExistsException`: the repo already exists from a prior attempt. Verify settings with:

```bash
aws ecr describe-repositories --repository-names solarlayout/smoketest --region ap-south-1
```

If `imageTagMutability` is `IMMUTABLE` and `imageScanningConfiguration.scanOnPush` is `true`, proceed. Otherwise, agent drafts `aws ecr put-image-tag-mutability` and/or `aws ecr put-image-scanning-configuration` to fix.

- [ ] **Step 2: NO commit for this task** — AWS state mutation only.

---

## Task 12: Phase 2.5 — Arun updates GHA `AWS_ROLE_ARN` secret

**Interactive task — Arun executes via GitHub UI.**

- [ ] **Step 1: Agent provides the new ARN for Arun**

> The role ARN to set as the GHA secret value:
>
> ```
> arn:aws:iam::378240665051:role/solarlayout-github-actions
> ```
>
> On `https://github.com/SolarLayout/solarlayout/settings/secrets/actions`:
>
> - Either update the existing `AWS_ROLE_ARN` secret value to the above, OR create it if it doesn't exist.
> - Verify variables `AWS_ACCOUNT_ID = 378240665051` and `AWS_REGION = ap-south-1` are set in the **Variables** tab (not Secrets — public values).
>
> Confirm back when done.

- [ ] **Step 2: NO commit for this task** — GitHub repo settings change only.

---

## Task 13: Phase 3 — `.github/workflows/build-lambdas.yml` matrix workflow

**Files:**
- Create: `.github/workflows/build-lambdas.yml`

- [ ] **Step 1: Write the workflow file**

Create `.github/workflows/build-lambdas.yml` with this exact content:

```yaml
name: build-lambdas

# Build + push Lambda container images to ECR. One job per Lambda
# directory under python/lambdas/, matrix-driven. arm64 (Graviton)
# images via buildx + QEMU emulation on the x86_64 GitHub runner.
#
# Triggers (mirror ci.yml's pattern):
#   push:               every branch (including main)
#   pull_request:       PRs targeting main
#   workflow_dispatch:  manual trigger from the Actions UI
#
# Authentication: GHA OIDC → IAM role solarlayout-github-actions
# (trust scoped to repo:SolarLayout/solarlayout:*).
# See docs/AWS_RESOURCES.md § GitHub Actions OIDC.
#
# Image tagging:
#   - <git-sha>:  always pushed (D21 — Run.engineVersion source of truth)
#   - latest:     pushed only on main (convenience tag for ad-hoc invocations)
#
# Build context is REPO ROOT (per D5) so each Lambda's Dockerfile can
# COPY python/pvlayout_core sibling.

on:
  push:
  pull_request:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  id-token: write   # for OIDC
  contents: read    # for checkout

jobs:
  discover:
    name: discover lambdas
    runs-on: ubuntu-22.04
    outputs:
      lambdas: ${{ steps.list.outputs.lambdas }}
      count: ${{ steps.list.outputs.count }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: List Lambda directories
        id: list
        shell: bash
        run: |
          set -euo pipefail
          lambdas=$(find python/lambdas -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | jq -R -s -c 'split("\n") | map(select(length > 0))')
          count=$(echo "$lambdas" | jq 'length')
          echo "lambdas=$lambdas" >> "$GITHUB_OUTPUT"
          echo "count=$count" >> "$GITHUB_OUTPUT"
          echo "Discovered $count Lambda(s): $lambdas"

  build:
    name: build ${{ matrix.lambda }}
    needs: discover
    if: ${{ needs.discover.outputs.count != '0' }}
    runs-on: ubuntu-22.04
    strategy:
      fail-fast: false
      matrix:
        lambda: ${{ fromJSON(needs.discover.outputs.lambdas) }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Login to Amazon ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3
        with:
          platforms: arm64

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: python/lambdas/${{ matrix.lambda }}/Dockerfile
          platforms: linux/arm64
          push: true
          provenance: false
          build-args: |
            GIT_SHA=${{ github.sha }}
          tags: |
            ${{ steps.ecr-login.outputs.registry }}/solarlayout/${{ matrix.lambda }}:${{ github.sha }}
            ${{ github.ref == 'refs/heads/main' && format('{0}/solarlayout/{1}:latest', steps.ecr-login.outputs.registry, matrix.lambda) || '' }}
          cache-from: type=gha,scope=${{ matrix.lambda }}
          cache-to: type=gha,mode=max,scope=${{ matrix.lambda }}
```

Notes on tag-list conditional: GitHub Actions doesn't support conditional list entries cleanly; the `format()` ternary returns either the `latest` tag or an empty string. `docker/build-push-action@v5` ignores empty tag entries.

`provenance: false`: SLSA provenance attestations create an OCI manifest list that ECR's `IMMUTABLE` tag policy rejects on second push (each commit creates a new attestation manifest with a different digest but same logical tag, conflicting with immutability). Disabling provenance keeps the image push idempotent.

- [ ] **Step 2: Verify with `actionlint`**

If `actionlint` is available locally:
```bash
which actionlint && actionlint .github/workflows/build-lambdas.yml || echo "actionlint not installed; skip"
```

If not installed, install via Homebrew:
```bash
brew install actionlint
actionlint .github/workflows/build-lambdas.yml
```

Expected: no output (clean parse). If errors: fix per actionlint's diagnostics.

- [ ] **Step 3: Commit Task 13**

```bash
git add .github/workflows/build-lambdas.yml
git commit -m "$(cat <<'EOF'
ci(c3): build-lambdas.yml matrix workflow

Auto-discovers Lambda directories under python/lambdas/ and builds
arm64 (Graviton) container images via buildx + QEMU on the x86_64
runner. OIDC auth via solarlayout-github-actions role. Pushes each
image tagged with the git SHA (D21); also pushes :latest on main.

Triggers mirror ci.yml: push (any branch) + pull_request to main +
workflow_dispatch. Concurrency cancels superseded runs per ref.

Build context is repo root (per D5) so the Dockerfile can COPY
python/pvlayout_core sibling.

Provenance disabled to keep ECR's IMMUTABLE tag policy idempotent
on re-runs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Phase 4.1 — Local buildx verification

**Verifies the Dockerfile actually builds before relying on CI to discover problems.**

- [ ] **Step 1: Verify Docker buildx is available**

```bash
docker buildx version
```

Expected: `github.com/docker/buildx v<X.Y.Z>` (any recent version). If not installed, on macOS: Docker Desktop ships with buildx by default; ensure Docker Desktop is running.

- [ ] **Step 2: Build the smoketest image locally for arm64**

From the repo root:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
docker buildx build \
  --platform linux/arm64 \
  -f python/lambdas/smoketest/Dockerfile \
  --build-arg GIT_SHA=local-test \
  -t solarlayout/smoketest:local-test \
  --load \
  .
```

Expected: `=> => writing image sha256:...` and `=> => naming to docker.io/solarlayout/smoketest:local-test`. Build time ≤ 60s (smoketest is tiny).

If `--load` fails on arm64 build (rare; happens when default builder doesn't support arm64 load), try `--platform linux/arm64,linux/amd64` then `--load` only the host arch — but the GHA workflow doesn't need this; CI uses `--push`, not `--load`. Fall back to:

```bash
docker buildx build --platform linux/arm64 -f python/lambdas/smoketest/Dockerfile --build-arg GIT_SHA=local-test .
```

(no `--load`, just verify build succeeds).

- [ ] **Step 3: Smoke-invoke the local image (Apple Silicon only — runs arm64 natively)**

```bash
docker run --rm --platform linux/arm64 -e AWS_LAMBDA_FUNCTION_NAME=test solarlayout/smoketest:local-test &
DOCKER_PID=$!
sleep 3
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{}'
kill $DOCKER_PID 2>/dev/null
```

This invokes the AWS Lambda Runtime Interface Emulator (RIE) which is built into the public.ecr.aws/lambda/python image.

Expected response body:
```json
{"ok": true, "engine_version": "local-test", "pvlayout_core_importable": true}
```

If `pvlayout_core_importable` is `false`: the Dockerfile's COPY/install of `pvlayout_core` is broken — fix in Task 5 before proceeding.

- [ ] **Step 4: NO commit — verification only.**

If anything in Step 2 or Step 3 failed, fix the Dockerfile / handler / pyproject.toml + re-run before proceeding to Task 15.

---

## Task 15: Phase 4.2 — Push branch + verify CI runs green

- [ ] **Step 1: Push the branch to origin**

```bash
git push -u origin chore/c3-lambda-monorepo-scaffolding
```

Expected: branch published. Output should include the URL to compare/PR.

- [ ] **Step 2: Watch the `build-lambdas` workflow run**

```bash
gh run list --workflow=build-lambdas.yml --branch=chore/c3-lambda-monorepo-scaffolding --limit=5
```

Identify the run for the latest push. Then:

```bash
gh run watch <RUN_ID>
```

Expected:
- `discover` job: outputs `lambdas: ["smoketest"]`, `count: 1`.
- `build (smoketest)` job: completes successfully in ~3-5 min (QEMU arm64 emulation is slow on x86_64 runners; smoketest is tiny so ≤ 5min).

If `build` fails on `Configure AWS credentials (OIDC)`: GHA secret `AWS_ROLE_ARN` is missing or wrong. Confirm with Arun (Task 12).

If `build` fails on `Login to Amazon ECR`: the role's ECR permissions are wrong. Re-check Task 10.

If `build` fails on `Build and push image` with `denied: User: ... is not authorized to perform: ecr:PutImage on resource:`: the role's resource-scope is wrong. Should be `arn:aws:ecr:ap-south-1:378240665051:repository/solarlayout/*`.

- [ ] **Step 3: Verify the image landed in ECR**

```bash
aws ecr describe-images \
  --repository-name solarlayout/smoketest \
  --region ap-south-1 \
  --query 'imageDetails[*].{tags:imageTags,pushed:imagePushedAt,sha:imageDigest}' \
  --output table
```

Expected: at least one image with the workflow's commit SHA in `imageTags`. If on `main`: also `latest` tag.

- [ ] **Step 4: NO commit — verification only.**

---

## Task 16: Phase 4.3 — Open the PR

- [ ] **Step 1: Open the PR via `gh`**

```bash
gh pr create \
  --title "chore(c3): Lambda monorepo scaffolding" \
  --body "$(cat <<'EOF'
## Summary

Implements row C3 of the cloud-offload architecture spec (master spec
at `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md`).
Establishes:

- `python/lambdas/` monorepo conventions (README + folder layout +
  Dockerfile template + naming convention + arm64 Graviton platform).
- AWS-side OIDC role `solarlayout-github-actions` (trust scoped to
  `repo:SolarLayout/solarlayout:*`; inline policy for ECR push on
  `solarlayout/*` repos).
- ECR repo `solarlayout/smoketest` (throwaway; deleted in C4).
- `.github/workflows/build-lambdas.yml` matrix workflow that
  auto-discovers Lambdas, builds arm64 images via buildx + QEMU,
  pushes to ECR tagged with git SHA + (on main) `latest`.
- `smoketest` placeholder Lambda exercising the full plumbing.

Spec amendment v1.2 (in this PR): C3 naming-convention prefix flipped
from `pvlayout-*` to `solarlayout-*` on all three lines (Lambda fn,
ECR, SQS) for brand consistency with the existing S3 bucket prefix.
No locked decision (D-id) was changed.

## Locked decisions referenced

- **D5** — Lambda Dockerfile `COPY` from monorepo (no wheel registry)
- **D10** — One Lambda = one image = one package
- **D22** — Lambda → ECS portability (same image works for ECS via
  `CMD` change; documented escape hatch)

## Out of scope (per spec C3)

- Real Lambda code (C4 lands `parse-kmz`).
- IaC (Terraform / CDK).
- SQS queues (C5).
- Lambda execution role (C4 / C5 concern).

## Smoke evidence

(C3 has no `Smoke trigger` field — automated gates + the CI run on
this branch + ECR image landing are the verification per Tier T2.)

### Tier T2 verification

- [x] `actionlint` parses `build-lambdas.yml` cleanly.
- [x] Local `docker buildx build --platform linux/arm64` of
      `smoketest` succeeds and runs returning the expected handler
      response.
- [x] `build-lambdas` workflow runs green on this branch.
- [x] Image `solarlayout/smoketest:<sha>` present in ECR
      (`aws ecr describe-images`).

## Post-row completion protocol

(Filled in at row close per spec §11.5 — see final commit.)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL from the output for the §11.5 close commit.

- [ ] **Step 2: NO commit — PR open is metadata.**

---

## Task 17: Phase 5 — §11.5 post-row completion + close commit

Runs BEFORE flipping `Status: todo → done` per spec §11.5 protocol.

- [ ] **Step 1: Four-category drift check (silent first)**

The implementing agent runs the §11.5 protocol mentally / in notes:

1. **Stale assumptions in row text.** Did any C3 `Open verifications` turn out wrong during execution? Did the prefix-flip surface? **Already amended in Phase 0 (v1.2)** — that's the material drift, already captured.
2. **New rows surfaced by execution.** Any new C-row needed? Likely none — `smoketest` deletion is in C4's first commit (already captured in `smoketest/README.md`'s deletion-pointer note).
3. **Adjacent-row scope gaps.** Does C4's row text cover the `smoketest` cleanup? Re-read C4's Acceptance — if it doesn't explicitly mention `aws ecr delete-repository` for `smoketest`, surface to Arun whether to amend C4's body inline.
4. **Locked-decision (D-id) implications.** D5/D10/D22 implementations matched spec. No D-id needs amendment.

- [ ] **Step 2: Surface any material findings to Arun (one at a time)**

If anything material from Step 1 surfaces, agent reports to Arun via the conversation, lands any concurred spec amendments per §12 in dedicated commit(s) BEFORE proceeding to Step 3.

If nothing material — proceed.

- [ ] **Step 3: Append PR description with `## Post-row completion protocol` section**

Update the PR body via `gh pr edit` to add:

```markdown
## Post-row completion protocol (§11.5)

Four-category drift check ran at row close:

1. **Stale assumptions in row text:** material drift already amended
   inline (v1.2 prefix flip in Phase 0).
2. **New rows surfaced:** none.
3. **Adjacent-row scope gaps:** [yes/no — fill at execution time].
4. **D-id implications:** none.
```

- [ ] **Step 4: Flip C3 row Status + append `Plan:` + `Shipped:` lines in spec**

Edit `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md`. Find the C3 row's status line:

```
Status:   todo
```

Replace with:

```
Status:   done (2026-05-03)
```

Then, at the bottom of the C3 row entry (after the `Out of scope` block but inside the row's fenced block), append:

```
Plan:     docs/superpowers/plans/2026-05-03-c3-lambda-monorepo-scaffolding.md
Shipped:  PR #<NUM> (<URL>), merged at <SHA> on 2026-05-03 — Lambda
          monorepo conventions established (python/lambdas/README.md
          + canonical Dockerfile template); throwaway smoketest
          Lambda built + pushed to solarlayout/smoketest ECR via
          new GHA OIDC role solarlayout-github-actions; matrix CI
          workflow build-lambdas.yml auto-discovers future Lambdas.
          arm64 Graviton platform locked. v1.2 spec amendment in
          this PR (C3 naming-convention prefix flip to solarlayout-*).
```

(`<NUM>`, `<URL>`, `<SHA>` filled in at merge time.)

- [ ] **Step 5: Commit the row close**

```bash
git add docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md
git commit -m "$(cat <<'EOF'
docs(c3): flip C3 status to done in cloud-offload spec

Plan + Shipped cross-references appended per spec §12. §11.5
post-row completion protocol ran (four-category drift check);
material drift already amended in Phase 0 (v1.2).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push final commit + merge PR**

```bash
git push origin chore/c3-lambda-monorepo-scaffolding
gh pr merge --squash --delete-branch
```

(Or whatever merge strategy Arun prefers — check existing PR history. C2's PR #5 was a merge commit, suggesting `--merge` is the convention. Confirm with Arun before pulling the trigger.)

After merge:
- Verify `git pull --ff-only origin main` on the agent's worktree updates cleanly.
- Verify `bun run lint && bun run typecheck && bun run test && bun run build` still passes on `main` (C3 added no JS/TS code; should be unaffected).
- Verify `cd python/pvlayout_core && uv run pytest tests/ -q` and `cd python/pvlayout_engine && uv run pytest tests/ -q` still pass (C3 added no engine/core code; should be unaffected).
- Run the `build-lambdas` workflow once on `main` post-merge to verify the `latest` tag also lands.

- [ ] **Step 7: Final commit gate verification**

```bash
git log --oneline origin/main | head -20
```

Confirm C3's commits are present in main + the row's atomic-close commit landed.

---

## Self-review checklist (run at end of plan writing)

Per skill convention:

**1. Spec coverage:** Each C3 Acceptance bullet maps to:
- "`python/lambdas/README.md` documents the convention" → Task 2.
- "Shared Dockerfile template documented or symlinked" → Task 2 (in README) + Task 5 (concrete example in `smoketest/Dockerfile`).
- "`.github/workflows/build-lambdas.yml` matrix workflow scaffolded; initially empty matrix or with parse-kmz only" → Task 13 (matrix is auto-discovered; populated with `smoketest` per Arun's option-B choice).
- "Naming convention recorded: Lambda fn / ECR / SQS" → Task 2 (README) + Task 7 (AWS_RESOURCES.md) + Phase 0 spec amendment.
- (Implicit) AWS provisioning verifiable → Tasks 8-12.

**2. Placeholder scan:** Searched plan for "TBD", "TODO", "implement later", "fill in details", "write tests for the above", "similar to Task N". Only allowed exception: Task 17 Step 4's `<NUM>`, `<URL>`, `<SHA>` — these are git/PR metadata that genuinely cannot exist at plan-write time and are filled at merge time. Documented inline.

**3. Type consistency:** Handler signature `handler(event, context) → dict[str, Any]` consistent across handler.py, test_handler.py, and the README's CMD reference. Matrix variable `${{ matrix.lambda }}` consistent across discover/build jobs.

---

## Execution Handoff

Plan complete. Saved to `docs/superpowers/plans/2026-05-03-c3-lambda-monorepo-scaffolding.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task; I review between tasks; fast iteration.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`; batch execution with checkpoints for review.

**Caveat:** Tasks 8–12 are interactive AWS provisioning where Arun is in the loop. Both execution modes have to pause for human-in-the-loop on those tasks regardless. Phase 0–1 + Phase 3–4 + Phase 5 can run autonomously in either mode.

**Which approach?**
