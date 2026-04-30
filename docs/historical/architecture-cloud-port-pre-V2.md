# Architecture and Technical Decisions

This document records the architectural decisions and rationale behind the project's technical choices. Update it when new decisions are made.

---

## Project Context

A B2B solar panel layout design tool. Users belong to organizations (teams/workspaces). The primary users are electrical engineers and solar site designers. The UI is form-heavy with map/KMZ upload and layout visualization capabilities. The project is being built incrementally — spike first, verify, then scale.

---

## Stack Overview

| Layer | Technology | Version |
|---|---|---|
| Monorepo | Turborepo + Bun | latest |
| Web app | Next.js App Router | 16 |
| UI library | shadcn/ui + Tailwind CSS | v4 |
| Icons | Phosphor Icons | latest |
| Auth | Clerk | latest |
| ORM | Prisma | v6 |
| Database | PostgreSQL | 17 |
| API framework | Hono | v4 |
| Testing | Vitest + React Testing Library | latest |

**Policy: always use the latest stable version of all frameworks and dependencies.**

---

## Monorepo Structure

```
apps/
  web/        → Next.js 16 App Router (primary user-facing application)
  api/        → Hono API server on Bun (planned)
packages/
  ui/         → Shared shadcn/ui component library
  db/         → Prisma client and schema (planned)
  eslint-config/
  typescript-config/
```

### Package Scope: `@renewable-energy/*`

**Decision:** Use `@renewable-energy/` as the npm scope for all internal packages.

**Rationale:** Meaningful, project-specific scope makes intent clear at a glance. Generic alternatives (`@workspace/`, `@repo/`) give no signal about the project domain. All packages are `private: true` and never published to npm — this is purely an internal identifier.

---

## Authentication: Clerk

**Decision:** Use Clerk for all authentication and B2B organization management.

**Rationale:**
- Clerk has native B2B support: organizations, memberships, roles, invitations — zero auth code to write
- Handles passwords, MFA, social login, session management out of the box
- `@clerk/nextjs` integrates directly with Next.js App Router middleware

### Ownership boundary

| Clerk owns | Prisma/Postgres owns |
|---|---|
| User identity, passwords, MFA, sessions | Extended user/org profiles |
| Organizations (teams), memberships, roles | All domain/business data |
| Invitations and auth flows | Anything referenced by `orgId` or `userId` |

User sync is no-webhook. On the first authenticated request (`GET /auth/me`), the API auth middleware verifies the Clerk JWT, looks up the user by `clerkId`, and upserts the record if it doesn't exist (fetching the Clerk profile via `@clerk/backend`). No webhook infrastructure is required.

---

## Database: PostgreSQL 17 + Prisma v6

**Decision:** PostgreSQL 17 via Docker for local dev. Prisma v6 as the ORM.

**Rationale:**
- PostgreSQL is the natural fit for relational B2B data with org/user/resource hierarchies
- Prisma v6 provides type-safe queries, schema-first migrations, and Prisma Studio for local inspection
- Docker ensures every developer runs the same database version with zero installation friction

### Local DB inspection tools

**Decision:** Use Prisma Studio (`bunx prisma studio`) and DBeaver. No pgAdmin container.

**Rationale:** pgAdmin adds a second Docker service with no benefit over tools the team already uses. Prisma Studio is zero-config and ships with Prisma itself.

### Connection

```
Host:     localhost:5432
Database: renewable_energy
User:     renewable
Password: renewable
```

`DATABASE_URL` lives in `.env` (gitignored). `.env.example` is the committed reference.

---

## API: Hono on Bun

**Decision:** Separate `apps/api` application using Hono v4, running on Bun.

**Rationale:**
- Hono is TypeScript-first, minimal, and purpose-built for Bun/edge runtimes
- Keeping the API separate from the Next.js app gives a clean boundary: `apps/web` handles UI and auth flows, `apps/api` handles business logic and data access
- Hono has built-in OpenAPI/Zod validation support for typed request/response contracts

### Data access boundary

**`apps/web` never imports `@renewable-energy/db` directly.** All data flows through the API:

```
apps/web  →  HTTP  →  apps/api  →  @renewable-energy/db  →  PostgreSQL
```

Only `apps/api` has `@renewable-energy/db` in its `package.json` dependencies. This keeps the web app a pure UI layer with no direct database coupling.

---

## Local Infrastructure: Docker Compose

**Decision:** Single `docker-compose.yml` at repo root, Postgres only.

**Rationale:** One command (`docker compose up -d`) gives every developer a working database. No other local services are needed at this stage. Additional services (Redis, etc.) will be added to this file if/when required.

---

## Build and Rollout Order

The project is built incrementally. Each step is spiked and verified before the next begins.

| Step | What | Status |
|---|---|---|
| 1 | Turborepo monorepo + Next.js web app + shadcn/ui | Done |
| 2 | GitHub Actions CI (lint, typecheck, test, build) | Done |
| 3 | Vitest + TDD infrastructure | Done |
| 4 | Docker Compose (Postgres 17) | Done |
| 5 | `packages/db` — Prisma schema + client | Done |
| 6 | Clerk auth in `apps/web` — sign in/up, middleware, dashboard redirect | Done |
| 7 | `apps/api` — Hono server, Clerk JWT auth, no-webhook user sync on first `GET /auth/me` | Done |
| 8 | `packages/api-client` — typed HTTP client; TanStack Query wiring in `apps/web` | Done |
