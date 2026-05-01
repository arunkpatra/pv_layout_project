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
| Desktop installers (5 files per release) | GitHub Release page (built by `release.yml`); operator then uploads to S3 `solarlayout-{local,staging,prod}-downloads` | Tag-triggered CI build matrix (Windows + macOS arm64 + macOS x64 + Linux) | Push `v*` tag → `release.yml` orchestrates `build-windows.yml` + `build-macos.yml` + `build-linux.yml` |
| Sidecar bundle (`pvlayout-engine[.exe]`) | Embedded inside each desktop installer via `bundle-sidecar.mjs` | Built per-platform inside each `build-*.yml` reusable workflow | Same tag-triggered chain |

**Things that are NOT auto-deployed:**
- No Vercel git integration. The Vercel projects are still wired to the old `renewable_energy` repo on the Git tab — cosmetic and ignored. Real cloud deploys go through `platform-deployment.yml` (Vercel CLI).
- Desktop installers don't auto-upload to the S3 download buckets. The CI pipeline produces and attaches them to the GitHub Release page; the operator downloads from there and uploads to S3 manually per §5.5.

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

## 4. Desktop release — automated tag-driven build

The desktop installers are built by CI on every `v*` tag push. The pipeline is modeled after the legacy `PVlayout_Advance` flow.

### 4.1 Pipeline shape

```
git tag v0.1.0 + git push origin v0.1.0
    │
    ▼
.github/workflows/release.yml
    │
    ├─ gate                        Lint + typecheck + test + build (Ubuntu, ~5 min)
    │
    ├─ build-windows  ─── uses ──▶ .github/workflows/build-windows.yml
    │                              (PyInstaller sidecar → tauri:build →
    │                               .msi → wrap in .zip → artifact)
    │
    ├─ build-macos    ─── uses ──▶ .github/workflows/build-macos.yml
    │                              (matrix: arm64 + x64; .dmg per arch)
    │
    ├─ build-linux    ─── uses ──▶ .github/workflows/build-linux.yml
    │                              (.AppImage + .deb)
    │
    └─ release                     Downloads all 5 artifacts, renames with
                                   the tag's version, generates a SHA256
                                   checksums file, attaches everything to
                                   a new GitHub Release page.
```

### 4.2 Operator steps

```bash
# 1. Make sure main is green
git checkout main && git pull
bun run lint && bun run typecheck && bun run test && bun run build
cd python/pvlayout_engine && uv run pytest tests/ -q && cd ../..

# 2. Bump version in tauri.conf.json (drives the .msi product version
#    and the .dmg/.deb internal metadata; the filename gets overwritten
#    by the release.yml rename step but the embedded version persists).
#    Edit apps/desktop/src-tauri/tauri.conf.json → "version": "0.1.0".
#    Commit + push to main.

# 3. Tag and push.
git tag v0.1.0
git push origin v0.1.0
```

This triggers `release.yml`. Wall-clock end-to-end ~25-35 minutes (Rust compile is the long pole; runs in parallel across all four platforms).

### 4.3 What ends up on the Release page

| File | What it is |
|---|---|
| `SolarLayout-<version>-windows.zip` | `.msi` wrapped in `.zip` (sidesteps Chrome's unsigned-installer download warning until we have an EV cert) |
| `SolarLayout-<version>-macos-arm64.dmg` | Apple Silicon drag-and-drop installer |
| `SolarLayout-<version>-macos-x64.dmg` | Intel macOS drag-and-drop installer |
| `SolarLayout-<version>-linux-x64.AppImage` | Portable executable (any glibc-compatible distro) |
| `SolarLayout-<version>-linux-x64.deb` | Debian/Ubuntu native install |
| `SolarLayout-<version>-checksums.sha256` | SHA256 of the five files above |

### 4.4 Distribute to the S3 download buckets

After CI lands, the operator manually uploads from the GitHub Release page to S3 so the dashboard's download links resolve. Pattern:

```bash
# Download the assets locally first (or use gh release download).
gh release download v0.1.0 --dir ~/Downloads/solarlayout-v0.1.0

# Stage in local bucket (smoke against staging entitlements).
cd ~/Downloads/solarlayout-v0.1.0
for f in *.zip *.dmg *.AppImage *.deb *.sha256; do
  aws s3 cp "$f" "s3://solarlayout-local-downloads/downloads/$f" --copy-props none
done

# Then staging.
for f in *.zip *.dmg *.AppImage *.deb *.sha256; do
  aws s3 cp "$f" "s3://solarlayout-staging-downloads/downloads/$f" --copy-props none
done

# Then production.
for f in *.zip *.dmg *.AppImage *.deb *.sha256; do
  aws s3 cp "$f" "s3://solarlayout-prod-downloads/downloads/$f" --copy-props none
done
```

(Buckets in `ap-south-1`, AWS account `378240665051`.)

### 4.5 Ad-hoc builds (no release)

Each `build-*.yml` workflow is also `workflow_dispatch`-able. To build a Windows installer without cutting a release:

GitHub UI → Actions → "Build Windows Installer" → "Run workflow" → pick branch.

Artifact lands on the Actions run summary page (30-day retention). Same for macOS and Linux.

### 4.6 Code-signing + notarization (deferred — required before launch)

- **macOS:** Apple Developer ID + `notarytool`. Tauri can do this via `bundle.macOS` config + signing identity env vars in CI; for prereleases the unsigned `.dmg` works (right-click → Open to bypass Gatekeeper).
- **Windows:** EV code-signing cert + `signtool`. **Without this, every Windows user sees a SmartScreen "Unrecognized app" warning on first launch.** The current `.zip`-wrapped `.msi` only sidesteps Chrome's *download* warning, not Windows's *first-launch* warning. EV certs take 1–2 weeks to issue; order early.
- **Linux:** Optional GPG signature on `.deb`.

### 4.7 Local builds (when CI is unavailable or for fast iteration)

```bash
# Build sidecar
cd python/pvlayout_engine
uv sync --extra dev
uv run pyinstaller pvlayout-engine.spec --noconfirm --clean

# Build Tauri app for current host OS+arch
cd ../../apps/desktop
bun run tauri:build
```

Outputs land at `apps/desktop/src-tauri/target/release/bundle/{dmg,msi,appimage,deb}/`. Useful for iterating on the bundle config without burning CI cycles. CI is the authoritative builder for releases.

### 4.8 Verify the installer

On a clean machine (or VM):
1. Download from the GitHub Release page (or after S3 upload, from the dashboard's download URL).
2. Install — note SmartScreen / Gatekeeper warnings if unsigned.
3. Launch the app and paste a test license key.
4. Open `complex-plant-layout.kmz` (multi-plot; exercises the Spike 1 parallel cable path).
5. Toggle "Calculate AC cable trench" on. Click Generate.
6. Watch the per-plot progress list; verify Cancel works.
7. Verify SummaryPanel shows both `AC cable BoM length` and `AC cable trench length`.
8. Export KMZ + PDF + DXF; open each in its native viewer (Google Earth / Adobe / AutoCAD or LibreCAD).
9. Verify the SHA256 of the downloaded asset matches the published checksums file:

   ```bash
   # macOS / Linux
   sha256sum -c SolarLayout-<version>-checksums.sha256

   # PowerShell (Windows)
   (Get-FileHash SolarLayout-<version>-windows.zip -Algorithm SHA256).Hash
   Get-Content SolarLayout-<version>-checksums.sha256
   ```

---

## 5. Hotfix process

1. Fix on `main` (or short-lived branch → merge to main).
2. Run all gates locally:
   ```bash
   bun run lint && bun run typecheck && bun run test && bun run build
   cd python/pvlayout_engine && uv run pytest tests/ -q
   ```
3. **For cloud hotfixes:** trigger `platform-deployment.yml` (production environment).
4. **For desktop hotfixes:** bump the version in `apps/desktop/src-tauri/tauri.conf.json` and `apps/desktop/package.json`, commit + push to main.
5. Tag the patch: `git tag v0.1.1 && git push origin v0.1.1`. CI builds + attaches all five installers to the new Release page.
6. Download from Release page, push to S3 per §4.4.
7. Optionally announce.

---

## 6. Pre-launch checklist (before the first non-prerelease tag)

All of these need to be true before `v1.0.0`:

- [ ] Apple Developer ID + notarization wired into the macOS Tauri build (`build-macos.yml`).
- [ ] EV code-signing cert + `signtool` wired into the Windows Tauri build (`build-windows.yml`); drop the `.zip` wrapper once signed `.msi` no longer trips Chrome's download warning.
- [ ] Auto-updater manifest hosted (Vercel Blob or S3) with platform URLs.
- [ ] AWS OIDC trust policy updated from `repo:SolarLayout/renewable_energy:*` to `repo:SolarLayout/solarlayout:*` (currently still points at the archived repo — cosmetic until any cable-engine workflow tries to assume a role).
- [ ] DB backup-and-restore drill tested at least once against staging.
- [ ] Stripe webhook signature verification tested with a Stripe-CLI dry run.
- [ ] Rollback runbook exists for each component.
- [ ] On-call rotation defined.

---

## 7. Quick command reference

```bash
# Cloud — trigger via GitHub UI → Actions → Platform Deployment → Run workflow

# Desktop — full release (CI does it on tag push)
git tag v0.1.0 && git push origin v0.1.0
gh release download v0.1.0 --dir ~/Downloads/solarlayout-v0.1.0
# Then aws s3 cp loop per §4.4 to push to local/staging/prod buckets.

# Desktop — local build (any host OS+arch)
cd python/pvlayout_engine
uv sync --extra dev
uv run pyinstaller pvlayout-engine.spec --noconfirm --clean
cd ../../apps/desktop
bun run tauri:build

# Ad-hoc CI build (no tag)
# Actions → "Build Windows Installer" / "Build macOS Installer" / "Build Linux Installers" → Run workflow

# DB migration status
set -a; . ./.env.staging; set +a
bunx prisma migrate status --schema=packages/mvp_db/prisma/schema.prisma

# Roll back a tag (deletes local + remote tag + Release page + assets)
git tag -d v0.1.0
git push --delete origin v0.1.0
gh release delete v0.1.0 --cleanup-tag --yes
```
