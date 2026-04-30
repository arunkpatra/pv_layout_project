# 2026-05-01-002 — `renewable_energy` Repo Structural Inventory

**Date:** 2026-05-01
**Author:** Claude (research-only, no modifications made)
**Purpose:** Complete structural inventory of `/Users/arunkpatra/codebase/renewable_energy` to inform the decision to merge it into `pv_layout_project` (being renamed `solarlayout`). Read-only. No files modified.

---

## Track 1 — Complete Top-Level Inventory

### Top-level directories

| Path | What it is |
|---|---|
| `apps/` | Workspace applications (5 sub-dirs, see Track 2) |
| `packages/` | Shared workspace packages (8 sub-dirs, see Track 2) |
| `docs/` | Architecture docs, AWS resources, UX principles, initiatives, findings, principles |
| `.github/` | GitHub Actions workflow definitions (2 workflow files) |

No `infra/`, `terraform/`, `scripts/`, `tools/`, `e2e/`, `deploy/`, `cdk/`, or `migrations/` directories were found at the top level.

### Top-level files

| File | What it is |
|---|---|
| `README.md` | Minimal — project name "SolarDesign", pnpm shadcn snippet, "dummy line" (stale) |
| `package.json` | Bun workspaces root; `packageManager: bun@1.3.11`; `engines.node: >=20`; scope `renewable_energy` |
| `turbo.json` | Turborepo pipeline config; defines build, lint, typecheck, test, db:*, mvp-db:* tasks |
| `docker-compose.yml` | Two Postgres 17-alpine services: `postgres` (port 5432, `renewable_energy` db) and `mvp_postgres` (port 5433, `mvp_db` db) |
| `CLAUDE.md` | Claude Code session instructions for this repo; references docs/architecture.md etc. |
| `.gitignore` | Standard; gitignores `.env`, `node_modules`, `.next/`, `dist/`, `aws-creds/`, `tmp/`, `.next-docs/` |
| `.env.example` | Committed reference; exposes only local dev defaults (no real secrets) |
| `.npmrc` | Present but empty (1 line, blank) |

### Hidden directories that matter

| Path | What it is |
|---|---|
| `.github/workflows/` | Two workflow files: `build-layout-engine.yml`, `deploy-layout-engine.yml` |

No `.changeset/`, `.husky/`, `.vscode/`, `.turbo/` directories found at repo root.

No `.gitmodules` (no git submodules).

No `Procfile`, `serverless.yml`, `sam-template.yaml`, `cdk.json`, `terraform/`, or `*.tf` files found anywhere.

---

## Track 2 — Complete `apps/` and `packages/` Inventory

### `apps/` subdirectories

| App | Name (package.json) | Stack | Status | Notes |
|---|---|---|---|---|
| `apps/mvp_api/` | `@renewable-energy/mvp-api` | Hono v4 + Bun; depends on `@renewable-energy/mvp-db` and `@renewable-energy/shared` | **Live** — serves `api.solarlayout.in`; V1 + V2 endpoints; Stripe billing; license-key auth | Default port 3003. Has `vercel.json` (git auto-deploy disabled; rewrites all to `/api/index`). |
| `apps/mvp_web/` | `@renewable-energy/mvp-web` | Next.js 16 App Router + React 19 + Clerk; depends on `@renewable-energy/ui` | **Live** — marketing site + customer dashboard | Default port 3002. Has `vercel.json` (git auto-deploy disabled). |
| `apps/mvp_admin/` | `@renewable-energy/mvp-admin` | Next.js 16 App Router + React 19 + Clerk + Recharts | **Live** — internal ops/admin dashboard | Default port 3004. Has `vercel.json` (git auto-deploy disabled). |
| `apps/layout-engine/` | `layout-engine` (no scope) | Python 3.13 + uv + Shapely + Boto3; Lambda container image | **Dormant** — wired to prod Lambda (`layout_engine_lambda_prod`) + ECR + SQS but carries no live traffic. Explicitly marked dormant in V2 plan §2. Decommission is post-V2. | Has `Dockerfile` (FROM `public.ecr.aws/lambda/python:3.13`, copies uv, installs deps, CMD `lambda_handler.handler`). Has `pyproject.toml` (Python 3.13, shapely, pyproj, matplotlib, simplekml, ezdxf, requests, boto3, psycopg2-binary). |
| `apps/api/` | `@renewable-energy/api` | Hono v4 + Bun; depends on `@renewable-energy/db` and `@renewable-energy/shared` | **Defunct** — cloud-port era API backed by `packages/db/` (old schema). Explicitly called out as defunct in V2 plan §3. | Has `vercel.json` (rewrites all to `/api/index`; NO `git.deploymentEnabled: false` — this one still has git auto-deploy enabled by default if linked to a Vercel project). |
| `apps/web/` | `@renewable-energy/web` | Next.js 16 App Router + React 19 + Clerk; depends on `@renewable-energy/api-client` | **Defunct** — cloud-port era web frontend. Explicitly called out as defunct in V2 plan §3. | No `vercel.json` at `apps/web/` level. |

### `packages/` subdirectories

| Package | Name | Purpose | Stack | Status |
|---|---|---|---|---|
| `packages/mvp_db/` | `@renewable-energy/mvp-db` | Prisma ORM + schema + semantic-ID extension for mvp stack | Prisma 7.7 + `@prisma/adapter-pg` + pg; custom `semanticIdExtension` + `strictIdExtension` | **Live** — V2 schema with Project, Run, Product, Entitlement, UsageRecord, Transaction, LicenseKey, CheckoutSession, DownloadRegistration, ContactSubmission, User |
| `packages/ui/` | `@renewable-energy/ui` | Shared shadcn/ui component library | shadcn + Tailwind v4 + Radix UI + Recharts + Framer-adjacent primitives | **Live** — consumed by mvp_web and mvp_admin |
| `packages/shared/` | `@renewable-energy/shared` | Shared TypeScript types | Pure TypeScript; no runtime deps | **Live** — exports V1 and V2 wire types; `project-v2.ts` has `RunSummary`, `ProjectWire`, `ProjectDetail`, `BoundaryGeojson` |
| `packages/db/` | `@renewable-energy/db` | Prisma ORM + schema for cloud-port era stack | Prisma 7.7 + `@prisma/adapter-pg` + pg | **Defunct** — cloud-port era schema (User, Project, Version, LayoutJob, EnergyJob). Used only by `apps/api/`. |
| `packages/api-client/` | `@renewable-energy/api-client` | Type-safe HTTP client for `apps/api/` | Pure TypeScript; depends on `@renewable-energy/shared` | **Defunct** — used only by `apps/web/` (cloud-port era) |
| `packages/eslint-config/` | `@renewable-energy/eslint-config` | Shared ESLint flat config | eslint 9 + typescript-eslint + next/eslint-plugin | **Live** — shared by all workspaces |
| `packages/typescript-config/` | `@renewable-energy/typescript-config` | Shared tsconfig bases | Pure TypeScript | **Live** — shared by all workspaces |

Note: `packages/ui/` is NOT named `packages/mvp_ui/` — there is a single UI package shared across both live and defunct apps.

---

## Track 3 — CI/CD Workflow Inventory

There are exactly two workflow files in `.github/workflows/`.

### `build-layout-engine.yml`

| Attribute | Value |
|---|---|
| Name | `Build Layout Engine` |
| Trigger | `workflow_dispatch` only (push/PR triggers commented out: "Disabling for now to avoid triggering builds on every push/PR") |
| What it does | Builds a Docker image for `apps/layout-engine` targeting `linux/arm64` (via QEMU emulation on `ubuntu-latest`), logs in to ECR via OIDC, pushes two tags: `{sha}` and `prod` |
| Pushes to | AWS ECR: `378240665051.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine` |
| Cache | `type=registry` Docker layer cache at same ECR repo under tag `buildcache` |
| Secrets / vars | `secrets.AWS_ROLE_ARN` (OIDC role), `vars.AWS_REGION`, `vars.AWS_ACCOUNT_ID` |
| Architecture note | QEMU arm64 — emulated build on x86 runner, produces arm64 image for Lambda |

### `deploy-layout-engine.yml`

| Attribute | Value |
|---|---|
| Name | `Deploy Layout Engine` |
| Trigger | `workflow_dispatch` only |
| What it does | Updates Lambda function code (`layout_engine_lambda_prod`) to use the `:prod` ECR tag, waits for update completion, confirms deployed image URI |
| Pushes to | AWS Lambda `layout_engine_lambda_prod` via `aws lambda update-function-code` |
| Secrets / vars | `secrets.AWS_ROLE_ARN`, `vars.AWS_ACCOUNT_ID`, `vars.AWS_REGION` |

No CI workflow for any of the Vercel apps (mvp_api, mvp_web, mvp_admin, web, api). All Vercel deployments are triggered via Vercel's git integration or manually — no GitHub Actions pipeline for those. The `vercel.json` files in all three live mvp apps have `"git": {"deploymentEnabled": false}` set, meaning Vercel does not auto-deploy on push; deployments are triggered manually or via Vercel CLI.

No npm publishing workflows. No test/lint/typecheck CI pipeline. No scheduled workflows.

---

## Track 4 — Vercel and Deployment Artifacts

### `vercel.json` files

| Location | Content | Notes |
|---|---|---|
| `apps/mvp_api/vercel.json` | `git.deploymentEnabled: false`, `outputDirectory: "."`, rewrites all to `/api/index` | Disables git-triggered deploys; SPA-style rewrite for Hono |
| `apps/mvp_web/vercel.json` | `git.deploymentEnabled: false` only | No special output or rewrite config |
| `apps/mvp_admin/vercel.json` | `git.deploymentEnabled: false` only | No special output or rewrite config |
| `apps/api/vercel.json` | `outputDirectory: "."`, rewrites all to `/api/index` | No `git.deploymentEnabled: false` — this defunct app does NOT disable git auto-deploy |
| `apps/web/` | No `vercel.json` | No Vercel-specific config |
| repo root | No `vercel.json` | No root-level Vercel config |

### Dockerfile

One Dockerfile at `apps/layout-engine/Dockerfile`:
- Base: `public.ecr.aws/lambda/python:3.13`
- Copies uv from `ghcr.io/astral-sh/uv:latest`
- Exports prod deps from `uv.lock` via `uv export`, installs with `uv pip install --system`
- CMD: `lambda_handler.handler`
- Target: AWS Lambda container image, arm64

No `docker-compose.yml` beyond the top-level one (which covers local Postgres only).

No `Procfile`, `serverless.yml`, `sam-template.yaml`, `cdk.json`, or Terraform files.

### AWS infrastructure (from `docs/AWS_RESOURCES.md`)

Account: `378240665051`, region: `ap-south-1`

**S3 buckets (9 total across 3 families):**

| Family | Buckets | Status |
|---|---|---|
| Layout artifacts (legacy) | `renewable-energy-{local,staging,prod}-artifacts` | Dormant — cloud-port era; no live traffic |
| MVP downloads | `solarlayout-{local,staging,prod}-downloads` | Active — desktop installer downloads |
| V2 projects | `solarlayout-{local,staging,prod}-projects` | Active — V2 KMZ + run-result blobs; provisioned 2026-04-30 |

**IAM:** Single user `renewable-energy-app` with inline policy `renewable-energy-app-s3` covering all 9 bucket families (6 original + 3 V2 projects). Policy source-of-truth file committed at `docs/iam-policy-re-app-s3.json`.

**Lambda:** `layout_engine_lambda_prod` — arm64, 1769MB, 600s timeout, container image from ECR. Wired to SQS queue `re_layout_queue_prod`. Dormant (no live traffic per V2 plan §2).

**GitHub Actions OIDC role:** `renewable-energy-github-actions` (`arn:aws:iam::378240665051:role/renewable-energy-github-actions`), scoped to `repo:SolarLayout/renewable_energy:*`. Grants ECR push + Lambda update only.

> **Erratum (2026-05-01):** the subagent's original report wrote the org as `arunkpatra/...` based on a misread or hallucination — actual GitHub org is `SolarLayout` (verified via `git remote -v` on both repos). The OIDC trust subject should read `repo:SolarLayout/renewable_energy:*` and similarly the post-rename target is `repo:SolarLayout/solarlayout:*`. Both repos are at `https://github.com/SolarLayout/<name>`. If `docs/AWS_RESOURCES.md` in the renewable_energy repo also says `arunkpatra`, that doc is wrong and needs the same correction during merge.

---

## Track 5 — Prisma Schema and Migration Audit

### `packages/db/` — cloud-port era schema (defunct)

| Item | Detail |
|---|---|
| Schema path | `packages/db/prisma/schema.prisma` |
| Generator | `prisma-client-js` (no output override — uses default location) |
| Datasource | `postgresql` (no connection string — reads `DATABASE_URL`) |
| Models | `User`, `Project`, `Version` (with LayoutJob, EnergyJob FK), `LayoutJob`, `EnergyJob` |
| Enums | `UserStatus`, `VersionStatus`, `JobStatus` |
| Seed script | `packages/db/prisma/seed.ts` — placeholder only ("TODO: add seed data as the schema grows") |
| Migration count | Could not enumerate directory (no shell). Migration lock file confirms provider is `postgresql`. |
| Custom extensions | None — plain `PrismaClient`, no semantic-ID extension |
| Status | Defunct. Only used by `apps/api/` which is defunct. |

### `packages/mvp_db/` — live schema

| Item | Detail |
|---|---|
| Schema path | `packages/mvp_db/prisma/schema.prisma` |
| Generator | `prisma-client-js` with `output = "../src/generated/prisma"` (non-default output) |
| Datasource | `postgresql` (no connection string — reads `MVP_DATABASE_URL`) |
| Models | `DownloadRegistration`, `ContactSubmission`, `User`, `LicenseKey`, `Product`, `ProductFeature`, `Entitlement`, `CheckoutSession`, `UsageRecord`, `Transaction`, `Project`, `Run` — 12 models total |
| Enums | None (string fields used instead: `status`, `source`) |
| Seed scripts | Three seed scripts: `prisma/seed-products.ts` (product catalog upsert), `prisma/seed-desktop-test-fixtures.ts` (8 named integration test users with stable keys), `src/seed-data/products.ts` (canonical product data source) |
| Custom extensions | `semanticIdExtension` (generates `{prefix}_{base62}` IDs) + `strictIdExtension` (rejects manually provided IDs). Two client exports: `appPrisma` (both extensions) and `adminPrisma` (semantic only, for seed scripts). |
| Semantic-ID prefixes | `drg` (DownloadRegistration), `csb` (ContactSubmission), `usr` (User), `lk` (LicenseKey), `prod` (Product), `pf` (ProductFeature), `ent` (Entitlement), `cs` (CheckoutSession), `ur` (UsageRecord), `txn` (Transaction), `prj` (Project), `run` (Run) |

**Known migrations (verified by reading files):**

| Migration timestamp | Description |
|---|---|
| `20260430160000_add_project_quota_to_entitlement` | Adds `projectQuota INT NOT NULL DEFAULT 0` to `entitlements`; backfills from `products.projectQuota`. B19 row. |
| `20260430170000_add_boundary_geojson_to_project` | Adds `boundaryGeojson JSONB` (nullable) to `projects`. B26 row. |

Earlier migrations (B1 `projectQuota` on Product, B2 `idempotencyKey` on UsageRecord + CheckoutSession, B3 `Project` model, B4 `Run` model) are confirmed to exist by the schema state and plan status (all marked `done`) but their exact migration file names could not be enumerated without directory listing capability.

The most recent confirmed migration is `20260430170000_add_boundary_geojson_to_project`.

**V2 product catalog (from `packages/mvp_db/src/seed-data/products.ts`):**

| Slug | Name | Price | Calcs | Project quota |
|---|---|---|---|---|
| `pv-layout-free` | Free | $0 | 5 | 3 |
| `pv-layout-basic` | Basic | $1.99 | 5 | 5 |
| `pv-layout-pro` | Pro | $4.99 | 10 | 10 |
| `pv-layout-pro-plus` | Pro Plus | $14.99 | 50 | 15 |

Feature keys by tier: Free gets all 6. Basic: `plant_layout`, `obstruction_exclusion`. Pro: + `cable_routing`, `cable_measurements`. Pro Plus: + `energy_yield`, `generation_estimates`.

---

## Track 6 — Surprising Findings

### Finding 1: Two completely separate Prisma schemas / databases

The repo has two entirely separate Prisma setups targeting two separate PostgreSQL databases:

- `packages/db/` + `apps/api/` + `apps/web/`: the cloud-port era stack. Its schema covers `User`, `Project`, `Version`, `LayoutJob`, `EnergyJob`. It runs against `DATABASE_URL` on port 5432. It is fully defunct — no live traffic, no active development.
- `packages/mvp_db/` + `apps/mvp_api/` + `apps/mvp_web/` + `apps/mvp_admin/`: the live mvp stack. Its schema covers the 12-model V2 commercial domain. It runs against `MVP_DATABASE_URL` on port 5433. This is the only live path.

The `docker-compose.yml` runs both Postgres instances simultaneously. After Option B cleanup, only `mvp_postgres` on 5433 needs to come along.

### Finding 2: `apps/api/vercel.json` does NOT disable git auto-deploy

`apps/mvp_api/vercel.json`, `apps/mvp_web/vercel.json`, and `apps/mvp_admin/vercel.json` all have `"git": {"deploymentEnabled": false}`. But `apps/api/vercel.json` (the defunct cloud-port API) does not. Going away under Option B but worth confirming there's no Vercel project linked to `apps/api`.

### Finding 3: `apps/layout-engine` is a non-trivial Python Lambda in the monorepo

`apps/layout-engine/` is a complete Python 3.13 Lambda with its own `pyproject.toml`, `uv.lock`, `Dockerfile`, and source under `src/`. Same compute deps as `pvlayout_core` (Shapely, pyproj, etc.). Dormant. Removed under Option B.

### Finding 4: CLAUDE.md references `apps/web` and `apps/api` as the canonical architecture

The top-level `CLAUDE.md` and `docs/architecture.md` still describe the architecture as `apps/web → api-client → HTTP → apps/api → db → Postgres`. This is the defunct cloud-port architecture. The V2 backend plan §3 explicitly flags this as stale. Any merge that brings these docs into the combined repo needs to either update or clearly mark them as historical.

### Finding 5: No CI pipeline for the live mvp apps

No GitHub Actions workflow for lint/typecheck/test/build on `mvp_api`, `mvp_web`, `mvp_admin`. The only CI workflows target the defunct `layout-engine`. Quality gates are enforced locally via the `bun run lint && bun run typecheck && bun run test && bun run build` pre-commit convention.

### Finding 6: Package scope collision risk

All packages use `@renewable-energy/*` scope. The `pv_layout_project` repo uses `@solarlayout/*` scope. There is no collision. The merged repo will have two scopes side-by-side, which is fine since both are private (never published to a registry).

### Finding 7: Stripe is live in production

`apps/mvp_api` depends on `stripe: ^20.3.1`. Env schema accepts `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Stripe webhook handling is live via `apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.js`. The webhook URL is currently configured in Stripe dashboard pointing at `api.solarlayout.in/v1/webhooks/stripe` (or similar) — this URL must not be disrupted during cutover.

### Finding 8: Vercel git auto-deploy is globally disabled for all live apps

All three live apps have `"git": {"deploymentEnabled": false}`. No push to any branch triggers a Vercel deploy. Deployments are manual (Vercel CLI or dashboard). **This is actually a benefit for the merge** — there's no risk of accidental deployment from an unstable mid-merge state. But the Vercel project's git connection still needs re-pointing to the merged repo so manual deploys can find the source.

### Finding 9: `docs/initiatives/` contains two superseded planning documents plus one live plan

- `docs/initiatives/pv-layout-cloud.md` — Superseded 2026-04-29.
- `docs/initiatives/pv-layout-spike-plan.md` — Superseded 2026-04-29.
- `docs/initiatives/post-parity-v2-backend-plan.md` — The live V2 backend plan. 26 rows (B1–B26), 25 done, 1 todo (B20), 1 deferred (B22).

Plan: superseded docs migrate into `docs/historical/` of the merged repo (matches existing pv_layout_project policy).

### Finding 10: `next-agents-md` embedded in `CLAUDE.md`

The `CLAUDE.md` file has a large auto-generated `<!-- NEXT-AGENTS-MD-START -->...<!-- NEXT-AGENTS-MD-END -->` block appended by `npx @next/codemod agents-md`. Embeds a Next.js docs index. Inflates CLAUDE.md unusably. Strip during merge.

### Finding 11: No `.env` with real secrets committed

`.gitignore` properly excludes `.env`, `.env.local`, `.env.production`, `.env.staging`, `aws-creds/`. `.env.example` only contains local defaults. `docs/AWS_RESOURCES.md` masks all real values. No accidentally committed secrets found.

### Finding 12: Two PostgreSQL ports in `docker-compose.yml`

Local dev currently requires both Postgres instances. After Option B (defunct stack removed), drop the `postgres` service and its volume. Only `mvp_postgres` on 5433 stays.

---

## Key File Paths for Reference

| File | Role |
|---|---|
| `package.json` | Monorepo root; packageManager bun@1.3.11; workspaces |
| `turbo.json` | Turborepo pipeline; env var lists per task |
| `docker-compose.yml` | Two Postgres services (5432 + 5433) |
| `.env.example` | Committed reference env; no real secrets |
| `.gitignore` | Gitignores `.env`, `aws-creds/`, `tmp/` |
| `CLAUDE.md` | Claude session instructions; partially stale on app naming; has next-agents-md block |
| `docs/architecture.md` | Partially stale (describes defunct cloud-port arch) |
| `docs/AWS_RESOURCES.md` | AWS account, buckets, IAM, Lambda, SQS, ECR, OIDC |
| `docs/iam-policy-re-app-s3.json` | IAM inline policy; 6 statements covering 9 buckets |
| `docs/initiatives/post-parity-v2-backend-plan.md` | Live V2 backend backlog; B1–B26; 25/26 done |
| `apps/mvp_api/src/app.ts` | All route mounts; 16 route modules |
| `apps/mvp_api/src/env.ts` | Env schema (Zod); MVP_DATABASE_URL, PORT, AWS creds, Clerk, Stripe |
| `apps/mvp_api/src/middleware/license-key-auth.ts` | Auth middleware; `sl_live_` prefix enforcement |
| `apps/layout-engine/Dockerfile` | Lambda container image build |
| `apps/layout-engine/pyproject.toml` | Python 3.13 deps |
| `packages/mvp_db/prisma/schema.prisma` | Live 12-model schema; non-default generator output |
| `packages/mvp_db/src/index.ts` | `appPrisma` (strict + semantic), `adminPrisma` (semantic only) |
| `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts` | 12 model-to-prefix mappings |
| `packages/mvp_db/src/seed-data/products.ts` | Canonical 4-product catalog |
| `packages/mvp_db/prisma/seed-desktop-test-fixtures.ts` | 8 integration-test user fixtures with stable license keys |
| `.github/workflows/build-layout-engine.yml` | Manual workflow; builds arm64 Docker image; pushes to ECR |
| `.github/workflows/deploy-layout-engine.yml` | Manual workflow; updates Lambda function code |
| `apps/mvp_api/vercel.json` | git auto-deploy disabled; rewrite to `/api/index` |
| `apps/api/vercel.json` | git auto-deploy NOT disabled |
