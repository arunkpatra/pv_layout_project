# SolarLayout Desktop — Spike Plan

**Status:** Draft for review
**Last updated:** 2026-04-24
**Companion doc:** [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Protocol

- **Spike = a small, logically contained chunk of work with a clear, human-testable Definition of Done.**
- Spikes run sequentially unless explicitly marked parallelizable.
- At the end of each spike, I stop and ask you to physically verify the gate criteria. No next spike starts until you sign off.
- If a gate fails, we fix within the same spike. A spike is not done until you say it is.
- Each spike lists: **Goal**, **In scope**, **Out of scope**, **Deliverables**, **Human Gate** (the exact thing you test).
- Estimates are for calibration only — we ship when the gate passes, not when the clock runs out.

---

## Spike map

```
S0    Repo & tooling bootstrap                       [foundation]
S1    Vendor Python core from PVlayout_Advance       [foundation]
S2    FastAPI sidecar — health, schemas, auth        [sidecar]
S3    Sidecar: parse + layout + golden-file tests    [sidecar]
S4    Sidecar: PyInstaller single-binary build       [sidecar]
S5    Tauri 2 shell + sidecar lifecycle              [shell]
S5.5  Design Foundations (tokens + light mocks)      [design]
S6    Design system implementation (light polished)  [frontend]
S7    License key + entitlements + feature gating    [auth]
S8    KMZ load + MapLibre canvas (light vector style)[canvas]
S8.7  Frontend test harness + CI                     [foundation]
S8.8  State architecture cleanup (ADR-0003 + 0004)   [foundation]
S9    Input panel + Generate Layout (tables, ICRs)   [core UX]
S10   Inverters, cables, LAs (PRO, read-only)        [core UX]
S10.2 Feature-key alignment with backend seed        [foundation]
S10.5 Drawing/editing pipeline ADR                   [foundation]
S11   Interactivity: ICR drag + obstruction drawing  [core UX]
S11.5 Cable-calc correctness (industry requirements) [core UX]
S12   Exports: KMZ + PDF                             [output]
S13   Exports (DXF, CSV) + PRO_PLUS energy yield     [output]
S13.5 Dark theme parity                              [design]
S13.7 Subscription model redesign (brainstorm)       [strategy]
S13.8 Parity & gates end-to-end verification         [release]
S14   Auto-updater + code signing + notarization    [release]
S15   Release pipeline + download delivery          [release]
S15.5 Sidecar bundle slimming (deferred opt)         [post-launch]
```

23 spikes. S0–S4 produce a working sidecar you can `curl`. S5–S7 produce a launchable shell that can authenticate, rendered to the Claude-Desktop-quality bar in light mode. S8.7 + S8.8 invest in foundation (test harness, state architecture) before the core-UX run begins. S9–S13 bring the UI to feature parity with PVlayout_Advance, with S10.2 inserted to correct S7's fictional feature keys (discovered during S10's gate walkthrough) and S10.5 inserted to pick the drawing/editing library before S11 needs it. S13.5 brings dark theme to parity. S13.7 decomposes the Edition → Subscription redesign. S13.8 runs the full parity + plan-based gate sweep against PVlayout_Advance with real Basic / Pro / Pro Plus licenses (the per-spike gate walkthroughs deliberately cover only what each spike ships — S13.8 is the consolidated pre-release check). S14–S15 make it shippable. S15.5 is a deferred post-launch optimization picked up only on real-user signal.

---

## S0 — Repo & tooling bootstrap

**Goal:** A monorepo you can clone, `bun install`, and run empty lint/typecheck/build across.

**In scope:**
- `pv_layout_project/` monorepo with Turbo + Bun workspaces.
- Top-level `package.json`, `turbo.json`, `tsconfig.json`, `.editorconfig`, `.prettierrc`, `.gitignore`.
- `apps/desktop/`, `python/pvlayout_engine/`, `packages/ui/`, `packages/sidecar-client/`, `packages/entitlements-client/` created as empty workspace stubs.
- `docs/ARCHITECTURE.md` and `docs/SPIKE_PLAN.md` (this file) committed.
- `CLAUDE.md` at root, documenting local commands and conventions.
- Python toolchain: `uv` + `pyproject.toml` skeleton.
- Git initialized, first commit tagged `v0.0.0-s0`.

**Out of scope:** any actual source code, any UI, any sidecar routes.

**Deliverables:**
- Running `bun install` succeeds from repo root.
- Running `bun run lint && bun run typecheck && bun run build` returns zero errors on empty stubs.
- Running `uv sync` inside `python/pvlayout_engine/` succeeds.

**Human Gate:**
1. `cd pv_layout_project && bun install` completes without error.
2. `bun run build` completes without error.
3. `cd python/pvlayout_engine && uv sync` completes without error.
4. `git log --oneline` shows the `v0.0.0-s0` tag.

---

## S1 — Vendor Python core from PVlayout_Advance

**Goal:** The full `core/`, `models/`, `utils/` trees from PVlayout_Advance live inside the new repo, installable and importable, with PyQt5 removed from the dependency graph.

**In scope:**
- Copy `PVlayout_Advance/core/`, `PVlayout_Advance/models/`, `PVlayout_Advance/utils/` into `python/pvlayout_engine/pvlayout_core/`.
- `pyproject.toml` dependencies: `shapely`, `pyproj`, `simplekml`, `matplotlib` (for PDF export only), `numpy`, `ezdxf`. **No PyQt5, no PySide.**
- Audit imports: if any `core/` module imports PyQt5, refactor to a pure-Python interface. (Spot check: `layout_engine.py`, `kmz_parser.py`, `icr_placer.py`, `string_inverter_manager.py`, `la_manager.py`, `road_manager.py`, `spacing_calc.py`, `energy_calculator.py`, exporters.)
- Smoke test: a single `pytest` that imports every module and instantiates the core dataclasses.

**Out of scope:** FastAPI, HTTP, any GUI concerns.

**Deliverables:**
- `uv run python -c "from pvlayout_core.core.layout_engine import run_layout_multi"` succeeds.
- `uv run pytest` passes the smoke test.
- No PyQt5 or PySide in `uv tree`.

**Human Gate:**
1. Run `uv run pytest tests/smoke/` — all pass.
2. Confirm `uv tree | grep -iE 'pyqt|pyside'` returns nothing.
3. Confirm `ls python/pvlayout_engine/pvlayout_core/core/` lists the 16 vendored modules plus `__init__.py`.

---

## S2 — FastAPI sidecar: health, schemas, auth

**Goal:** A runnable sidecar process exposing `/health` on a loopback port, authenticated by a per-session bearer token. Pydantic schemas cover every dataclass in `models/project.py`.

**In scope:**
- `pvlayout_engine/server.py` — FastAPI app, binds `127.0.0.1`, random free port, token from `PVLAYOUT_SIDECAR_TOKEN` env var.
- `pvlayout_engine/schemas.py` — pydantic models twinning every field of `models/project.py`: `LayoutParameters`, `LayoutResult`, `PlacedTable`, `PlacedICR`, `PlacedLA`, `CableRun`, `PlacedRoad`, etc.
- `pvlayout_engine/main.py` — uvicorn entry that prints `{"port": N, "token": "..."}` to stdout on ready (so Tauri can parse it).
- Middleware: rejects requests missing or mismatching the bearer token.
- `GET /health` returns `{"status": "ok", "version": "<git-sha>"}`.
- `GET /openapi.json` works — we'll use it for TS client generation in S5.

**Out of scope:** layout computation, KMZ parsing, exports.

**Deliverables:**
- `uv run python -m pvlayout_engine.main` launches the sidecar and prints startup JSON.
- `curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/health` returns `{"status":"ok",...}`.
- `curl http://127.0.0.1:$PORT/health` (no token) returns 401.

**Human Gate:**
1. Launch sidecar from terminal; capture port and token from stdout.
2. `curl` with token → 200.
3. `curl` without token → 401.
4. Open `http://127.0.0.1:$PORT/docs` → Swagger UI renders all pydantic schemas.

---

## S3 — Sidecar: parse + layout + golden-file tests

**Goal:** The sidecar can parse a KMZ and generate a layout, producing output that matches PVlayout_Advance byte-for-byte (or geometrically-equivalent) on known inputs.

**In scope:**
- `POST /parse-kmz` — takes a KMZ as multipart upload, returns parsed boundaries/obstacles/line obstructions as GeoJSON-shaped JSON.
- `POST /layout` — takes `LayoutParameters` + parsed KMZ data, returns `LayoutResult[]` with placed tables, ICRs, string inverters, cables, LAs.
- `POST /refresh-inverters` — takes current result + ICR positions, reruns `place_string_inverters` + `place_lightning_arresters`.
- Golden-file test harness: 3 real KMZs from PVlayout_Advance's typical workload stored in `tests/golden/`. For each: run the current PyQt5 app, dump `LayoutResult` to JSON (a one-off script), check into `tests/golden/expected/`. Then the sidecar test runs the same params through `/layout` and compares JSON.
- Geometric tolerance: exact match on counts (tables, ICRs, inverters, LAs); position match within 0.01 m.

**Out of scope:** exports, energy yield, road/obstruction endpoints.

**Deliverables:**
- `uv run pytest tests/golden/` passes on 3 reference KMZs.
- Swagger UI shows all three endpoints with example payloads.

**Human Gate:**
1. Manually upload one reference KMZ via `curl` or Swagger → see parsed boundaries in JSON.
2. POST a known parameter set → see table count, ICR count, inverter count matching what the current PyQt5 app produces for the same KMZ.
3. Optionally: visually render the returned table centroids in QGIS or a quick Python script — looks like a solar plant, not like noise.

---

## S4 — Sidecar: PyInstaller single-binary build

**Goal:** One `pvlayout-engine` binary per OS/arch that runs the sidecar standalone, no Python runtime required on the target machine.

**In scope:**
- `python/pvlayout_engine/pvlayout-engine.spec` — single PyInstaller spec, `--onefile`, `--noconsole` on Windows, excludes PyQt5/PySide2/PySide6.
- Binary launches exactly like the dev sidecar: same stdout JSON, same endpoints.
- GitHub Actions workflow: builds on `macos-14` (arm64), `macos-13` (x64), `windows-2022`, `ubuntu-22.04`. Uploads artifacts.
- Smoke test in CI: after building, runs the binary, hits `/health`, verifies 200.

**Out of scope:** code signing, notarization (that's S14).

**Deliverables:**
- Local: `uv run pyinstaller pvlayout-engine.spec` produces `dist/pvlayout-engine` on host OS.
- CI: artifacts `pvlayout-engine-macos-arm64`, `pvlayout-engine-macos-x64`, `pvlayout-engine-windows-x64.exe`, `pvlayout-engine-linux-x64` downloadable from the Actions run.

**Human Gate:**
1. Download the artifact for your current OS from the CI run.
2. Run it locally; hit `/health` with a `curl` — 200.
3. POST a KMZ through `/parse-kmz` — same JSON shape as in S3.
4. File size sanity check (expect 60–150 MB per binary depending on platform).

---

## S5 — Tauri 2 shell + sidecar lifecycle

**Goal:** A Tauri app that opens a window, spawns the sidecar binary, passes the token, and kills the sidecar on quit. No UI yet — just an empty React page that shows "Sidecar: healthy" if `/health` returns 200.

**In scope:**
- `apps/desktop/src-tauri/tauri.conf.json` — `externalBin` points at the sidecar built in S4 for the current platform. Dev builds use the local binary; release builds use the bundled one.
- `src-tauri/src/sidecar.rs` — spawn with `Command::new`, capture stdout, parse the startup JSON, pass port+token to the frontend.
- `src-tauri/src/main.rs` — wires the sidecar manager into Tauri's setup hook; kills the sidecar on window close.
- `invoke("get_sidecar_config")` — returns `{ port, token }` to React.
- Minimal React app: calls `invoke("get_sidecar_config")`, then fetches `/health` with the token, renders status.
- Sidecar-client package stub: `packages/sidecar-client/` runs `openapi-typescript-codegen` against the sidecar's `/openapi.json` and produces a typed client. Not wired in yet beyond the `/health` call.

**Out of scope:** keyring, entitlements, any business logic.

**Deliverables:**
- `bun run tauri dev` opens a native window.
- Page shows "Sidecar: healthy — pvlayout-engine v<sha>".
- On window close: sidecar process exits within 1s (verified via Activity Monitor / Task Manager).

**Human Gate:**
1. `bun run tauri dev` from `apps/desktop/` opens a native window on macOS (or Windows/Linux).
2. Window chrome looks native — not a web browser tab.
3. UI shows "Sidecar: healthy".
4. Open Activity Monitor → see `pvlayout-engine` process running.
5. Close the window → `pvlayout-engine` disappears from Activity Monitor within 1s.
6. Run `bun run tauri build` → produces a `.dmg` / `.msi` / `.AppImage` on the host. Install and launch — same behavior.

---

## S5.5 — Design Foundations

**Goal:** Before any UI is built in code, produce a written design system and a set of high-fidelity static mocks that hit the Claude-Desktop quality bar for light mode. This spike is the quality contract for every UI spike that follows.

**In scope:**
- `docs/DESIGN_FOUNDATIONS.md` — the normative design document. Sections:
  - **Design principles** — restraint, weight-led hierarchy, canvas-first, motion you feel not see.
  - **Color tokens** — semantic token table with light and dark values for every token. Ground color, surface elevations, text roles, border opacities, state colors (hover/active/focus/disabled), data-vis palette for the canvas (tables, ICRs, inverters, cables, LAs, obstructions), signal colors (success/warning/error).
  - **Type system** — Inter (primary), Geist Mono (numerics). Complete type scale with sizes, weights, line-heights, letter-spacing, intended use.
  - **Spacing & sizing** — 4px grid; component density conventions.
  - **Radius scale** — `sm/md/lg/xl/2xl` with intended uses.
  - **Motion tokens** — duration scale (fast/base/slow), easing curves, named motion primitives (dialog-open, sidebar-collapse, inspector-slide, toast-enter).
  - **Elevation** — how we do depth without heavy shadows (luminance shifts + hairline borders + micro-shadows for floating surfaces only).
  - **Icon discipline** — Lucide as the primary set; stroke weight; sizing grid; solar-specific custom icon inventory (module, table, tracker, ICR, string inverter, LA, cable DC, cable AC).
  - **Component inventory** — checklist of every shadcn/ui primitive we'll use, plus the custom compositions (ToolRail, Inspector, StatusBar, MapCanvas, FeatureGate, UpgradeBadge, CommandBar, PropertyRow, SummaryCard).
  - **Canvas visual language** — table fill, stroke, hover, selection, obstruction fills, ICR footprints, cable strokes, LA rects + circles. All defined as vector style specs.
  - **Interaction language** — keyboard shortcuts master list, drag affordances, empty states, loading states, error states.
  - **Accessibility** — contrast targets (WCAG AA), focus visibility, keyboard reachability.
- **High-fidelity static mocks** (static HTML → PNG via headless Chromium) of five surfaces, built for Claude-Desktop-quality in **light mode**:
  1. Splash (cold-start during sidecar boot).
  2. Startup dialog (design mode selection).
  3. Project empty state (canvas, no KMZ loaded).
  4. Project populated (canvas with tables, ICRs, inverters; inspector with summary).
  5. Inspector in parameter-editing state (during input, before generate).
- Dark-mode drafts of the same five surfaces — rough cut, tokens applied, polish deferred to S13.5.

**Out of scope:**
- Any code. Not one line of React.
- MapLibre style authoring (that's S8, but guided by the canvas visual language defined here).

**Deliverables:**
- `docs/DESIGN_FOUNDATIONS.md` complete and reviewable.
- Four light-mode mocks checked in as PNG/PDF under `docs/design/light/`.
- Four dark-mode draft mocks under `docs/design/dark/`.

**Human Gate:**
1. Read `DESIGN_FOUNDATIONS.md` end to end. Every token has a name and a value. Every principle has a consequence.
2. View each light-mode mock side-by-side with its closest Claude Desktop equivalent from `reference_screenshots_for_UX_dsktop/light_theme/`. Your judgment call: does the SolarLayout mock belong in the same visual family? If not, we iterate within this spike before moving on.
3. The dark-mode drafts can be rough — they're a sanity check that the token system flips cleanly, nothing more.
4. Sign-off on this spike is effectively sign-off on the quality bar for the rest of the project. Every subsequent UI spike will be graded against these mocks.

---

## S6 — Design system implementation (light polished)

**Goal:** The desktop app's visual shell — not its contents — implemented in React and Tauri to hit the light-mode mocks from S5.5. Dark theme renders via the same tokens but is labeled "preview" in settings.

**In scope:**
- `packages/ui/` — shadcn primitives installed and themed against the S5.5 tokens. Components needed for the shell and subsequent spikes: Button (ghost/subtle/primary/destructive variants), IconButton, Card, Dialog, Sheet, Tabs, Segmented, Tooltip, Input, Select, Label, Separator, Toaster, Popover, DropdownMenu, Command, Kbd, Badge, Switch, Slider, NumberInput.
- **Custom window chrome** — Tauri `decorations: false` on macOS; re-implement traffic-light positioning; native menus wired; Windows/Linux keep platform-default chrome in v1.
- **Global layout** — `apps/desktop/src/App.tsx`:
  - Left: collapsible **ToolRail** (icon-only, hover labels).
  - Main: **MapCanvas** area (empty placeholder, correctly themed).
  - Right: collapsible **Inspector** panel.
  - Top bar: app title, project name, edition chip, user menu.
  - Bottom: **StatusBar** with sidecar status, FPS counter (dev builds only), units toggle, zoom indicator.
- **Command palette** (`⌘K`) — cmdk, with stub commands so the chrome works.
- **Motion system** — Framer Motion configured with the tokens from S5.5. Dialog open, sidebar collapse, inspector toggle, tab switch all use named motion primitives.
- **Theme** — `<ThemeProvider>` with OS-follow + explicit override in settings. Theme toggle in status bar.
- **Icon system** — Lucide installed; custom solar-specific icons stubbed (placeholder glyphs if S5.5 didn't produce finals).
- All content in the shell is placeholder text — real functionality arrives in S7+.

**Out of scope:**
- Canvas rendering (S8).
- License flow (S7).
- Any data fetching.

**Deliverables:**
- `bun run tauri dev` opens a window that is visually at parity with the S5.5 light-mode mocks.
- Light mode: polished. Every component matches its spec.
- Dark mode: functional but explicitly marked "preview" in the theme switcher.
- Theme toggle is instant, no flicker, no layout shift.
- All motion feels intentional and consistent.

**Human Gate:**
1. **Side-by-side screenshot test.** Open the app next to the S5.5 light mocks. Delta is within acceptable visual noise.
2. **Side-by-side with Claude Desktop** (light). Does our shell belong in the same visual family? Yes / no.
3. **Motion audit.** Open every dialog, collapse every panel, switch every tab. Nothing is jarring. Nothing is sluggish. Nothing is inconsistent.
4. **Chrome audit.** On macOS, traffic lights are where they should be; window is borderless and looks native. On Windows/Linux, default chrome feels appropriate.
5. **Command palette.** `⌘K` opens, keyboard-navigates, dismisses.
6. **Theme switcher.** Toggle between light and preview-dark. Light is flawless. Dark is rough but nothing is broken — text is readable, all components render.
7. **Dark "preview" label is visible** in the theme switcher so no user is confused.
8. Sign-off here is the license to pour functionality into this shell.

---

## S7 — License key + entitlements + feature gating

**Goal:** User enters their license key, it's saved in OS keyring, entitlements fetched from `api.solarlayout.in`, feature flags applied to UI. Online-required (no offline grace window — [ADR 0001](./adr/0001-online-required-entitlements.md)).

**In scope:**
- `src-tauri/src/keyring.rs` — wraps the `keyring` crate. Service name `solarlayout-desktop`, account `license_key`.
- Tauri commands: `get_license()`, `save_license(key)`, `clear_license()`.
- `packages/entitlements-client/` — TS client for `GET /entitlements`, `POST /usage/report` on `api.solarlayout.in`. Response shape mirrors the live mvp_api contract (`{ data: { user, plans[], availableFeatures[], remainingCalculations, ... } }`). Zod schemas validate at the boundary.
- React dialogs:
  - `LicenseKeyDialog.tsx` — paste key, validate `sl_live_` prefix, link to `solarlayout.in/sign-up` for new users.
  - `LicenseInfoDialog.tsx` — account name/email, active plans with feature lists and `{used}/{total}` calculation counts, Change Key / Close.
- `useEntitlements()` hook — TanStack Query: fetches once per session on boot (no offline fallback by policy; network failure surfaces as an error banner the user must resolve by reconnecting).
- `<FeatureGate feature="dxf">…</FeatureGate>` wrapper — renders children if `availableFeatures` includes the key, upgrade badge otherwise.
- Top-bar plan chip showing `data.plans[0].planName` verbatim (temporary — terminology will be revisited when the subscription redesign in S13.7 lands).
- Tauri passes the license key to the sidecar on spawn via env var; sidecar loads `availableFeatures` into session state and enforces per-endpoint (infrastructure laid here; real enforcement endpoints arrive in S12/S13).

**Out of scope:**
- Stripe flow, license issuance, subscription upgrade/downgrade (live in `mvp_api`; redesign in S13.7).
- Renaming editions to subscription tiers (deferred to S13.7 and its sub-spikes).
- Offline grace window (explicitly rejected — see ADR 0001).

**Deliverables:**
- First launch: license dialog blocks the app until a key is entered.
- Valid key: entitlements shown in top bar; dialog dismisses.
- Invalid key: inline error, dialog stays open.
- Relaunch: no dialog; cached key from keyring is used.
- "Clear license" menu item: keyring entry removed, relaunch shows dialog again.

**Human Gate:**
1. Fresh install → license dialog appears (blocking — no anonymous path).
2. Paste a valid key from your signup-provisioned dashboard → plan chip updates to match `data.plans[0].planName`.
3. Close and relaunch with internet → skip dialog, plan chip visible immediately.
4. Turn off wifi → relaunch → app shows a "no internet — license check required" error surface. No offline fallback (by policy — see [ADR 0001](./adr/0001-online-required-entitlements.md)).
5. Reconnect → relaunch works.
6. Clear license from menu → relaunch → dialog returns.

---

## S8 — KMZ load + MapLibre canvas (light vector style)

**Goal:** Open a KMZ via native file dialog, parse via sidecar, render boundaries + obstacles + TL lines on a MapLibre canvas with pan/zoom. Author a custom MapLibre vector style for light mode that hits the quality bar; stub a dark-mode style for use between S6 and S13.5.

**In scope:**
- Tauri command: `open_kmz()` → native file dialog, returns path.
- React file-open flow: read file bytes → `POST /parse-kmz` → GeoJSON response.
- `MapCanvas.tsx` — MapLibre GL map instance.
- **Basemap decision resolved here.** [ADR 0002](./adr/0002-no-basemap.md) — accepted 2026-04-24. No basemap tiles. MapLibre renders our KMZ overlay on a solid `--surface-canvas` background; a scale bar and the existing hairline dot grid provide the only ambient reference. Adding a tile-based basemap later is an additive change that doesn't touch the overlay styles.
- **Custom MapLibre vector styles** authored per the canvas visual language defined in S5.5:
  - `pv-light.json` — polished to bar; matches the S5.5 canvas mocks for typography, feature colors, atmosphere.
  - `pv-dark.json` — draft; tokens applied, polish deferred to S13.5. Must be readable and not visually broken, but not expected to match the light style's craft level.
- Sources: `boundaries`, `obstacles`, `line_obstructions`. Layers: fills + outlines, styled per the canvas visual language.
- Fit map bounds to loaded KMZ.
- Status bar shows "X boundaries, Y obstacles" after load.

**Out of scope:** table placement, any layout compute, drawing tools.

**Deliverables:**
- File → Open → select a KMZ → map renders the boundary and obstacles.
- Pan, zoom, rotate all work at 60fps.
- Loading a second KMZ replaces the first cleanly.
- Basemap ADR committed.
- `pv-light.json` and `pv-dark.json` both check into `apps/desktop/public/map-styles/`.

**Human Gate:**
1. Open a known KMZ (the same file you tested S3 with).
2. Boundary shape visible on map matches Google Earth view of the same file.
3. Obstacles and TL lines render distinctly from the boundary.
4. Status bar count matches the PyQt5 app's count for the same file.
5. Pan/zoom smooth, no stuttering.
6. **Canvas visual comparison:** side-by-side with the S5.5 canvas mock for light mode — typography, feature colors, and atmosphere match.
7. Toggle theme to dark preview — canvas still reads, isn't broken, but may be visually rough. Label matches "preview" status from S6.

---

## S8.7 — Frontend test harness + CI

**Goal:** Stand up an automated test harness for the frontend (Vitest + RTL + happy-dom) so S9–S15 fixes are caught before the gate, not by you in dev mode. Wire CI to enforce it.

**In scope:**
- Vitest + `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` + `happy-dom` across the workspace.
- `apps/desktop/src/test-setup.ts` (matchMedia stub, `inTauri()` stub).
- `apps/desktop/src/test-utils/mockSidecar.ts` — typed mock factory for `SidecarClient`.
- ~10 proof-of-life tests covering: a few components from `packages/ui`, the `kmzToGeoJson` pure function (the one that almost shipped a bug in S8), the MapCanvas cascade-layer fix as a regression guard, and `App.tsx` mount with mocked sidecar + entitlements.
- ESLint configs replacing the stub `lint` scripts in `apps/desktop` + `packages/ui`.
- `.github/workflows/ci.yml`: triggers on push to non-main + PR to main; runs `lint`, `typecheck`, `test`, `build` for the frontend and `pytest` for the sidecar in parallel.
- Update `CLAUDE.md` §8 to reflect that `bun run test` actually runs tests.

**Out of scope:** visual regression tests (S13.5 territory), end-to-end Tauri tests, sidecar coverage uplift, Storybook/Ladle, pre-commit hooks.

**Deliverables:**
- `bun run test` runs and passes locally + in CI.
- Intentionally breaking a test makes CI red.
- Local test suite finishes in <15s.

**Human Gate:**
1. `bun run lint && bun run typecheck && bun run test && bun run build` clean from repo root.
2. Push to a feature branch — both `frontend` and `sidecar` CI jobs go green.
3. Break one test, confirm CI red, revert.
4. Mock sidecar shape stays in sync with real `SidecarClient` (TS error surfaces if the real interface drifts).

Memo: [`docs/gates/s08_7.md`](./gates/s08_7.md).

---

## S8.8 — State architecture cleanup

**Goal:** Land [ADR-0003 — State architecture](./adr/0003-state-architecture.md) and [ADR-0004 — Cloud is passive storage](./adr/0004-cloud-as-passive-storage.md). Adopt Zustand as the cross-component client-state layer. Migrate the `project` state out of `useState` into a Zustand slice. Establish empty `layoutParams` + `layoutResult` slices that S9 fills.

**In scope:**
- New dep: `zustand` (with `subscribeWithSelector` middleware).
- `apps/desktop/src/state/` directory with `README.md`, `queryKeys.ts`, `project.ts`, `layoutParams.ts` (empty schema), `layoutResult.ts` (empty schema).
- Migrate `App.tsx`'s `project` state to `useProjectStore`.
- Tests for each slice (depends on S8.7 harness).
- ADR-0003 + ADR-0004 marked `accepted`.
- Update `docs/ARCHITECTURE.md` §3 (frontend stack table) to reference Zustand + ADR-0003.
- Update `CLAUDE.md` §11 (Coding conventions) to reference `state/` + slice pattern.

**Out of scope:** any S9 feature (no InputPanel, no SummaryPanel, no layout mutation). Other useState that is still ephemeral / single-component (`paletteOpen`, dialog flags, etc.) — stays as is per ADR-0003.

**Deliverables:**
- Project open/load flow still works after migration (S8 success path holds).
- DevTools: fewer re-renders on KMZ open (selectors isolate consumers).
- Both ADRs land as `accepted`.

**Human Gate:**
1. Static gates green (incl. new state tests).
2. Open phaseboundary2.kmz — boundary renders, breadcrumb + status update, second KMZ replaces cleanly. (S8 regression check.)
3. Read-through: ADR-0003, ADR-0004, `state/README.md`, CLAUDE.md §11 updates — all clear and useful as future-reference docs.

Memo: [`docs/gates/s08_8.md`](./gates/s08_8.md).

---

## S9 — Input panel + Generate Layout

**Goal:** User fills in module / table / spacing / site / inverter sizing parameters in the right panel's **Layout tab**, clicks Generate, sees tables and ICRs on the map with counts in the summary panel. The **Energy yield tab** is visible but locked behind a PRO_PLUS gate (built fully in S13).

**In scope:**

- **Tabbed inspector IA.** Right panel becomes a `Tabs` primitive (Radix). Two tabs:
  - **Layout** — fully built in S9.
  - **Energy yield** — visible to all users; renders a `LockedSectionCard` ("Available in PRO_PLUS") for non-entitled users; placeholder body for PRO_PLUS users (full content lands in S13). Locks the IA so S13 doesn't redesign the panel mid-spike — see [ADR-0003](./adr/0003-state-architecture.md) and the "InputPanel split" rationale.
- **`LayoutPanel.tsx`** — react-hook-form bound to the `layoutParams` Zustand slice (introduced in S8.8). Sections:
  - Module: length / width / wattage.
  - Table: orientation (portrait/landscape), modules per row, rows per table, table gap.
  - Spacing & tilt: tilt override (auto-from-latitude vs manual), row pitch override (auto-from-shading vs manual).
  - Site: perimeter road width.
  - Inverter sizing: design mode (string vs central), max strings per inverter (or SMB), max SMB per central (visible in central mode), enable cable calc toggle.
- **Validation:** Zod schema mirroring the sidecar's `LayoutParameters`. Min/max from PyQt5 reference inventory. Errors render inline.
- **Generate button.** Wired to a TanStack Query mutation that POSTs `/layout` with the current `parsed_kmz` + `layoutParams`. Disabled when no project loaded or mid-flight.
- **`SummaryPanel.tsx`** (in the Layout tab, below the Generate button or as a separate inspector section) — counts: MWp, # tables, # ICRs, plant area, used area, packing density. `Skeleton` state during mutation.
- **Sidecar:** add `placed_tables_wgs84: list[list[Wgs84Point]]` and `placed_icrs_wgs84: list[list[Wgs84Point]]` fields to `LayoutResult`. Populate via existing `utm_to_wgs84` helper in `result_from_core`. Tests for parity with golden fixtures.
- **`@solarlayout/sidecar-client`:** add `LayoutParameters` / `LayoutResult` / `PlacedTable` / `PlacedICR` / enums + `runLayout(parsedKmz, params)`.
- **MapCanvas extension:** 2 new sources (`kmz-tables`, `kmz-icrs`) + 4 new layers in both `pv-light.json` and `pv-dark.json` (tables-fill, tables-outline, icrs-fill, icrs-outline). New props `tablesGeoJson` / `icrsGeoJson`.
- **ICR labels:** HTML overlays positioned via `map.project()` on `move`/`zoom` events. Sidesteps the glyph/sprite stack we don't have. Pragmatic for ~1–5 ICRs per plant; deck.gl integration deferred to S10 where it earns its keep on inverters/cables.
- **Loading state:** spinner inside the Generate button; `Skeleton` rows in the summary panel during mutation.

**Out of scope:** inverters, cables, LAs (S10), drag/edit (S11), exports (S12), all energy yield fields (S13). PVgis / PAN / OND file parsers (deferred — manual entry works).

**Deliverables:**
- Fill in typical parameters → click Generate → tables appear as a grid inside the boundary, ICRs visible with footprint + label.
- Layout tab fully functional. Energy tab visible with locked or placeholder state per entitlement.
- Summary panel counts match PyQt5 output for the same input.

**Human Gate:**
1. Open a known KMZ; enter the same params as a PyQt5 reference run.
2. Click Generate — tables render in <2s for a typical plant.
3. Table count in summary = PyQt5's table count for the same run.
4. ICR count matches.
5. MWp matches.
6. Visual: table grid layout looks identical to PyQt5's matplotlib output.
7. Switch to Energy tab — PRO_PLUS lock card visible (non-entitled) or placeholder content (entitled). No errors.
8. Re-open a different KMZ — old layout clears, new project state loads cleanly.

**Deliverables:**
- Fill in typical parameters, click Generate.
- Tables appear as a grid inside the boundary.
- ICRs visible with their footprint.
- Summary panel counts match PyQt5 output.

**Human Gate:**
1. Open a known KMZ, enter the same params as a PyQt5 run.
2. Click Generate — tables render in < 2s for a typical plant.
3. Table count in summary panel = table count in PyQt5 app for the same run.
4. ICR count matches.
5. MWp matches.
6. Visual: table layout looks identical to PyQt5's matplotlib output.

---

## S10 — Inverters, cables, LAs (PRO features, read-only)

**Goal:** String inverters, DC cables, AC cables, and lightning arresters render on the canvas when entitled. Toggles work as they do in the current app.

**In scope:**
- Canvas layers: `string_inverters`, `dc_cables`, `ac_cables`, `las_rects`, `las_labels`, `las_circles`.
- Visibility toggles in sidebar: "Show AC cables" (default off), "Show LAs" (default off). Match current PyQt5 defaults.
- `FeatureGate` on each toggle: disabled + upgrade badge for Basic tier.
- Summary panel additions: number of string inverters, total DC cable length, total AC cable length, number of LAs, AC capacity (MW) and DC/AC ratio (PRO_PLUS only).

**Out of scope:** any interactivity beyond toggles.

**Deliverables:**
- With a PRO license: inverters appear after Generate, cable toggles work, LA toggle works.
- With a Basic license: feature gates visible; toggles disabled.
- Numbers in summary panel match PyQt5 exactly.

**Human Gate:** combined with S10.2 — see S10.2 Human Gate. S10 cannot pass its physical gate alone because S7's fictional feature keys mis-gate S10's surfaces; S10.2 corrects this and the combined gate validates both.

---

## S10.2 — Feature-key alignment with backend seed

**Goal:** Replace S7's fictional feature-key names with the real keys emitted by `api.solarlayout.in/entitlements`. Introduce a typed registry, a contract test against the `renewable_energy` seed, and correct S10's mis-gated surfaces. Sub-spike triggered during S10's physical gate walkthrough when the LA toggle was shown to be wrongly gated on a fictional `cables` key (LA is part of `plant_layout`, Basic-tier).

**In scope:**
- Typed `FEATURE_KEYS` registry + `FeatureKey` union in `packages/entitlements-client` mirroring `renewable_energy/packages/mvp_db/prisma/seed-products.ts`.
- Narrow `FeatureGate` and `useHasFeature` from `string` to `FeatureKey`.
- Correct S10 call sites: ungate LA toggle; re-gate AC cables on `cable_routing`; re-gate cable-length summary rows on `cable_measurements`; re-gate PRO_PLUS summary rows on `energy_yield`.
- Replace single `PREVIEW_ENTITLEMENTS` with three tier-accurate variants (Basic / Pro / Pro Plus), each reflecting real seed output.
- Contract test asserting `ALL_FEATURE_KEYS` ⊆ seed key set.
- Remove stranded invented keys (`icr_drag`, `dxf`, `obstructions`) from preview; no code consumes them yet.
- ADR-0005 — feature-key registry and backend contract.
- Process updates: `CLAUDE.md` §2 (external-contract principle), §7 (named source-of-truth file paths), §13 (session-start checklist); `SPIKE_PLAN.md` cross-cutting criterion for gate-introducing spikes.

**Out of scope:**
- Sidecar feature-gate enforcement (S12/S13 own the real work; S10.2 audits and flags only if divergence exists).
- Tier restructure / new product features.
- New backend seed keys (no `renewable_energy` changes).
- S11's ICR-drag / obstructions gates (wire with real keys when S11 lands).

**Deliverables:**
- Registry + contract test green.
- S10's three mis-gated surfaces corrected.
- Three-variant preview entitlements.
- ADR-0005 committed.
- CLAUDE.md + SPIKE_PLAN.md process patches landed.
- Combined physical gate with S10 passes — see gate memo for the step-by-step.

**Human Gate (combined with S10):**
1. **Basic preview**: LA toggle enabled (no Pro chip). AC cables toggle disabled with Pro chip. Summary shows Modules / Inverters / LAs / Inverter capacity; cable-length rows and AC capacity / DC-AC ratio absent.
2. **Pro preview**: both VisibilitySection toggles enabled. Summary shows cable-length rows. AC capacity / DC-AC ratio rows absent.
3. **Pro Plus preview**: both toggles enabled. Summary shows AC capacity (MW) and DC-AC ratio.
4. Counts match PVlayout_Advance on phaseboundary2.kmz (611 tables, 62 inverters, 22 LAs, 19.85 MWp).
5. Contract test fails if any frontend feature key drifts from seed.

---

## Cross-cutting criterion — feature gates

Any spike that introduces, removes, or modifies a feature gate must:
1. Use `FEATURE_KEYS.*` constants from `@solarlayout/entitlements-client`. String-literal keys fail lint/typecheck once the narrow type lands in S10.2.
2. Cross-reference the `renewable_energy` seed before writing new key names. New keys require a seed change first, merged upstream; the frontend tracks.
3. The contract test in `entitlements-client` runs under CI's `bun run test`. Divergence is a failing build.
4. **When in doubt, ship ungated.** If a surface "feels like it might be premium" but doesn't match any existing seed key, the default is ungated — don't invent, don't improvise. If it genuinely should be gated, surface to the human, propose a seed change, deploy that first, then wire the gate. Never the other way around.

Applies to S11 (obstruction gate = `OBSTRUCTION_EXCLUSION`; ICR drag ungated), S12 (all exports ungated), S13 (DXF + CSV ungated; energy yield gated on `ENERGY_YIELD`). Authoritative policy: [ADR-0005](./adr/0005-feature-key-registry.md). Background principle: [`docs/principles/external-contracts.md`](./principles/external-contracts.md).

### Product decisions locked in S10.2

- **All export formats (DXF, KMZ, PDF, CSV) — ungated.** Outputs serialize whatever was computed; they don't themselves represent value. A Basic user's DXF is naturally sparser than a Pro Plus user's because the feature keys that drive computation differ; the format is not the revenue lever.
- **ICR drag — ungated.** Dragging is an interaction on top of layouts a user is already entitled to compute. The recompute that follows a drag is still gated by the user's tier.
- **Obstruction drawing — gated on existing `OBSTRUCTION_EXCLUSION` (Basic-tier).** No new seed key needed.
- **Zoom / pan / undo / basic canvas interaction — ungated.** Always available.

Revenue is protected by (a) the feature keys that determine **what gets computed** and (b) the `calculations` quota that determines **how many times**. Not by per-format export gating.

---

## S10.5 — Drawing/editing pipeline ADR

**Goal:** Pick the drawing/editing library S11 will use. MapLibre is a renderer, not an editor — drawing/dragging needs a separate interaction layer. Avoid hitting that wall on day 1 of S11.

**In scope:**
- Spike-quality demos (throwaway code, ~half-day total) of the three viable options against our existing MapLibre setup, on a real KMZ:
  - **deck.gl + nebula.gl `EditableGeoJsonLayer`** (deck.gl will land in S10 anyway for inverters/cables, so adding it here is "free").
  - **Terra Draw** (newer, MIT, MapLibre-native, declarative modes — strong for drawing new polygons).
  - **maplibre-gl-draw** (community fork of `mapbox-gl-draw`; ISC-licensed; mature, less elegant API).
- Evaluate each on: API ergonomics, bundle size impact, license, integration cleanliness with our existing `MapCanvas` composition, suitability for both *editing* (ICR drag) and *drawing* (obstruction polygons).
- ADR-0005 — drawing/editing pipeline — picks one (or a combination) and locks the choice.
- All demo code thrown away after the ADR lands. Final implementation is S11.

**Out of scope:** any production code. Any S11 deliverable. Any change to S10 deliverables.

**Deliverables:**
- ADR-0005 written and accepted.
- One-paragraph summary of why each option was picked or rejected.

**Human Gate:**
- Read ADR-0005. Decision is clear, options were honestly compared, future-S11 starts on solid ground.

---

## S11 — Interactivity: ICR drag + obstruction drawing

**Goal:** The two interactive features that define the app — drag an ICR to reposition it, or draw an obstruction — both trigger live recomputation and canvas update.

**In scope:**
- **Interaction pipeline** per [ADR-0006](./adr/0006-drawing-editing-pipeline.md) + [design spec](./superpowers/specs/2026-04-24-s10_5-drawing-editing-pipeline-design.md): custom on raw MapLibre events, Zustand `editingState` slice, InteractionController + pure mode modules, direct-to-MapLibre `setDrawPreview` for high-frequency transient geometry.
- **Coordinate policy:** WGS84 end-to-end on client; sidecar projects via pyproj (S9 precedent). `/add-road` and `/refresh-inverters` accept WGS84 (amendment from original spec text which said UTM).
- **MapLibre drag handler on ICR markers.** Debounced 80ms `POST /refresh-inverters` with WGS84 new center on mouseup. Canvas repaints with new inverter clusters and LAs, with tables inside the footprint cleared.
- **Preview persists until sidecar ack** — mouseup does NOT clear the dashed preview. Mode transitions from `drag-icr` → new `awaiting-ack` state (not directly to `idle`). InteractionController treats `awaiting-ack` as a no-op mode (no handlers attached; user can't re-interact until the mutation settles). On sidecar response: `setLayoutResult(new)` + `clearDrawPreview(map)` + mode `idle` land atomically. On error: toast + `clearDrawPreview` + mode `idle` with no optimistic state to unwind. See ADR-0006 "S11 UX pattern" for the full flow.
- **Original ICR dim/dash during drag** — optional polish that matches PVlayout_Advance (legacy makes dragged rect semi-transparent + dashed). Either remove the dragged ICR from `kmz-icrs` temporarily and render it via preview, or use a MapLibre data-driven paint expression keyed on `properties.index`. The simpler of the two in S11.
- **Draw tools: rectangle (must), polygon + line (stretch).** Rectangle is the must-have because it's the most common obstruction shape (blocks, pads, rectangular corridors). Polygon + line follow the same mode-module pattern and can be landed in-spike if time allows, else bumped to a small follow-up.
- **Obstruction commits** → `POST /add-road` with WGS84 `coords_wgs84` list + `road_type`. Same preview-persists-until-ack UX as ICR drag.
- **"Remove last obstruction" button** → `POST /remove-road { index }`.
- **Undo stack** (LIFO, unbounded in practice per legacy parity; optional 10-entry cap). Obstructions only; no ICR-drag undo.
- **Debug probes first-class** per the spec (`canvas/debug.ts` probe factory, `VITE_INTERACTION_DEBUG` gate, production tree-shake). Established pattern from S10.5 demo.
- **Feature gating (resolved in S10.2):**
  - **ICR drag — ungated.** Drag is an interaction on top of `plant_layout` (Basic-tier); any user entitled to compute a layout can reposition its ICRs. No `FEATURE_KEYS.*` wrap, no `FeatureGate`. The recomputation that follows a drag is still naturally gated by the user's tier (a Basic drag re-runs a Basic-tier layout — no cables appear because `cable_routing` is off).
  - **Obstruction drawing — gate on `FEATURE_KEYS.OBSTRUCTION_EXCLUSION`.** Existing Basic-tier seed key (labeled "Obstruction Exclusion"). S11 uses the real key directly; no seed change needed.

**Out of scope:** any export changes.

**Deliverables:**
- Drag an ICR; inverters re-cluster and cables re-route within 150ms.
- Draw a rectangle over a populated area; tables inside vanish; inverters and LAs update.
- Remove-last-obstruction restores tables.

**Human Gate:**
1. Drag an ICR a few hundred meters. Tables underneath the new position clear. Inverters re-cluster around the new ICR. Feel-level test: does the drag feel responsive or laggy?
2. Draw a 100m × 100m rectangle. All tables inside removed. Surrounding inverters and LAs update.
3. Remove the obstruction. Tables come back.
4. Draw a polygon. Same behavior.
5. Draw a line (power line corridor). TL_SETBACK_M buffer respected — a strip of tables clears around the line.
6. Counts in summary match what PyQt5 produces for identical operations.

---

## S11.5 — Cable-calc correctness (industry requirements)

**Goal:** Fix `place_string_inverters`'s pathological runtime on real plants (measured **460 s** on `phaseboundary2.kmz`, industry-unshippable) and establish that the cable-calc outputs are correct against **solar-industry practice**, not against PVlayout_Advance parity. Sub-spike triggered when S11's physical gate exposed that cables-on runs were taking minutes with no user feedback and that no prior gate had ever verified cable correctness end-to-end.

**Framing:** industry standards are the normative source of truth. IEC 60364-7-712 (DC voltage drop ≤ 3 %), IEC 62548-1:2023 (PV array design), IEC TS 62738 (large PV plants), NREL ATB 2024 (DC:AC ratio), PVcase / HelioScope / Virto.CAD / RatedPower (EPC tool conventions), CEA 2010/2023 (India regulatory). Legacy PVlayout_Advance is explicitly not consulted for "correct" answers.

**In scope:**
- **Port the search-space pruning** from the 2026-04-20 review-package artifact (validated peer-plant optimisation: 563 s → 16 s, 0.95 % AC length delta, table/inverter/LA counts bit-identical) into `pvlayout_core/core/string_inverter_manager.py`. Caps apply to patterns A2, A3, A4, B main, E; pattern order and pattern geometry preserved.
- **Dormant instrumentation** in `_route_ac_cable` gated on `PVLAYOUT_PATTERN_STATS=1`. Emits per-pattern and per-cable `_path_ok` counts to stderr for diagnostic runs.
- **Pattern F route-quality tagging** — every cable that resolves via Pattern F best-effort gets a `CableRun.route_quality` value of `"best_effort"` (route stays inside polygon) or `"boundary_violation"` (some segment crosses outside). Clean routes carry `"ok"`. Frontend renders differently.
- **Pattern V — visibility-graph shortest-path fallback** (ADR 0007 amendment; added mid-spike when the instrumented baseline revealed Pattern F was producing 15 boundary-violating routes on `phaseboundary2`). Inserted between Pattern E and F. Uses a cached visibility graph on polygon-boundary vertices + Dijkstra via Python stdlib `heapq`. Graph is built against a **route polygon** = plant boundary minus ICR footprints (contiguous; obstacles NOT subtracted since cables can route around them at trench level). Algorithmic basis: textbook computational geometry (Preparata & Shamos 1985). Result: 0 `boundary_violation` cables on `phaseboundary2` (was 15); AC total recomputes from 14,474.8 m to the correct 12,361.0 m.
- **Optional `LayoutParameters` fields** — `ac_termination_allowance_m` (default 4.0) and `dc_per_string_allowance_m` (default 10.0). Existing numeric behaviour preserved; customer-site tuning becomes parameterised.
- **Additive `LayoutResult` fields** — `ac_cable_m_per_inverter` and `ac_cable_m_per_icr` (both `Dict[int, float]`, empty-dict default). Surfaces per-ICR BOM subtotals to the API.
- **Headless timing script** at `python/pvlayout_engine/scripts/debug/time_cable_calc.py`. Benchmark artefact going forward.
- **Integration test** `test_layout_s11_5_cables.py` — runs `enable_cable_calc=True` on `phaseboundary2.kmz` and asserts: wall-clock ≤ 45 s, DC total ±1 % of 39,536.2 m, AC total ±1 % of 12,361.0 m, 62 inverters + 611 tables + 22 LAs (bit-identical), **zero boundary violations**, all 62 AC cables tagged `route_quality=ok`.
- **Unit test suite** `test_visibility_graph.py` — 9 tests covering `_build_boundary_vis_graph` on square / L-shape / MultiPolygon, Dijkstra on trivial graphs, and `_route_visibility` happy-path + unreachable cases.
- **ADR 0007** (amended mid-spike) documenting the scoped §2 exception (two files: `string_inverter_manager.py` + `models/project.py`, additive-only, including Pattern V addition).
- **Doc patches:** correct `S11_PAUSED_FOR_CABLES.md` §1 "25 s" claim to 460 s; `CLAUDE.md` §2 links ADR 0007; `STATUS.md` flips S11.5 ⚪ → 🟡 → 🟢; gate memo at `docs/gates/s11_5.md`.

**Out of scope:**
- Cable gauge / cross-section selection — requires ampacity tables + conductor-material handling. → S12 or S13.
- Voltage-drop computation per cable — requires gauge. → S12 or S13.
- Per-string DC routing (currently per-table aggregate) — larger data-shape change than S11.5 should carry.
- BOM spreadsheet export — belongs with export spikes.
- Cable tray / conduit quantity estimation.
- Any change to `_kmeans_cluster`, `_assign_to_icrs`, `_find_inverter_position`, `_get_row_gap_ys`, `_get_col_xs`, `_route_length`, `_seg_ok`, `_path_ok` body, `_safe_pt`, `place_lightning_arresters`, `icr_placer`, `road_manager`, `layout_engine`, or any other pvlayout_core module.
- Any change to existing fields on any dataclass. Rename / retype / delete are all non-goals.
- Legacy PVlayout_Advance parity at cables-on. Deliberately broken — golden-file convention for cables remains cables-off (unchanged from S3).
- S11's remaining gate steps (d) through (k). S11 resumes after S11.5.

**Deliverables:**
- `pvlayout_core/core/string_inverter_manager.py` + `pvlayout_core/models/project.py` patched per ADR 0007 (including the Pattern V amendment).
- Sidecar wire mirrors (`schemas.py`, `adapters.py`) reflect the three additive model fields.
- Headless script measures **4.4 s** wall-clock post-port on `phaseboundary2.kmz` (vs 457 s pre-port — **104× faster**; target was ≤ 30 s). Zero boundary-violation cables (vs 15 pre-V).
- Instrumented baseline + post-port pattern-stats summaries captured in the gate memo (`docs/gates/s11_5.md` §2).
- All existing tests green; new integration test + 9 new unit tests green. Sidecar pytest: **68 pass, 6 skipped**.
- ADR 0007 committed (amended mid-spike for Pattern V); `CLAUDE.md` §2 and `docs/adr/README.md` updated.

**Human Gate:**
1. **Static gates.** `bun run lint && bun run typecheck && bun run test && bun run build` all green. `cd python/pvlayout_engine && uv run pytest -q` green. Expected: **68 pass, 6 skipped** (+10 from S11 pause baseline: 9 new unit tests for Pattern V primitives + 1 integration test on phaseboundary2 cables-on). **108 frontend tests** unchanged. **31 lint warnings** unchanged (all pre-existing `react-refresh`).
2. **Headless measurement.** `uv run python scripts/debug/time_cable_calc.py` on `phaseboundary2.kmz`: total wall-clock ≤ 30 s (measured 4.4 s; ~104× faster than pre-port 457 s). 62 inverters, 611 DC runs, 62 AC runs. `total_dc_cable_m == 39,536.2 m` (bit-identical to pre-port). `total_ac_cable_m == 12,361.0 m` (14.6 % below the pre-port 14,474.8 m number — correct: pre-port over-counted the outside-polygon portions of 15 boundary-violating cables).
3. **Pattern-stats census.** Re-run with `PVLAYOUT_PATTERN_STATS=1`. Expected pattern distribution AC: `{A=41, A2=3, A3=3, V=15}`, F=0. DC: `{A=611}`. Zero `boundary_violation` tags across DC and AC.
4. **UI walkthrough.** Boot desktop app → license → open `phaseboundary2.kmz` → toggle `Calculate cables` ON → click Generate layout. UI returns from "Generating…" to layout view in ≤ 10 s. Cables render as two distinct visual layers (DC and AC). No errors in sidecar stdout.
5. **Docs patched.** `S11_PAUSED_FOR_CABLES.md` §1 corrected; `docs/adr/0007-pvlayout-core-s11-5-exception.md` committed (with Pattern V amendment); `CLAUDE.md` §2 links ADR 0007; `docs/adr/README.md` lists ADR 0006 and 0007; this spike plan updated; `STATUS.md` reflects gate state; gate memo at `docs/gates/s11_5.md` complete with measurements + Pattern V finding + test-coverage summary.
6. **Permitted surface.** `git diff` shows only: `string_inverter_manager.py`, `models/project.py`, `schemas.py`, `adapters.py`, new test files (`test_layout_s11_5_cables.py`, `test_visibility_graph.py`), debug script, and docs. No drift into other pvlayout_core modules.

---

## S12 — Exports: KMZ + PDF

**Goal:** User can export the current project as KMZ (for Google Earth) or PDF (layout plan + summary). Both match PVlayout_Advance byte-similar.

**In scope:**
- Tauri `save_export(format)` — native save dialog → returns path.
- `POST /export/kmz` and `POST /export/pdf` — sidecar calls `kmz_exporter.py` and `pdf_exporter.py` with the target path.
- PDF export honors the existing visibility rules (AC/DC cables hidden; LA rects/labels force-shown; LA circles hidden).
- Post-export: `POST api.solarlayout.in/usage/report` with feature name.
- Toast on success with "Open in Finder/Explorer" action.
- **Feature gating (resolved in S10.2):** KMZ and PDF exports are **ungated**. Any user with a layout can export it. The exported content is implicitly gated by the feature keys that drove computation — a Basic user's KMZ has MMS + inverters + LAs but no cable layers. No `FeatureGate` on the export buttons; no 403 on the sidecar endpoints.

**Out of scope:** DXF, energy yield (S13).

**Deliverables:**
- Export KMZ; open in Google Earth → see boundary, tables, ICRs, LAs (rects only), obstructions.
- Export PDF; open in preview → layout page + summary page identical to PyQt5 PDF.

**Human Gate:**
1. Generate a layout, export KMZ, open in Google Earth — all shapes render.
2. Export PDF, open — visual comparison with PyQt5 PDF on same input passes your eyeball test.
3. Summary stats on the PDF page match exactly.
4. Usage telemetry event appears in your `mvp_api` dashboard.

---

## S13 — Exports (DXF, CSV) + PRO_PLUS energy yield

**Goal:** DXF export for any user, and the PRO_PLUS energy-yield computation with its CSV artifact. Match PyQt5 output byte-similar where a byte-similar reference exists.

**In scope:**
- `POST /export/dxf` — calls `dxf_exporter.py`. All layers preserved (tables, ICRs, inverters, cables, LAs, LA circles, obstructions). **Ungated export** — every tier can produce a DXF; the layer content reflects the tier's computation.
- `POST /energy-yield` — calls `energy_calculator.py` with PVGIS/TMY/custom weather file; returns 25-year yield summary + 15-min CSV data.
- UI: Energy Yield panel (new subsection in right panel) — weather file input, output summary: P50/P75/P90, annual yield MWh, specific yield.
- "Export 15-min CSV" button for the energy-yield results.
- **Feature gating (resolved in S10.2):**
  - **DXF export — ungated.** Same rationale as S12 KMZ/PDF.
  - **Energy yield computation — gated on `FEATURE_KEYS.ENERGY_YIELD`.** Existing Pro-Plus-tier seed key.
  - **Plant generation estimates (if surfaced as a separate computation) — gated on `FEATURE_KEYS.GENERATION_ESTIMATES`.** Existing Pro-Plus-tier seed key.
  - **15-min CSV export — ungated.** You can export the CSV of whatever yield the user computed; the yield itself is what's gated.

**Out of scope:** auto-update, signing (S14+).

**Deliverables:**
- DXF opens in AutoCAD / LibreCAD / ezdxf viewer with all layers.
- Energy yield P50 matches PyQt5 to within 0.1% on identical inputs.
- 15-min CSV matches PyQt5 byte-for-byte for identical weather input.

**Human Gate:**
1. With any licensed key: export DXF, open in LibreCAD or equivalent, all layers present. (Basic's DXF has no cable layers — expected.)
2. With PRO_PLUS license: run energy yield with a known PVGIS file; compare P50/P75/P90 with PyQt5 values.
3. With PRO_PLUS license: export 15-min CSV; diff against PyQt5 output → identical.
4. With non-PRO_PLUS license: the energy-yield panel is disabled / shows upgrade affordance; DXF export and existing S12 exports remain available.

---

## S13.6 — Branding (placeholder; exact number TBD)

**Goal:** Replace the placeholder wordmark/logo/icon/accent from S5.5 with the real brand system. Slot between S13.5 and S14 so signed installers and the auto-update manifest ship with the real assets.

**In scope (will be detailed when the spike activates):**
- Logo / wordmark / icon set (`icon.icns`, `icon.ico`, favicon, splash mark).
- Accent and any secondary hues (swapping the `--accent-*` tokens).
- Optional type-face swap (if a licensed face is procured).
- App Store / download page assets if applicable.

**Out of scope:** any functional change; any layout change beyond what the new identity requires.

**Gate:** brand assets approved, tokens swapped, side-by-side screenshots against S5.5 placeholders confirm only the identity shifted, not the system.

**Status:** not yet scheduled. Written here as a marker so S5.5 decisions (placeholder identity behind semantic tokens) stay honest.

---

## S13.5 — Dark theme parity

**Goal:** Every surface, component, state, map style, and motion passes the Claude-Desktop-quality bar in dark mode. The "preview" label comes off the theme switcher.

**In scope:**
- **Component audit.** Every component in `packages/ui/` reviewed for dark-mode color, contrast, focus, hover, active, and disabled states. Any semantic token with a weak dark value gets adjusted.
- **Canvas polish.** `pv-dark.json` MapLibre style brought to bar: feature fills, label colors, atmosphere, hover/selection states, obstruction fills, cable strokes, LA footprints.
- **Surface sweep.** Every screen visited in dark mode: startup, license dialogs, input panel, summary panel, tool rail, inspector, command palette, popovers, toasts. Anything that feels washed out, stark, or off-brand gets adjusted.
- **Accessibility check.** WCAG AA contrast verified in both themes using automated tooling + manual spot checks.
- **Settings switch.** The theme switcher drops the "preview" label; theme selection is now an equal-weight user choice.
- **Visual QA pass.** Screenshots of all 4 S5.5 reference surfaces captured in dark mode and added to `docs/design/dark/final/`, replacing the S5.5 drafts.

**Out of scope:**
- Any new features.
- Any change to light-mode polish (only if the component audit surfaces bugs that affect both).
- High-contrast accessibility mode (deferred to a future spike).

**Deliverables:**
- Dark theme polished to the same bar as light.
- `pv-dark.json` MapLibre style polished.
- Final dark-mode mocks committed.
- Audit checklist committed as `docs/design/dark-audit.md` with every component signed off.

**Human Gate:**
1. Toggle theme in settings — every surface flips cleanly, no flash, no flicker, no stuck state.
2. Side-by-side screenshot of each major surface in both themes — both pass the quality bar. Your judgment: are these the same app in two skins, at the same craft level?
3. MapLibre canvas in dark looks intentional — not inverted, not washed out. Labels readable. Selection state obvious. Obstruction fills distinguishable from boundary.
4. Sighted check by a second person (anyone): "does this feel like the same premium app in both themes?" returns yes.
5. Theme switcher no longer says "preview."

---

## S13.7 — Subscription model redesign (brainstorm)

**Goal:** Decide the path from the current Edition-based stacking-entitlements model (Basic / Pro / Pro Plus — historical artifact from PVlayout_Advance) to a subscription-based model (Free / Basic / Pro / Pro+ — single active subscription per user, upgrade/downgrade supported). Output: a written decision doc and a set of executable sub-spikes.

**This spike is deliberative. No desktop code. No mvp_api code. Only thinking, scoping, and planning.**

**Input context (as of S13.7 start — all captured already in S0–S13.5):**
- Live mvp_api response shape for `/entitlements`, `/usage/report`, `/health`.
- Live mvp_db schema (`User`, `Product`, `ProductFeature`, `Entitlement`, `LicenseKey`, `CheckoutSession`, `UsageRecord`).
- Live Stripe wiring: `checkout.session.completed` only; no subscription lifecycle webhooks.
- Live Clerk integration: signup → auto-provision Free product entitlement + license key.
- Complete list of `availableFeatures` keys the desktop consumes across S7, S10, S11, S12, S13.
- Complete list of PVlayout_Advance Edition-gated behaviors (`core/edition.py` semantics preserved verbatim in `pvlayout_core` but consumed via feature keys rather than Edition enum at the app boundary).

**In scope:**
1. **Tier design.** What features, what quotas, what price points for Free / Basic / Pro / Pro+. Anchor against competitive landscape and cost-to-serve. Output: a tier matrix.
2. **Subscription lifecycle design.** Upgrade, downgrade, cancel, reactivate, payment-failed states. Proration rules. Grace-before-downgrade vs. immediate-downgrade. Plan-change effective-date semantics. Output: a state diagram.
3. **Data model delta.** `Subscription` table shape, relationship to `Entitlement` (replace / augment / coexist), `SubscriptionEvent` audit log, migration strategy for existing stacking-entitlement users. Output: a proposed Prisma schema diff.
4. **API contract delta.** New/updated endpoints (`GET /billing/subscription`, `POST /billing/upgrade`, `POST /billing/downgrade`, `POST /billing/cancel`, modified `/entitlements` response), Stripe webhook expansion (`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`). Output: a proposed OpenAPI delta.
5. **Desktop client delta.** `@solarlayout/entitlements-client` schema update, `useEntitlements` shape change, top-bar chip copy (planName now is tier name — one of four), FeatureGate behavior unchanged. Output: a proposed TS client diff.
6. **mvp_web dashboard delta.** "Current plan" + "Manage subscription" surface. Upgrade/downgrade modal. Payment-failed dunning UI. Output: rough wireframes or a written surface list.
7. **Migration strategy.** How do existing stacking-entitlement users land in the new subscription model on cutover day? Grandfathering rules. Communication.
8. **Cutover ordering.** Does the new API ship before, after, or alongside desktop v1? If alongside: how do we coordinate releases? Output: a cutover runbook.
9. **Sub-spike enumeration.** What sub-spikes come out of this, in what order, with what gates. Output: draft spike-plan entries for each.

**Out of scope:**
- Writing any of the sub-spike code.
- Stripe product catalog changes (these ride in the sub-spikes).
- Any desktop code or test change.
- Brand / identity decisions (S13.6).

**Deliverables:**
- `docs/adr/0002-subscription-model.md` — the decision doc recording the final design across all 9 in-scope items.
- `docs/SPIKE_PLAN.md` amended — new sub-spikes (S13.7a, S13.7b, …) inserted between S13.7 and S14, each with real Goal/In-scope/Out-of-scope/Deliverables/Gate sections.
- `docs/adr/0003-subscription-migration.md` — cutover and grandfathering plan.

**Human Gate:**
1. Read `docs/adr/0002-subscription-model.md` end to end. Every design decision is explicit, justified, and has a "consequence" line.
2. Sub-spike list in the updated `SPIKE_PLAN.md` covers every delta in the ADR. No hand-waving; each sub-spike has a real gate.
3. Stripe product catalog + Clerk signup flow + mvp_web dashboard changes all mapped to specific sub-spikes. Nothing orphaned.
4. Cutover runbook addresses: grandfathering, communication, rollback plan, data migration script. Your judgment: would you trust this plan with real users on the other side?
5. Sign-off on this spike is sign-off on the subscription architecture. The sub-spikes execute against this contract.

**Note:** This spike explicitly decouples deliberation from execution. The spike closes when the plan is good, not when any code ships. Sub-spikes carry the execution.

---

## S13.8 — Parity & gates end-to-end verification

**Goal:** A single consolidated pre-release sweep that confirms (a) the desktop app matches PVlayout_Advance output at numeric parity on a canonical input set, and (b) every feature gate behaves correctly on every real plan tier with real licenses. Per-spike gates earlier in the plan validate only what each spike ships; S13.8 is where we walk the full surface with Basic / Pro / Pro Plus licenses and compare byte-level against the reference app. Catches cross-spike drift that individual spike gates can't see.

**Why a dedicated spike?** Running the "open a KMZ, generate, compare every number, toggle every gate, export every format" sweep inside S10, S11, S12, or S13 each bloats those spikes and spreads the parity test across the plan instead of consolidating it at the end. Deferring cross-plan gate testing to a dedicated exercise keeps earlier spikes focused on their own scope and gives the parity sweep a single owner. Per-spike gates still run — S13.8 just replaces the *en-masse* parity / cross-tier portions that were previously spread across them.

**In scope:**
1. **Parity matrix.** For each canonical KMZ (phaseboundary2 at minimum, plus any other golden fixtures S3 blessed), on each plan tier, verify: table count, ICR count, inverter count, LA count, total MWp, DC/AC cable totals (when applicable), plant AC capacity (when applicable), DC/AC ratio (when applicable), and energy-yield P50/P75/P90 (when applicable) all match PVlayout_Advance within tolerance.
2. **Gate matrix.** For each UI gate defined in the feature-key registry, verify with a real license key of the appropriate tier: (a) enabled/disabled state matches entitlement, (b) "Pro" / upgrade chip appears only when not entitled, (c) disabled controls are no-ops, (d) gated rows appear/disappear correctly in SummaryPanel, (e) form-level gates (`enable_cable_calc` and any similar additions in S11+) coerce on submit.
3. **Sidecar enforcement matrix.** If S12/S13 added `require_feature` to any endpoint, verify a not-entitled plan receives 403 `feature_not_entitled` while an entitled plan receives 200. Tested with direct `curl` against the running sidecar, not just the UI layer.
4. **Export roundtrip.** Every ungated export (KMZ, PDF, DXF, CSV) produced by every tier opens correctly in its native viewer. Per-tier content differences are expected and documented (Basic KMZ has no cable layers, etc.) — that's the point of ungated exports: content scales with compute.
5. **Parity report doc.** `docs/gates/s13_8.md` — a parity report with per-tier, per-fixture numbers side-by-side with PVlayout_Advance output, plus any accepted deviations with justification.
6. **Deviation handling.** Any numeric deviation > tolerance is fixed in-spike — the spike closes only when parity holds.

**Out of scope:**
- New features. Any gap that requires new compute or new UI is a separate spike.
- Performance optimization. Parity is about correctness; speed is S15.5's concern.
- The subscription-model redesign from S13.7 (that's deliberative, this is verificative).

**Deliverables:**
- `docs/gates/s13_8.md` — the parity + gate report.
- All gate / parity matrix items green, or documented as accepted with rationale.
- Any bugs surfaced by the sweep fixed and re-verified.

**Human Gate:**
1. Read `s13_8.md`. Every fixture × plan cell has a number from both the app and PVlayout_Advance; deltas within tolerance or explicitly accepted.
2. For each plan, open the app, walk the happy path (KMZ → Generate → toggle features → export formats). No surprise behavior, no unexpected "Pro" chips, no missing rows.
3. Run `curl` against the sidecar with each plan's session established, attempt a forbidden operation (if any), receive expected 403 / 200.
4. On sign-off, the desktop is ready to ship against the mvp_api entitlements contract. S14 starts the release pipeline work.

**Dependencies:** S13 complete (all features landed). S13.7 complete (subscription model locked — if still Edition model, that's fine, but the sub-spike count under S13.7 must be zero open). Real test licenses provisioned for every tier.

---

## S14 — Auto-updater + code signing + notarization

**Goal:** Installed apps can self-update; installers don't trigger SmartScreen/Gatekeeper warnings on fresh machines.

**In scope:**
- Tauri updater configured: manifest URL, public key for signature verification.
- Release script: produces updater manifest JSON alongside artifacts.
- Windows: EV code-signing cert, `signtool` in CI, `.msi` and `.exe` signed.
- macOS: Apple Developer ID, hardened runtime entitlements, `codesign --deep` on `.app` + embedded sidecar, `notarytool submit --wait`, stapled.
- Linux: optional GPG signature on `.deb`.
- Manifest hosting: Vercel Blob or R2 bucket under `solarlayout.in/updates/manifest.json`.

**Out of scope:** triggering the release (S15).

**Deliverables:**
- A signed `.msi` installs on a clean Windows 11 VM with no SmartScreen prompt.
- A signed + notarized `.dmg` opens on a clean macOS machine with no Gatekeeper prompt.
- Installing v0.1, then releasing v0.2, triggers auto-update on next launch.

**Human Gate:**
1. Fresh macOS VM or machine: download `.dmg`, install, open — no "cannot be opened because developer cannot be verified" dialog.
2. Fresh Windows VM: install `.msi`, no SmartScreen warning.
3. Install v0.1; tag and release v0.2; relaunch v0.1; auto-updater prompts; accept; app restarts as v0.2.

---

## S15 — Release pipeline + download delivery

**Goal:** Tagging a release builds, signs, uploads artifacts, publishes the updater manifest, and updates download URLs on `mvp_web` — all automatically.

**In scope:**
- GitHub Actions release workflow on `v*` tag: runs S4 + S14 for every OS/arch, uploads signed artifacts to GitHub Releases, publishes updater manifest.
- `mvp_web` dashboard: pulls latest release from GitHub API (or a static JSON endpoint we publish), renders per-OS download buttons. This is a small change to `mvp_web` and belongs in the `renewable_energy` repo, not this one.
- Release notes template.
- CHANGELOG.md in `pv_layout_project`.

**Out of scope:** anything beyond shipping v1.0.0.

**Deliverables:**
- `git tag v1.0.0 && git push --tags` triggers the full pipeline.
- Within ~30 minutes: all signed artifacts on GitHub Releases.
- `solarlayout.in/download` shows the new version with correct platform downloads.
- End-user workflow: dashboard → download → install → launch → enter license → use. Validated end-to-end.

**Human Gate:**
1. Tag v1.0.0.
2. Wait for CI.
3. Visit `solarlayout.in/download` (logged-in dashboard user) → see v1.0.0 buttons.
4. Download your OS's installer → install → launch → enter test license → generate a layout → export a KMZ.
5. The full loop works without manual intervention from here on out. You can ship new versions by tagging.

---

## S15.5 — Sidecar bundle slimming (deferred post-launch optimization)

**Status:** Not scheduled. Picked up only on real-user signal.

**Goal:** Reduce sidecar PyInstaller bundle by ~50MB by removing matplotlib (used only for PDF export today) and porting the PDF exporter to reportlab (or equivalent lightweight Python PDF lib).

**Trigger to schedule:** Real-user feedback (after release) indicating install size or auto-update payload is friction. Without that signal, do not schedule — bundle size is a polish concern given our distribution model (binaries shipped from `solarlayout.in/download`, not Microsoft Store / Mac App Store, so no hard size caps; see [ADR-0004](./adr/0004-cloud-as-passive-storage.md)).

**In scope (when activated):**
- Replace matplotlib with reportlab in a new `pvlayout_engine/` PDF exporter module (NOT in `pvlayout_core/` — that stays verbatim per CLAUDE.md §2).
- Golden-file tests for byte-similar output against PVlayout_Advance's matplotlib PDF.
- Drop matplotlib from `pyproject.toml`; rebuild with PyInstaller; verify bundle size delta.

**Out of scope:** any other size reductions; touching `pvlayout_core`; client-side PDF rendering.

**Gate:** Bundle size reduced by ≥40MB; PDF output indistinguishable from current at the eyeball level + summary-page byte-for-byte where possible.

---

## Cross-cutting principles

These apply to every spike:

1. **Functional parity, always.** Any feature that behaves one way in PVlayout_Advance must behave identically in the new app unless we've explicitly decided otherwise. Golden-file tests catch silent drift.
2. **No new features during migration.** If a user request comes in that isn't "reach parity," it goes in a separate backlog. Keep the scope honest.
3. **Each spike ends with a demo commit.** `git log` should read like a project plan: `s03: golden-file tests for layout`, `s09: input panel + generate layout`, etc.
4. **I pause at every gate.** No amount of "I'm sure it works" replaces you running the app on your machine.
5. **Open questions get resolved in the relevant spike, not up front.** The Open Questions list in ARCHITECTURE.md §11 is assigned to spikes as we go (e.g., basemap strategy → S8; telemetry granularity → S12).

---

## How we'll work once you sign off

1. You approve this plan (possibly after edits).
2. I start S0. When the gate is ready, I'll tell you exactly what to run.
3. You verify → sign off → I start the next spike. And so on through all 17.
4. At any point you can say "change the plan" or "re-scope this spike" or "insert a spike here." The plan is a living document, not a contract.
