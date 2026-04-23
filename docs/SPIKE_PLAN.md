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
S9    Input panel + Generate Layout (tables, ICRs)   [core UX]
S10   Inverters, cables, LAs (PRO, read-only)        [core UX]
S11   Interactivity: ICR drag + obstruction drawing  [core UX]
S12   Exports: KMZ + PDF                             [output]
S13   PRO_PLUS: DXF + energy yield + CSV             [output]
S13.5 Dark theme parity                              [design]
S13.7 Subscription model redesign (brainstorm)       [strategy]
S14   Auto-updater + code signing + notarization    [release]
S15   Release pipeline + download delivery          [release]
```

18 spikes. S0–S4 produce a working sidecar you can `curl`. S5–S7 produce a launchable shell that can authenticate, rendered to the Claude-Desktop-quality bar in light mode. S8–S13 bring the UI to feature parity with PVlayout_Advance. S13.5 brings dark theme to parity. S13.7 decomposes the Edition → Subscription redesign (Free / Basic / Pro / Pro+) into executable sub-spikes before release. S14–S15 make it shippable.

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
- **Basemap decision resolved here.** Evaluate: online free tile providers (MapTiler, Stadia, Protomaps) vs. offline vector pack bundled with the app. Decision criteria: data freshness, redistribution license, offline-readiness, cost at scale. Record decision in an ADR under `docs/adr/`.
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

## S9 — Input panel + Generate Layout

**Goal:** User fills in module/table/spacing parameters in the right panel, clicks Generate, sees tables and ICRs on the map with counts in the summary panel.

**In scope:**
- `InputPanel.tsx` — React port of `gui/input_panel.py`. All current fields: module spec, table config (portrait/landscape, rows/cols), spacing (auto from latitude or manual), inverter sizing, road width, setbacks.
- Validation with Zod; persisted to Zustand store so changing fields doesn't lose state.
- "Generate" button → `POST /layout` with current params + parsed KMZ data.
- `SummaryPanel.tsx` — counts: MWp, number of tables, number of ICRs, plant area, used area, packing density.
- Canvas layers: `tables` (rect polygons), `icrs` (building footprints + labels).
- Loading state during compute (spinner on Generate button, skeleton on summary).

**Out of scope:** inverters, cables, LAs (S10), drag (S11), exports (S12).

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

**Human Gate:**
1. Using a PRO license: open a KMZ, generate, see string inverters on the map, toggle AC cables on/off, toggle LAs on/off.
2. Switch to a Basic license (re-enter a basic key from your dashboard): relaunch, generate, PRO features are locked with upgrade badges.
3. Counts and lengths match PyQt5 output for the same input.

---

## S11 — Interactivity: ICR drag + obstruction drawing

**Goal:** The two interactive features that define the app — drag an ICR to reposition it, or draw an obstruction — both trigger live recomputation and canvas update.

**In scope:**
- MapLibre drag handler on ICR markers. Optimistic move locally, debounced 80ms `POST /refresh-inverters` with new ICR position. Canvas repaints with new inverter clusters and LAs, with tables inside the footprint cleared.
- MapLibre GL Draw tools: rectangle, polygon, line. Drawing commits a `POST /add-road` with UTM coordinates.
- "Remove last obstruction" button → `POST /remove-road`.
- Undo stack (limited, 10 entries) for obstruction adds.
- Both flows feature-gated on `icr_drag` and `obstructions` entitlements.

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

## S12 — Exports: KMZ + PDF

**Goal:** User can export the current project as KMZ (for Google Earth) or PDF (layout plan + summary). Both match PVlayout_Advance byte-similar.

**In scope:**
- Tauri `save_export(format)` — native save dialog → returns path.
- `POST /export/kmz` and `POST /export/pdf` — sidecar calls `kmz_exporter.py` and `pdf_exporter.py` with the target path.
- PDF export honors the existing visibility rules (AC/DC cables hidden; LA rects/labels force-shown; LA circles hidden).
- Post-export: `POST api.solarlayout.in/usage/report` with feature name.
- Toast on success with "Open in Finder/Explorer" action.

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

## S13 — PRO_PLUS: DXF + energy yield + CSV

**Goal:** The remaining PRO_PLUS-only exports work and match PyQt5 output.

**In scope:**
- `POST /export/dxf` — calls `dxf_exporter.py`. All layers preserved (tables, ICRs, inverters, cables, LAs, LA circles, obstructions).
- `POST /energy-yield` — calls `energy_calculator.py` with PVGIS/TMY/custom weather file; returns 25-year yield summary + 15-min CSV data.
- UI: Energy Yield panel (new subsection in right panel) — weather file input, output summary: P50/P75/P90, annual yield MWh, specific yield.
- "Export 15-min CSV" button.
- All gated on `dxf`, `energy` entitlements.

**Out of scope:** auto-update, signing (S14+).

**Deliverables:**
- DXF opens in AutoCAD / LibreCAD / ezdxf viewer with all layers.
- Energy yield P50 matches PyQt5 to within 0.1% on identical inputs.
- 15-min CSV matches PyQt5 byte-for-byte for identical weather input.

**Human Gate:**
1. With PRO_PLUS license: export DXF, open in LibreCAD or equivalent, all layers present.
2. Run energy yield with a known PVGIS file; compare P50/P75/P90 with PyQt5 values.
3. Export 15-min CSV; diff against PyQt5 output → identical.
4. With non-PRO_PLUS license: these features are locked.

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
