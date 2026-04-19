# Renewable Energy — Deployment Guide

## Environments

| Environment | Database | Web | API |
|---|---|---|---|
| Staging | `re_staging` on shared RDS (`journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com`) | TBD (Vercel) | TBD (Vercel) |
| Production | `re_prod` on shared RDS (`journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com`) | TBD (Vercel) | TBD (Vercel) |

---

## Staging

### Database Setup (one-time)

Run as the RDS admin user (`journium_db_adm`).

> **Note:** `\c` is a `psql`-only meta-command and does not work in DBeaver.
> Use separate connection sessions per database instead.

**Step 1** — Connect to the default `postgres` database as admin and run:

```sql
CREATE DATABASE re_staging;

CREATE USER re_staging_user WITH PASSWORD '<password>';

GRANT ALL PRIVILEGES ON DATABASE re_staging TO re_staging_user;
```

**Step 2** — Open a new connection to `re_staging` as admin and run:

```sql
GRANT ALL ON SCHEMA public TO re_staging_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO re_staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO re_staging_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO re_staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO re_staging_user;
```

> Verify the grant landed:
> ```sql
> SELECT nspacl FROM pg_namespace WHERE nspname = 'public';
> -- re_staging_user=UC should appear in the output
> ```

### Prerequisites

`.env.staging` at repo root (gitignored):

```
DATABASE_URL=postgresql://re_staging_user:<password>@journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432/re_staging
CLERK_SECRET_KEY=<staging clerk secret key>
NODE_ENV=production
CORS_ORIGINS=<vercel-web-staging-url>
```

### Run Migrations

> Always use `migrate deploy` (not `migrate dev`) for staging and production.

```bash
cd packages/db && DATABASE_URL=$(grep DATABASE_URL ../../.env.staging | cut -d= -f2-) bunx prisma migrate deploy
```

> **Shell special characters in passwords (e.g. `!`):** Use single quotes to pass the URL literally:
> ```bash
> cd packages/db && DATABASE_URL='postgresql://re_staging_user:pass!word@journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432/re_staging?sslmode=no-verify' bunx prisma migrate deploy
> ```

### Seed the Database

> Pass `DATABASE_URL` inline — Bun auto-loads root `.env` (localhost credentials) on startup
> and overrides any shell-exported vars. Inline assignment takes highest precedence.

```bash
cd packages/db && DATABASE_URL="postgresql://re_staging_user:<password>@journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432/re_staging?sslmode=no-verify" bun run prisma/seed.ts
```

> **Do not use `bun run db:seed` via turbo** — it also runs `db:migrate` (which calls `migrate dev`,
> development-only) and does not reliably pass `DATABASE_URL` through to the seed script.

### Vercel Environment Variables

**Web app (`apps/web`):**

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` (staging Clerk instance) |
| `CLERK_SECRET_KEY` | `sk_test_...` (staging Clerk instance) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` | `/dashboard` |
| `NEXT_PUBLIC_API_URL` | `<vercel-api-staging-url>` |

**API server (`apps/api`):**

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://re_staging_user:<password>@journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432/re_staging` |
| `CLERK_SECRET_KEY` | `sk_test_...` (staging Clerk instance) |
| `CORS_ORIGINS` | `<vercel-web-staging-url>` |

> `NODE_ENV` and `PORT` are set automatically by Vercel — do not add them manually.

---

## Production

### Database Setup (one-time)

Run as the RDS admin user. Same process as staging.

**Step 1** — Connect to the default `postgres` database as admin and run:

```sql
CREATE DATABASE re_prod;

CREATE USER re_prod_user WITH PASSWORD '<password>';

GRANT ALL PRIVILEGES ON DATABASE re_prod TO re_prod_user;
```

**Step 2** — Open a new connection to `re_prod` as admin and run:

```sql
GRANT ALL ON SCHEMA public TO re_prod_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO re_prod_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO re_prod_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO re_prod_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO re_prod_user;
```

> Verify the grant landed:
> ```sql
> SELECT nspacl FROM pg_namespace WHERE nspname = 'public';
> -- re_prod_user=UC should appear in the output
> ```

### Prerequisites

`.env.production` at repo root (gitignored):

```
DATABASE_URL=postgresql://re_prod_user:<password>@journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432/re_prod
CLERK_SECRET_KEY=<prod clerk secret key>
NODE_ENV=production
CORS_ORIGINS=<vercel-web-production-url>
```

### Run Migrations

```bash
cd packages/db && DATABASE_URL="postgresql://re_prod_user:<password>@journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432/re_prod" bunx prisma migrate deploy
```

### Seed the Database

```bash
cd packages/db && DATABASE_URL="postgresql://re_prod_user:<password>@journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432/re_prod?sslmode=no-verify" bun run prisma/seed.ts
```

### Vercel Environment Variables

**Web app (`apps/web`):**

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` (production Clerk instance) |
| `CLERK_SECRET_KEY` | `sk_live_...` (production Clerk instance) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` | `/dashboard` |
| `NEXT_PUBLIC_API_URL` | `<vercel-api-production-url>` |

**API server (`apps/api`):**

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://re_prod_user:<password>@journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432/re_prod` |
| `CLERK_SECRET_KEY` | `sk_live_...` (production Clerk instance) |
| `CORS_ORIGINS` | `<vercel-web-production-url>` |

> `NODE_ENV` and `PORT` are set automatically by Vercel — do not add them manually.

---

## Notes

- Always use `prisma migrate deploy` (not `migrate dev`) for staging and production.
- Pass `DATABASE_URL` inline when running migrations or seeds — never `source` or `export` it. Bun auto-loads the root `.env` (localhost) on startup and overrides shell-exported vars.
- The shared RDS hosts multiple projects' databases. Each user is scoped to its own database only.
- Secrets must never be committed. Use `.env.staging` / `.env.production` locally; Vercel dashboard for deployed environments.
- Deployment order when first standing up an environment: DB setup → migrations → deploy API → deploy web (web needs the API URL; API needs CORS set to the web URL — update both after first deploy).
