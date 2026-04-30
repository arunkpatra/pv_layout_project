# PRD — Merge Spike: `pv_layout_project` + `renewable_energy` → `solarlayout`

**Status:** Draft, ready for spike creation
**Date:** 2026-05-01
**Author:** Claude (under Arun's direction)
**Scope:** One-time merge of two existing monorepos into a single unified monorepo named `solarlayout`. Eliminates cross-repo coordination overhead, atomic versioning between desktop sidecar and future cable Lambda, single CI pipeline, single source of truth for shared types and schemas.
**Estimated calendar:** 3–5 days of focused work (one engineer-week).
**Predecessor docs:** [POC findings](findings/2026-04-30-002-cable-perf-poc.md), [architecture research](findings/2026-05-01-001-cable-perf-architecture-research.md), [renewable_energy inventory](findings/2026-05-01-002-renewable-energy-inventory.md), [cable-compute strategy PRD](PRD-cable-compute-strategy.md).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Why Merge (recap)](#2-why-merge-recap)
3. [Locked Decisions](#3-locked-decisions)
4. [Pre-Merge State Audit](#4-pre-merge-state-audit)
5. [Target State](#5-target-state)
6. [Sequenced Plan (day-by-day)](#6-sequenced-plan-day-by-day)
7. [Operational Playbooks](#7-operational-playbooks)
   - 7.1 [Pre-merge prep (Day 0)](#71-pre-merge-prep-day-0)
   - 7.2 [Mechanical merge (Day 1–2)](#72-mechanical-merge-day-12)
   - 7.3 [GitHub repo rename (Day 3)](#73-github-repo-rename-day-3)
   - 7.4 [Vercel cutover playbook (Day 3)](#74-vercel-cutover-playbook-day-3)
   - 7.5 [AWS OIDC retarget (Day 3)](#75-aws-oidc-retarget-day-3)
   - 7.6 [GitHub Actions secrets transfer (Day 3)](#76-github-actions-secrets-transfer-day-3)
   - 7.7 [Defunct cleanup PR (Day 4)](#77-defunct-cleanup-pr-day-4)
   - 7.8 [CLAUDE.md cascade (Day 4)](#78-claudemd-cascade-day-4)
   - 7.9 [Rollback playbook (any day)](#79-rollback-playbook-any-day)
8. [CLAUDE.md Cascade — Detailed](#8-claudemd-cascade--detailed)
9. [Risks Register](#9-risks-register)
10. [Acceptance Criteria](#10-acceptance-criteria)
11. [Out of Scope](#11-out-of-scope)
12. [Code Freeze Window](#12-code-freeze-window)

---

## 1. Executive Summary

We currently maintain SolarLayout's product surface across two GitHub repos under the `SolarLayout` org:

- `pv_layout_project` — desktop Tauri app, Python sidecar (`pvlayout_core`), shared UI components.
- `renewable_energy` — backend (mvp_api on Vercel), marketing site (mvp_web), admin app (mvp_admin), Prisma schema (mvp_db), shared types, dormant cloud-port era code.

Both are already monorepos using compatible tooling (Bun workspaces + Turborepo). They couple at the type/schema/wire-protocol level — every backend change requires paste-block coordination with the desktop session, type drift, idempotency-key plumbing duplication, and a multi-step 2-repo deployment dance for cross-cutting features.

This merger eliminates that coordination cost permanently. After cutover:

- One repo, one CI pipeline, atomic PRs across desktop + backend + Lambda.
- Single source of truth for shared types (eliminates the manual `packages/shared` ↔ `packages/entitlements-client` mirror).
- Future cable-compute Spike 2 ships without cross-repo wheel publishing or cross-account ECR push permissions.
- One Claude Code session covers all product work.

**The merger is not a refactor of either repo's internals.** All apps and packages keep their existing relative paths inside the merged repo. No imports change inside an app. The work is pure git mechanics + Vercel re-link + AWS OIDC retarget + cleanup.

**Calendar:** 3–5 days, one engineer (Claude + Arun pair). Work happens during a code-freeze window; both repos are currently stable and pushed.

---

## 2. Why Merge (recap)

Concrete pain points the merge eliminates:

| Today's friction | After merge |
|---|---|
| Cable-compute and similar features require paste-block coordination across 2 Claude sessions | One session, one PR |
| Shared wire types maintained in 2 places: `packages/shared` (renewable_energy) and `packages/entitlements-client` (this repo) | Single `packages/shared`, both consumed directly |
| Schema migration in mvp_db forces coordination dance with desktop's pinned types | Single PR, atomic |
| Cable-compute Spike 2 needs wheel publishing + cross-account ECR push | Workspace package dependency, no registry |
| DB schema in one repo, Lambda handler in another (ownership friction) | Both colocate naturally |
| New devs need 2 onboarding paths | One |
| Refactoring across boundaries (rename a wire field) → coordinated 2-PR dance | Single PR touching everything |
| Two Claude sessions running in parallel | Eliminated |

What the merger does NOT solve:

- Performance of any individual app (no code changes inside apps).
- Existing tech debt (defunct apps `apps/api`, `apps/layout-engine`, `packages/db`, `packages/api-client` — these are removed by Option B during merge but their underlying tech debt was already there).
- Lack of CI for live mvp apps — that's a follow-up; the merge inherits the gap, doesn't introduce it.

---

## 3. Locked Decisions

These are answers to the 8 questions resolved before this PRD was written. No further discussion needed; they're the ground truth for the playbooks below.

| # | Decision | Value |
|---|---|---|
| Q1 | Repo rename target | `solarlayout` (under `SolarLayout` GitHub org) |
| Q2 | Target directory layout | Option A — flat `apps/*` and `packages/*`, plus `python/pvlayout_engine/` for Python |
| Q3 | Defunct cleanup approach | Option B — delete during merge (don't migrate `apps/api`, `apps/layout-engine`, `packages/db`, `packages/api-client`) |
| Q4 | Vercel team + projects | Team **Journium**; 3 live projects (`mvp_api` → `api.solarlayout.in`, `mvp_web` → `solarlayout.in` (apex; `www` redirected), `mvp_admin` → `admin.solarlayout.in`); CI/CD-driven (manual Vercel CLI, git auto-deploy off) |
| Q5 | AWS OIDC cutover style | Hard — retarget trust subject from `repo:SolarLayout/renewable_energy:*` to `repo:SolarLayout/solarlayout:*` at cutover moment |
| Q6 | ECR + Lambda inventory | `renewable-energy/layout-engine` ECR + `layout_engine_lambda_prod` Lambda are dormant; deleted in post-merge cleanup PR. Future Spike 2 will create new `solarlayout/cable-engine` ECR + cable Lambda. |
| Q7 | Secrets transfer | GitHub Actions secrets/vars recreated in `solarlayout` repo; Vercel project env vars preserved automatically across project re-link |
| Q8 | DNS | No-op — domains attach to Vercel projects, not git connections |

Additional clarifications gathered during Q&A:

- Stripe webhook URL: `https://api.solarlayout.in/webhooks/stripe` (live, must not be disrupted).
- Cable Lambda's source code (future) lives at `python/pvlayout_engine/lambda_handlers/cable_handler.py` — same Python tree as the sidecar, different entry point.
- `next-agents-md` block in renewable_energy's `CLAUDE.md` must be stripped during merge.
- `docs/architecture.md` in renewable_energy is partially stale (describes defunct cloud-port arch); rewrite or move to `docs/historical/`.

---

## 4. Pre-Merge State Audit

Snapshot of both repos as of 2026-05-01.

### 4.1 `pv_layout_project` (this repo, becomes the merge target)

- GitHub: `https://github.com/SolarLayout/pv_layout_project.git`
- Active branches: `main`, `post-parity-v1-desktop` (the "make-believe main" integration branch), `parity/p0` (older, unmerged), `s08_7-verify` (older).
- Working state: `post-parity-v1-desktop` has 3 commits ahead of origin (just pushed in step 1 of this initiative — A+B perf wins + benchmark scripts + POC docs).
- Top-level structure: `apps/desktop`, `packages/{ui, sidecar-client, entitlements-client}`, `python/pvlayout_engine`, `docs/`, `reference_screenshots_for_UX_dsktop/`, `.github/workflows/`.
- Workspaces: Bun workspaces + Turborepo. Workspace globs `apps/*`, `packages/*`. Package scope `@solarlayout/*`.
- Languages: TypeScript (frontend), Python 3.13 (sidecar), Rust (Tauri shell).
- Workflows: pre-commit gate locally; whatever GitHub Actions exist (need to inventory pre-merge — see playbook 7.1).

### 4.2 `renewable_energy` (the source repo, fully merged + archived after cutover)

- GitHub: `https://github.com/SolarLayout/renewable_energy.git`
- Working state: all committed and pushed (per Arun confirmation). No in-flight branches.
- Top-level structure (per inventory): `apps/{mvp_api, mvp_web, mvp_admin, layout-engine, api, web}`, `packages/{mvp_db, ui, shared, db, api-client, eslint-config, typescript-config}`, `docs/`, `.github/workflows/`, `docker-compose.yml`.
- Live apps: `mvp_api`, `mvp_web`, `mvp_admin` (all on Vercel under team Journium).
- Defunct apps (deleted under Option B): `apps/api`, `apps/web`, `apps/layout-engine`, `packages/db`, `packages/api-client`.
- Live packages: `mvp_db` (Prisma + Postgres), `ui`, `shared`, `eslint-config`, `typescript-config`.
- Workspaces: Bun workspaces + Turborepo. Workspace globs `apps/*`, `packages/*`. Package scope `@renewable-energy/*`.
- AWS resources: account `378240665051`, region `ap-south-1`. ECR `renewable-energy/layout-engine` (dormant), Lambda `layout_engine_lambda_prod` (dormant), 6 active S3 buckets (`solarlayout-{local,staging,prod}-{downloads,projects}`), 3 dormant S3 buckets (`renewable-energy-*-artifacts`), IAM user `renewable-energy-app`, OIDC role `renewable-energy-github-actions`.
- Stripe: live (`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in mvp_api Vercel env). Webhook URL `https://api.solarlayout.in/webhooks/stripe`.
- DB: live `mvp_postgres` (port 5433 in docker-compose); dormant `postgres` (port 5432, deleted under Option B).

### 4.3 Cross-repo coupling (today)

- `packages/entitlements-client` (this repo) hand-mirrors V2 wire types from `packages/shared` (renewable_energy). Keeping in sync is currently manual.
- `apps/desktop` (this repo) calls `https://api.solarlayout.in/v2/*` (renewable_energy's `apps/mvp_api`) at runtime. After merge: same runtime call, no change.
- No build-time coupling between repos. After merge: `packages/entitlements-client` can either stay separate or merge into `packages/shared` (decided later — out of scope for this spike).

---

## 5. Target State

### 5.1 Repository

- GitHub: `https://github.com/SolarLayout/solarlayout.git`
- Local clone path: continues to be `/Users/arunkpatra/codebase/pv_layout_project` (Arun's call to rename the local dir or not — git remote update is enough; directory name doesn't have to match repo name).
- Active branches: `main`, `post-parity-v1-desktop` (make-believe main, where the merge lands).
- `renewable_energy` repo: archived (read-only), GitHub repo description updated to "Archived — merged into SolarLayout/solarlayout 2026-05-XX". Kept available as audit trail until product goes to main.

### 5.2 Top-level layout (Option A flat, defunct stuff removed)

```
solarlayout/
├── apps/
│   ├── desktop/                    ← from pv_layout_project (Tauri app)
│   ├── mvp_api/                    ← from renewable_energy (Hono on Vercel; serves api.solarlayout.in)
│   ├── mvp_admin/                  ← from renewable_energy (Next.js on Vercel; serves admin.solarlayout.in)
│   └── mvp_web/                    ← from renewable_energy (Next.js on Vercel; serves solarlayout.in)
├── packages/
│   ├── ui-desktop/                 ← from pv_layout_project (was packages/ui — RENAMED to avoid collision; see 5.5)
│   ├── ui/                         ← from renewable_energy (web shadcn components for mvp_web, mvp_admin)
│   ├── sidecar-client/             ← from pv_layout_project (sidecar HTTP client)
│   ├── entitlements-client/        ← from pv_layout_project (V2 backend client)
│   ├── shared/                     ← from renewable_energy (V2 wire types)
│   ├── mvp_db/                     ← from renewable_energy (Prisma schema + client)
│   ├── eslint-config/              ← from renewable_energy
│   └── typescript-config/          ← from renewable_energy
├── python/
│   └── pvlayout_engine/            ← from pv_layout_project (cable engine + sidecar)
│       ├── pvlayout_core/          ← the cable algorithm (single source of truth)
│       ├── pvlayout_engine/        ← FastAPI sidecar (consumes pvlayout_core)
│       ├── lambda_handlers/        ← (NEW, Spike 2) thin Lambda shims; same source tree
│       ├── tests/
│       ├── scripts/
│       └── pyproject.toml
├── docs/
│   ├── ARCHITECTURE.md             ← merged + rewritten to cover both desktop and cloud
│   ├── CLAUDE.md                   ← top-level Claude Code instructions, rewritten
│   ├── PLAN.md                     ← from pv_layout_project (active backlog)
│   ├── post-parity/                ← from pv_layout_project (this dir)
│   ├── adr/                        ← merged ADR registries from both repos
│   ├── initiatives/                ← from renewable_energy (post-parity-v2-backend-plan.md, etc.)
│   ├── principles/                 ← merged
│   ├── historical/                 ← from pv_layout_project + superseded renewable_energy initiatives
│   ├── AWS_RESOURCES.md            ← from renewable_energy (corrected for SolarLayout org)
│   ├── DESIGN_FOUNDATIONS.md       ← from pv_layout_project
│   └── (everything else carried preserving relative paths inside each repo's docs/)
├── reference_screenshots_for_UX_dsktop/   ← from pv_layout_project
├── .github/
│   └── workflows/                  ← merged + deduped (defunct layout-engine workflows removed under Option B)
├── docker-compose.yml              ← from renewable_energy, simplified (mvp_postgres only; the old port-5432 service removed under Option B)
├── package.json                    ← merged Bun workspace globs
├── turbo.json                      ← merged from both repos' Turborepo configs
├── CLAUDE.md                       ← top-level — rewritten for the merged repo
├── .env.example                    ← merged (only local defaults; no real secrets)
├── .gitignore                      ← merged (preserve all entries from both)
├── .npmrc                          ← merged
├── README.md                       ← rewritten — describes the unified product
└── LICENSE                         ← (decide; pv_layout_project doesn't have one currently — verify)
```

### 5.3 Apps deleted (Option B)

- `apps/api/` — defunct cloud-port era Hono API (Clerk auth)
- `apps/web/` — defunct cloud-port era Next.js frontend
- `apps/layout-engine/` — defunct PV-layout Python Lambda

### 5.4 Packages deleted (Option B)

- `packages/db/` — defunct cloud-port Prisma schema
- `packages/api-client/` — defunct type-safe HTTP client for `apps/api/`

### 5.5 Naming collision: `packages/ui`

Both repos have a `packages/ui` workspace, but with different contents:

- `pv_layout_project/packages/ui` → `@solarlayout/ui` — desktop (Tauri-targeted) shadcn component library
- `renewable_energy/packages/ui` → `@renewable-energy/ui` — web (Next.js-targeted) shadcn component library, used by mvp_web and mvp_admin

These cannot live at the same path. **Resolution:** rename the desktop one to `packages/ui-desktop` during merge (and update its `package.json` name to `@solarlayout/ui-desktop`). Update the single import site in `apps/desktop/` accordingly.

Web `packages/ui` keeps its name. After merge it gets renamed from `@renewable-energy/ui` to `@solarlayout/ui` to align with the new monorepo's package scope (see 5.6).

### 5.6 Package scope unification

All `@renewable-energy/*` packages get renamed to `@solarlayout/*` during merge for consistency:

| Old | New |
|---|---|
| `@renewable-energy/mvp-api` | `@solarlayout/mvp-api` |
| `@renewable-energy/mvp-web` | `@solarlayout/mvp-web` |
| `@renewable-energy/mvp-admin` | `@solarlayout/mvp-admin` |
| `@renewable-energy/mvp-db` | `@solarlayout/mvp-db` |
| `@renewable-energy/ui` | `@solarlayout/ui` |
| `@renewable-energy/shared` | `@solarlayout/shared` |
| `@renewable-energy/eslint-config` | `@solarlayout/eslint-config` |
| `@renewable-energy/typescript-config` | `@solarlayout/typescript-config` |

Mechanically: rename `name` in each `package.json`, then global find/replace of `@renewable-energy/` → `@solarlayout/` across the merged tree. ~30-50 import sites total. Bun workspace resolution catches any miss at build time.

### 5.7 Bun workspace + Turborepo config

Merged `package.json` workspaces:
```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```
(Same as both source repos. No change.)

Merged `turbo.json` carries all task definitions from both source files. Minor reconciliation expected:
- Both have `build`, `lint`, `typecheck`, `test`, `dev` tasks — semantics should be compatible.
- renewable_energy has `db:*` and `mvp-db:*` task families (Prisma codegen, migrate, push, seed). The `db:*` family goes away with `packages/db` deletion; `mvp-db:*` family stays.
- pv_layout_project has Tauri-specific tasks. Stay.

### 5.8 docker-compose.yml

Merged version: single Postgres instance (the live `mvp_postgres` on port 5433). The old port 5432 service goes away with `packages/db` deletion.

```yaml
services:
  mvp_postgres:
    image: postgres:17-alpine
    ports: ["5433:5432"]
    environment:
      POSTGRES_USER: mvp
      POSTGRES_PASSWORD: mvp
      POSTGRES_DB: mvp_db
    volumes:
      - mvp_postgres_data:/var/lib/postgresql/data
volumes:
  mvp_postgres_data:
```

---

## 6. Sequenced Plan (day-by-day)

### Day 0 (T-1) — Prep

- [ ] Verify both repos clean: `git status` in each, no uncommitted work, no unpushed commits.
- [ ] Verify backend session is paused or notified of code freeze (no commits to renewable_energy from now until merge lands).
- [ ] Run pre-merge inventory checklist (playbook 7.1) — captures any last-minute state changes.
- [ ] Snapshot both repos' Vercel + AWS configurations (screenshots for audit trail).

### Day 1 — Mechanical merge

- [ ] In a fresh local working dir, execute the mechanical merge plan (playbook 7.2) on a feature branch `merge/renewable-energy` cut from `post-parity-v1-desktop`.
- [ ] Apply Option B deletions inline (defunct apps + packages don't enter the tree).
- [ ] Reconcile package.json workspace globs and turbo.json.
- [ ] Rename `packages/ui` → `packages/ui-desktop` (the pv_layout_project one; see 5.5).
- [ ] Rename all `@renewable-energy/*` → `@solarlayout/*` package scopes (see 5.6).
- [ ] Strip `next-agents-md` block from CLAUDE.md.
- [ ] Run `bun install` at root. Resolve any workspace resolution errors.

### Day 2 — Local verification

- [ ] `bun run build` — all apps build successfully.
- [ ] `bun run lint` — passes.
- [ ] `bun run typecheck` — passes.
- [ ] `bun run test` — all existing tests pass.
- [ ] `cd python/pvlayout_engine && uv run pytest tests/ -q` — sidecar tests pass (123/123 + 6 skipped, per current state).
- [ ] `bun run dev` for each app — local dev servers start on their respective ports (3002 mvp_web, 3003 mvp_api, 3004 mvp_admin, Tauri dev for desktop).
- [ ] Smoke: open desktop app in dev, verify it can call `api.solarlayout.in` (the live backend, still served by renewable_energy's Vercel projects at this point).
- [ ] Push `merge/renewable-energy` branch to remote. Self-review the diff (it'll be huge).

### Day 3 — Cutover

- [ ] [Playbook 7.3] GitHub repo rename: `pv_layout_project` → `solarlayout`.
- [ ] Merge `merge/renewable-energy` branch into `post-parity-v1-desktop`. Push.
- [ ] [Playbook 7.4] Vercel cutover — relink each of 3 projects to `solarlayout` repo. **Test deploys after each relink**, monitor Stripe.
- [ ] [Playbook 7.5] AWS OIDC retarget — update trust to `repo:SolarLayout/solarlayout:*`.
- [ ] [Playbook 7.6] GitHub Actions secrets transfer — recreate AWS_ROLE_ARN, AWS_ACCOUNT_ID, AWS_REGION in `solarlayout` repo.
- [ ] Verify all 3 Vercel projects deploy successfully from new repo (manual `vercel --prod` per project).
- [ ] Verify DNS still resolves: `curl https://api.solarlayout.in/health`, `curl https://solarlayout.in`, `curl https://admin.solarlayout.in`.
- [ ] Monitor Stripe webhook delivery dashboard for any failures.

### Day 4 — Stabilization + cleanup

- [ ] [Playbook 7.7] Defunct cleanup PR — verify `apps/api`, `apps/layout-engine`, `apps/web`, `packages/db`, `packages/api-client` are absent from the merged tree (they should be — playbook 7.2 handles this).
- [ ] [Playbook 7.8] CLAUDE.md cascade — update root CLAUDE.md, app-level CLAUDE.md files, ARCHITECTURE.md, ADR registry, all cross-references.
- [ ] Run all 4 quality gates again on `post-parity-v1-desktop`. Push.
- [ ] Update [docs/PLAN.md](../PLAN.md) header to reflect merged-repo state.
- [ ] Update [docs/post-parity/PRD-cable-compute-strategy.md](PRD-cable-compute-strategy.md) — drop §5 cross-repo dependency map (now inapplicable), simplify §4 Lambda packaging (no wheel registry needed; workspace-package import).

### Day 5 (optional, sometime in the next 2 weeks) — Archive source repo

- [ ] On GitHub: archive `renewable_energy` repo (Settings → Archive).
- [ ] Update repo description: "Archived 2026-05-XX — merged into SolarLayout/solarlayout".
- [ ] Add `README.md` pointer to the merged repo.

---

## 7. Operational Playbooks

### 7.1 Pre-merge prep (Day 0)

Run-through checklist for the engineer doing the merge.

```bash
# Step 1: Verify pv_layout_project clean
cd /Users/arunkpatra/codebase/pv_layout_project
git fetch origin
git status                           # Must be clean
git log --oneline origin/post-parity-v1-desktop..HEAD   # Must be empty (no unpushed commits)
git log --oneline HEAD..origin/post-parity-v1-desktop   # Must be empty (we're up to date)

# Step 2: Verify renewable_energy clean
cd /Users/arunkpatra/codebase/renewable_energy
git fetch origin
git status                           # Must be clean
git log --oneline origin/post-parity-v2-backend..HEAD
git log --oneline HEAD..origin/post-parity-v2-backend

# Step 3: Inventory current branches (for Day 4 audit)
cd /Users/arunkpatra/codebase/pv_layout_project && git branch -r > /tmp/pv_branches.txt
cd /Users/arunkpatra/codebase/renewable_energy && git branch -r > /tmp/re_branches.txt

# Step 4: Snapshot Vercel state (do in browser; save as screenshots)
# - Vercel team Journium → Projects view
# - For each of mvp_api, mvp_web, mvp_admin: Settings → Domains, Settings → Git, Settings → Environment Variables (just the names tab)

# Step 5: Snapshot AWS state
# Via AWS CLI (if creds available locally) or AWS console:
aws iam get-role --role-name renewable-energy-github-actions \
    --query 'Role.AssumeRolePolicyDocument' > /tmp/oidc-trust-current.json
aws ecr describe-repositories --query 'repositories[].repositoryName' > /tmp/ecr-repos-current.txt
aws lambda list-functions --query 'Functions[?contains(FunctionName, `layout`)].FunctionName' > /tmp/lambda-list.txt
aws s3 ls > /tmp/s3-buckets.txt

# Step 6: Snapshot Stripe webhook config
# In Stripe dashboard → Developers → Webhooks
# Confirm endpoint URL = https://api.solarlayout.in/webhooks/stripe
# Note the signing secret reference (don't copy the value — verify it exists)
```

Output of step 6 is the audit-trail baseline. If anything looks unexpected, stop and triage before proceeding to Day 1.

### 7.2 Mechanical merge (Day 1–2)

Engineer-executed. Claude pairs.

#### 7.2.1 Cut the merge branch

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git fetch origin
git checkout post-parity-v1-desktop
git pull
git checkout -b merge/renewable-energy
```

#### 7.2.2 Add renewable_energy as a remote and pull its history

We use `git subtree` to preserve full git history of renewable_energy under a top-level temporary subdir, then move the subdirs out. This is more involved than a copy-paste but preserves blame/log on every renewable_energy file forever.

Two viable approaches:

**Approach A: `git subtree add` with squash=false (preserves history)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git remote add re https://github.com/SolarLayout/renewable_energy.git
git fetch re

# Pull renewable_energy's main branch into a temporary subdir
git subtree add --prefix=_re_temp re post-parity-v2-backend

# This creates a merge commit that brings all of renewable_energy's history under _re_temp/
```

After this step, `_re_temp/` contains renewable_energy's full tree:
```
_re_temp/
├── apps/
├── packages/
├── docs/
├── docker-compose.yml
├── package.json
├── turbo.json
├── CLAUDE.md
└── ... (everything from renewable_energy)
```

**Approach B: Manual file copy (simpler, no git history preservation)**

```bash
# In a scratch directory:
cd /tmp
git clone https://github.com/SolarLayout/renewable_energy.git
cd renewable_energy
git checkout post-parity-v2-backend

# Copy files into the merge branch
cp -r apps/mvp_api /Users/arunkpatra/codebase/pv_layout_project/apps/
cp -r apps/mvp_web /Users/arunkpatra/codebase/pv_layout_project/apps/
cp -r apps/mvp_admin /Users/arunkpatra/codebase/pv_layout_project/apps/
cp -r packages/mvp_db /Users/arunkpatra/codebase/pv_layout_project/packages/
cp -r packages/ui /Users/arunkpatra/codebase/pv_layout_project/packages/
cp -r packages/shared /Users/arunkpatra/codebase/pv_layout_project/packages/
cp -r packages/eslint-config /Users/arunkpatra/codebase/pv_layout_project/packages/
cp -r packages/typescript-config /Users/arunkpatra/codebase/pv_layout_project/packages/
# ... (and selected docs, .github/workflows/, docker-compose.yml, .env.example, etc.)
```

**Recommendation: Approach A** for git history preservation. The subtree merge is a one-time operation and the resulting log graph is fine for monorepo workflows.

#### 7.2.3 Reorganize from `_re_temp/` to flat layout

After Approach A, move subdirs out of `_re_temp/` to their final locations:

```bash
# Move live apps
git mv _re_temp/apps/mvp_api apps/mvp_api
git mv _re_temp/apps/mvp_web apps/mvp_web
git mv _re_temp/apps/mvp_admin apps/mvp_admin

# Move live packages
git mv _re_temp/packages/mvp_db packages/mvp_db
git mv _re_temp/packages/shared packages/shared
git mv _re_temp/packages/eslint-config packages/eslint-config
git mv _re_temp/packages/typescript-config packages/typescript-config

# Web UI package — collision; rename desktop's first
git mv packages/ui packages/ui-desktop
git mv _re_temp/packages/ui packages/ui

# Move docs (selectively — preserve folder structure)
git mv _re_temp/docs/AWS_RESOURCES.md docs/AWS_RESOURCES.md
git mv _re_temp/docs/iam-policy-re-app-s3.json docs/iam-policy-re-app-s3.json
git mv _re_temp/docs/initiatives docs/initiatives
git mv _re_temp/docs/principles docs/principles-cloud  # Avoid collision with pv_layout_project's docs/principles/
# (Then merge the two principles dirs manually as part of CLAUDE.md cascade — Day 4)

# Move ADRs (merge ADR registries)
git mv _re_temp/docs/adr docs/adr-cloud
# (Manual ADR merge as part of Day 4 cascade)

# Move root files (carefully — these collide with pv_layout_project's)
# - We KEEP pv_layout_project's package.json, turbo.json, CLAUDE.md, .gitignore
# - We MERGE renewable_energy's contents IN to those files manually, not git-mv
mv _re_temp/docker-compose.yml docker-compose.yml  # No collision
mv _re_temp/.env.example .env.merged              # Hold for manual merge

# Drop the rest (defunct under Option B)
rm -rf _re_temp/apps/api
rm -rf _re_temp/apps/web
rm -rf _re_temp/apps/layout-engine
rm -rf _re_temp/packages/db
rm -rf _re_temp/packages/api-client

# After all moves: _re_temp/ should be empty or contain only files we deliberately don't take.
# Delete it.
rm -rf _re_temp
git add -A
```

#### 7.2.4 Reconcile root config files

**`package.json`** — manual merge:
- Keep pv_layout_project's `name`, `private: true`, `packageManager`.
- Update `name` to `solarlayout`.
- Workspaces unchanged: `["apps/*", "packages/*"]`.
- Merge `scripts` blocks: take all from both; resolve duplicates by keeping pv_layout_project's where they overlap (e.g., `lint`, `typecheck`, `build`, `test`).
- Merge `devDependencies` blocks: take union, resolve version conflicts toward newer.

**`turbo.json`** — manual merge:
- Take all task definitions from both.
- For overlapping task names (`build`, `lint`, etc.), use the more permissive `dependsOn` and `outputs` arrays.
- Add `mvp-db:*` family from renewable_energy.
- Drop `db:*` family (deletes with `packages/db`).

**`.gitignore`** — concatenate both, dedupe.

**`.env.example`** — manual merge: take pv_layout_project's content, append renewable_energy's content under a `# === Backend (mvp_*) ===` section divider.

**`.npmrc`** — both empty/minimal; take whichever is non-empty.

**`CLAUDE.md`** — full rewrite on Day 4 (playbook 7.8). For now, leave pv_layout_project's CLAUDE.md as-is.

**`README.md`** — full rewrite on Day 4. For now, append a note: "(merged from renewable_energy on 2026-05-XX; full README rewrite pending)".

**`docker-compose.yml`** — already moved from renewable_energy. Edit to remove the port-5432 `postgres` service (defunct). Keep `mvp_postgres` only.

#### 7.2.5 Rename package scopes `@renewable-energy/*` → `@solarlayout/*`

```bash
# Find every package.json with @renewable-energy/
grep -rl "@renewable-energy/" --include="package.json"

# Update each — change `name` field and any internal dependencies
# (Use jq or manual edit; ~10-15 files total)

# Then global find-replace across source code
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
    -not -path "./node_modules/*" \
    -not -path "./.git/*" \
    -exec sed -i '' 's|@renewable-energy/|@solarlayout/|g' {} +
```

Verify with `grep -r "@renewable-energy/" --include="*.ts*" --include="*.js*" .` — should return zero matches.

#### 7.2.6 Strip `next-agents-md` block from CLAUDE.md

In `_re_temp/CLAUDE.md` (before Day 4 rewrite, just for the file content):
```bash
# Remove from <!-- NEXT-AGENTS-MD-START --> through <!-- NEXT-AGENTS-MD-END -->
sed -i '' '/<!-- NEXT-AGENTS-MD-START -->/,/<!-- NEXT-AGENTS-MD-END -->/d' _re_temp/CLAUDE.md
```

(Note: by Day 4 the renewable_energy CLAUDE.md content is being rewritten into the unified root CLAUDE.md anyway. This step just keeps the temporary in-tree version sane.)

#### 7.2.7 Install + verify

```bash
bun install
bun run build
bun run lint
bun run typecheck
bun run test
cd python/pvlayout_engine && uv run pytest tests/ -q
```

Each gate must pass. Failures are diagnosed and resolved on this branch.

#### 7.2.8 Commit + push

Commit in logical chunks for reviewability:

```bash
git add -A
git commit -m "merge: import renewable_energy live apps + packages into solarlayout

Brings in apps/{mvp_api,mvp_web,mvp_admin}, packages/{mvp_db,ui,shared,
eslint-config,typescript-config} from SolarLayout/renewable_energy at SHA <X>.

Defunct apps/packages NOT migrated (Option B): apps/api, apps/web,
apps/layout-engine, packages/db, packages/api-client.

Renames:
  packages/ui (desktop)         → packages/ui-desktop
  @renewable-energy/* scopes    → @solarlayout/*

Strips next-agents-md block from root CLAUDE.md.

CLAUDE.md + ARCHITECTURE.md + README.md rewrites pending Day 4.
Vercel cutover + AWS OIDC retarget pending Day 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin merge/renewable-energy
```

#### 7.2.9 Self-review

The diff is enormous. Reviewer should focus on:
- Workspace resolution: `bun install` produced no errors.
- All 4 gates green.
- Sidecar pytest green.
- No `@renewable-energy/` imports remain.
- Defunct apps/packages absent from tree.
- `docker-compose.yml` has only `mvp_postgres`.

If all checks pass, merge `merge/renewable-energy` into `post-parity-v1-desktop` (no squash — preserve git history; Approach A's whole point).

### 7.3 GitHub repo rename (Day 3)

Done by Arun in GitHub web UI:

1. Navigate to `https://github.com/SolarLayout/pv_layout_project/settings`.
2. In the "General" section, find "Repository name".
3. Change to `solarlayout`.
4. Click "Rename" and confirm.

GitHub automatically issues `301 Permanent Redirect` from the old URL to the new one. All existing clones can still `git push`/`pull` via the redirect, but should be updated to the new URL explicitly:

```bash
# Update local clone
cd /Users/arunkpatra/codebase/pv_layout_project   # local dir name unchanged
git remote set-url origin https://github.com/SolarLayout/solarlayout.git
git remote -v   # Verify
```

### 7.4 Vercel cutover playbook (Day 3)

**Critical sequencing:** Stripe webhook delivery to `api.solarlayout.in` must not be disrupted. Mitigation:

- Cutover order: `mvp_admin` first (no live customer traffic), then `mvp_web`, then `mvp_api` last.
- Before starting `mvp_api` cutover: in Stripe dashboard, briefly DISABLE the webhook endpoint (Stripe will still record events; they'll be redelivered when re-enabled).
- After mvp_api re-deploy succeeds and `curl https://api.solarlayout.in/webhooks/stripe` returns expected response, RE-ENABLE the webhook endpoint in Stripe.
- Stripe automatically retries failed deliveries with exponential backoff (3 retries over 3 days), so the brief disable window is recoverable even without the manual disable.

#### 7.4.1 Per-project cutover steps (Vercel UI)

For each of `mvp_admin`, `mvp_web`, `mvp_api` in order:

1. Open Vercel dashboard, switch to team **Journium**.
2. Open the project (`mvp_admin`, `mvp_web`, or `mvp_api`).
3. Settings → Git:
   - Click "Disconnect" (the project temporarily shows "No Git repository connected").
   - Click "Connect Git Repository".
   - Choose GitHub provider.
   - Select organization `SolarLayout`.
   - Select repository `solarlayout`.
   - Set "Production Branch" — match what was set before (likely `main` or `post-parity-v1-desktop`).
   - Set "Root Directory" — `apps/mvp_admin` / `apps/mvp_web` / `apps/mvp_api` respectively. **Same path as before** because of Option A flat layout — relative path inside the repo is unchanged.
   - Click "Save".
4. Settings → Build & Output Settings — verify framework preset and any build command override haven't changed (they shouldn't; Vercel preserves these on disconnect/reconnect).
5. Settings → Environment Variables — verify all env vars are still present (they should be; Vercel preserves these on disconnect/reconnect).
6. Trigger a manual deploy:
   ```bash
   cd /Users/arunkpatra/codebase/pv_layout_project/apps/<app-name>   # local dir name still pv_layout_project
   vercel --prod
   ```
   Or via Vercel dashboard: Deployments → "Deploy" button → choose `post-parity-v1-desktop` branch.
7. Verify deploy succeeds. Check the production domain:
   - mvp_admin: `curl -I https://admin.solarlayout.in` — expect 200 or 302.
   - mvp_web: `curl -I https://solarlayout.in` — expect 200.
   - mvp_api: `curl https://api.solarlayout.in/health` — expect 200 with health JSON.

#### 7.4.2 Post-cutover verification

After all 3 cutovers complete:

- [ ] All 3 production domains resolve and return expected responses.
- [ ] mvp_api: `curl https://api.solarlayout.in/v2/entitlements` with a test license key returns valid V2 envelope.
- [ ] In Stripe dashboard → Developers → Webhooks → re-enable endpoint if disabled. Send a test webhook event (Stripe dashboard has "Send test event" button). Verify endpoint logs receipt in Vercel function logs.
- [ ] In Vercel dashboard → each project → Deployments — verify the latest deploy is healthy.
- [ ] Smoke test the desktop app — open it, check it can connect to `api.solarlayout.in` and fetch entitlements.

### 7.5 AWS OIDC retarget (Day 3)

Done by Arun (or a CI engineer) in AWS console.

1. Open IAM Console → Roles → search "renewable-energy-github-actions".
2. Open the role → Trust relationships tab → "Edit trust policy".
3. Find the `Condition` block with `token.actions.githubusercontent.com:sub`.
4. Update the value from `repo:SolarLayout/renewable_energy:*` to `repo:SolarLayout/solarlayout:*`.
   ```json
   {
     "Condition": {
       "StringLike": {
         "token.actions.githubusercontent.com:sub": "repo:SolarLayout/solarlayout:*"
       }
     }
   }
   ```
5. Save.
6. **Optional:** rename the role itself from `renewable-energy-github-actions` to `solarlayout-github-actions` for clarity. Requires updating the role ARN in any GitHub Actions workflow that references it (none exist today after Option B cleanup, but worth doing for hygiene). For now: leave the role name as-is. Cosmetic rename can be a follow-up.

### 7.6 GitHub Actions secrets transfer (Day 3)

Done by Arun in GitHub UI for the renamed `solarlayout` repo (post-rename, the new URL is `https://github.com/SolarLayout/solarlayout`).

Path: Settings → Secrets and variables → Actions

#### 7.6.1 Repository secrets

Recreate from the renewable_energy values:

| Secret | Source value (look up in renewable_energy) | Target |
|---|---|---|
| `AWS_ROLE_ARN` | `arn:aws:iam::378240665051:role/renewable-energy-github-actions` (or whatever it currently is) | Recreate same value |

#### 7.6.2 Repository variables

Recreate:

| Variable | Value |
|---|---|
| `AWS_ACCOUNT_ID` | `378240665051` |
| `AWS_REGION` | `ap-south-1` |

#### 7.6.3 Verify

After Day 4 (when CLAUDE.md cascade runs and any retained workflows are present):
- Trigger a manual workflow_dispatch on whatever workflow uses these (none exist today after Option B; the first will be the cable-engine build/deploy in Spike 2).
- Confirm OIDC AssumeRole succeeds, ECR push works.

### 7.7 Defunct cleanup PR (Day 4)

Under Option B, defunct apps and packages don't enter the merged tree at all. So this isn't a "deletion PR" — it's a verification step.

**Verification checklist:**

- [ ] `apps/api/` does not exist in the merged repo.
- [ ] `apps/web/` does not exist.
- [ ] `apps/layout-engine/` does not exist.
- [ ] `packages/db/` does not exist.
- [ ] `packages/api-client/` does not exist.
- [ ] `.github/workflows/build-layout-engine.yml` does not exist.
- [ ] `.github/workflows/deploy-layout-engine.yml` does not exist.
- [ ] `docker-compose.yml` has only `mvp_postgres` service (no port-5432 `postgres` service).
- [ ] `package.json` workspaces / `turbo.json` task definitions don't reference any defunct package.
- [ ] No source file imports from `@renewable-energy/db` or `@renewable-energy/api-client`.

If any check fails: file as a follow-up cleanup PR. Quick `rm -rf` + commit per item.

**AWS resource cleanup (deferred to a separate post-stabilization PR, ~1 week after merge stable):**

- [ ] Delete Lambda function `layout_engine_lambda_prod` (dormant, no traffic).
- [ ] Delete ECR repo `378240665051.dkr.ecr.ap-south-1.amazonaws.com/renewable-energy/layout-engine`.
- [ ] Delete SQS queue `re_layout_queue_prod`.
- [ ] Delete S3 buckets `renewable-energy-{local,staging,prod}-artifacts` (verify they're empty first or `aws s3 sync` to a backup location).
- [ ] Update `docs/AWS_RESOURCES.md` to reflect deletions.

### 7.8 CLAUDE.md cascade (Day 4)

This is the biggest non-mechanical task in the merge — see §8 for the detailed plan.

### 7.9 Rollback playbook (any day)

If something goes catastrophically wrong, rollback options:

#### Rollback at Day 1–2 (mechanical merge fails locally)

- Trivial. Just `git branch -D merge/renewable-energy` and try again. No external impact.

#### Rollback at Day 3 mid-cutover (after rename, before Vercel cutover complete)

- Repo rename is reversible: GitHub Settings → Rename back to `pv_layout_project`. The 301 redirect from `solarlayout` to `pv_layout_project` would then trip up anyone relying on the redirect — communicate clearly.
- Vercel: re-link projects back to `renewable_energy` repo. Same disconnect/reconnect flow.
- AWS OIDC: revert trust subject back to `repo:SolarLayout/renewable_energy:*`.

#### Rollback at Day 3 after cutover complete but before Day 4 cleanup

- Most painful rollback. The merged repo is live; renewable_energy is stale.
- Options:
  1. Continue forward (most likely). Whatever broke can be fixed with normal patches.
  2. Revert the merge commit in `solarlayout`. Vercel projects keep pointing at `solarlayout` but the code is the pre-merge desktop-only state — backend deploys would fail because `apps/mvp_*` is gone. Re-link Vercel back to renewable_energy as in the Day 3 mid-cutover scenario.
- **Decision rule:** if rollback is contemplated past Day 3, prefer fix-forward unless the issue is fundamental.

#### Rollback at Day 4+ (after CLAUDE.md cascade, settled state)

- Functionally impossible. Roll forward with patches.

---

## 8. CLAUDE.md Cascade — Detailed

`CLAUDE.md` files are the load-bearing contract between Claude Code and the repo conventions. Both repos have rich, hand-curated CLAUDE.md content. Merging them well determines how fast Claude can be productive in the new repo.

### 8.1 Surface area

Inventory of CLAUDE.md files in both repos (verified by grep):

**pv_layout_project:**
- `/CLAUDE.md` — root, comprehensive (210 lines per current state)

**renewable_energy:**
- `/CLAUDE.md` — root, with `next-agents-md` bloat (need to strip)
- `/apps/mvp_api/CLAUDE.md` — likely
- `/apps/mvp_web/CLAUDE.md` — likely
- `/apps/mvp_admin/CLAUDE.md` — likely
- `/apps/api/CLAUDE.md` — defunct, deleted under Option B
- `/packages/mvp_db/CLAUDE.md` — likely
- `/packages/db/CLAUDE.md` — defunct, deleted under Option B

(Verify by `grep -rl '^# ' --include="CLAUDE.md"` on each repo before Day 4.)

### 8.2 Merge strategy per file

#### Root `/CLAUDE.md`

Full rewrite. Structure:

```markdown
# solarlayout — Claude Code Context

# 1. What this project is
   (combined: the desktop product + cloud backend together)

# 2. ⛔ Non-negotiables
   (merged from both repos' rules)

# 3. Repository map
   (the new flat layout from §5.2 of this PRD)

# 4. Tech stack at a glance
   (combined: TypeScript, Python, Rust, Hono, Next.js, Prisma, Tauri, etc.)

# 5. Single-app paradigm (desktop side) + Backend domain (cloud side)
   (from each repo's existing content)

# 6. Theme strategy (desktop)
   (carried from pv_layout_project)

# 7. External context (now smaller — no other repos to track)
   (mostly removed; just keep references to legacy PVlayout_Advance + renewable_energy archive)

# 8. Common commands
   (merged: bun run, uv run, cargo, vercel)

# 9. Working a row from PLAN.md / post-parity-v2-backend-plan.md
   (merge both backlog conventions)

# 10. Architecture decision records
   (merge both ADR registries — see §8.3)

# 11. Coding conventions
   (merged)

# 12. What to do when something is unclear
   (merged)

# 13. Session-start checklist for Claude
   (merged)
```

#### Per-app `/apps/<name>/CLAUDE.md`

Each preserved as-is during merge, then on Day 4 each is reviewed for:
- References to `pv_layout_project` or `renewable_energy` repo names → update to `solarlayout`.
- References to absolute paths in the other repo → update relative paths.
- References to defunct apps/packages → remove.
- "Backlog: see [docs/initiatives/post-parity-v2-backend-plan.md](docs/initiatives/post-parity-v2-backend-plan.md)" — confirm path resolves.

These are best done by a sub-agent reading each CLAUDE.md and proposing diffs; engineer reviews and commits.

#### `/docs/ARCHITECTURE.md`

pv_layout_project's exists and is current. renewable_energy's `docs/architecture.md` is partially stale (describes defunct cloud-port architecture per the inventory).

**Strategy:**
- Move renewable_energy's `docs/architecture.md` to `docs/historical/architecture-cloud-port-pre-V2.md` with a banner: "Superseded 2026-04-29 by V2 backend rewrite. Preserved for context."
- pv_layout_project's `docs/ARCHITECTURE.md` becomes the single source — extend it with new sections covering the cloud surface (mvp_api, mvp_db, Stripe billing, AWS resources reference).

#### `/docs/PLAN.md` + `/docs/initiatives/post-parity-v2-backend-plan.md`

Both keep their own paths post-merge. They're separate backlogs serving different domains. The unified root CLAUDE.md §9 references both.

#### `/docs/adr/` (ADR registries)

Merge ADR numbering ranges. pv_layout_project has ADR-0001 through 0007. renewable_energy has its own ADR registry (count unverified — check on Day 4).

**Strategy:**
- pv_layout_project ADRs keep their numbers (0001–0007).
- renewable_energy ADRs get re-numbered starting at 0100 (or another offset) to avoid collision.
- Each ADR's content stays unchanged; only the filename and the ADR's own header line update.
- Update `docs/adr/README.md` (the index) to list both old and new ADRs.

### 8.3 Execution method

This is best done by spawning a focused subagent on Day 4:

```
Prompt: "Read every CLAUDE.md, ARCHITECTURE.md, and ADR file in the merged
solarlayout repo. Identify every cross-reference, every absolute path,
every reference to repo names that need updating. Produce a list of
proposed changes. The engineer reviews and commits."
```

Output: a single commit-ready diff. Engineer applies. ~half a day.

---

## 9. Risks Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | Stripe webhook delivery fails during Vercel cutover, customer payment event missed | Low | High | Disable Stripe webhook endpoint before mvp_api cutover; re-enable after; rely on Stripe's 3-retry exponential backoff as fallback | Arun |
| 2 | Vercel project re-link loses an env var | Low | Medium | Vercel preserves env vars on disconnect/reconnect (verified pattern). Snapshot env var names in playbook 7.1 step 4 to allow audit. | Arun |
| 3 | Custom domain points to wrong project after re-link | Low | High | Domains attach to projects, not git connections (Vercel's data model). Should be unaffected. Verify in playbook 7.4.2. | Arun |
| 4 | Workspace resolution fails after package scope rename | Low | Low | `bun install` catches at Day 1. If anything is missed, build fails — fix and re-commit. | Engineer |
| 5 | `packages/ui` collision causes import errors | Low | Low | Resolved upfront (5.5): rename desktop's to `packages/ui-desktop`. Update single import site in `apps/desktop`. | Engineer |
| 6 | Subtree merge produces unmergeable history | Low | High | Rehearse on a throwaway branch before Day 1. If subtree is unworkable, fall back to manual file copy (Approach B). | Engineer |
| 7 | OIDC trust update breaks an in-flight CI job | Low | Low | No CI workflows in either repo today reference the OIDC role for live mvp apps. Only the (defunct, deleted) layout-engine workflows. Hard cutover is safe. | Arun |
| 8 | GitHub repo rename breaks a third-party integration | Low | Medium | GitHub's 301 redirect handles HTTP-based integrations. SSH-based clones need explicit `git remote set-url`. List third-party integrations in playbook 7.1. | Arun |
| 9 | Bun + Turborepo can't resolve mixed-scope workspaces during transition | Very low | Low | Solved by 5.6 — rename all `@renewable-energy/*` → `@solarlayout/*` upfront. No mixed-scope state. | Engineer |
| 10 | Backend session commits to renewable_energy mid-merge (race) | Low | Medium | Code freeze announced before Day 1. Backend session paused. If a commit happens, cherry-pick into solarlayout post-merge. | Arun |
| 11 | Vercel project path "Root Directory" doesn't match new repo's path | Very low | Medium | Same path under Option A flat layout. Verify in playbook 7.4 step 3. | Arun |
| 12 | CLAUDE.md cascade misses a stale cross-reference, Claude later acts on bad info | Medium | Low | Mitigated by subagent-driven cascade on Day 4. Errors found later are fixable in seconds. | Engineer |
| 13 | Defunct AWS resources continue to incur cost | Very low | Very low | Lambda dormant ($0 idle), ECR storage ~few cents/month, S3 buckets `renewable-energy-*-artifacts` if not empty. Cleanup PR ~1 week post-merge. | Arun |
| 14 | Local clone working dir name `pv_layout_project` mismatches repo name `solarlayout` | Very low | Very low | Cosmetic. Optional `mv ~/codebase/pv_layout_project ~/codebase/solarlayout` post-merge. | Arun |
| 15 | docker-compose collision (port 5432 still referenced somewhere) | Very low | Very low | Dropped from compose. If any local dev script references port 5432, surface as part of grep audit before Day 1. | Engineer |

---

## 10. Acceptance Criteria

The merge is complete when ALL of these hold:

- [ ] `git push origin post-parity-v1-desktop` to `https://github.com/SolarLayout/solarlayout.git` succeeds (the rename is live, the merged code is on the new repo).
- [ ] `bun run build` at root passes (all 4 apps build).
- [ ] `bun run lint` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run test` passes (all existing tests).
- [ ] `cd python/pvlayout_engine && uv run pytest tests/ -q` passes (123/123 + 6 skipped).
- [ ] `bun run dev` (with appropriate workspace filters) brings up dev servers for desktop, mvp_api, mvp_web, mvp_admin without errors.
- [ ] All 3 production domains resolve correctly:
  - [ ] `curl -I https://api.solarlayout.in/health` returns 200
  - [ ] `curl -I https://solarlayout.in` returns 200
  - [ ] `curl -I https://admin.solarlayout.in` returns 200 or 302 (auth gate)
- [ ] Stripe webhook delivers a test event successfully to `https://api.solarlayout.in/webhooks/stripe` after cutover.
- [ ] Desktop app (running locally in dev) successfully calls `api.solarlayout.in` and fetches entitlements.
- [ ] AWS OIDC trust policy on `renewable-energy-github-actions` role contains `repo:SolarLayout/solarlayout:*`.
- [ ] No reference to `@renewable-energy/` anywhere in source code (verified by grep).
- [ ] `docker-compose up` brings up only `mvp_postgres` (no port-5432 service).
- [ ] No defunct apps/packages present (`apps/api`, `apps/web`, `apps/layout-engine`, `packages/db`, `packages/api-client` all absent).
- [ ] Root CLAUDE.md rewritten and accurately describes the merged repo.
- [ ] `docs/PLAN.md` (this repo's) and `docs/initiatives/post-parity-v2-backend-plan.md` (carried over) both exist and resolve from the unified docs hierarchy.
- [ ] PRD at `docs/post-parity/PRD-cable-compute-strategy.md` updated to drop §5 cross-repo dependency map.

---

## 11. Out of Scope

Explicitly NOT in this spike — flagged as follow-ups:

1. **AWS resource cleanup PR.** Deletion of dormant Lambda / ECR / SQS / `renewable-energy-*-artifacts` S3 buckets. Post-stabilization PR ~1 week after merge.
2. **CI pipeline for mvp apps.** No GH Actions for lint/typecheck/test/build of mvp_api, mvp_web, mvp_admin currently. Adding them is its own spike — recommended within 2 weeks of merge to avoid regressions.
3. **Cable-compute Spike 1 (local A+B + UX hygiene + relabel)** — already shipped on `post-parity-v1-desktop` as part of this initiative's earlier work; benefits from merge but doesn't depend on it.
4. **Cable-compute Spike 2 (cloud Lambda framework)** — gated on this merge landing. Picks up after Day 5.
5. **Cosmetic OIDC role rename** (`renewable-energy-github-actions` → `solarlayout-github-actions`). Cosmetic; defer.
6. **`packages/entitlements-client` ↔ `packages/shared` consolidation.** Now possible since both live in the same repo; defer until natural opportunity.
7. **Local clone directory rename** (`/Users/arunkpatra/codebase/pv_layout_project` → `solarlayout`). Cosmetic; Arun's call.
8. **Repo description / README.md polish** post-merge — keep simple during merge, polish in a follow-up.
9. **Renumbering or consolidating ADR registries** beyond the offset-merge in 8.2. Wait until next ADR is written.

---

## 12. Code Freeze Window

**Duration:** Day 1 (merge branch cut) through Day 3 (cutover complete) ≈ 3 days.

**Scope:** No commits to either repo's mainline branches during this window.

- `pv_layout_project / post-parity-v1-desktop` — frozen; all work happens on `merge/renewable-energy` branch.
- `renewable_energy / post-parity-v2-backend` — frozen; backend session paused.

**Communication:**
- Before Day 1: Arun confirms freeze with backend session.
- Day 3 end: Arun confirms cutover complete; backend session resumes work in `solarlayout` repo.

**If freeze is broken:** the lost commit is cherry-picked into `solarlayout` post-merge. Cost: a few minutes.

---

*End of Merge Spike PRD. Ready for spike creation.*
