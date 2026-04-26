# Release Process

This document describes how to cut a release for the SolarLayout platform.

## Versioning

We use [Semantic Versioning](https://semver.org/): `vMAJOR.MINOR.PATCH` (e.g., `v0.1.0`).

- **MAJOR** — breaking changes (API contracts, DB schema incompatibility)
- **MINOR** — new features, new pages, new API endpoints
- **PATCH** — bug fixes, copy changes, styling tweaks

Current phase: `v0.x.x` (pre-1.0, public beta).

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

## Creating a Release

### 1. Make sure all gates pass

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

### 2. Create and push a tag

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the **Release** workflow which:
- Runs all gates (lint, typecheck, test, build)
- Creates a GitHub Release with auto-generated notes from commits since the last tag
- Marks the release as pre-release for `v0.x.x`

### 3. Verify

- Check the **Actions** tab — the Release workflow should complete successfully
- Check **Releases** — the new release should appear with auto-generated notes
- Check **Vercel** — deployments should be live (triggered by the push to main, not the tag)

## Pre-Release Checklist

Before tagging:

1. **All changes merged to `main`** and CI passing
2. **Database migrations (if any):** apply to staging first, then prod
3. **Seed data (if changed):**
   ```bash
   MVP_DATABASE_URL="<staging-url>" bun run packages/mvp_db/prisma/seed-products.ts
   MVP_DATABASE_URL="<prod-url>" bun run packages/mvp_db/prisma/seed-products.ts
   ```
4. **Desktop EXE (if updated):**
   ```bash
   source aws-creds/renewable-energy-app.env
   aws s3 cp <path-to-exe> s3://solarlayout-local-downloads/downloads/pv_layout.exe --copy-props none
   aws s3 cp <path-to-exe> s3://solarlayout-staging-downloads/downloads/pv_layout.exe --copy-props none
   aws s3 cp <path-to-exe> s3://solarlayout-prod-downloads/downloads/pv_layout.exe --copy-props none
   ```

## Hotfix Process

1. Fix on `main` (or short-lived branch → merge to main)
2. Run all gates
3. Tag as patch: `git tag v0.1.1 && git push origin v0.1.1`
4. Vercel auto-deploys on push; release workflow creates the GitHub Release
