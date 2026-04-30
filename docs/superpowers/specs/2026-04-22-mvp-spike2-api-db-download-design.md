# Spike 2 — MVP DB + MVP API + Download Registration Design Spec

**Date:** 2026-04-22
**Spike Plan Reference:** `docs/initiatives/mvp-spike-plan.md` (Spike 2)
**Depends on:** Spike 1 (complete)

---

## 1. Goal

Scaffold `packages/mvp_db` (Prisma + Postgres) and `apps/mvp_api` (Hono on Bun), then implement the download registration endpoint. Wire the Products page DownloadModal to call the API and trigger an exe file download from S3.

---

## 2. Architecture

### New package: `packages/mvp_db`

- Own Prisma schema, own Postgres DB (`mvp_db`, port 5433 local)
- Env var: `MVP_DATABASE_URL`
- Copy of semantic ID infrastructure from `packages/db` (independent, not shared — acceptable duplication)
- Exports: `appPrisma`, `adminPrisma`, `prisma` (same pattern as `packages/db`)
- ID prefix for Spike 2: `drg` (DownloadRegistration)
- Testing: `bun:test`, unit tests for semantic ID generation only

### New app: `apps/mvp_api`

- Hono v4 on Bun, port 3003 local
- Mirrors `apps/api` patterns:
  - Typed `HonoEnv` (no user context in Spike 2 — unauthenticated)
  - CORS middleware (origins from `CORS_ORIGINS` env var)
  - Error handler middleware (catches `AppError`, formats `{ success, error }`)
  - Request logger middleware (JSON structured logs)
  - `ok(data)` / `err(code, message)` response helpers
  - `AppError` hierarchy: `NotFoundError`, `ValidationError`, `ConflictError`
- Imports `@renewable-energy/mvp-db` via `lib/db.ts` re-export
- S3 integration: `lib/s3.ts` with `getPresignedDownloadUrl` (rewritten for MVP bucket)
- Env var: `MVP_S3_DOWNLOADS_BUCKET`
- Dev script: `bun run --env-file ../../.env --hot src/index.ts` (port 3003)
- Vercel deployment: `@hono/node-server` entry point, same `vercel.json` rewrite pattern
- Testing: `bun:test` with mocked `@renewable-energy/mvp-db`

### Infrastructure changes

- `docker-compose.yml`: new `mvp_postgres` service on port 5433
- `turbo.json`: `@renewable-energy/mvp-db` tasks mirroring `@renewable-energy/db` (`mvp-db:generate`, build depends on generate)
- Root `.env`: new vars `MVP_DATABASE_URL`, `MVP_S3_DOWNLOADS_BUCKET`, `CORS_ORIGINS` (for mvp_api)

---

## 3. Data Model

```prisma
model DownloadRegistration {
  id        String   @id @default("")
  name      String
  email     String
  mobile    String?
  product   String
  ipAddress String
  createdAt DateTime @default(now())

  @@map("download_registrations")
}
```

- No unique constraint on email — every download creates a new row (audit trail)
- No `User` model in Spike 2 — user accounts come in Spike 8 (dashboard)
- ID prefix: `drg`

---

## 4. API Endpoint

### `POST /download-register`

**Auth:** None (unauthenticated)

**Request body (Zod validated):**
```typescript
{
  name: string      // required, min 1
  email: string     // required, valid email format
  mobile?: string   // optional
  product: string   // required, one of "PV Layout Basic" | "PV Layout Pro" | "PV Layout Pro Plus"
}
```

**Server-side:**
1. Validate request body with Zod
2. Extract IP from `X-Forwarded-For` header (Vercel sets this), fallback to `"unknown"`
3. Insert `DownloadRegistration` row in mvp_db
4. Map product name to S3 key:
   - "PV Layout Basic" → `downloads/pv-layout-basic.exe`
   - "PV Layout Pro" → `downloads/pv-layout-pro.exe`
   - "PV Layout Pro Plus" → `downloads/pv-layout-pro-plus.exe`
5. Generate presigned S3 download URL (1 hour expiry, `Content-Disposition: attachment`)
6. Return `ok({ downloadUrl })`

**Response (success):**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://s3.amazonaws.com/..."
  }
}
```

**Response (validation error):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": { ... }
  }
}
```

---

## 5. S3 Configuration

- Bucket: `MVP_S3_DOWNLOADS_BUCKET` env var (separate from cloud platform bucket)
- Key prefix: `downloads/`
- Three exe files uploaded manually by the user before wiring is tested
- Presigned URL: `getPresignedDownloadUrl(key, filename, expiresIn=3600)` with `Content-Disposition: attachment`

---

## 6. Frontend Wiring

**`apps/mvp_web` changes:**

- New env var: `NEXT_PUBLIC_MVP_API_URL` (local: `http://localhost:3003`, prod: `https://api.solarlayout.in`)
- Update `DownloadModal` from stubbed toast to real API call:
  1. `POST` to `${NEXT_PUBLIC_MVP_API_URL}/download-register`
  2. On success: `window.location.href = data.downloadUrl` (triggers browser download)
  3. Show toast: "Download started"
  4. On error: show toast with error message

---

## 7. Data Flow

```
User clicks Download on Products page
  → DownloadModal opens (name, email, mobile, T&C checkbox)
  → Submit: POST to mvp_api /download-register
    → Zod validates { name, email, product }
    → Extract IP from X-Forwarded-For
    → Insert DownloadRegistration row
    → Generate presigned S3 URL
    → Return { downloadUrl }
  → Frontend: window.location.href = downloadUrl
  → Browser downloads the exe file
  → Toast: "Download started"
```

---

## 8. Error Handling

| Scenario | Response |
|---|---|
| Missing/invalid fields | 400 ValidationError with field details |
| Invalid product name | 400 ValidationError |
| DB write failure | 500 internal error |
| S3 unavailable / no bucket configured | 500 internal error (registration still saved) |

---

## 9. Testing

**`packages/mvp_db`:**
- `bun:test` for semantic ID generation (prefix mapping, format validation)
- DB never connected in tests

**`apps/mvp_api`:**
- `bun:test` with mocked `@renewable-energy/mvp-db`
- Mock S3 (`lib/s3.ts`)
- Tests:
  - Valid registration saves row and returns presigned URL
  - Missing required fields returns 400
  - Invalid product name returns 400
  - IP extraction from headers

**`apps/mvp_web`:**
- Update DownloadModal test: mock `fetch`, verify API call, verify download trigger on success

---

## 10. Module Structure

```
packages/mvp_db/
  prisma/schema.prisma
  src/index.ts                    — appPrisma, adminPrisma, prisma exports
  src/extensions/semantic-id/     — copied from packages/db (independent)
  src/tests/                      — bun:test for ID generation

apps/mvp_api/
  src/index.ts                    — Bun server entry
  src/app.ts                      — Hono app setup, middleware, route mounting
  src/env.ts                      — Zod env validation
  src/lib/db.ts                   — re-export prisma from @renewable-energy/mvp-db
  src/lib/response.ts             — ok(), err()
  src/lib/errors.ts               — AppError hierarchy
  src/lib/s3.ts                   — S3 client + getPresignedDownloadUrl
  src/middleware/error-handler.ts  — catches AppError
  src/middleware/logger.ts         — structured JSON logs
  src/modules/downloads/
    downloads.routes.ts            — POST /download-register
    downloads.service.ts           — validation, DB insert, S3 URL generation
    downloads.test.ts              — bun:test with mocked deps
  api/index.ts                    — Vercel serverless entry
  vercel.json                     — rewrite rules
```

---

## 11. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Copy semantic ID infra into `packages/mvp_db` | Full independence from cloud platform; acceptable duplication |
| D2 | No User model in Spike 2 | User accounts come in Spike 8 (dashboard signup); zero friction downloads |
| D3 | No unique constraint on email in DownloadRegistration | Every download is a trackable event; full audit trail |
| D4 | Separate S3 bucket (`MVP_S3_DOWNLOADS_BUCKET`) | Clean separation from cloud platform artifacts |
| D5 | IP from X-Forwarded-For header | Vercel sets this; fallback to "unknown" |
