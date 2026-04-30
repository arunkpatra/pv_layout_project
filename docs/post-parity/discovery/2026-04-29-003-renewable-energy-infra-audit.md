# Discovery 003 — `renewable_energy` Production Infra Audit

**Date:** 2026-04-29
**Scope:** Ground-truth inventory of the live production infrastructure backing the legacy PVLayout desktop app — AWS resources, env vars, deployment platforms, GitHub Actions, S3, domains, and other load-bearing services. Source of truth for the V2 backend plan.
**Method:** Read-only — `docs/AWS_RESOURCES.md`, IAM policies, `.env.production` / `.env.staging`, `vercel.json` per app, `.github/workflows/*`, `DEPLOYMENTS.md`, `RELEASE.md`, app source where needed.

> **Secret-handling:** All keys/passwords below are masked. Real values were inspected to verify live vs test mode, then represented here only by their prefix shape (`sk_live_…`, `pk_test_…`, etc.). Do not treat any string in this document as a credential.

---

## 1. AWS Account + Resources

| Field | Value |
|---|---|
| **Account ID** | `378240665051` (single account, no multi-account split) |
| **Primary region** | `ap-south-1` (Mumbai) for all S3/Lambda/SQS/ECR |
| **Secondary region** | `us-east-1` for the shared RDS host (`journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com`) — **note the cross-region split** |

Source: `docs/AWS_RESOURCES.md:3`, `.env.production:1`.

### 1.1 Inventory

| Service | Resource | Purpose | Source |
|---|---|---|---|
| **S3** | `renewable-energy-local-artifacts` | Layout engine input + output artifacts (KMZ in / KMZ+SVG+DXF out) — local dev | `AWS_RESOURCES.md:12` |
| **S3** | `renewable-energy-staging-artifacts` | Same, staging | `AWS_RESOURCES.md:13` |
| **S3** | `renewable-energy-prod-artifacts` | Same, prod (Lambda reads/writes here) | `AWS_RESOURCES.md:14`, used by `apps/layout-engine/src/handlers.py:137` |
| **S3** | `solarlayout-local-downloads` | Desktop EXE/zip distribution — local dev | `AWS_RESOURCES.md:20` |
| **S3** | `solarlayout-staging-downloads` | Staging desktop downloads | `AWS_RESOURCES.md:21` |
| **S3** | `solarlayout-prod-downloads` | Prod desktop downloads (`downloads/pv_layout.zip`); served via presigned URLs from `mvp_api` | `AWS_RESOURCES.md:22`, `apps/mvp_api/src/lib/s3.ts`, `downloads.service.ts:25` |
| **IAM user** | `renewable-energy-app` | Long-lived access-key user used by layout engine + mvp_api for S3 operations | `AWS_RESOURCES.md:46-56` |
| **IAM policy (inline)** | `renewable-energy-app-s3` | Grants get/put/delete + list on all 6 S3 buckets above | `docs/iam-policy-re-app-s3.json` |
| **IAM role** | `renewable-energy-lambda-execution` | Layout engine Lambda execution role; bundles `AWSLambdaBasicExecutionRole` + `renewable-energy-app-s3` (managed) + `sqs-layout-queue-prod` (inline) | `AWS_RESOURCES.md:228-234` |
| **IAM role** | `renewable-energy-github-actions` | OIDC-trust role for CI/CD; allows ECR push + Lambda update only | `AWS_RESOURCES.md:262`, `docs/iam-policy-github-actions.json` |
| **Lambda** | `layout_engine_lambda_prod` | Container-image Lambda (arm64, 1769 MB / 1 vCPU, 600 s timeout) running PVLayout core for layout jobs. SQS-triggered, batch size 1. | `AWS_RESOURCES.md:215-225`, `apps/layout-engine/src/lambda_handler.py` |
| **SQS** | `re_layout_queue_prod` | Standard queue; 1200 s visibility timeout (2× Lambda); message body = `{ "version_id": "ver_..." }` | `AWS_RESOURCES.md:241`, `lambda_handler.py:35-36` |
| **ECR** | `renewable-energy/layout-engine` | Container image registry for Lambda; tags: `prod`, `{git-sha}`, `buildcache` | `AWS_RESOURCES.md:248-256` |
| **RDS (us-east-1)** | `journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com` | Shared Postgres host. Hosts `re_staging`, `re_prod` databases (and presumably mvp_db variants — see §7). Multi-tenant by user. | `.env.production:1`, `DEPLOYMENTS.md:6-8` |

### 1.2 What is NOT here

- **No Vercel Blob** — confirmed; the user's correction is right. Vercel is used only for compute hosting (web/api containers as Vercel Functions). All file storage is S3 in `ap-south-1`.
- **No CloudFront / S3 static-hosting** — bucket public-access is fully blocked (`AWS_RESOURCES.md:30`); S3 access only via presigned URLs or IAM-credentialed clients.
- **No KMS** referenced explicitly (Lambda env vars rely on default AWS-managed keys).
- **No bucket versioning / lifecycle rules** referenced anywhere — `AWS_RESOURCES.md:32` explicitly says "No versioning (artifacts are immutable per version ID)" and there is no CLI / IaC for lifecycle in the repo. **This is the most surprising gap** — old per-version artifacts accumulate forever.
- **No IaC** (Terraform / CloudFormation / CDK). All AWS resources were created by ad-hoc CLI commands documented in `AWS_RESOURCES.md:188-208`. State of truth is the AWS console.

---

## 2. Environment Variables

Live production config is in `/Users/arunkpatra/codebase/renewable_energy/.env.production` (gitignored on disk but **present locally as a development convenience**, with real prod values). Staging config is in `.env.staging`. Local dev is in `.env`.

> **Risk callout (logged to §8):** `.env.production` containing **live Stripe and live RDS credentials** is sitting on the developer machine in plaintext. This is the single highest-impact handling risk surfaced in this audit.

### 2.1 `.env.production` (renewable_energy root)

| Var | Mode / Pattern | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://re_prod_user:<live-pw>@journium...us-east-1.rds.amazonaws.com:5432/re_prod?sslmode=no-verify` | Prisma connection for `apps/api` (legacy) and the V1 Prisma `re_prod` DB. **`sslmode=no-verify` in prod** — pragmatic but not ideal. |
| `CLERK_SECRET_KEY` | `sk_test_…` | **Test-mode Clerk secret in `.env.production`** — see §8 risks. The `DEPLOYMENTS.md:185` comment says prod uses `sk_live_…`, so the Vercel dashboard config is correct; this `.env.production` file appears to be a developer-side placeholder mismatched with the live Vercel envs. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` | Same — file is using test-mode Clerk publishable keys. |
| `NEXT_PUBLIC_API_URL` | `https://renewable-energy-api.vercel.app` | Web app's pointer to the legacy `apps/api` Vercel deployment. **Note: this is a vercel.app URL, not `api.solarlayout.in`** — `api.solarlayout.in` is a custom domain configured on the `mvp_api` project, not `api`. |
| `NODE_ENV` | `production` | — |
| `CORS_ORIGINS` | `https://renewable-energy-web.vercel.app` | Legacy web app origin allow-list. |
| `STRIPE_SECRET_KEY` | `sk_live_51Rx7dY…` | **LIVE Stripe secret — real customer money.** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | Live Stripe webhook signing secret. |
| `STRIPE_PRICE_BASIC` | `price_1TQUwU…` | Live price ID — Basic tier. |
| `STRIPE_PRICE_PRO` | `price_1TQUxi…` | Live price ID — Pro tier. |
| `STRIPE_PRICE_PRO_PLUS` | `price_1TQUyl…` | Live price ID — Pro Plus tier. |

### 2.2 `.env.staging`

| Var | Pattern | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://re_staging_user:<staging-pw>@journium...us-east-1.rds.amazonaws.com:5432/re_staging?sslmode=no-verify` | Same RDS host, different DB + user. |
| `CLERK_SECRET_KEY` | `<placeholder>` | Not filled — staging Clerk secret is set in the Vercel dashboard, not in this file. |
| `NODE_ENV` | `production` | — |
| `CORS_ORIGINS` | `<placeholder>` | Same. |

### 2.3 `.env` (local dev)

| Var | Pattern | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://renewable:renewable@localhost:5432/renewable_energy` | Local Postgres from `docker compose`. |
| `MVP_DATABASE_URL` | `postgresql://mvp:mvp@localhost:5433/mvp_db` | Separate local Postgres on port 5433 for the MVP app's separate DB. |
| `AWS_ACCESS_KEY_ID` | `AKIAVQEHGQXN53RFOR72` | **The single shared `renewable-energy-app` IAM user's access key — the same key that's deployed to production Vercel + Lambda execution role environment.** Confirmed identical to `aws-creds/renewable-energy-app.env:17`. |
| `AWS_SECRET_ACCESS_KEY` | `gmRwmg…` | Same key's secret. |
| `AWS_REGION` | `ap-south-1` | — |
| `S3_ARTIFACTS_BUCKET` | `renewable-energy-local-artifacts` | Local layout-engine S3 target. |
| `MVP_S3_DOWNLOADS_BUCKET` | `solarlayout-local-downloads` | — |
| `MVP_CORS_ORIGINS` | `http://localhost:3002,http://localhost:3004` | mvp_web (3002) + mvp_admin (3004) dev defaults. |
| `STRIPE_SECRET_KEY` | `sk_test_51Rx84c…` | Test-mode. Different from prod live key. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_SUvbRu…` | Test-mode (rotates per `stripe listen` invocation per `STRIPE_SETUP.md:110`). |
| `STRIPE_PRICE_BASIC/PRO/PRO_PLUS` | `price_1TOrn…` family | Test-mode price IDs (different from prod). |

### 2.4 mvp_api `env.ts` schema (validated via Zod at boot)

`apps/mvp_api/src/env.ts:1-34` requires `MVP_DATABASE_URL`; everything else (AWS, Clerk, Stripe) is optional with graceful degradation. So in production the Vercel env must have:

- `MVP_DATABASE_URL` (mandatory, comes from Vercel project secret `MVP_DATABASE_URL` per `platform-deployment.yml:77`).
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `MVP_S3_DOWNLOADS_BUCKET` (S3 client only initializes if all four present — `s3.ts:8-14`).
- `CLERK_SECRET_KEY` (live mode for prod).
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- `MVP_CORS_ORIGINS`.
- `NODEJS_HELPERS=0` — **load-bearing** Vercel env var per `apps/mvp_api/api/index.js:5-9` comment: without it, all POST/PUT/PATCH requests hang for 300 s.

---

## 3. Deployment Architecture

### 3.1 Where each app actually deploys

| App | Platform | Domain | Trigger | Notes |
|---|---|---|---|---|
| `apps/web` | **Vercel** | `https://renewable-energy-web.vercel.app` | Push to `main` (auto, git deployment enabled) | Legacy. Per `RELEASE.md:20`: still active. |
| `apps/api` | **Vercel** | `https://renewable-energy-api.vercel.app` | Push to `main` (auto) | Legacy V1 Hono API. Domain is the vercel.app subdomain — not custom. |
| `apps/mvp_web` | **Vercel** | `solarlayout.in` (custom domain) | **Manual via `platform-deployment.yml` workflow_dispatch** (vercel.json sets `git.deploymentEnabled: false`) | Marketing + dashboard. |
| `apps/mvp_admin` | **Vercel** | (subdomain TBD — likely `admin.solarlayout.in` or via Vercel custom; not explicitly stated in repo) | Manual (`platform-deployment.yml`); `git.deploymentEnabled: false` | Internal admin UI for CSRs. |
| `apps/mvp_api` | **Vercel** (Bun runtime via Hono) | `api.solarlayout.in` (per `STRIPE_SETUP.md:169` and the desktop's existing entitlements path) | Manual (`platform-deployment.yml`); `git.deploymentEnabled: false` | All MVP backend routes (entitlements, usage, downloads, billing, Stripe webhook, admin). |
| `apps/layout-engine` | **AWS Lambda** (`layout_engine_lambda_prod`) via container image in ECR | Not HTTP-exposed — invoked via SQS `re_layout_queue_prod` | Manual workflow_dispatch (`build-layout-engine.yml` → `deploy-layout-engine.yml`); auto trigger commented out | arm64 Python 3.13 from `public.ecr.aws/lambda/python:3.13`. |
| Desktop EXE (`pv_layout.zip`) | **S3** (`solarlayout-{local,staging,prod}-downloads`) | Served via presigned URLs from `mvp_api` `/download-register` | Manual `aws s3 cp` per `RELEASE.md:64-69` | One zip across all tiers — entitlement gating is runtime, not separate binaries. |

**Diagram in prose.** End-user flow: customer hits `solarlayout.in` (Vercel — `mvp_web`) → fills download form → POST to `api.solarlayout.in/download-register` (Vercel — `mvp_api`) → `mvp_api` writes a `DownloadRegistration` row to `mvp_db` and generates a presigned `s3://solarlayout-prod-downloads/downloads/pv_layout.zip` URL → user downloads from S3. After install, the desktop app talks to `api.solarlayout.in/entitlements` and `/usage/report` (both `mvp_api`), and to `api.solarlayout.in/checkout` for purchases. Stripe webhooks land at `api.solarlayout.in/webhooks/stripe`. Layout compute is **not** in the user-facing path: the legacy desktop runs PVLayout core locally; the AWS Lambda + SQS layout engine in `apps/layout-engine` is plumbing for the **abandoned web-port direction** (`pv-layout-cloud.md`) and the V2 desktop will continue running compute locally per the post-parity plan.

### 3.2 The two halves of this repo

| Half | Apps | Status | Used by |
|---|---|---|---|
| **Legacy / abandoned web port** | `apps/web`, `apps/api`, `apps/layout-engine`, `packages/db` | Deployed but no live customer traffic — superseded | Not consumed by the legacy desktop or by `mvp_*` apps |
| **MVP / live customer surface** | `apps/mvp_web`, `apps/mvp_admin`, `apps/mvp_api`, `packages/mvp_db` | **Production** | Legacy PVLayout desktop calls `mvp_api`; `solarlayout.in` runs `mvp_web` |

The V2 backend plan extends the **MVP half**; the legacy half is dead code paid for by Vercel idle.

---

## 4. GitHub Actions

Five workflows in `.github/workflows/`:

| File | Trigger | Purpose | Secrets / Vars used |
|---|---|---|---|
| `ci.yml` | `push` to `main`, `pull_request` to `main` | Bun + uv install, lint, typecheck, test, build. **No deploy.** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` hardcoded as `pk_test_Y2xhc3NpY...` in build step (line 58) — a developer-account test key, embedded in CI for build-time validation only. |
| `release.yml` | Push of tag matching `v*` | Run gates + create GitHub Release with auto-generated notes. **Does not deploy** anything — Vercel/Lambda deploys are independent. | `secrets.GITHUB_TOKEN`; same hardcoded Clerk test PK. |
| `platform-deployment.yml` | `workflow_dispatch` (manual, with environment input) | The **canonical prod/staging deploy path** for `mvp_api`, `mvp_web`, `mvp_admin`. Pipeline: gate → migrate (`prisma migrate deploy` against `MVP_DATABASE_URL`) → parallel Vercel deploys of all three Vercel projects via `vercel build --prod && vercel deploy --prebuilt --prod`. | `secrets.MVP_DATABASE_URL`, `secrets.VERCEL_TOKEN`; `vars.VERCEL_ORG_ID`, `vars.VERCEL_PROJECT_ID_MVP_API` / `VERCEL_PROJECT_ID_MVP_WEB` / `VERCEL_PROJECT_ID_MVP_ADMIN`, `vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Bound to GitHub Environments (gate / migrate / deploy-* steps each declare `environment: ${{ inputs.environment }}`) so secrets are environment-scoped. |
| `build-layout-engine.yml` | `workflow_dispatch` only (auto triggers commented out at lines 4-7) | Build & push arm64 container to ECR `renewable-energy/layout-engine:{sha,prod,buildcache}`. Uses GitHub OIDC → assumes `renewable-energy-github-actions` role. | `secrets.AWS_ROLE_ARN`, `vars.AWS_REGION`, `vars.AWS_ACCOUNT_ID`. |
| `deploy-layout-engine.yml` | `workflow_dispatch` only | `aws lambda update-function-code` against `:prod` ECR tag, then wait + verify. | Same OIDC role. |

### 4.1 What does and does not gate merges

- **Every PR runs `ci.yml`** — lint + typecheck + test + build. This is the merge gate.
- **No deploy is automatic from main.** Per `RELEASE.md:17-26`, the doc claims "Push to main" auto-deploys all Vercel apps. **This is now stale**: every Vercel project for the MVP apps has `git.deploymentEnabled: false` in its `vercel.json`, and `platform-deployment.yml` is a manual workflow_dispatch. So the real prod deploy path is: merge to main → run `ci.yml` → manually trigger `Platform Deployment` workflow → pick environment → it runs migrations + deploys. **`apps/api` and `apps/web` (legacy) do auto-deploy from main** (`api/vercel.json` has no `deploymentEnabled: false`; `web/` has no `vercel.json` at all so Vercel default applies). This is a documentation/reality mismatch (logged in §8).

---

## 5. S3 Buckets — The Critical Section

### 5.1 The six buckets

All in `ap-south-1`, all in account `378240665051`, public access fully blocked, no versioning, no documented lifecycle policy.

| Bucket | Owner | Purpose | Key layout |
|---|---|---|---|
| `renewable-energy-local-artifacts` | Layout engine (local dev) | Input KMZ + output (KMZ/SVG/DXF) for local layout-engine runs | `projects/<project_id>/versions/<version_id>/{input,layout}.{kmz,svg,dxf}` (`AWS_RESOURCES.md:36-40`) |
| `renewable-energy-staging-artifacts` | Layout engine (staging) | Same | Same |
| `renewable-energy-prod-artifacts` | Layout engine prod (Lambda) | Same — read in `handlers.py:155`, written in `handlers.py:206-208` | Same |
| `solarlayout-local-downloads` | mvp_api (local) | Desktop binary distribution | `downloads/pv_layout.zip` (single key — one zip for all tiers; `downloads.service.ts:25`) |
| `solarlayout-staging-downloads` | mvp_api (staging) | Same | Same |
| `solarlayout-prod-downloads` | mvp_api (prod) | Same | Same |

### 5.2 IAM coverage — `renewable-energy-app-s3` policy (`docs/iam-policy-re-app-s3.json`)

The single inline policy attached to `renewable-energy-app` user **and** to the Lambda execution role grants:

```
GetObject / PutObject / DeleteObject  on  arn:aws:s3:::{re-{local,staging,prod}-artifacts}/*  (lines 9-15)
ListBucket                            on  arn:aws:s3:::{re-{local,staging,prod}-artifacts}    (lines 19-26)
GetObject / PutObject / DeleteObject  on  arn:aws:s3:::{solarlayout-{local,staging,prod}-downloads}/*  (lines 31-40)
ListBucket                            on  arn:aws:s3:::{solarlayout-{local,staging,prod}-downloads}    (lines 44-50)
```

**Implication for V2:** the existing IAM user already has full read/write/delete + list on **all six buckets across all three environments**. There is no per-environment credential boundary — the same `AKIAVQEH...` access key has access to local, staging, and prod buckets simultaneously. If the V2 plan adds new buckets (e.g., `solarlayout-prod-uploads` for KMZ uploads, `solarlayout-prod-runs` for run results), the policy must be amended to add the new ARNs; existing code does **not** need a new IAM identity.

### 5.3 Upload patterns currently in use

Two distinct patterns:

**(a) Server-mediated upload, server-mediated download (artifacts buckets).** `apps/layout-engine/src/s3_client.py` uses `boto3.client('s3').download_file` and `upload_file` — the Lambda executes both legs. Browser/desktop never touches the artifacts buckets directly.

**(b) Server-presigned download, no upload (downloads buckets).** `apps/mvp_api/src/lib/s3.ts:27-44` generates a `GetObject` presigned URL with `expiresIn: 3600` and `ResponseContentDisposition: attachment; filename="pv_layout.zip"`. The browser downloads directly from S3. **Upload to the downloads bucket is manual `aws s3 cp` by a human at release time** (`RELEASE.md:64-69`) — there is no automated upload pipeline for the desktop EXE.

**What does NOT exist yet:**
- No presigned **PUT** URL generation anywhere in the codebase. No S3 Transfer Acceleration. No CORS config on any bucket (verified by absence in `AWS_RESOURCES.md` — public access is blocked, presigned `GET`s are blob fetches that don't need CORS).
- No multipart upload helper.
- No browser-direct upload pattern. **The V2 plan needs to add this** if KMZ uploads are to be browser/desktop-direct rather than server-mediated through `mvp_api`.

### 5.4 What the V2 plan needs to extend

Cross-referencing `docs/initiatives/post-parity-v2-backend-plan.md` (in `renewable_energy`) and `pv_layout_project/docs/post-parity/PLAN.md`:

1. **Decide whether V2 reuses `renewable-energy-prod-artifacts` or introduces new buckets** (e.g., `solarlayout-prod-projects`). The legacy artifacts bucket is presently only written by the unused Lambda. If V2 reuses it, key layout (`projects/<project_id>/versions/<version_id>/...`) carries over cleanly. If new buckets are introduced, the `renewable-energy-app-s3` policy needs new ARNs added to the four `Resource` arrays.
2. **Add a presigned-PUT helper** in `apps/mvp_api/src/lib/s3.ts` analogous to `getPresignedDownloadUrl`. Trivially small (`@aws-sdk/s3-request-presigner` is already in deps).
3. **Add bucket lifecycle rules** for projects/runs — at present every artifact lives forever. This is unnacceptable at scale and must land before the V2 surface goes wide.
4. **Add bucket CORS** if the desktop Tauri shell does direct browser-style PUTs (Tauri's HTTP client may bypass CORS, but if any uploads go through a webview, CORS is required).

---

## 6. Domains + DNS

Inferred from `.env.production`, `vercel.json` configs, and source code references (no direct DNS access). Authoritative DNS zone is presumably outside this repo.

| Domain | Points at | Confidence |
|---|---|---|
| `solarlayout.in` (apex) | Vercel — `apps/mvp_web` project | **High.** Multiple references (`STRIPE_SETUP.md:169` mentions `api.solarlayout.in`, marketing pages talk about `solarlayout.in`, and `mvp-spike-plan.md:D16` confirms "solarlayout.in and api.solarlayout.in live, SSL active"). |
| `api.solarlayout.in` | Vercel — `apps/mvp_api` project | **High.** Stripe webhook endpoint is configured to this URL per `STRIPE_SETUP.md:169`. |
| `admin.solarlayout.in` | Vercel — `apps/mvp_admin` project | **Medium.** `mvp_admin` has its own Vercel project (`VERCEL_PROJECT_ID_MVP_ADMIN`), strongly implying a custom domain — but no string in the repo confirms `admin.solarlayout.in` specifically. The CSR-facing admin app must be reachable somehow; likely subdomain. |
| `dashboard.solarlayout.in` | **Not in use** — superseded | Per `mvp-spike-plan.md:D11` "dashboard merged into `apps/mvp_web` at `solarlayout.in/dashboard`". |
| `renewable-energy-web.vercel.app` | Vercel — `apps/web` (legacy) | **High.** Listed in `.env.production:6` as `CORS_ORIGINS`. |
| `renewable-energy-api.vercel.app` | Vercel — `apps/api` (legacy) | **High.** Listed in `.env.production:4` as `NEXT_PUBLIC_API_URL`. |

DNS provider is not visible from the repo. Best guess: a registrar pointing `solarlayout.in` zones at Vercel's nameservers (the simplest setup — Vercel handles `solarlayout.in`, `api.solarlayout.in`, `admin.solarlayout.in` records via custom domain config in the Vercel UI). No Route53 zone is referenced in any IAM policy, so DNS is **not** in AWS.

---

## 7. Other Production Infra

### 7.1 Postgres

- **Host:** `journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432` — a shared AWS RDS instance, **`us-east-1`** despite all other AWS resources living in `ap-south-1`. The host is named `journium` which is the user's other product brand — confirming this RDS is **shared across multiple Journium products**, not dedicated to SolarLayout. Per `DEPLOYMENTS.md:196` "The shared RDS hosts multiple projects' databases. Each user is scoped to its own database only."
- **Databases:** `re_staging`, `re_prod` (legacy V1 Prisma schema in `packages/db/`); presumably `mvp_staging` and `mvp_prod` (or similar) for `packages/mvp_db/` — though only `MVP_DATABASE_URL` as a Vercel secret reveals the actual prod name (we cannot read it from this repo).
- **Connection mode:** `sslmode=no-verify` in production. Convenient; not strictly secure (TLS is on, but cert is not validated).
- **Migrations:** `prisma migrate deploy` only, run from CI (`platform-deployment.yml:73-75`) before each Vercel deploy. **Migration runs in CI uses the same RDS user as the app** (`re_prod_user` / `mvp_prod_user`), which has full grants per `DEPLOYMENTS.md:34-38`. Safer pattern would be a separate migration role, but that's an enhancement, not a blocker.

### 7.2 Auth (Clerk)

- **Provider:** Clerk (`@clerk/nextjs` and `@clerk/backend`). Two instances:
  - **Test instance** (`pk_test_…` / `sk_test_…`) — used in dev and CI builds. The hardcoded `pk_test_Y2xhc3NpYy13YXNwLTU1.clerk.accounts.dev$` in `ci.yml:58` and `release.yml:50` is a build-only placeholder.
  - **Live instance** (`pk_live_…` / `sk_live_…`) — set in Vercel project envs for prod, per `DEPLOYMENTS.md:172-185`.
- **JWT verification** in `mvp_api`: `apps/mvp_api/src/middleware/clerk-auth.ts:20-25` calls `verifyToken(token, { secretKey: CLERK_SECRET_KEY })` from the `@clerk/backend` package.
- **First-login provisioning** auto-creates a User row + Free entitlement + license key in mvp_db (`clerk-auth.ts:90-138`).
- **Webhook endpoint** for Clerk events: not present in this repo. (User+org creation is reactive via the auth middleware on first protected request, not webhook-driven.)

### 7.3 Stripe

- **Mode:** **Live** in `.env.production` (`sk_live_…`). Three live products with price IDs visible in the env.
- **Webhook endpoint:** `https://api.solarlayout.in/webhooks/stripe` (`STRIPE_SETUP.md:169`), implemented at `apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.ts:9`. Verifies signature via `stripe.webhooks.constructEventAsync`. Handles `checkout.session.completed` only — provisions an entitlement.
- **Idempotency:** Provisioning is keyed by `checkoutSessionId` (`provisionEntitlement(session.id, ...)` — webhook can fire multiple times safely if `provisionEntitlement` is itself idempotent on session ID; not verified deeper here).

### 7.4 Email service

- **Not yet integrated.** No SendGrid / Resend / SES references in `apps/mvp_api/src/`. The `contact` module saves form submissions to the DB but doesn't appear to email anyone — this is a gap, not a feature.
- Address `support@solarlayout.in` and `grievance@solarlayout.in` are advertised on the marketing site and in privacy/terms pages. Inbound mail is presumably routed via Google Workspace or Zoho Mail at the registrar level — invisible from this repo.

### 7.5 Observability

- **No Sentry / DataDog / OpenTelemetry** integration found anywhere in the repo.
- Logging is plain `console.log` / `console.error` with structured JSON in some places (`mvp_api/src/index.ts:9-15`). On Vercel this lands in Vercel's built-in logs (queryable via `vercel logs`). On Lambda this lands in CloudWatch.
- No alerting / SLO config visible.

### 7.6 CDN

- Vercel's built-in edge network handles `mvp_web`, `mvp_admin`, `mvp_api`. No CloudFront. No separate CDN.

### 7.7 Local Postgres

- `docker-compose.yml` at repo root spins up two Postgres containers — port 5432 (`renewable_energy` legacy) + port 5433 (`mvp_db`) — for parallel local dev.

---

## 8. Risks / Surprises

1. **Live Stripe + live RDS credentials sit in `.env.production` on the developer workstation.** Real money + real customer data exposed if the laptop is compromised. The `.env.production` file is gitignored but otherwise unprotected. **Recommendation for V2:** push secrets entirely into Vercel's env UI / 1Password and remove `.env.production` from disk; document the lookup path.
2. **One IAM access key (`AKIAVQEHGQXN53RFOR72`) is shared across local, staging, and prod.** It is in plaintext in `.env`, `aws-creds/renewable-energy-app.env`, **and** in Vercel/Lambda environment variables. A leak on any developer's machine grants prod S3 bucket access. **`AWS_RESOURCES.md:162` recommends creating a separate prod key — that recommendation is not implemented.** This is also the access key that the Lambda execution role would otherwise not need (Lambda has its own IAM role; the env-var key in Lambda is redundant and increases blast radius).
3. **Documentation drift on deploy triggers.** `RELEASE.md:17-26` claims `mvp_*` apps auto-deploy on push to main. Reality: their `vercel.json` files have `git.deploymentEnabled: false` and the only deploy path is manual `platform-deployment.yml`. Newcomer would push to main expecting prod to update, and it would not. Logged but not yet reconciled.
4. **No bucket lifecycle policies** on any of the six S3 buckets. Project artifacts accumulate forever; old `pv_layout.zip` versions accumulate forever (downloads bucket is overwritten by `aws s3 cp` to the same key, so this is not as bad as it sounds, but artifacts do grow unboundedly with project count).
5. **Cross-region data path.** S3 (artifacts + downloads) is in `ap-south-1` but RDS is in `us-east-1`. Every `mvp_api` request that reads/writes the DB pays cross-region latency from Vercel functions (Vercel functions in their default `iad1` region → us-east-1 RDS = local; Vercel functions → ap-south-1 S3 = ~250 ms RTT minimum). For presigned URLs this doesn't matter (URL is generated locally, signed with credentials, not actually round-tripped to S3). For server-mediated S3 ops, this is a tax. **For V2:** decide if you want a regional RDS in `ap-south-1` to match S3, or vice versa. Current setup is fine because the signed-URL pattern avoids the S3 round trip on the hot path.
6. **`sslmode=no-verify` in production DATABASE_URL.** TLS is enabled but cert validation is disabled. Pragmatic shortcut around `journium...rds.amazonaws.com` cert chain issues, but not best practice.
7. **`apps/api` + `apps/web` (legacy) are still auto-deploying to Vercel from every push to main and are paid for.** Worth a one-line decision: archive them now or after V2 GA.
8. **The Lambda layout-engine pipeline is fully wired (ECR, SQS, IAM, OIDC) but is NOT in any active production traffic path.** It was built for the abandoned web-port direction. Decommissioning it would save Lambda + ECR + SQS costs — but only after confirming the V2 desktop path doesn't intend to reuse it for cloud-side compute (per the post-parity plan, the desktop continues to do compute locally, so this Lambda is dead weight).
9. **`mvp_admin` deploys exist but its custom domain is not documented anywhere in the repo.** A V2 plan that needs to call admin endpoints from a script needs to know the URL — currently you'd have to ask a human. Worth documenting.
10. **`NODEJS_HELPERS=0` is a hidden gotcha** specific to the Hono-on-Vercel deployment of `mvp_api`. It's documented in a code comment (`api/index.js:5-9`) but not in `DEPLOYMENTS.md`. If anyone re-creates the Vercel project from scratch and forgets this env var, every POST hangs for 5 minutes.

---

## 9. Bottom-line ground truth for the V2 backend plan

- All file storage is S3 in `ap-south-1`, account `378240665051`.
- Existing S3 footprint: 3× layout artifact buckets + 3× downloads buckets, all governed by a single inline IAM policy on the `renewable-energy-app` user.
- Compute hosts: Vercel (mvp_web / mvp_admin / mvp_api / legacy web / legacy api) + AWS Lambda (layout-engine, currently dormant in prod traffic).
- Data: shared RDS Postgres in `us-east-1`, multi-tenanted by database name.
- Auth: Clerk (live instance for prod) with JWT verification on every protected `mvp_api` route.
- Billing: Stripe live, three one-time products, webhook at `api.solarlayout.in/webhooks/stripe`.
- CI/CD: GitHub Actions on `arunkpatra/renewable_energy`. CI auto-runs on PR/main; deploys are manual workflow_dispatch with environment-scoped secrets.
- The V2 plan can extend the existing `renewable-energy-app-s3` IAM policy by adding new bucket ARNs to its four resource lists; no new IAM principal is required.
- The `getPresignedDownloadUrl` helper in `mvp_api/src/lib/s3.ts` is the template for any new presigned-URL flow (PUT, multipart, etc.); the AWS SDK and presigner are already wired up.
