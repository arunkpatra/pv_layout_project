# SolarLayout Desktop — Platform Architecture

**Status:** Draft for review
**Last updated:** 2026-04-24
**Owning repo:** `/Users/arunkpatra/codebase/pv_layout_project`
**Related repos (read-only reference):**
- `PVlayout_Advance` — the current PyQt5 desktop app, source of truth for all domain logic
- `renewable_energy` (mvp_web + mvp_api + mvp_db) — marketing site, user dashboard, entitlements API, database

---

## 1. Goal

Deliver a single native desktop application — Windows, macOS, Linux — that:

1. Provides a modern, web-app-grade UI/UX (not a restyled Qt widget tree).
2. Preserves **100%** of the functionality of `PVlayout_Advance` — KMZ parsing, layout generation, obstruction drawing, ICR drag, string inverters, cables, lightning arresters, energy yield, and KMZ/DXF/PDF exports.
3. Ships as **one binary per OS/arch**. Features appear or disappear at runtime based on entitlements returned by `api.solarlayout.in`. There is no Basic/Pro/Pro_Plus build variant.
4. Consumes **only** entitlements and usage-reporting APIs from `api.solarlayout.in`. All heavy compute runs locally in the desktop process.
5. Shares design language with the existing `mvp_web` marketing/dashboard site so the product feels unified.

---

## 2. High-level component map

```
┌──────────────────────── Desktop App (one artifact per OS/arch) ────────────────┐
│                                                                                │
│  ┌─ Tauri 2 shell (Rust) ─────────────────────────────────────────────────┐   │
│  │  • Window chrome, native menus, OS file dialogs, auto-updater         │   │
│  │  • Keyring bridge (license key in OS secure storage)                  │   │
│  │  • Sidecar lifecycle: spawn pvlayout-engine on launch, kill on quit   │   │
│  │  • invoke() commands: get_license, save_license, open_kmz,           │   │
│  │    save_export, open_external_url                                     │   │
│  └─────────────────────────────┬─────────────────────────────────────────┘   │
│                                │                                              │
│  ┌─ WebView (OS-native) ───────▼─────────────────────────────────────────┐   │
│  │  React 19 + TypeScript                                                │   │
│  │  • shadcn/ui + Tailwind v4 + Nova theme (shared with mvp_web)         │   │
│  │  • MapLibre GL + deck.gl overlays (interactive layout canvas)         │   │
│  │  • TanStack Query (entitlements cache + sidecar RPC cache)            │   │
│  │  • Zustand (project state)                                            │   │
│  │  • react-hook-form + Zod (input panel)                                │   │
│  │  • Typed sidecar client generated from FastAPI OpenAPI schema         │   │
│  └─────────────────────────────┬─────────────────────────────────────────┘   │
│                                │  loopback HTTP (127.0.0.1:<random>)          │
│  ┌─ Python sidecar ────────────▼─────────────────────────────────────────┐   │
│  │  PyInstaller onefile binary: pvlayout-engine[.exe]                    │   │
│  │  • FastAPI + uvicorn, bound to 127.0.0.1 only, per-session token      │   │
│  │  • pvlayout_core  (verbatim copy of PVlayout_Advance/{core,models,    │   │
│  │      utils} — NO PyQt5 imports, NO matplotlib on interactive path)    │   │
│  │    – layout_engine, kmz_parser, icr_placer,                           │   │
│  │      string_inverter_manager, la_manager, road_manager,               │   │
│  │      spacing_calc, energy_calculator, solar_transposition,            │   │
│  │      pvgis/pan/ond parsers, kmz/dxf/pdf exporters, edition            │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└────────────────────┬───────────────────────────────────────────────────────────┘
                     │  HTTPS
                     ▼
┌──────────────── api.solarlayout.in (Vercel — apps/mvp_api) ───────────────────┐
│   GET  /entitlements       → edition + feature flags                           │
│   POST /usage/report       → telemetry                                         │
│   (License issuance + Stripe webhooks live in mvp_api but are not called       │
│    directly by the desktop app — they fire on checkout from mvp_web.)          │
└────────────────────────────────────────────────────────────────────────────────┘

┌──────────────── solarlayout.in (Vercel — apps/mvp_web) ───────────────────────┐
│  Marketing, pricing, Stripe checkout, user dashboard, license downloads       │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Repo layout

Self-contained monorepo. No dependency on `renewable_energy`.

```
pv_layout_project/
├── apps/
│   └── desktop/                        Tauri + React desktop app
│       ├── src/                        React frontend
│       │   ├── canvas/MapCanvas.tsx        replaces matplotlib FigureCanvas
│       │   ├── panels/InputPanel.tsx       replaces gui/input_panel.py
│       │   ├── panels/SummaryPanel.tsx
│       │   ├── dialogs/StartupDialog.tsx   replaces gui/startup_dialog.py
│       │   ├── dialogs/LicenseKeyDialog.tsx
│       │   ├── dialogs/LicenseInfoDialog.tsx
│       │   ├── dialogs/HelpDialog.tsx
│       │   ├── hooks/useSidecar.ts         typed RPC to pvlayout-engine
│       │   ├── hooks/useEntitlements.ts
│       │   ├── state/projectStore.ts       Zustand store
│       │   └── App.tsx
│       ├── src-tauri/                  Rust shell
│       │   ├── src/main.rs
│       │   ├── src/sidecar.rs          spawn + health-check
│       │   ├── src/keyring.rs          OS keyring wrapper
│       │   └── tauri.conf.json
│       └── package.json
├── python/
│   └── pvlayout_engine/                The sidecar
│       ├── pvlayout_engine/
│       │   ├── server.py               FastAPI app; 127.0.0.1 + token
│       │   ├── routes/
│       │   │   ├── parse.py            POST /parse-kmz
│       │   │   ├── layout.py           POST /layout, /refresh-inverters, /place-las
│       │   │   ├── roads.py            POST /add-road, /remove-road
│       │   │   ├── energy.py           POST /energy-yield
│       │   │   └── export.py           POST /export/{kmz,dxf,pdf}
│       │   ├── schemas.py              pydantic mirrors of pvlayout_core/models/project.py
│       │   └── main.py                 uvicorn entry
│       ├── pvlayout_core/              EXACT copy of PVlayout_Advance/{core,models,utils}
│       ├── tests/
│       │   ├── golden/                 reference KMZs + expected output JSONs
│       │   └── test_*.py
│       ├── pvlayout-engine.spec        single PyInstaller spec
│       └── pyproject.toml
├── packages/
│   ├── ui/                             shadcn components, Nova theme tokens
│   ├── sidecar-client/                 generated TS client from FastAPI OpenAPI
│   └── entitlements-client/            tiny hand-written client for /entitlements + /usage/report
├── docs/
│   ├── ARCHITECTURE.md                 (this file)
│   └── SPIKE_PLAN.md
├── turbo.json
├── package.json
└── README.md
```

**Why self-contained:** the desktop product has a different release cadence, toolchain, and signing story than the web product. Two endpoints (`/entitlements`, `/usage/report`) are a small enough contract to hand-write a client for.

---

## 4. Single-app paradigm

One build. All features shipped. Runtime gating by entitlements.

**Feature definition** — `pvlayout_core/edition.py` is preserved verbatim (part of the vendored core — never modified). At the app boundary, however, we consume feature keys directly (`"plant_layout"`, `"cables"`, `"icr_drag"`, `"dxf"`, `"energy"`, …) rather than the `Edition` enum. This decouples the desktop from the Edition abstraction, which will be retired when the subscription redesign (S13.7) ships Free/Basic/Pro/Pro+ tiers.

**Entitlements flow:**
1. App launch → Tauri reads license key from OS keyring → React calls `GET api.solarlayout.in/entitlements` with `Authorization: Bearer <key>`.
2. Response shape (live mvp_api contract as of 2026-04):
   ```json
   {
     "success": true,
     "data": {
       "user":   { "name": "Acme Solar", "email": "ops@acme.example" },
       "plans":  [
         {
           "planName": "Pro",
           "features": ["Cable routing", "DXF export"],
           "totalCalculations": 500,
           "usedCalculations": 12,
           "remainingCalculations": 488
         }
       ],
       "licensed": true,
       "availableFeatures": ["plant_layout", "cables", "icr_drag", "dxf"],
       "totalCalculations": 500,
       "usedCalculations": 12,
       "remainingCalculations": 488
     }
   }
   ```
   `availableFeatures[]` is the enforcement truth. `plans[]` drives the top-bar chip and the license-info dialog.
3. React holds entitlements in TanStack Query for the session (no persistent offline cache — [ADR 0001](./adr/0001-online-required-entitlements.md)).
4. UI reads `useEntitlements()`; locked features render with an upgrade badge + disabled controls.

**Defense in depth:**
- The sidecar also enforces. `POST /export/dxf` returns `403 feature_not_entitled` if the license key's `availableFeatures` set (loaded at sidecar boot) doesn't include the required key. A tampered React bundle cannot coax a DXF out of the sidecar.
- Entitlements are loaded by the sidecar at session start — Tauri forwards the license key via env var, the sidecar calls `/entitlements` itself on boot.

**Upgrade flow:**
- User clicks "Upgrade" in desktop → Tauri opens browser to `solarlayout.in/pricing`.
- Stripe checkout on `mvp_web` → `mvp_api` provisions entitlement + license key (key is reused across purchases for a given user).
- User's existing key already works; entitlements refresh on next launch, features unlock immediately.
- New-user flow: signup at `solarlayout.in/sign-up` (Clerk) auto-provisions a Free-tier entitlement and license key on first authenticated request. No purchase required to start.

---

## 5. Module mapping — PVlayout_Advance → new platform

| PVlayout_Advance | Destination | Status |
|---|---|---|
| `core/layout_engine.py` | `python/pvlayout_engine/pvlayout_core/` | **Unchanged** |
| `core/kmz_parser.py`, `icr_placer.py`, `road_manager.py`, `spacing_calc.py`, `string_inverter_manager.py`, `la_manager.py`, `energy_calculator.py`, `solar_transposition.py` | same | **Unchanged** |
| `core/{kmz,dxf,pdf}_exporter.py` | same | **Unchanged**; called via `/export/*` |
| `core/{pvgis,pan,ond}_parser.py` | same | **Unchanged** |
| `core/edition.py` | same | **Unchanged**; consumed by entitlements mapping |
| `models/project.py` | `pvlayout_core/models/project.py` + `server/schemas.py` (pydantic twins) | **Unchanged core; new wrapper** |
| `utils/geo_utils.py` | same | **Unchanged** |
| `auth/license_client.py` (~73 LOC) | `packages/entitlements-client` in TypeScript | **Reimplemented in TS** |
| `auth/key_store.py` (~27 LOC) | Rust `keyring` crate in `src-tauri/src/keyring.rs` | **Reimplemented in Rust** |
| `auth/workers.py` (~53 LOC) | TanStack Query in React | **Reimplemented in TS** |
| `gui/main_window.py` (~2,548 LOC) | `apps/desktop/src/` | **Rewritten in React** |
| `gui/input_panel.py` (~1,079 LOC) | `apps/desktop/src/panels/InputPanel.tsx` | **Rewritten in React** |
| `gui/{help,startup,license_info,license_key}_dialog.py` | `apps/desktop/src/dialogs/*.tsx` | **Rewritten in React** |
| `main.py` | `apps/desktop/src-tauri/src/main.rs` + `python/pvlayout_engine/pvlayout_engine/main.py` | **Split** |
| `PVLayout.spec` | `python/pvlayout_engine/pvlayout-engine.spec` | **Reused pattern** |
| `PVLayout_{Basic,Pro,Pro_Plus}.spec`, `main_{basic,pro,pro_plus}.py` | **Deleted** | Obsolete under single-app paradigm |

**Net LOC movement:** ~5,200 Python LOC preserved verbatim; ~4,200 LOC of PyQt/matplotlib GUI replaced by React; ~150 LOC of auth moved to Rust + TS.

---

## 6. Runtime flows

**App launch**
1. Tauri boots → reads license from keyring → spawns `pvlayout-engine` on a random loopback port with a per-session bearer token.
2. React mounts → `invoke("get_license")` → `GET /entitlements` on `api.solarlayout.in` → caches result.
3. Startup dialog (React) prompts design mode.

**Generate layout** — replaces current Generate button + `_refresh_inverters`
1. User fills input panel → `POST 127.0.0.1:<port>/layout` with `LayoutParameters`.
2. Sidecar runs `run_layout_multi` → `place_string_inverters` → `place_lightning_arresters`, returns JSON of `LayoutResult[]` (GeoJSON for geometries).
3. React merges into Zustand store → MapLibre repaints via source updates.

**ICR drag**
1. MapLibre drag handler → optimistic local move.
2. Debounced (~80ms) `POST /refresh-inverters` → sidecar reruns inverter + LA steps → returns updated result.
3. Canvas re-renders at 60fps. Matches or beats current matplotlib latency.

**Obstruction draw**
1. MapLibre GL Draw (rectangle/polygon/line) → on commit, `POST /add-road` with UTM polygon.
2. Sidecar runs `recompute_tables` + inverter/LA refresh → returns new result.

**Export**
1. User clicks Export → React → Tauri `invoke("save_export", format)` → native save dialog → path returned.
2. `POST /export/{format}` with path → sidecar writes using `kmz_exporter` / `dxf_exporter` / `pdf_exporter`.
3. `POST api.solarlayout.in/usage/report` for telemetry.

**License upgrade**
1. User clicks Upgrade → Tauri opens browser at `solarlayout.in/pricing?user=<email>`.
2. Stripe → `mvp_api` → license email.
3. User pastes key → keyring + entitlements refresh → features unlock.

---

## 7. Packaging & release

**Sidecar build**
```bash
# From python/pvlayout_engine/
uv run pyinstaller pvlayout-engine.spec
# Produces: dist/pvlayout-engine[.exe]
```
One spec. No edition variants. Excludes PyQt5/PySide6/PySide2.

**Desktop build**
```bash
# From apps/desktop/
bun run tauri build
# Produces: installer artifacts for the host OS/arch
```
Tauri embeds the sidecar binary via `tauri.conf.json > bundle > externalBin`.

**Artifacts per release**
| Platform | Artifact |
|---|---|
| Windows x64 | `SolarLayout-Setup-<version>.msi` |
| macOS x64 | `SolarLayout-<version>-x64.dmg` |
| macOS arm64 | `SolarLayout-<version>-arm64.dmg` |
| Linux x64 | `SolarLayout-<version>.AppImage` + `.deb` |

**Code signing**
- Windows: EV code-signing cert for SmartScreen trust.
- macOS: Apple Developer ID + `notarytool`; hardened runtime; signed sidecar binary.
- Linux: optional GPG signature on `.deb`.

**Auto-update**
- Tauri updater polls a signed JSON manifest hosted on Vercel Blob or R2.
- Same endpoint across all platforms; manifest lists platform-specific download URLs.

**Download delivery**
- Release artifacts uploaded to GitHub Releases (or Vercel Blob).
- `mvp_web` dashboard renders download buttons per platform, gated by the user's entitlements.

---

## 8. CI & build pipeline

- Monorepo gates: `bun run lint && bun run typecheck && bun run test && bun run build` from repo root.
- GitHub Actions matrix: `{macos-14 (arm64), macos-13 (x64), windows-2022, ubuntu-22.04}`. Each runner: build sidecar → build Tauri → sign → notarize (macOS) → upload artifact.
- Release triggered on tag push (`v*`). PRs run everything except signing/publishing.
- Python and TypeScript tests run in parallel in separate Turbo tasks.

---

## 9. Security model

- **Sidecar is localhost-only.** `uvicorn` binds `127.0.0.1` explicitly. Windows firewall may still prompt once; Linux/macOS do not.
- **Per-session bearer token.** Tauri generates a random token at spawn; passes it to sidecar via env var; React reads it via `invoke("get_sidecar_token")`. No token on disk, rotates per launch.
- **License key** lives in OS keyring (Credential Manager on Windows, Keychain on macOS, Secret Service on Linux). Never in plaintext files.
- **Entitlements enforcement is double-sided** — React gates UI, sidecar gates API. Both required.
- **Safe deserialization only.** All parsers (KMZ, PAN, OND, PVGIS) are data-only — JSON/XML/CSV — with no code-executing deserializers.

---

## 10. Non-goals (explicitly out of scope)

- Cloud-hosted layout generation. All compute is local.
- Multi-user collaboration, project sync, cloud save. File-based workflow only.
- Mobile apps. Desktop only.
- Web-based version of the editor. Marketing + dashboard on the web; editing on desktop.
- Offline license activation. Online required on every launch — no offline grace window. See [ADR 0001](./adr/0001-online-required-entitlements.md).

---

## 11. Open questions

Resolved:
- **Font.** **Inter** (OFL, redistribution-safe) as primary. Geist Mono (OFL) for numeric/code contexts. No proprietary fonts in the bundle.
- **User environment.** Standard office setting assumed — no sunlight-readability or high-contrast adaptations needed in v1.
- **Theme priority.** **Light first** in S5.5/S6, to Claude-Desktop quality bar. Dark theme ships as "preview" between S6 and S13.5, then brought to parity in S13.5.

Resolved in S7:
- **Offline entitlement behaviour** — no grace window. Online required on every launch for entitlement verification. See [ADR 0001](./adr/0001-online-required-entitlements.md).

Deferred to relevant spikes:
- **Telemetry granularity** (which events fire `/usage/report`, opt-in vs. opt-out) — decided in S12.
- **Crash reporting** (Sentry for both Rust shell and Python sidecar? free tier?) — decided in S14.
- **MapLibre basemap strategy** (online free tiles vs. offline vector pack bundled with the app) — decided in S8.
- **Subscription model redesign** (Free / Basic / Pro / Pro+, single active subscription, upgrade/downgrade) — deliberated in S13.7.

---

## 12. Design system & quality bar

**Quality bar:** the Claude Desktop app, adjusted for a canvas-first engineering tool. Reference screenshots for both themes are captured in `reference_screenshots_for_UX_dsktop/{light_theme,dark_theme}/` and treated as normative.

**Pattern-language references** (ordered by primacy):
1. **Claude Desktop** — typography discipline, motion, color restraint, chrome.
2. **Linear** — light-mode engineering-tool density; sidebar + list + detail pattern.
3. **Figma** — canvas + inspector interactions; tool rail on left.

**Canvas-first translation.** Our map canvas is the analog of Claude's chat surface. Claude's conversational chrome becomes, for us:

| Claude Desktop | SolarLayout Desktop |
|---|---|
| Conversation stream | Map canvas |
| Chat history sidebar | Project file + recent projects |
| Skills / connectors rail | Tool rail (Select, Pan, Draw Rectangle, Draw Polygon, Draw Line, ICR, Measure) |
| Message input at bottom | Command bar + tool drawer |
| Model / usage cards | Summary panel (tables, ICRs, MWp, cable lengths) |
| `Type /` for skills | `⌘K` command palette |

**Theme strategy.**
- Semantic CSS variables from day one (`--surface-canvas`, `--surface-inspector`, `--text-primary`, `--border-subtle`, …). No component references a color literal.
- Light theme is polished to bar in S6. Dark theme renders but is labeled "preview" in settings until S13.5.
- MapLibre requires two hand-authored vector styles (`pv-light.json`, `pv-dark.json`). Light is polished in S8; dark is rough draft in S8 and polished in S13.5.

**Core design ingredients** (locked in S5.5, implemented in S6):
- **Typography:** Inter (OFL), custom type scale tuned for desktop density.
- **Icons:** Lucide (monoline, 16/20/24 grid, one stroke weight), plus a small custom set for solar-specific glyphs.
- **Components:** shadcn/ui as the primitive library; our `packages/ui` extends, never duplicates.
- **Motion:** Framer Motion; 150–200ms durations; standard easing; applied consistently to dialog open, sidebar collapse, tab switch, canvas layer toggle, inspector hydration.
- **Command palette:** cmdk.
- **Window chrome:** Tauri-native, borderless on macOS with traffic-light repositioning, native menus.
- **Ground color:** warm off-white (`#FAFAF9` region) in light; warm near-black (`#1A1A19` region) in dark. Never pure white; never pure black.
- **Hierarchy discipline:** typographic weight and spacing carry structure. Borders are hairline and rare. Shadows are micro and reserved for floating surfaces.

**Non-goals for the design system:**
- No custom icon language invention — we extend Lucide, we don't replace it.
- No illustration system in v1.
- No marketing-quality bespoke components in v1; we ship the engineering tool and let the marketing site do marketing.
