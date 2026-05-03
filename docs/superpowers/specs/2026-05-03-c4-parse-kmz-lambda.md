# C4 — `parse-kmz` Lambda end-to-end

**Status:** Brainstorm output (2026-05-03). Approved for writing-plans.
**Row:** C4 in [`2026-05-03-cloud-offload-architecture.md`](./2026-05-03-cloud-offload-architecture.md) §9.
**Branch:** `feat/c4-parse-kmz-lambda`.
**Locked decisions:** D2, D5, D7, D10.
**Spec amendment landed during this brainstorm:** v1.7 (commit `023a18b`) — burn-the-boats per row; drop USE_CLOUD_* dual-path scaffolding across §8 + C4/C9/C17/C18/C19 row text.

---

## 1. Context

C3 established the Lambda monorepo skeleton and the GitHub Actions OIDC + ECR push pipeline. C3.5 added the local-dev parallel HTTP transport (`server.py` per Lambda; `lambda-invoker.ts` in mvp_api).

C4 is the first Lambda that does real work. It replaces the sidecar's `/parse-kmz` route end-to-end: KMZ archive in → parsed boundaries / obstacles / line obstructions / centroid out. The parse-kmz workload is small, sync-invoked, and the simplest possible "real cloud Lambda" — chosen first deliberately so pattern decisions (IAM scope, error-envelope shape, mvp_api orchestration) get worked out on a low-stakes surface before scaling to compute-layout (C6).

**Why this row matters as a precedent:** C4's choices cascade. The Lambda input shape (`{bucket, key}` vs alternatives), the error envelope (`{ok, code, message}`), the mvp_api invocation pattern (lambda-invoker → invoke), the IAM minimum-privilege model, and the validation surface — all four of these designs get reused at C6 (compute-layout), C16 (detect-water), and C18 (compute-energy). Get them right once.

## 2. Locked architectural posture

**Burn the boats** (per spec §8 v1.7 amendment): no feature flag, no dual-path code, no rollback toggle. C4's PR merge IS the cutover for the parse-kmz surface. Sidecar `/parse-kmz` route stays alive but becomes orphan code from merge time; deletion is C19. Pre-launch reality (co-founder dogfood; no external customers) makes this acceptable.

**Bundle scope in C4:** the redundant `sidecar.parseKmz` call in the open-project flow (App.tsx `handleOpenProjectById`) is also deleted; post-C4, every project open reads `parsedKmz` from B14's response directly — no re-parse. This eliminates the second parse-kmz call site, reduces total Lambda calls per project lifetime to exactly one, and dodges a future bridging row.

## 3. Six design decisions

### Q1 — Flow timing: create-first

**Path 1 (locked):**
```
[+ New project clicked]
  ↓
[Native file picker]                             — extension filter (.kmz/.kml) — first defense
  ↓
[Staged modal opens]
  ├─ Stage 1: Upload boundary file               (B6 mint URL → S3 PUT)
  ├─ Stage 2: Create your project                (B11 createProjectV2)
  └─ Stage 3: Read boundaries                    (POST /v2/projects/:id/parse-kmz → Lambda)
  ↓
[Modal auto-dismisses; canvas renders parsed boundaries]
```

Project creation precedes parse. mvp_api looks up the project's `kmzBlobUrl`, parses bucket+key, invokes Lambda. Lambda fetches from S3, parses, returns the parsed payload. mvp_api persists to `Project.parsedKmz` (new column — see Q7) and returns to desktop.

**UX latency budget (worst-case):** 1–7s on first-of-session (Lambda cold start ~3-5s); 1–2s warm. Staged modal masks the latency by showing explicit per-stage progress.

**Trade-off rejected:** Path 2 (parse-first, inline bytes via mvp_api → Lambda Payload) preserves today's <1s parse latency but introduces a different Lambda input shape than the rest of the arc (compute-layout, detect-water always read from S3). Single pattern wins; UX latency masked by staged modal.

### Q2 — Lambda input shape: explicit `{bucket, key}`

```python
# Lambda event (sync invoke from mvp_api)
{
  "bucket": "solarlayout-staging-projects",   # parsed from Project.kmzBlobUrl
  "key":    "projects/usr_xyz/prj_abc/kmz/<sha256>.kmz"
}
```

mvp_api owns env-to-bucket resolution via existing `MVP_S3_PROJECTS_BUCKET` env var (per `apps/mvp_api/src/lib/s3.ts` + `projects.service.ts:73`); the bucket name is already baked into `Project.kmzBlobUrl` at upload time. mvp_api's small `parseS3Url(blobUrl) → {bucket, key}` helper splits the URI before invoking Lambda.

**Lambda is bucket-agnostic.** No env var on the Lambda side; no RDS access required (pure stateless transform). This means **non-VPC Lambda** — 2-3s cold start instead of the 5-10s cold start a VPC-attached Lambda would suffer from ENI initialization. compute-layout at C6 will be VPC-attached (it needs RDS); parse-kmz dodges that cost.

**Rejected:** RDS-fetch-the-URL (Lambda queries Project table) — overkill; adds VPC requirement for one SELECT. Implicit bucket env var per Lambda — env-name drift risk; explicit per-call is honest.

### Q3 — Error envelope: structured Lambda↔mvp_api, uniform mvp_api↔desktop

**Lambda return shape** (kept structured for ops observability):
```python
# success
{"ok": True, "parsed": {...full ParsedKMZ shape...}}

# known failures
{"ok": False, "code": "KMZ_NOT_FOUND",   "message": "...", "key": "..."}
{"ok": False, "code": "INVALID_KMZ",     "message": "...", "trace": "..."}
{"ok": False, "code": "INTERNAL_ERROR",  "message": "...", "trace": "..."}
# Lambda raises only for unexpected exceptions; lambda-invoker translates to INTERNAL_ERROR.
```

**mvp_api → desktop wire** (collapsed to one user-facing path):
```ts
// success
200 OK { ...parsed payload... }

// any failure
500 { code: "INTERNAL_ERROR",
      message: "Something went wrong setting up your project. Please try again, or contact support if it keeps happening." }
```

Server-side observability keeps full granularity (CloudWatch + future Sentry); customer UX collapses to one message because EPC/IPP-side users can't act differently on `KMZ_NOT_FOUND` vs `INVALID_KMZ` vs `INTERNAL_ERROR` — all paths lead to "try again or contact support."

**Server-side cleanup is uniform** (per Q1's bundle): on ANY Lambda failure, mvp_api auto-DELETEs the Project row (B25 internal call) AND refunds the quota slot (`UsageRecord` with `kind='refund'`, `refundsRecordId=<original create>`). One policy; one code path; user's quota stays accurate.

### Q4 — No feature flag

`USE_CLOUD_PARSE` does not exist. v1.7 spec amendment codified this across the whole arc (USE_CLOUD_LAYOUT and USE_CLOUD_EXPORTS are also gone). The new path is the only path post-C4 merge. Pre-launch reality (co-founder dogfood) accommodates the brief windows of partial Tauri functionality between rows.

### Q5 — Defer pre-warm

Cold-start latency on first-of-session is masked by the staged modal's explicit progress. Pre-warm (firing a tiny Lambda call on app launch) was considered and deferred:
- Adds code surface (Tauri hook + mvp_api endpoint + Lambda warmup branch) we'd delete at C19.
- Half-measure: Lambda goes cold after ~10-15min idle; user who takes a coffee break before clicking + sees cold start anyway.
- Real fix is provisioned concurrency (per spec D non-goals; v2 ladder).

If post-cutover dogfood reveals the cold-start UX is painful, escalate to provisioned concurrency, not pre-warm.

### Q6 — Staged modal UX (locked defaults; tweakable at smoke)

Modal mounts at App.tsx top-level (same pattern as `UpsellModal`). Single React state `stage: idle | uploading | creating | parsing | error | done`. Three stage rows; per-stage time displayed (helps user calibrate); 300ms "all-green" pause before auto-dismiss for closure. Cancel button always enabled; per-stage cleanup logic decides what to call (no-op for stage 1; B25 DELETE for stages 2-3 if Project exists).

Error states collapse to the uniform copy from Q3 with two buttons — `[Cancel]` (close, no file picker) and `[Try again]` (close, reopen file picker). Per Q3's auto-cleanup, the orphan project is already deleted server-side before the user clicks either button.

### Q7 — Data model: new `Project.parsedKmz Json?` column

**Decision:** option α — new nullable Json column on Project. Migration is standard staging→prod via Prisma.

The existing `Project.boundaryGeojson` column stores polygon-only GeoJSON-spec geometry (used for thumbnails / placeholder fallbacks per B26). `parsedKmz` is the wider canvas-render payload — boundaries with name, coords, obstacles, water_obstacles, line_obstructions, plus centroid. The Lambda populates **both** columns on every parse (`boundaryGeojson` is computed as a subset of `parsedKmz.boundaries`).

**Wire shape addition** (entitlements-client `types-v2.ts` adds `ParsedKmz` Zod schema; `ProjectV2Wire` extends with `parsedKmz: ParsedKmz | null`).

**Pre-C4 project wipe at cutover.** Pre-launch privilege: Arun confirmed prod DB cleanup is fine. Cutover SQL or Prisma script removes pre-C4 Project rows (those with no `parsedKmz`). Co-founders re-create their test projects post-merge as part of smoke.

### Validation gradient (Lambda-side; levels 1–4 in C4)

Field intelligence (Arun, 2026-05-03) confirmed users have uploaded garbage KMZs — structurally valid KMZ archives with no usable plant boundaries, sub-3-vertex polygons, etc. The Tauri file picker's extension filter catches `.txt` renames but not garbage-content. Lambda enforces domain validation as the second-line defense.

| Level | Check | C4 scope |
|---|---|---|
| 1 | `boundaries[]` non-empty | YES |
| 2 | Each boundary has ≥3 coords | YES |
| 3 | Each coord within WGS84 range (-90/90 lat, -180/180 lon) | YES |
| 4 | Each polygon `is_valid` (Shapely; no self-intersection) | YES |
| 5 | Plausible area range (e.g., 5 ha to 100 km²) | DEFER (Prasanta to weigh in on bounds) |
| 6 | Boundaries don't overlap each other | DEFER (multi-plot edge cases) |

All validation failures return `{ok: false, code: "INVALID_KMZ"}` with the failed-check name in the internal `message` field. Per Q3, user sees the uniform error message; ops see the specific check.

## 4. Lambda execution-role IAM (security, locked)

Minimum-privilege execution role per env:

```
arn:aws:iam::378240665051:role/solarlayout-parse-kmz-{staging,prod}-execution

Permissions:
  s3:GetObject       on  arn:aws:s3:::solarlayout-{staging,prod}-projects/*
  logs:CreateLogGroup,
  logs:CreateLogStream,
  logs:PutLogEvents  on  the Lambda's own CloudWatch log group
```

**Nothing else.** No KMS, no SSM, no SQS, no other S3 buckets, no Lambda invoke chain. The Lambda is a pure stateless transform with read-only S3 access scoped to one bucket per env.

## 5. CI / OIDC role extension (additive to C3-shipped role)

The `solarlayout-github-actions` OIDC role from C3 currently grants ECR + Lambda perms scoped to `solarlayout/smoketest`. C4 extends additively (smoketest entries STAY during the cutover window because C4's first commit deletes them):

```
Add to the role's inline policy:
  ecr:*                          on  arn:aws:ecr:ap-south-1:378240665051:repository/solarlayout/parse-kmz
  lambda:UpdateFunctionCode      on  arn:aws:lambda:ap-south-1:378240665051:function:solarlayout-parse-kmz-{staging,prod}
  lambda:GetFunction             on  same ARNs (status checks during deploy)
  iam:PassRole                   on  the parse-kmz execution roles (assigning role to function)
```

C4's first commit subsequently removes the smoketest entries (per v1.4 amendment).

## 6. Architecture (consolidated)

**New project flow (post-C4):**

```
[Tauri new-project click]
  ↓
[Native file picker — .kmz/.kml filter]
  ↓ bytes
[uploadKmzToS3 → B6 mint upload URL → S3 PUT]
  ↓ kmzBlobUrl, kmzSha256
[client.createProjectV2 (B11)]                ─→  Project row created with kmzBlobUrl
  ↓ project.id
[client.parseKmzV2(projectId)]                ─→  POST /v2/projects/:id/parse-kmz
                                                    ↓
                                    [mvp_api: parseS3Url(project.kmzBlobUrl)]
                                                    ↓ {bucket, key}
                                    [lambdaInvoker.invoke("parse-kmz", {bucket, key})]
                                                    ↓
                                    [Lambda (cloud OR local server.py)]
                                              s3:GetObject the KMZ
                                              parse via pvlayout_core
                                              validate (levels 1-4)
                                              return {ok, parsed} or {ok: false, code, message}
                                                    ↓
                                    [mvp_api: persist parsedKmz + boundaryGeojson on Project]
                                                    ↓
                                    [mvp_api: 200 + ParsedKmz to desktop]
  ↓
[Canvas renders boundaries + obstacles + line_obstructions + water]
```

**Open existing project flow (post-C4):**

```
[handleOpenProjectById]
  ↓
[client.getProjectV2 (B14)]                   ─→  Project incl. parsedKmz
  ↓
[Canvas renders directly from parsedKmz — NO sidecar.parseKmz call]
```

**Local dev:** parse-kmz Lambda runs natively via `cd python/lambdas/parse-kmz && uv run python -m parse_kmz_lambda.server` per C3.5 D24 pattern. mvp_api with `USE_LOCAL_ENVIRONMENT=true` routes via `lambda-invoker` to `localhost:4101`. The local server.py uses the dev's AWS credentials (`~/.aws/credentials`) to `s3:GetObject` against real `solarlayout-local-projects` bucket — same as today's mvp_api code does for thumbnails.

## 7. Artifacts C4 produces

| Path | Purpose | Lifecycle |
|---|---|---|
| `python/lambdas/parse-kmz/` (new dir; full structure per C3 README) | The Lambda | Durable until C19; new structure scaffolded as the first "real" Lambda |
| `python/lambdas/parse-kmz/parse_kmz_lambda/handler.py` | AWS Lambda entry point — fetches from S3, parses, validates, returns | Durable |
| `python/lambdas/parse-kmz/parse_kmz_lambda/server.py` | Local-dev HTTP entry per C3.5 pattern (sync-mode; POST /invoke; port 4101) | Durable |
| `python/lambdas/parse-kmz/Dockerfile` | Production Lambda image (per C3 canonical template) | Durable |
| `python/lambdas/parse-kmz/pyproject.toml` | Deps: `pvlayout-core`, `boto3`, `shapely` | Durable |
| `python/lambdas/parse-kmz/tests/test_handler.py` | 8 unit tests (success + 7 failure modes) | Durable |
| `python/lambdas/smoketest/` | DELETED in C4's first commit (per v1.4) | Removed |
| `apps/mvp_api/src/modules/projects/parse-kmz.service.ts` (or extend existing projects.service) | New route handler | Durable |
| `apps/mvp_api/src/modules/projects/projects.routes.ts` | New `POST /v2/projects/:id/parse-kmz` route | Durable extension |
| `apps/mvp_api/src/lib/s3.ts` | Add `parseS3Url(blobUrl)` helper | Durable extension |
| `packages/mvp_db/prisma/schema.prisma` | Add `Project.parsedKmz Json?` column | Migration |
| `packages/mvp_db/prisma/migrations/<ts>_project_parsed_kmz/migration.sql` | The migration | Durable |
| `packages/entitlements-client/src/types-v2.ts` | Add `ParsedKmz` Zod schema; extend `ProjectV2Wire` with `parsedKmz` | Durable |
| `packages/entitlements-client/src/client.ts` | Add `parseKmzV2(projectId)` method | Durable |
| `apps/desktop/src/project/CreateProjectModal.tsx` | New staged-modal component | Durable |
| `apps/desktop/src/auth/useCreateProject.ts` | REWRITTEN — file pick → upload → create → parse, drives the modal | Durable replacement |
| `apps/desktop/src/auth/useCreateProject.test.tsx` | Tests REPLACED for new 3-stage flow | Durable replacement |
| `apps/desktop/src/App.tsx` | `handleOpenProjectById` loses `sidecar.parseKmz` call; reads `parsedKmz` from B14 | Durable change |
| `apps/desktop/src/project/parsedKmzFromWire.ts` | New helper — converts wire `ParsedKmz` to canvas-render shape | Durable |
| `docs/AWS_RESOURCES.md` | Updated: drop smoketest ECR entry; add parse-kmz ECR + Lambda entries (staging + prod); IAM role docs | Durable |

## 8. Smoke (per spec §11.2 + C4 row)

**Local (ST-C4-L)** — driven by Arun, bite-sized per §11.4. mvp_api dev server pointed at local Postgres + local AWS profile. Tauri pointed at localhost:3003. Pick a real customer KMZ, observe staged modal progression, confirm parsed boundaries render. Plus garbage-KMZ scenarios for validation levels 1-4.

**Staging (ST-C4-S)** — AWS-only smoke against staging Lambda. Direct `aws lambda invoke` with a real staging-bucket S3 key; verify CloudWatch shows the invocation; verify response shape; verify CloudWatch logs carry the structured `{code}` for failure cases.

**Prod (ST-C4-P)** — deferred to phase-end (C21) per row's Smoke trigger field.

## 9. Forward-looking notes (for downstream rows)

- **C6 compute-layout** inherits the Lambda input pattern (`{bucket, key, ...}` event), error envelope (`{ok, code, message}`), and IAM minimum-privilege model. Adds RDS access (psycopg2) — needs VPC config; pays the ~5s ENI cold start that parse-kmz dodges.
- **C7 mvp_api orchestrator** reuses the `parseS3Url` helper added in C4 for compute-layout's S3 key resolution.
- **C16 detect-water + C18 compute-energy** mirror C4's pattern: Lambda input is `{bucket, key, ...domain params}`; same envelope; same validation gradient if relevant.
- **C19 sidecar deletion** removes the orphan `/parse-kmz` route along with the rest of the sidecar. By C19, every cloud path has been live for at least one release cycle; this row is the atomic deletion of every dormant sidecar surface.

## 10. Out of scope (explicit, repeating spec C4)

- Production deployment (staging only at this row).
- Lambda timeout tuning beyond defaults (30s timeout, 512MB memory; sufficient for KMZs <50MB).
- IaC (Terraform / CDK).
- Cache layer.
- Validation levels 5-6 (area range; boundary overlap).
- Pre-warm hook (deferred per Q5).
- Status enum on Project for in-flight visibility (e.g., `DRAFT` / `READY`); the transient inconsistency window (project exists with `parsedKmz=null` for 1-7s) is acceptable for v1.

---

*End of brainstorm. Next step per spec §13.1 rule #4: invoke `superpowers:writing-plans` after Arun reviews this document.*
