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
2. **[docs/SPIKE_PLAN.md](./docs/SPIKE_PLAN.md)** — the 17-spike project plan. We execute these sequentially with human gates between each.

### Working agreements
- **Spike-based development.** Work proceeds in named spikes (S0 → S15, with intervening sub-spikes inserted as needs surface — currently S5.5, S8.7, S8.8, S10.5, S13.5, S13.6, S13.7, S15.5). Each spike has an explicit **Human Gate** defined in `SPIKE_PLAN.md`. Nothing else gets built until the current spike's gate passes.
- **I pause at every gate.** When a spike's deliverables are ready, I stop and tell the human exactly what to run to verify. I do not start the next spike until the human signs off.
- **No new features during migration.** If a request comes in that isn't "reach parity with PVlayout_Advance," it goes in a backlog. Keep scope honest.
- **Functional parity is the contract.** Any feature that behaves one way in `PVlayout_Advance` must behave identically here unless we've explicitly decided otherwise. Golden-file tests in S3 catch silent drift.
- **Design bar is explicit and non-negotiable** — see §12 of `ARCHITECTURE.md` and the S5.5 deliverables. "It works" is not done. "It matches the quality bar" is done.
- **Each spike ends with a demo commit.** `git log` should read like a project plan: `s03: golden-file tests for layout`, `s09: input panel + generate layout`, etc.

### Local execution, global awareness

> *"Look at the road you are on, but know where the road leads to."*

Each spike has a tight scope and a physical gate. Within those, execute end-to-end without leaking. **Look at the road.**

But every architectural decision — every data shape, dependency, abstraction, naming choice, file structure — implicitly binds the future. **Know where the road leads.**

Operationally:

1. **Before locking any architectural decision** (anything that becomes an ADR or shows up in a gate memo as a "Decision"), re-read the SPIKE_PLAN entries for S+1 through S+5. Ask: does this choice serve or constrain those spikes?
2. **When a current-spike decision affects a future spike**, flag it explicitly — in the ADR's "Consequences" section ("S11 will need X because we chose Y here"), or in the gate memo. Never silently bind a future spike to today's expedience.
3. **Refactor in-spike when a known future need conflicts with current shape.** If S9 needs a Zustand store and S11 will need geometric editing on the same data, design the store now so editing fits — even if S9 uses 20% of it.
4. **Reverse: don't over-architect for hypothetical futures.** Only design for *known* upcoming spikes (SPIKE_PLAN is the source of truth), not imagined ones. YAGNI still applies.
5. **Pause and surface** if an in-progress decision would force throw-away work in any future spike. Better to redesign the current spike than to ship debt that compounds across the next five.

This applies to: scoping decisions, dependency choices, data schemas, file structure, naming, abstractions, what to test, what to defer. It does NOT apply to product features — those are governed by the SPIKE_PLAN scope rules and the "no scope creep" agreement above.

### What I never do without explicit human ask
- Skip a Human Gate.
- Start a spike before the previous gate has passed.
- Rewrite or refactor `pvlayout_core/` modules (the copied PVlayout_Advance domain logic). Those are preserved verbatim.
- Add features not listed in the current spike's In-Scope section.
- Commit anything the human hasn't asked me to commit.
- Modify `reference_screenshots_for_UX_dsktop/` — it's a frozen reference.

---

## 3. Repository map

```
pv_layout_project/
├── CLAUDE.md                            ← this file
├── README.md
├── docs/
│   ├── ARCHITECTURE.md                  canonical architecture
│   ├── SPIKE_PLAN.md                    17-spike project plan
│   ├── DESIGN_FOUNDATIONS.md            (created in S5.5)
│   ├── adr/                             architecture decision records
│   ├── design/
│   │   ├── light/                       S5.5 light mocks
│   │   └── dark/                        S5.5 dark drafts; S13.5 dark finals
│   └── gates/                           per-spike gate verification records
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

## 9. Spike execution protocol

**For every spike:**
1. Re-read `docs/SPIKE_PLAN.md` for the current spike's **Goal**, **In scope**, **Out of scope**, **Deliverables**, and **Human Gate**.
2. Execute only what's in scope.
3. When deliverables are met, write a **gate verification memo** at `docs/gates/s<NN>.md` containing:
   - What was built.
   - How to verify (exact commands, URLs, file paths).
   - Known limitations.
   - Any decisions made during the spike.
4. Stop. Ask the human to run the gate. Do not proceed.
5. On sign-off: commit with message `s<NN>: <one-line summary>`, then start the next spike.
6. If the gate fails: fix within the current spike. Do not declare done early.

**Current spike status is tracked in `docs/gates/STATUS.md`** (created in S0; kept current on every gate pass).

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

ADRs accepted so far:
- ADR 0001 — online-required entitlement policy (S7, accepted 2026-04-24).
- ADR 0002 — canvas-first MapLibre, no basemap (S8, accepted 2026-04-24).
- ADR 0003 — state architecture (S8.8, accepted 2026-04-24).
- ADR 0004 — cloud is passive storage (S8.8, accepted 2026-04-24).

Future ADRs scheduled:
- ADR 0005 — drawing/editing pipeline (S10.5, to pick deck.gl/nebula.gl vs Terra Draw vs maplibre-gl-draw before S11).
- S12: telemetry event granularity + opt-in/opt-out.
- S13.7: subscription model redesign + migration plan.
- S14: crash reporting provider.

---

## 11. Coding conventions

- **Prettier:** no semicolons, double quotes, trailing commas (es5), 80-char width — matches `renewable_energy` conventions.
- **Workspace package scope:** `@solarlayout/*` for all internal packages, all `private: true`.
- **Zod** for all external input validation (sidecar request bodies, env vars, entitlements response parsing).
- **State:** lives where ADR-0003 says it lives. TanStack Query for server cache; Zustand (sliced under `apps/desktop/src/state/<slice>.ts`) for cross-component client state; `useState` for ephemeral single-component UI state; `useRef` for imperative handles. Context is for *configuration* injection only, never for writable state. See [ADR-0003](./docs/adr/0003-state-architecture.md) for the full convention.
- **Test co-location:** `foo.test.ts` beside `foo.ts`. Frontend uses Vitest + RTL + happy-dom (S8.7); sidecar uses pytest (S3).
- **Python:** `ruff` + `mypy`. Tests in `python/pvlayout_engine/tests/`.
- **Rust:** `cargo fmt` + `cargo clippy`. Lives in `apps/desktop/src-tauri/`.
- **Commit style:** `s<NN>: <summary>` for spike-closing commits; `wip: <summary>` for intra-spike commits.

---

## 12. What to do when something is unclear

In order of preference:
1. Check `docs/ARCHITECTURE.md` — the design question probably has an answer there.
2. Check `docs/SPIKE_PLAN.md` — the scope question probably has an answer there.
3. Check `docs/adr/` — a precedent may exist.
4. Check `reference_screenshots_for_UX_dsktop/` — the visual question probably has an answer there.
5. Check `PVlayout_Advance/` (read-only) — the behavioral question probably has an answer there.
6. Ask the human. Do not guess.

Explicitly: **do not design from memory, do not assume PVlayout_Advance behavior without reading its code, do not invent requirements not in the plan.**

---

## 13. Session-start checklist for Claude

At the start of every new session on this repo, before taking any action:
1. Read this CLAUDE.md end to end.
2. Read `docs/ARCHITECTURE.md` §1–3, §6.5, §12.
3. Read `docs/SPIKE_PLAN.md` — at minimum, the Spike Map, the current spike's entry, the entries for S+1 through S+5 (per the "Local execution, global awareness" principle in §2), and the Cross-cutting Principles.
4. Read `docs/gates/STATUS.md` to know which spike is active and whether the last gate passed.
5. Skim `docs/adr/README.md` for the index of accepted ADRs; read any ADR relevant to the current spike.
6. If asked to do work: confirm it matches the current spike's In-Scope section. If it doesn't, surface the mismatch to the human before proceeding.
