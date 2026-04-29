# pv_layout_project — Claude Code Context

**Read this file at the start of every session on this repo. It is the canonical map of what this project is, where things live, how they fit together, and how we work.**

---

## 1. What this project is

A ground-up rewrite of the **SolarLayout** desktop product — a native desktop application (Windows, macOS, Linux) for automated solar PV plant layout design. Given a KMZ boundary, module specs, and plant parameters, it places panel tables, ICR (Inverter Control Room) buildings, string inverters, DC/AC cables, lightning arresters, and exports to KMZ, DXF, and PDF. It also computes 25-year energy yield.

**Why a rewrite:** the current PyQt5 + matplotlib app (`PVlayout_Advance` — read-only reference) is functionally complete but has a 90s-era desktop UI. This repo replaces the UI layer with a modern native-feel shell while preserving 100% of the domain logic.

**Quality bar:** [Claude Desktop](https://claude.ai/download) for chrome, typography, motion, and color discipline. [Linear](https://linear.app) for engineering-tool density. [Figma](https://www.figma.com) for canvas+inspector interactions. Reference screenshots at `reference_screenshots_for_UX_dsktop/{light_theme,dark_theme}/` are normative.

---

## 2. ⛔ Non-negotiables

### Read these before touching code or planning work
1. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — stack, component boundaries, runtime flows, module mapping, security model, design system §12.
2. **[docs/PLAN.md](./docs/PLAN.md)** — the active backlog. Mission: catch the new app up to legacy `baseline-v1-20260429`. Tiered process per row (T1 / T2 / T3). Pick top `todo`, do it, flip to `done`.

### Working agreements
- **Backlog-driven.** Work proceeds row-by-row through [docs/PLAN.md](./docs/PLAN.md). Pick the top `todo` row; do it; flip to `done`. No spike-execution protocol, no per-row gate memo.
- **Tiered process per row.** T1 = port + sidecar pytest. T2 = T1 + numeric parity test against the legacy baseline. T3 = T2 + a short discovery memo capturing solar-domain decisions (Prasanta reviews accumulated memos in a single pass at end-of-port; no per-row Prasanta gate). The row's tier is non-negotiable for that row; don't lighten or heavyen it on the fly.
- **No new features during the parity push.** If a request comes in that isn't in PLAN.md or required by an in-PLAN row's acceptance, it waits until the table is fully `done`.
- **Functional parity is the contract.** A feature that behaves one way in legacy at `baseline-v1-20260429` must behave identically here unless explicitly documented as a divergence (e.g., S11.5 Pattern V).
- **Design bar is explicit and non-negotiable** for code that lands in the new-app UI surface — see §12 of `ARCHITECTURE.md` and `DESIGN_FOUNDATIONS.md`. "It works" is not done. "It matches the quality bar" is done. (Most parity rows touch `pvlayout_core/` only and don't trigger this bar.)

### Local execution, global awareness

> *"Look at the road you are on, but know where the road leads to."*

Each row has a tight scope. Execute end-to-end without leaking. But when porting a row, look at adjacent rows in the same domain group — porting LA placement (row 2) shapes how the layout engine integrates LA (row 6). Don't silently bind a downstream row to today's expedience: flag in the row's notes if a current decision constrains a later row. Refactor in-row when a known later need conflicts with current shape; don't over-architect for hypothetical futures (YAGNI). Pause and surface if an in-progress decision would force throw-away work in a known future row.

### External contracts bind before code

Names that cross a boundary to another repo or service — feature-key strings, API response shapes, export format IDs, sidecar route paths — have a source of truth outside this repo. Read that source before typing the name in this one. Preview and mock data is silent about contract divergence; assume it's lying until a contract test or the real file agrees. New names flow one direction: the external contract changes first, we mirror.

Full principle, post-mortem of the S7/S10 incident that landed it, authoritative source-of-truth file table, and operational steps: [`docs/principles/external-contracts.md`](./docs/principles/external-contracts.md). Feature-key registry policy: [ADR-0005](./docs/adr/0005-feature-key-registry.md).

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
pv_layout_project/
├── CLAUDE.md                            ← this file
├── README.md
├── docs/
│   ├── PLAN.md                          active backlog (tier-graded, domain-grouped)
│   ├── ARCHITECTURE.md                  canonical architecture
│   ├── DESIGN_FOUNDATIONS.md            design system foundations
│   ├── adr/                             architecture decision records
│   ├── design/
│   │   ├── light/                       light mocks
│   │   └── dark/                        dark mocks
│   ├── parity/baselines/                legacy numeric capture data (test fixture)
│   ├── principles/                      cross-cutting principles
│   └── historical/                      superseded planning artifacts (audit trail; do not modify)
├── reference_screenshots_for_UX_dsktop/
│   ├── light_theme/                     Claude Desktop light — normative
│   └── dark_theme/                      Claude Desktop dark — normative
├── apps/
│   └── desktop/                         Tauri 2 + React 19 + TS desktop app
│       ├── src/                         React frontend
│       └── src-tauri/                   Rust shell
├── python/
│   └── pvlayout_engine/                 FastAPI sidecar
│       ├── pvlayout_engine/             FastAPI server + schemas + routes
│       ├── pvlayout_core/               EXACT copy of PVlayout_Advance/{core,models,utils}
│       └── tests/
├── packages/
│   ├── ui/                              shadcn-based component library
│   ├── sidecar-client/                  generated TS client from FastAPI OpenAPI
│   └── entitlements-client/             hand-written client for api.solarlayout.in
├── turbo.json
├── package.json                         Bun workspaces root
└── .github/workflows/                   CI (added in S4+)
```

---

## 4. Tech stack at a glance

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
| Monorepo | **Turborepo** + **Bun workspaces** | Consistent gates, selective builds |
| Sidecar packaging | **PyInstaller** (onefile) | Mature; matches PVlayout_Advance pattern |
| Desktop packaging | **Tauri bundler** | MSI / DMG / AppImage / DEB |

**Explicitly NOT using:** PyQt5, PySide2/6, Electron, Flutter, Qt Quick/QML.

**Architecture one-liner:** Tauri Rust shell ↔ React frontend ↔ localhost HTTP ↔ PyInstaller-bundled Python sidecar running `pvlayout_core` verbatim. External: `api.solarlayout.in` for entitlements + usage telemetry only.

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

These exist elsewhere on disk and are referenced by this project but **never modified by work in this repo**:

| Repo | Path | Purpose |
|---|---|---|
| `PVlayout_Advance` | `/Users/arunkpatra/codebase/PVlayout_Advance` | Source of truth for all domain logic. We copy `core/`, `models/`, `utils/` into `python/pvlayout_engine/pvlayout_core/` in S1. We don't modify the source repo. |
| `renewable_energy` | `/Users/arunkpatra/codebase/renewable_energy` | Hosts `apps/mvp_web` (marketing + dashboard on Vercel), `apps/mvp_api` (Hono backend serving `api.solarlayout.in`), `packages/mvp_db` (Prisma + Postgres). We consume `api.solarlayout.in/entitlements` and `/usage/report`. Anything else in that repo (old `apps/{web,api,layout-engine}`) is defunct — ignore. |

Source-of-truth files for external contracts (feature keys, API shapes, usage payloads) are catalogued in [`docs/principles/external-contracts.md`](./docs/principles/external-contracts.md) under §2's "External contracts bind before code" principle.

---

## 8. Common commands

> These land in S0+ as the repo gets built out. Until S0 is complete, the repo is just docs and references.

```bash
# From repo root
bun install
bun run dev               # all dev servers
bun run build
bun run lint              # eslint via flat config (S8.7)
bun run typecheck
bun run test              # vitest + RTL across all workspaces (S8.7)
bun run format            # prettier --write across the repo
bun run format:check      # prettier --check (CI)

# Desktop app — from apps/desktop
bun run tauri dev         # launches Tauri shell with sidecar
bun run tauri build       # produces installer for host OS/arch
bun run test:watch        # vitest in watch mode for the desktop workspace
bun run vite:dev          # vite-only preview (no Tauri); design / headless render mode

# UI package — from packages/ui
bun run test:watch        # vitest in watch mode for ui

# Python sidecar — from python/pvlayout_engine
uv sync                   # install deps
uv run pytest             # run tests (golden-file harness lands in S3)
uv run python -m pvlayout_engine.main    # dev-mode sidecar
uv run pyinstaller pvlayout-engine.spec  # build standalone binary (S4+)

# Pre-commit gate (from S8.7 onward — same gate as CI)
bun run lint && bun run typecheck && bun run test && bun run build
cd python/pvlayout_engine && uv run pytest tests/ -q
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
- ADR 0004 — cloud is passive storage (accepted 2026-04-24).
- ADR 0005 — feature key registry (accepted).
- ADR 0006 — drawing / editing pipeline (accepted).
- ADR 0007 — pvlayout_core S11.5 exception (**superseded** 2026-04-29 by docs/PLAN.md; the S11.5 changes themselves remain in place and correct).

New ADRs are written when a decision genuinely affects the shape of the system. There is no pre-scheduled ADR queue.

---

## 11. Coding conventions

- **Prettier:** no semicolons, double quotes, trailing commas (es5), 80-char width — matches `renewable_energy` conventions.
- **Workspace package scope:** `@solarlayout/*` for all internal packages, all `private: true`.
- **Zod** for all external input validation (sidecar request bodies, env vars, entitlements response parsing).
- **State:** lives where ADR-0003 says it lives. TanStack Query for server cache; Zustand (sliced under `apps/desktop/src/state/<slice>.ts`) for cross-component client state; `useState` for ephemeral single-component UI state; `useRef` for imperative handles. Context is for *configuration* injection only, never for writable state. See [ADR-0003](./docs/adr/0003-state-architecture.md) for the full convention.
- **Test co-location:** `foo.test.ts` beside `foo.ts`. Frontend uses Vitest + RTL + happy-dom (S8.7); sidecar uses pytest (S3).
- **Python:** `ruff` + `mypy`. Tests in `python/pvlayout_engine/tests/`.
- **Rust:** `cargo fmt` + `cargo clippy`. Lives in `apps/desktop/src-tauri/`.
- **Commit style:** `parity: <feature name>` for row-closing commits; `wip: <summary>` for intra-row commits. Other categories (`chore:`, `docs:`, `fix:`) follow conventional-commits when the change isn't a parity row.

---

## 12. What to do when something is unclear

In order of preference:
1. Check `docs/ARCHITECTURE.md` — the design question probably has an answer there.
2. Check `docs/PLAN.md` — the scope question probably has an answer there (active row + tier policy + out-of-scope list).
3. Check `docs/adr/` — a precedent may exist.
4. Check `reference_screenshots_for_UX_dsktop/` — the visual question probably has an answer there.
5. Check `PVlayout_Advance/` (read-only at branch `baseline-v1-20260429`) — the behavioral question probably has an answer there.
6. Ask the human. Do not guess.

Explicitly: **do not design from memory, do not assume legacy behavior without reading its code at the baseline branch, do not invent requirements not in PLAN.md.**

---

## 13. Session-start checklist for Claude

At the start of every new session on this repo, before taking any action:
1. Read this CLAUDE.md end to end.
2. Read `docs/ARCHITECTURE.md` §1–3, §6.5, §12.
3. Read `docs/PLAN.md` — header (status), the top `todo` row's Source + Acceptance, and the row's domain group (rows in the same group often share dependencies).
4. Skim `docs/adr/README.md` for the index of accepted ADRs; read any ADR relevant to the row.
5. If asked to do work: confirm it matches an in-PLAN row or its acceptance. If it doesn't, surface the mismatch to the human before proceeding.
6. **If the row touches an external contract** (feature gates, entitlements, sidecar API, export formats, telemetry), read the source-of-truth file(s) listed in §7 before writing any name that crosses the boundary. Preview / mock data is silent about contract divergence — assume it's lying until a contract test or the real file says otherwise.
