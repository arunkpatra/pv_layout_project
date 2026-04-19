# apps/api — Hono API Server

Hono v4 on Bun runtime (NOT Node.js). Auth via `@clerk/backend`. Testing via `bun:test` (NOT Vitest).

## Critical: Environment Variables

**Dev script reads env from repo root** via `--env-file ../../.env`.  
Do NOT create `apps/api/.env` — variables there are silently ignored by the dev server.  
`CLERK_SECRET_KEY` must be in the repo root `.env`.

## Auth Middleware (`middleware/auth.ts`)

- **Dev mode** (no `CLERK_SECRET_KEY`): auto-creates a mock user with `clerkId = "dev-clerk-id"` and skips token verification. This user persists in the DB.
- **Production mode**: verifies Bearer JWT via `@clerk/backend.verifyToken`, auto-creates the DB user on first sign-in (no-webhook pattern), rejects inactive users.
- Exposes `HonoEnv` type — use as the type parameter for all Hono `app`, routes, and middleware.

## Module Structure

```
modules/{domain}/
  {domain}.routes.ts   — Hono route definitions, calls service
  {domain}.service.ts  — Business logic, DB access via lib/db.ts
  {domain}.test.ts     — bun:test tests with mocked dependencies
```

## Responses and Errors

- **Always** use `ok(data)` and `err(code, message)` from `lib/response.ts` — never return raw objects
- **Always** throw `AppError` subclasses from `lib/errors.ts`: `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ValidationError`, `ConflictError`
- The error handler middleware catches `AppError` and formats `{ success: false, error: { code, message } }`

## Testing with bun:test

- Uses `bun:test` — `describe`, `test`, `expect`, `mock`, `beforeEach` (NOT Vitest's `vi.*`)
- `bunfig.toml` preloads `src/tests/preload.ts` before every test file — this mocks `@renewable-energy/db` and sets `DATABASE_URL`. Do not remove this.
- Use `mock.module("@renewable-energy/db", ...)` pattern — NOT `vi.mock`
- DB is always mocked in tests; never connects to a real database

## DB Access

- Import `db` from `lib/db.ts` only — it re-exports `prisma` from `@renewable-energy/db`
- Never import `@renewable-energy/db` directly in routes or services
