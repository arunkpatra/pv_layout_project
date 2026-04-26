# Release Process

This document describes how to cut a release for the SolarLayout platform.

## Versioning

We use [calendar versioning](https://calver.org/): `YYYY.MM.DD` (e.g., `2026.04.26`).
If multiple releases happen on the same day, append a patch number: `2026.04.26.1`.

## What Gets Deployed

| Component | Deployment | Trigger |
|---|---|---|
| `apps/web` | Vercel (auto) | Push to `main` |
| `apps/mvp_web` | Vercel (auto) | Push to `main` |
| `apps/api` | Vercel (auto) | Push to `main` |
| `apps/mvp_api` | Vercel (auto) | Push to `main` |
| `apps/mvp_admin` | Vercel (auto) | Push to `main` |
| `apps/layout-engine` | AWS Lambda | Manual workflow dispatch |
| Desktop EXE (`pv_layout.exe`) | S3 buckets | Manual upload |

## Pre-Release Checklist

Before creating a release:

1. **All gates pass on the branch:**
   ```bash
   bun run lint && bun run typecheck && bun run test && bun run build
   ```

2. **Branch is up to date with main:**
   ```bash
   git fetch origin main
   git rebase origin/main
   ```

3. **Database migrations (if any):**
   - Run `bun run db:status` to check pending migrations
   - Apply with `bun run db:migrate` on staging first, then prod

4. **Seed data (if changed):**
   ```bash
   # Staging
   MVP_DATABASE_URL="<staging-url>" bun run packages/mvp_db/prisma/seed-products.ts

   # Production
   MVP_DATABASE_URL="<prod-url>" bun run packages/mvp_db/prisma/seed-products.ts
   ```

5. **Desktop EXE (if updated):**
   ```bash
   source aws-creds/renewable-energy-app.env
   aws s3 cp <path-to-exe> s3://solarlayout-local-downloads/downloads/pv_layout.exe --copy-props none
   aws s3 cp <path-to-exe> s3://solarlayout-staging-downloads/downloads/pv_layout.exe --copy-props none
   aws s3 cp <path-to-exe> s3://solarlayout-prod-downloads/downloads/pv_layout.exe --copy-props none
   ```

## Creating a Release

### Option 1: GitHub UI

1. Go to **Releases** > **Draft a new release**
2. Click **Choose a tag** > type the version (e.g., `2026.04.26`) > **Create new tag**
3. Set target to `main`
4. Title: `2026.04.26`
5. Click **Generate release notes** (auto-generates from PRs/commits)
6. Review and edit the notes
7. Publish

### Option 2: GitHub CLI

```bash
# Create tag and release with auto-generated notes
gh release create 2026.04.26 --target main --generate-notes --title "2026.04.26"
```

### Option 3: Automated (GitHub Actions)

Run the **Create Release** workflow from the Actions tab:
1. Go to **Actions** > **Create Release**
2. Click **Run workflow**
3. Enter the version tag (or leave blank for today's date)
4. The workflow creates the tag, generates release notes, and publishes

## Post-Release

1. **Verify Vercel deployments** completed successfully for all apps
2. **Verify production** — check key pages and API health
3. **Layout engine** (if changed) — run the Deploy Layout Engine workflow
4. **Monitor** — check Vercel logs and error tracking for the first hour

## Hotfix Process

For urgent fixes after a release:

1. Create a fix on `main` directly (or a short-lived branch)
2. Run all gates
3. Push to `main` — Vercel auto-deploys
4. Create a patch release: `2026.04.26.1`

## Environment URLs

Read from `.env.production` — never hardcode:

| App | URL |
|---|---|
| Web (public) | `renewable-energy-web.vercel.app` |
| API | `renewable-energy-api.vercel.app` |
| MVP Web | Check Vercel dashboard |
| MVP API | Check Vercel dashboard |
| MVP Admin | Check Vercel dashboard |
