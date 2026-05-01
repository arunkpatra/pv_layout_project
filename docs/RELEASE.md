# Release Process

How to cut a release for the SolarLayout platform — both the cloud
stack (`apps/mvp_*`, `packages/mvp_db`) and the Tauri desktop app
(`apps/desktop` + `python/pvlayout_engine`).

> **Read first if you've cut releases before in `renewable_energy`:** the
> deployment mechanism changed at the 2026-05-01 merge. Vercel does
> NOT auto-deploy on push to `main` anymore. Cloud deploys go through
> `.github/workflows/platform-deployment.yml`, which is `workflow_dispatch`
> only (you trigger it manually from the Actions tab with an `environment`
> input). See §3.

---

## 1. Versioning

[Semantic Versioning](https://semver.org/): `vMAJOR.MINOR.PATCH`.

- **MAJOR** — breaking changes (V2 wire contracts, DB schema break, license-key shape change).
- **MINOR** — new features, new pages, new API endpoints, new desktop capabilities.
- **PATCH** — bug fixes, copy/styling tweaks, internal cleanup.

Current phase: `v0.x.x` (pre-1.0; pre-launch on the desktop side).

The `v0.0.*-s*` tags in history (`v0.0.0-s0` through `v0.0.13.2-s10.2`) are pre-merge artifacts from the spike-driven era. New tags after 2026-05-01 should drop the `-sNN` suffix and follow plain semver.

---

## 2. What ships, where, and how

| Component | Hosted on | Deploy mechanism | Trigger |
|---|---|---|---|
| `apps/mvp_web` (`solarlayout.in`) | Vercel | Vercel CLI from GitHub Actions | Manual `workflow_dispatch` of `platform-deployment.yml` |
| `apps/mvp_admin` (`admin.solarlayout.in`) | Vercel | Vercel CLI from GitHub Actions | Same workflow |
| `apps/mvp_api` (`api.solarlayout.in`) | Vercel | Vercel CLI from GitHub Actions | Same workflow |
| `packages/mvp_db` migrations | AWS RDS Postgres (us-east-1) | `bunx prisma migrate deploy` from GitHub Actions | Same workflow (runs first) |
| Desktop installer (`.msi` / `.dmg` / `.AppImage`) | S3 `solarlayout-{local,staging,prod}-downloads` | **Manual upload (no automated pipeline yet)** | Local build → `aws s3 cp` |
| Sidecar bundle (`pvlayout-engine[.exe]`) | Embedded inside the desktop installer via `bundle-sidecar.mjs` | Built locally, then bundled by Tauri | Part of the desktop release flow |

**Things that are NOT auto-deployed anymore:**
- No Vercel git integration. The Vercel projects are still wired to the old `renewable_energy` repo on the Git tab — that's cosmetic and ignored. Real deploys go through the `platform-deployment.yml` workflow which uses `vercel deploy --prod` via CLI.
- `release.yml` (tag trigger) **does not produce installers**. See §6.

---

## 3. Cloud release (mvp_web + mvp_admin + mvp_api + DB)

This is the stack on Vercel + AWS RDS. The pipeline lives in `.github/workflows/platform-deployment.yml`.

### 3.1 Pre-flight

```bash
# From repo root — same gate CI runs.
bun run lint && bun run typecheck && bun run test && bun run build
cd python/pvlayout_engine && uv run pytest tests/ -q
```

If anything red, fix before tagging.

### 3.2 Database migrations

The `migrate` job runs **on every deploy**, before any of the three Vercel app deploys. It executes `bunx prisma migrate deploy` against the target environment's `MVP_DATABASE_URL` secret. When there are no pending migrations the job is a fast no-op; when there are, it applies them in order.

You don't have to do anything manual to deploy migrations — the workflow handles it.

What you might want to do as a sanity check before triggering the workflow:

```bash
# Pattern — credentials live in gitignored .env.staging / .env.production
# at repo root. See memory/reference_db_credentials.md for the values.

# Preview what's pending against staging.
set -a; . ./.env.staging; set +a
bunx prisma migrate status --schema=packages/mvp_db/prisma/schema.prisma

# Same against production.
set -a; . ./.env.production; set +a
bunx prisma migrate status --schema=packages/mvp_db/prisma/schema.prisma
```

If `migrate status` shows pending migrations against prod that you don't expect, **stop and investigate** before triggering the deploy. The workflow will apply them as-is.

For destructive migrations (column drops, type changes that can't be rolled back), apply them to staging first via a `staging`-only deploy and verify the cloud apps still work, then run the production deploy.

### 3.3 If there are seed-data changes

Seed data isn't part of the auto pipeline — apply manually:

```bash
set -a; . ./.env.staging; set +a
bun run packages/mvp_db/prisma/seed-products.ts

set -a; . ./.env.production; set +a
bun run packages/mvp_db/prisma/seed-products.ts
```

### 3.4 Trigger the deploy

GitHub UI → Actions → "Platform Deployment" → "Run workflow" → choose
environment (`staging` or `production`) → Run.

The workflow:
1. Runs all four gates against the target environment's secrets.
2. Runs `prisma migrate deploy` against `MVP_DATABASE_URL`.
3. Deploys `mvp_api` to Vercel.
4. Deploys `mvp_web` to Vercel.
5. Deploys `mvp_admin` to Vercel.

Each Vercel deploy uses `vercel deploy --prod` with the team's `VERCEL_TOKEN`.

### 3.5 Verify

- **Actions tab** — workflow run shows all jobs green.
- **`https://api.solarlayout.in/`** — should return the API root response (200).
- **`https://api.solarlayout.in/v2/entitlements`** — should return 401 without a license key (proves auth gate is live).
- **`https://solarlayout.in`** — should render the marketing site.
- **`https://admin.solarlayout.in`** — should render the Clerk sign-in (admin gate).
- **DB migration status** — re-run §3.2 commands; should show "Database schema is up to date!"

---

## 4. Cut a GitHub Release tag (notes-only)

After the cloud deploy lands, tag the release so the GitHub Releases page tracks it.

```bash
# From main, after deploy is verified live.
git tag v0.1.0
git push origin v0.1.0
```

This triggers `.github/workflows/release.yml`:
- Runs the four JS gates one more time on Ubuntu (sanity check; expected to be green).
- Calls `gh release create $TAG --generate-notes --prerelease` (prerelease flag set automatically while we're on `v0.x`).

**Important:** this workflow does NOT build any installers, does NOT deploy anything, and does NOT upload artifacts. It only creates a Release page on the GitHub repo with auto-generated notes from commits since the last tag. Treat it as a release-notes mechanism, not a build pipeline.

---

## 5. Desktop release (Tauri app + PyInstaller sidecar)

> **Status as of 2026-05-01:** no installer of any kind has ever been built for any platform. The Phase 1 work in Spike 1 produced a Python sidecar bundle for macOS arm64 (one-off, in `apps/desktop/src-tauri/binaries/`); no Tauri shell has ever been built. The instructions below describe how to do the first build manually. CI automation lands in a future spike.

### 5.1 Prerequisites per platform

| Platform | Tooling required |
|---|---|
| **macOS (arm64 + x64)** | Xcode CLI tools, Rust toolchain (`rustup`), `bun`, `uv`, Apple Developer ID (for signing + notarization, can defer for first prerelease) |
| **Windows** | Visual Studio 2022 Build Tools (C++), WebView2 runtime, Rust toolchain, `bun`, `uv`, Git for Windows; EV code-signing cert (deferred — first prereleases will trigger SmartScreen "Unrecognized app" warnings until signed) |
| **Linux** | Standard build tooling (gcc, libwebkit2gtk-4.1-dev for Tauri 2 webview), Rust toolchain, `bun`, `uv` |

### 5.2 Build the sidecar binary first

The Tauri build expects `python/pvlayout_engine/dist/pvlayout-engine[.exe]` to exist. Build it on each target OS:

```bash
cd python/pvlayout_engine
uv sync --extra dev
uv run pyinstaller pvlayout-engine.spec --noconfirm --clean

# Verify it works.
bash scripts/smoke_binary.sh        # READY + /health
bash scripts/smoke_parallel.sh      # parallel ProcessPoolExecutor (macOS + Linux only;
                                    # Windows lacks pgrep — skip on Windows)
```

This produces `dist/pvlayout-engine[.exe]` (~52 MB).

### 5.3 Build the Tauri app

```bash
cd apps/desktop
bun install
bun run tauri:build
```

`tauri:build` runs `bundle:sidecar` (which copies the sidecar binary into `src-tauri/binaries/pvlayout-engine-<target-triple>[.exe]`) then `tauri build`. Produces:

| Platform | Output path | File |
|---|---|---|
| macOS arm64 | `apps/desktop/src-tauri/target/release/bundle/dmg/` | `solarlayout-desktop_<version>_aarch64.dmg` |
| macOS x64 | `apps/desktop/src-tauri/target/release/bundle/dmg/` | `solarlayout-desktop_<version>_x64.dmg` |
| Windows | `apps\desktop\src-tauri\target\release\bundle\msi\` | `solarlayout-desktop_<version>_x64_en-US.msi` |
| Linux | `apps/desktop/src-tauri/target/release/bundle/{appimage,deb}/` | `.AppImage` + `.deb` |

### 5.4 Code-signing + notarization (defer for prerelease, required before launch)

- **macOS:** Apple Developer ID + `notarytool`. Tauri can do this in `bundle.macOS` config; for the first prerelease, an unsigned `.dmg` works for testing but Gatekeeper will quarantine it.
- **Windows:** EV code-signing cert + `signtool`. **Without this, every Windows user sees a SmartScreen "Unrecognized app" warning on first launch.** This is a customer-experience blocker before launch — get the cert ordered early (issuance can take 1–2 weeks).
- **Linux:** Optional GPG signature on `.deb`.

### 5.5 Upload installers to S3

The desktop dashboard at `solarlayout.in/download` (when wired) will read from these buckets:

```bash
# Pattern — assumes AWS CLI configured with the SolarLayout AWS account
# (378240665051) credentials. Use ap-south-1 region.

# Stage installers in local first (smoke test against staging entitlements).
aws s3 cp <path-to-installer> s3://solarlayout-local-downloads/downloads/<filename> --copy-props none

# Then staging.
aws s3 cp <path-to-installer> s3://solarlayout-staging-downloads/downloads/<filename> --copy-props none

# Then production.
aws s3 cp <path-to-installer> s3://solarlayout-prod-downloads/downloads/<filename> --copy-props none
```

Suggested naming convention (`<filename>` above):
- `solarlayout-desktop-<version>-arm64.dmg`
- `solarlayout-desktop-<version>-x64.dmg`
- `solarlayout-desktop-<version>-x64.msi`
- `solarlayout-desktop-<version>-x64.AppImage`
- `solarlayout-desktop-<version>-x64.deb`

### 5.6 Verify the installer

On a clean machine (or VM):
1. Download the installer from the staging URL.
2. Install it (note SmartScreen / Gatekeeper warnings if unsigned).
3. Launch the app.
4. Paste a test license key.
5. Open `complex-plant-layout.kmz` (multi-plot, exercises the parallel cable path from Spike 1).
6. Toggle "Calculate AC cable trench" on.
7. Click Generate.
8. Watch the per-plot progress list; verify Cancel works.
9. Verify SummaryPanel shows both `AC cable BoM length` and `AC cable trench length`.
10. Export KMZ + PDF + DXF; open each in its native viewer (Google Earth / Adobe / AutoCAD or LibreCAD).

---

## 6. What `release.yml` does and doesn't do

The current `release.yml` is **release-notes-only**:

```yaml
on:
  push:
    tags: ["v*"]
runs-on: ubuntu-latest
steps:
  - bun run lint && typecheck && test && build       # gates only
  - gh release create $TAG --generate-notes --prerelease
```

It does NOT:
- Build the Tauri desktop app for any platform.
- Build the PyInstaller sidecar bundle.
- Run the `platform-deployment.yml` cloud-deploy steps.
- Upload installers to S3 or attach them to the GitHub Release.

So pushing a `v*` tag is a **bookkeeping action**, not a build action. The actual deploy/build work is split across `platform-deployment.yml` (cloud, manual) and §5 (desktop, manual local).

A future spike will extend `release.yml` into a real cross-platform build matrix that produces installers and uploads them as release assets. Until then, the desktop release flow is fully manual.

---

## 7. Hotfix process

1. Fix on `main` (or short-lived branch → merge to main).
2. Run all gates locally.
3. Trigger `platform-deployment.yml` (production environment) for cloud hotfixes.
4. For desktop hotfixes: rebuild and re-upload to S3 per §5; bump the version in `apps/desktop/src-tauri/tauri.conf.json` and `apps/desktop/package.json`.
5. Tag the patch: `git tag v0.1.1 && git push origin v0.1.1`.
6. Optionally announce in #announcements (when applicable).

---

## 8. Pre-launch checklist (before the first non-prerelease tag)

These all need to be true before `v1.0.0`:

- [ ] Apple Developer ID + notarization wired into the macOS Tauri build.
- [ ] EV code-signing cert + `signtool` wired into the Windows Tauri build.
- [ ] `release.yml` extended into a real cross-platform build matrix.
- [ ] Auto-updater manifest hosted (Vercel Blob or S3) with platform URLs.
- [ ] AWS OIDC trust policy updated from `repo:SolarLayout/renewable_energy:*` to `repo:SolarLayout/solarlayout:*` (currently still points at the archived repo — cosmetic until any cable-engine workflow tries to assume a role).
- [ ] DB backup-and-restore drill tested at least once against staging.
- [ ] Stripe webhook signature verification tested with a Stripe-CLI dry run.
- [ ] Rollback runbook exists for each component.
- [ ] On-call rotation defined.

---

## 9. Quick command reference

```bash
# Cloud — trigger via GitHub UI → Actions → Platform Deployment → Run workflow

# Desktop — first-time build on the dev machine
cd python/pvlayout_engine
uv run pyinstaller pvlayout-engine.spec --noconfirm --clean
cd ../../apps/desktop
bun run tauri:build

# DB migration status
set -a; . ./.env.staging; set +a
bunx prisma migrate status --schema=packages/mvp_db/prisma/schema.prisma

# Tag a release (notes-only)
git tag v0.1.0 && git push origin v0.1.0

# Roll back a tag if needed (deletes both local + remote, plus the Release page)
git tag -d v0.1.0
git push --delete origin v0.1.0
gh release delete v0.1.0 --yes
```
