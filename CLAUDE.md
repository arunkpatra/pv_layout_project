# solarlayout — Claude Code Context

**Read this file at the start of every session on this repo. It is the canonical map of what this project is, where things live, how they fit together, and how we work.**

> **Repo identity:** GitHub `SolarLayout/solarlayout`. Local working directory still `pv_layout_project/` for now (folder rename pending; not blocking). Was two repos until 2026-05-01 — see §1.

---

## 1. What this project is

The **SolarLayout** product surface — desktop engineering tool plus cloud support stack — in one monorepo.

**Desktop (primary product, primary focus of this repo):** A ground-up rewrite of the SolarLayout desktop product — a native desktop application (Windows, macOS, Linux) for automated solar PV plant layout design. Given a KMZ boundary, module specs, and plant parameters, it places panel tables, ICR (Inverter Control Room) buildings, string inverters, DC/AC cables, lightning arresters, and exports to KMZ, DXF, and PDF. It also computes 25-year energy yield. **Why a rewrite:** the legacy PyQt5 + matplotlib app (`PVlayout_Advance` — read-only reference) is functionally complete but has a 90s-era desktop UI. This repo replaces the UI layer with a modern native-feel shell while preserving 100% of the domain logic.

**Cloud (supporting surface, in-repo since merge):** the marketing site (`solarlayout.in` via `apps/mvp_web`), the user dashboard + payments (Clerk + Stripe via `mvp_web` + `apps/mvp_api`), the entitlements + telemetry API (`api.solarlayout.in` via `mvp_api`), the admin tool (`admin.solarlayout.in` via `apps/mvp_admin`), and the Postgres schema (`packages/mvp_db`). Per [ADR-0004](./docs/adr/0004-cloud-as-passive-storage.md): cloud is **passive** — no engineering compute, no rendering. Desktop does everything; cloud holds entitlements, accepts uploads, lists past designs.

**Why merged (2026-05-01):** the `renewable_energy` repo (which hosted the cloud apps) was merged into this repo via `git subtree` with full history preservation. One repo, one CI, one deploy pipeline, one place to reason about cross-cutting changes. Burn-the-boats migration: prod was cut over, both DBs are at migration HEAD, the old GitHub repo is archive-pending. See [docs/post-parity/PRD-merge-spike.md](./docs/post-parity/PRD-merge-spike.md) for the playbook and [docs/post-parity/RESUME-2026-05-01-post-merge.md](./docs/post-parity/RESUME-2026-05-01-post-merge.md) for the post-merge state snapshot.

**Quality bar (desktop):** [Claude Desktop](https://claude.ai/download) for chrome, typography, motion, and color discipline. [Linear](https://linear.app) for engineering-tool density. [Figma](https://www.figma.com) for canvas+inspector interactions. Reference screenshots at `reference_screenshots_for_UX_dsktop/{light_theme,dark_theme}/` are normative.

---

## 2. ⛔ Non-negotiables

### Read these before touching code or planning work
1. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — stack, component boundaries, runtime flows, module mapping, security model, design system §12.
2. **[docs/PLAN.md](./docs/PLAN.md)** — the active backlog. **Mission (post-parity, 2026-04-29 onward):** ship the desktop app for PVLayout — project + run primitives, multi-tab UI, V2 backend integration, full legacy GUI capability coverage, Claude-Desktop quality bar. The earlier parity-sweep mission ("catch the new app up to legacy `baseline-v1-20260429`") closed 12/12 done on 2026-04-29 and is archived at [docs/historical/PLAN-parity-v1.md](./docs/historical/PLAN-parity-v1.md). Tiered process per row (T1 / T2 / T3). Pick top `todo`, do it, flip to `done`.

### Working agreements
- **Backlog-driven.** Work proceeds row-by-row through [docs/PLAN.md](./docs/PLAN.md). Pick the top `todo` row; do it; flip to `done`. No spike-execution protocol, no per-row gate memo.
- **Tiered process per row (post-parity).** T1 = build + test. T2 = T1 + integration test (typically across desktop ↔ sidecar ↔ V2 backend). T3 = T1 + a short decision memo at `docs/post-parity/findings/YYYY-MM-DD-NNN-<slug>.md`. The row's tier is non-negotiable for that row; don't lighten or heavyen it on the fly. (The parity-era T1/T2/T3 model — port + parity-test + solar-domain memo — applied through 2026-04-29 and is preserved in the archived parity table.)
- **No out-of-plan features.** If a request comes in that isn't in PLAN.md or required by an in-PLAN row's acceptance, it waits until the table is fully `done` or the row is explicitly added.
- **V2 backend is a hard dependency for most desktop rows.** The active backend plan lives in this repo at [docs/initiatives/post-parity-v2-backend-plan.md](./docs/initiatives/post-parity-v2-backend-plan.md) (brought in by the 2026-05-01 merge; was previously in the separate `renewable_energy` repo on its `post-parity-v2-backend` branch). [docs/post-parity/PLAN-backend.md](./docs/post-parity/PLAN-backend.md) is the superseded scoping draft — read for additional rationale only. With one repo there is no longer a separate backend session — desktop and cloud work share this CLAUDE.md.
- **Functional parity is the floor, not the ceiling.** Per Prasanta's 2026-04-29 directive: whatever a user could do in the legacy PyQt5 app, the new app must support. UI/UX architecture is unconstrained — original quality bar (Claude Desktop chrome / Linear density / Figma canvas-inspector / semantic tokens / light-first with dark as preview) holds.
- **Design bar is explicit and non-negotiable** for code that lands in the new-app UI surface — see §12 of `ARCHITECTURE.md` and `DESIGN_FOUNDATIONS.md`. "It works" is not done. "It matches the quality bar" is done.

### Local execution, global awareness

> *"Look at the road you are on, but know where the road leads to."*

Each row has a tight scope. Execute end-to-end without leaking. But when porting a row, look at adjacent rows in the same domain group — porting LA placement (row 2) shapes how the layout engine integrates LA (row 6). Don't silently bind a downstream row to today's expedience: flag in the row's notes if a current decision constrains a later row. Refactor in-row when a known later need conflicts with current shape; don't over-architect for hypothetical futures (YAGNI). Pause and surface if an in-progress decision would force throw-away work in a known future row.

### External contracts bind before code

Names that cross a boundary between runtimes — feature-key strings, API response shapes, export format IDs, sidecar route paths, mvp_api wire shapes — have a single source of truth. Read that source before typing the name elsewhere. The merge put desktop and cloud in one repo but **the boundary is still real**: Tauri runs in the user's webview, the sidecar runs as a localhost subprocess, mvp_api runs on Vercel. They exchange JSON over HTTPS, not function calls. Preview and mock data is silent about contract divergence; assume it's lying until a contract test or the real file agrees. New names flow one direction: the contract source-of-truth changes first, the other side mirrors.

Full principle, post-mortem of the S7/S10 incident that landed it, authoritative source-of-truth file table, and operational steps: [`docs/principles/external-contracts.md`](./docs/principles/external-contracts.md). Feature-key registry policy: [ADR-0005](./docs/adr/0005-feature-key-registry.md).

### Verify with citations before proceeding

For any claim that touches **far-reaching effect, external users (customer impact), or deep tech specifics**, fetch authoritative sources first, cite the URLs and quoted passages back to the user in chat, and only THEN proceed with the action. This is non-negotiable.

What counts as a trigger: claims about external library/tool behavior, OS / runtime / package-manager specifics, CI/runner internals, security or signing posture, user-visible behavior on platforms not tested locally, SLAs / compliance / regulatory, pricing, anything that would land in a customer-facing release note.

Authoritative = upstream project docs, official GitHub repos, RFC/IEC/ISO specifications, vendor docs (AWS / GitHub / Apple). NOT random Stack Overflow answers or stale blog posts. When two pages from the same vendor disagree (it has happened — Tauri 2's Prerequisites page vs their GitHub Actions example), call out the divergence and pick the canonical/freshest source with reasoning.

Be honest about what cannot be verified. If a comparative claim ("X has more reports than Y") isn't supported by primary sources, drop or rephrase it — don't manufacture corroboration.

This rule does NOT apply to small refactors, in-codebase reasoning where the actual code is the source of truth, or trivial syntax. The bar: would a wrong claim here cost real time, money, or customer trust? If yes → cite first.

### What I never do without explicit human ask
- Skip a row in PLAN.md or work a row out of `todo` order without a documented reason in the row's notes.
- Lighten or heavyen a row's tier on the fly — T1 stays T1, T3 stays T3.
- Add features not in PLAN.md or required by an in-PLAN row's acceptance.
- Commit anything the human hasn't asked me to commit.
- Modify `reference_screenshots_for_UX_dsktop/` — it's a frozen reference.
- Modify files under `docs/historical/` — that's the audit trail of superseded plans.

---

## 3. Repository map

```
pv_layout_project/                       ← folder name; GitHub repo is "solarlayout"
├── CLAUDE.md                            ← this file
├── README.md
├── docs/
│   ├── PLAN.md                          active desktop backlog (tier-graded)
│   ├── ARCHITECTURE.md                  canonical architecture (desktop + cloud)
│   ├── DESIGN_FOUNDATIONS.md            design system foundations (desktop)
│   ├── adr/                             architecture decision records
│   ├── design/{light,dark}/             desktop mocks
│   ├── initiatives/
│   │   └── post-parity-v2-backend-plan.md   active V2 backend backlog
│   ├── parity/baselines/                legacy numeric capture data (test fixture)
│   ├── principles/                      cross-cutting principles
│   ├── post-parity/                     PRDs, findings, resume docs (post-2026-04-29)
│   └── historical/                      superseded planning artifacts (audit trail; do not modify)
├── reference_screenshots_for_UX_dsktop/
│   ├── light_theme/                     Claude Desktop light — normative
│   └── dark_theme/                      Claude Desktop dark — normative
├── apps/
│   ├── desktop/                         Tauri 2 + React 19 + TS desktop app
│   │   ├── src/                         React frontend
│   │   └── src-tauri/                   Rust shell
│   ├── mvp_web/                         Next.js 16 — solarlayout.in (marketing + dashboard)
│   ├── mvp_admin/                       Next.js 16 — admin.solarlayout.in (Clerk-gated)
│   └── mvp_api/                         Hono v4 (Bun) — api.solarlayout.in (entitlements, billing, telemetry)
├── python/
│   └── pvlayout_engine/                 FastAPI sidecar (desktop's compute engine)
│       ├── pvlayout_engine/             FastAPI server + schemas + routes
│       ├── pvlayout_core/               EXACT copy of PVlayout_Advance/{core,models,utils}
│       └── tests/
├── packages/
│   ├── ui-desktop/                      shadcn primitives for the Tauri desktop app (was `ui` pre-merge)
│   ├── sidecar-client/                  generated TS client from FastAPI OpenAPI
│   ├── entitlements-client/             hand-written client for api.solarlayout.in (desktop-side)
│   ├── ui/                              shadcn primitives for the Next.js cloud apps
│   ├── mvp_db/                          Prisma 7 schema + generated client (Postgres)
│   ├── shared/                          shared TS types (consumed by mvp_api)
│   ├── eslint-config/                   shared ESLint flat configs
│   └── typescript-config/               shared tsconfig presets
├── turbo.json                           Turborepo pipelines (unified for desktop + cloud)
├── package.json                         Bun workspaces root (name: "solarlayout")
└── .github/workflows/
    ├── ci.yml                           desktop + cloud gates (lint/typecheck/test/build + sidecar pytest)
    ├── platform-deployment.yml          workflow_dispatch — deploys mvp_{web,admin,api} to Vercel
    └── release.yml                      desktop release pipeline
```

**`packages/ui` vs `packages/ui-desktop`:** they're different libraries for different worlds — `ui` is for the Next.js cloud apps (mvp_web/mvp_admin), `ui-desktop` is for the Tauri desktop app. They share the shadcn ancestry but have diverged on tokens, components in scope, and consumers. Don't cross-import. Pre-merge they both happened to be called `@solarlayout/ui`; the desktop one was renamed to `@solarlayout/ui-desktop` during the merge to break the collision.

---

## 4. Tech stack at a glance

### 4.1 Desktop

| Layer | Technology | Why |
|---|---|---|
| Desktop shell | **Tauri 2** (Rust) | Native webview, small bundle, real OS chrome |
| Frontend | **React 19 + TypeScript** | Matches mvp_web stack; huge ecosystem |
| Styling | **Tailwind v4 + shadcn/ui** | Industry-standard primitives, theme-token-driven |
| Motion | **Framer Motion** | Claude-Desktop-quality transitions |
| Command palette | **cmdk** | Standard pattern, accessible |
| Icons | **Lucide** + small custom solar set | Monoline, consistent stroke, OFL |
| Typography | **Inter** (primary), **Geist Mono** (numerics) | OFL, bundle-safe |
| Map canvas | **MapLibre GL** + **deck.gl** overlays | GPU-accelerated, custom-stylable |
| State | **Zustand** + **TanStack Query** | Simple, fast, proven |
| Forms | **react-hook-form** + **Zod** | Type-safe, co-located validation |
| Sidecar | **Python 3.12+** + **FastAPI** + **uvicorn** | Minimal overhead around existing Python core |
| Python core | **pvlayout_core** (copied from PVlayout_Advance) | Shapely, pyproj, simplekml, matplotlib (PDF only), ezdxf, numpy |
| Python tooling | **uv** + **pyproject.toml** | Modern, fast |
| Sidecar packaging | **PyInstaller** (onefile) | Mature; matches PVlayout_Advance pattern |
| Desktop packaging | **Tauri bundler** | MSI / DMG / AppImage / DEB |

**Explicitly NOT using on desktop:** PyQt5, PySide2/6, Electron, Flutter, Qt Quick/QML.

**Desktop architecture one-liner:** Tauri Rust shell ↔ React frontend ↔ localhost HTTP ↔ PyInstaller-bundled Python sidecar running `pvlayout_core` verbatim. External: `api.solarlayout.in` for entitlements + usage telemetry only.

### 4.2 Cloud

| Layer | Technology | Why |
|---|---|---|
| Marketing + dashboard | **Next.js 16** (App Router) on **Vercel** | mvp_web — `solarlayout.in` |
| Admin tool | **Next.js 16** (App Router) on **Vercel** | mvp_admin — `admin.solarlayout.in` |
| API server | **Hono v4** on **Bun** runtime, on **Vercel** | mvp_api — `api.solarlayout.in` |
| Auth | **Clerk** | Used by mvp_web + mvp_admin only; never desktop (license-key bearer auth on desktop) |
| Payments | **Stripe** (live webhook at `api.solarlayout.in/webhooks/stripe`) | Subscriptions + plan management |
| Database | **Postgres** on AWS RDS (us-east-1: `journium.cbuwaoikc0qr...`) | Single instance for staging + prod (separate DBs) |
| ORM | **Prisma 7** with semantic-id extension | mvp_db |
| Object storage | **AWS S3** (ap-south-1, account 378240665051) | Buckets `solarlayout-{local,staging,prod}-{downloads,projects}` |
| Validation | **Zod** | At every external boundary |

**Cloud architecture one-liner:** Vercel-hosted Next.js + Hono in front of an AWS RDS Postgres + S3, with Clerk for human auth, license keys for desktop auth, and Stripe for billing. Per [ADR-0004](./docs/adr/0004-cloud-as-passive-storage.md): no compute, no rendering — passive storage and auth/billing only.

### 4.3 Shared

| Layer | Technology | Why |
|---|---|---|
| Monorepo | **Turborepo** + **Bun workspaces** | Consistent gates, selective builds, single install |
| Lint | **ESLint** flat config (shared via `@solarlayout/eslint-config`) | One config family across desktop + cloud |
| Format | **Prettier** | No semicolons, double quotes, trailing-commas:es5, 80-char width |
| TypeScript | **`@solarlayout/typescript-config`** presets | Reused tsconfig bases |
| CI | **GitHub Actions** | `ci.yml` runs all four JS gates + sidecar pytest; `platform-deployment.yml` deploys cloud apps via Vercel CLI |

---

## 5. Single-app paradigm (important)

There is **exactly one build per OS/arch**. No Basic/Pro/Pro_Plus variants. All features ship in the same binary. Runtime entitlements from `api.solarlayout.in/entitlements` control what the UI exposes and what the sidecar will compute.

Double-sided enforcement:
- React hides/locks features the user isn't entitled to.
- Sidecar endpoints (e.g. `/export/dxf`) return `403 feature_not_entitled` regardless of what the UI sends.

If you ever see `PVLayout_Basic.spec`, `main_basic.py`, `main_pro.py`, `main_pro_plus.py` or similar edition-specific files referenced anywhere — that's obsolete. `PVlayout_Advance` has them but they're junk. In this repo, we have one spec and one entry.

---

## 6. Theme strategy

- **Light first.** Polished to the quality bar in S5.5/S6.
- **Dark ships as "preview"** between S6 and S13.5. Semantic tokens cover both; dark renders, but polish is deferred.
- **Dark parity** is a dedicated spike (S13.5) after feature completeness.
- **Semantic tokens from day one.** No component references a color literal. Every color goes through the token system defined in `DESIGN_FOUNDATIONS.md`.
- **Ground colors:** warm off-white (`#FAFAF9` region) for light, warm near-black (`#1A1A19` region) for dark. Never pure white or pure black.

---

## 7. External context (read-only reference repos)

The cloud stack used to live in a separate `renewable_energy` repo. After the 2026-05-01 merge it lives in this repo (`apps/mvp_*`, `packages/mvp_db`, `packages/{ui,shared,eslint-config,typescript-config}`). The old repo on GitHub is archive-pending — **don't read or modify it**; treat this repo as the source of truth for everything cloud.

The only remaining external read-only reference:

| Repo | Path | Purpose |
|---|---|---|
| `PVlayout_Advance` | `/Users/arunkpatra/codebase/PVlayout_Advance` | Source of truth for all desktop domain logic. We copied `core/`, `models/`, `utils/` into `python/pvlayout_engine/pvlayout_core/` in S1 (frozen at branch `baseline-v1-20260429`). We don't modify the source repo. |

Source-of-truth files for **internal** contracts (feature keys, API shapes, usage payloads — now all in this repo) are catalogued in [`docs/principles/external-contracts.md`](./docs/principles/external-contracts.md) under §2's "External contracts bind before code" principle. The principle itself still applies — desktop and cloud are separate runtimes with versioned wire contracts even though they share a repo.

---

## 8. Common commands

```bash
# From repo root — covers all workspaces (desktop + cloud)
bun install
bun run dev               # all dev servers
bun run build             # turbo build across 10 packages
bun run lint              # eslint flat config across 8 lintable packages
bun run typecheck         # tsc --noEmit across 13 packages
bun run test              # vitest + bun:test across 9 testing workspaces (~931 JS/TS tests)
bun run format            # prettier --write across the repo
bun run format:check      # prettier --check (CI)

# Pre-commit gate (same gate as CI)
bun run lint && bun run typecheck && bun run test && bun run build
cd python/pvlayout_engine && uv run pytest tests/ -q

# Selective with turbo --filter
bunx turbo build --filter=@solarlayout/desktop
bunx turbo test --filter=@solarlayout/mvp-api
bunx turbo dev --filter=@solarlayout/mvp-web

# Desktop app — from apps/desktop
bun run tauri dev         # launches Tauri shell with sidecar
bun run tauri build       # produces installer for host OS/arch
bun run vite:dev          # vite-only preview (no Tauri); design / headless render mode

# Python sidecar — from python/pvlayout_engine
uv sync --extra dev       # install deps INCLUDING pytest (bare `uv sync` strips dev extras)
uv run pytest tests/ -q   # 123 passed + 6 skipped at HEAD
uv run python -m pvlayout_engine.main      # dev-mode sidecar (port 8001)
uv run pyinstaller pvlayout-engine.spec    # build standalone binary

# Cloud database — from repo root
bun run mvp-db:generate   # regenerate Prisma client (after schema.prisma change)
bun run mvp-db:migrate    # create + apply migration (env-aware; see below)
bun run mvp-db:status     # migration status against the connected DB
bun run mvp-db:studio     # Prisma Studio
bun run mvp-db:validate   # validate schema.prisma syntax

# Migrations against staging or prod (credentials in gitignored .env.staging / .env.production at repo root)
set -a; . ./.env.staging;    set +a; bunx prisma migrate status --schema=packages/mvp_db/prisma/schema.prisma
set -a; . ./.env.production; set +a; bunx prisma migrate status --schema=packages/mvp_db/prisma/schema.prisma

# Local cloud env files (gitignored; per-machine, NOT committed)
# - apps/mvp_web/.env.local
# - apps/mvp_admin/.env.local
# Both contain NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (test pubkey, public by design — same value as ci.yml)
# Without these the local Next.js build fails at prerender.
```

---

## 9. Working a row from PLAN.md

1. Read [docs/PLAN.md](./docs/PLAN.md). Pick the top `todo` row.
2. Read the row's `Source` (legacy file + commit) end-to-end before editing. Read adjacent rows in the same domain group for dependencies.
3. Apply the row's tier ceremony:
   - **T1** — implement → `uv run pytest tests/ -q` in `python/pvlayout_engine` → commit.
   - **T2** — T1 plus a numeric parity test against the legacy baseline at `docs/parity/baselines/baseline-v1-20260429/`.
   - **T3** — T2 plus a short discovery memo at `docs/parity/findings/YYYY-MM-DD-NNN-<slug>.md` capturing solar-domain decisions. Memo is the audit trail and prep material for Prasanta's end-of-port review (no per-row Prasanta gate; row close = T2 close + memo committed).
4. Flip `Status` to `done` in PLAN.md and bump the count in the Status line at the top of the file when `Acceptance` is met.
5. Atomic commit per row: `parity: <feature name>`. Intra-row checkpoints use `wip: <summary>`.

No per-row gate memo. No per-row sub-plan file. Discovery memos are only for T3 rows or when a T1/T2 diff itself surfaces a solar-domain question worth recording.

---

## 10. Architecture decision records

Decisions that affect the shape of the system go in `docs/adr/NNNN-short-title.md`. Template:

```markdown
# ADR NNNN: <title>
Date: YYYY-MM-DD
Spike: S<NN>
Status: accepted | superseded | reversed

## Context
<the question and the constraints>

## Options considered
<bullets>

## Decision
<what we chose and why>

## Consequences
<what we accept as a result>
```

ADRs:
- ADR 0001 — online-required entitlement policy (accepted 2026-04-24).
- ADR 0002 — canvas-first MapLibre, no basemap (accepted 2026-04-24).
- ADR 0003 — state architecture (accepted 2026-04-24).
- ADR 0004 — cloud is passive storage (accepted 2026-04-24; **2026-05-01 post-merge note** — the principle is unchanged but the Context now means in-repo `apps/mvp_*`, not a sibling `renewable_energy` repo).
- ADR 0005 — feature key registry (accepted).
- ADR 0006 — drawing / editing pipeline (accepted).
- ADR 0007 — pvlayout_core S11.5 exception (**superseded** 2026-04-29 by docs/PLAN.md; the S11.5 changes themselves remain in place and correct).

New ADRs are written when a decision genuinely affects the shape of the system. There is no pre-scheduled ADR queue.

---

## 11. Coding conventions

- **Prettier:** no semicolons, double quotes, trailing commas (es5), 80-char width.
- **Workspace package scope:** `@solarlayout/*` for all internal packages, all `private: true`.
- **Zod** for all external input validation (sidecar request bodies, env vars, entitlements response parsing, mvp_api request bodies).
- **State (desktop):** lives where ADR-0003 says it lives. TanStack Query for server cache; Zustand (sliced under `apps/desktop/src/state/<slice>.ts`) for cross-component client state; `useState` for ephemeral single-component UI state; `useRef` for imperative handles. Context is for *configuration* injection only, never for writable state. See [ADR-0003](./docs/adr/0003-state-architecture.md) for the full convention.
- **Test co-location:** `foo.test.ts` beside `foo.ts`. Frontend uses Vitest + RTL + happy-dom; mvp_api uses Bun's built-in test runner; sidecar uses pytest.
- **Python:** `ruff` + `mypy`. Tests in `python/pvlayout_engine/tests/`.
- **Rust:** `cargo fmt` + `cargo clippy`. Lives in `apps/desktop/src-tauri/`.
- **Commit style:** `parity: <feature name>` for desktop parity-row-closing commits (legacy mission, archived); for post-parity work follow conventional-commits (`feat:`, `fix:`, `docs:`, `chore:`, `perf:`, `refactor:`). `wip:` for intra-row checkpoints. Always co-author with `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

### Workspace package resolution (Bundler vs NodeNext)

When adding a new internal package, decide its `moduleResolution` first — it determines how consumers wire it up:

| Strategy | When | How |
|---|---|---|
| **Source alias** | `moduleResolution: "Bundler"` (no `.js` extensions in imports) | Add to consuming app's `tsconfig.json` paths + `transpilePackages`; no build step needed. Used by most packages here. |
| **Compiled dist** | `moduleResolution: "NodeNext"` (`.js` extensions in source) | Add `@solarlayout/<pkg>#typecheck` and `#build: { dependsOn: ["^build"] }` overrides in `turbo.json`; consumers depend on the built output. Used by `mvp_db` (Prisma client) and `mvp_api`'s build step. |

**Never point a Next.js / Turbopack path alias at NodeNext source** — Turbopack cannot remap `.js` imports to `.ts` files at build time.

**`turbo.json` per-package overrides REPLACE, not merge.** A `@solarlayout/mvp-api#build` entry replaces the global `build` task's `env` array entirely — it does not inherit from it. Always repeat the full `env` array on every per-package `#build` override or you lose env-var passthrough.

---

## 12. What to do when something is unclear

In order of preference:
1. Check `docs/ARCHITECTURE.md` — the design question probably has an answer there.
2. Check `docs/PLAN.md` — the scope question probably has an answer there (active row + tier policy + out-of-scope list).
3. Check `docs/adr/` — a precedent may exist.
4. Check `reference_screenshots_for_UX_dsktop/` — the visual question probably has an answer there.
5. Check `PVlayout_Advance/` (read-only at branch `baseline-v1-20260429`) — the behavioral question about the legacy desktop probably has an answer there.
6. For cloud questions: read the relevant `apps/mvp_*/src/` or `packages/mvp_db/prisma/schema.prisma` directly — there is no separate "cloud reference repo" anymore.
7. Ask the human. Do not guess.

Explicitly: **do not design from memory, do not assume legacy behavior without reading its code at the baseline branch, do not invent requirements not in PLAN.md or `docs/initiatives/post-parity-v2-backend-plan.md`.**

---

## 13. Session-start checklist for Claude

At the start of every new session on this repo, before taking any action:
1. Read this CLAUDE.md end to end.
2. Read `docs/ARCHITECTURE.md` — §1–3 for orientation, §6.5 + §12 for desktop specifics, the cloud section for cloud specifics.
3. Read the relevant backlog:
   - **Desktop work** → `docs/PLAN.md` header + top `todo` row + domain group.
   - **Cloud / V2 backend work** → `docs/initiatives/post-parity-v2-backend-plan.md`.
4. Skim `docs/adr/README.md` for the ADR index; read any ADR relevant to the row.
5. If asked to do work: confirm it matches an in-backlog row or its acceptance. If it doesn't, surface the mismatch to the human before proceeding.
6. **If the row touches a cross-runtime contract** (feature gates, entitlements, sidecar API, mvp_api wire shapes, export formats, telemetry payloads), read the source-of-truth file(s) listed in [`docs/principles/external-contracts.md`](./docs/principles/external-contracts.md) before writing any name that crosses the desktop ↔ cloud boundary. Both ends now live in this repo, but the boundary is real — Tauri runs in the user's webview, mvp_api runs on Vercel, they exchange JSON over HTTPS. Names still flow one direction: contract changes first, the other side mirrors.
