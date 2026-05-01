# SolarLayout — Platform Architecture

**Status:** Active
**Last updated:** 2026-05-01 (post-merge)
**Owning repo:** `solarlayout` on GitHub (folder `/Users/arunkpatra/codebase/pv_layout_project` locally)
**Scope:** desktop engineering tool (primary) + cloud support stack (in-repo since 2026-05-01)
**Related repos (read-only reference):**

- `PVlayout_Advance` — the legacy PyQt5 desktop app, source of truth for all desktop domain logic (frozen at branch `baseline-v1-20260429`).

The cloud surface (mvp_web + mvp_admin + mvp_api + mvp_db) used to live in a sibling `renewable_energy` repo; it was merged into this repo on 2026-05-01 via `git subtree`. See §13 below for the cloud architecture and [docs/post-parity/PRD-merge-spike.md](./post-parity/PRD-merge-spike.md) for the merge playbook.

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
│  ┌─ Tauri 2 shell (Rust) ──────────────────────────────────────────────────┐   │
│  │  • Window chrome, native menus, OS file dialogs, auto-updater           │   │
│  │  • Keyring bridge (license key in OS secure storage)                    │   │
│  │  • Sidecar lifecycle: spawn pvlayout-engine on launch, kill on quit     │   │
│  │  • invoke() commands: get_license, save_license, open_kmz,              │   │
│  │    save_export, open_external_url                                       │   │
│  └─────────────────────────────┬───────────────────────────────────────────┘   │
│                                │                                               │
│  ┌─ WebView (OS-native) ───────▼──────────────────────────────────────────┐    │
│  │  React 19 + TypeScript                                                 │    │
│  │  • shadcn/ui + Tailwind v4 + Nova theme (shared with mvp_web)          │    │
│  │  • MapLibre GL + deck.gl overlays (interactive layout canvas)          │    │
│  │  • TanStack Query — server cache (entitlements, sidecar RPC)           │    │
│  │  • Zustand — cross-component client state (sliced; see ADR-0003)       │    │
│  │  • react-hook-form + Zod (input panel — RHF lifecycle, Zustand persist)│    │
│  │  • Typed sidecar client generated from FastAPI OpenAPI schema          │    │
│  └─────────────────────────────┬──────────────────────────────────────────┘    │
│                                │  loopback HTTP (127.0.0.1:<random>)           │
│  ┌─ Python sidecar ────────────▼─────────────────────────────────────────┐     │
│  │  PyInstaller onefile binary: pvlayout-engine[.exe]                    │     │
│  │  • FastAPI + uvicorn, bound to 127.0.0.1 only, per-session token      │     │
│  │  • pvlayout_core  (verbatim copy of PVlayout_Advance/{core,models,    │     │
│  │      utils} — NO PyQt5 imports, NO matplotlib on interactive path)    │     │
│  │    – layout_engine, kmz_parser, icr_placer,                           │     │
│  │      string_inverter_manager, la_manager, road_manager,               │     │
│  │      spacing_calc, energy_calculator, solar_transposition,            │     │
│  │      pvgis/pan/ond parsers, kmz/dxf/pdf exporters, edition            │     │
│  └───────────────────────────────────────────────────────────────────────┘     │
└────────────────────┬───────────────────────────────────────────────────────────┘
                     │  HTTPS
                     ▼
┌──────────────── api.solarlayout.in (Vercel — apps/mvp_api) ────────────────────┐
│   GET  /entitlements       → edition + feature flags                           │
│   POST /usage/report       → telemetry                                         │
│   (License issuance + Stripe webhooks live in mvp_api but are not called       │
│    directly by the desktop app — they fire on checkout from mvp_web.)          │
└────────────────────────────────────────────────────────────────────────────────┘

┌──────────────── solarlayout.in (Vercel — apps/mvp_web) ────────────────────────┐
│  Marketing, pricing, Stripe checkout, user dashboard, license downloads,       │
│  artifact listing (S3-backed via mvp_api — KMZ/PDF/DXF the user opted to       │
│  upload from the desktop). No render compute — see ADR-0004.                   │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Cloud is passive — desktop is the engineering tool.** All layout, ICR placement, energy yield, KMZ/DXF/PDF rendering happens in the local sidecar. The cloud handles auth, payments, entitlements, opt-in artifact storage, and dashboard listing — nothing more. See [ADR-0004](./adr/0004-cloud-as-passive-storage.md).

---

## 3. Repo layout

Single Bun-workspaces monorepo housing both desktop and cloud surfaces. Desktop and cloud have separate release cadences, toolchains, and deploy targets — but share lint/typecheck conventions, the `@solarlayout/*` package scope, and a unified CI pipeline.

```
solarlayout/  (folder name on disk: pv_layout_project/)
├── apps/
│   ├── desktop/                        Tauri + React desktop app
│   │   ├── src/                        React frontend
│   │   │   ├── canvas/MapCanvas.tsx        replaces matplotlib FigureCanvas
│   │   │   ├── panels/InputPanel.tsx       replaces gui/input_panel.py
│   │   │   ├── panels/SummaryPanel.tsx
│   │   │   ├── dialogs/{StartupDialog,LicenseKeyDialog,LicenseInfoDialog,HelpDialog}.tsx
│   │   │   ├── hooks/useSidecar.ts         typed RPC to pvlayout-engine
│   │   │   ├── hooks/useEntitlements.ts
│   │   │   ├── state/projectStore.ts       Zustand store
│   │   │   └── App.tsx
│   │   ├── src-tauri/                  Rust shell
│   │   │   ├── src/{main,sidecar,keyring}.rs
│   │   │   └── tauri.conf.json
│   │   └── package.json
│   ├── mvp_web/                        Next.js 16 — solarlayout.in (marketing + user dashboard)
│   ├── mvp_admin/                      Next.js 16 — admin.solarlayout.in (Clerk-gated admin tool)
│   └── mvp_api/                        Hono v4 on Bun — api.solarlayout.in (entitlements, billing, telemetry)
├── python/
│   └── pvlayout_engine/                The desktop sidecar
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
│       ├── tests/                      pytest (123 passed + 6 skipped at HEAD)
│       ├── pvlayout-engine.spec        single PyInstaller spec
│       └── pyproject.toml
├── packages/
│   ├── ui-desktop/                     shadcn primitives for the Tauri desktop (was `ui` pre-merge)
│   ├── sidecar-client/                 generated TS client from FastAPI OpenAPI
│   ├── entitlements-client/            hand-written client for /entitlements + /usage/report
│   ├── ui/                             shadcn primitives for the Next.js cloud apps
│   ├── mvp_db/                         Prisma 7 schema + generated client (Postgres)
│   ├── shared/                         shared TS types (consumed by mvp_api)
│   ├── eslint-config/                  shared ESLint flat configs
│   └── typescript-config/              shared tsconfig presets
├── docs/
│   ├── ARCHITECTURE.md                 (this file)
│   ├── PLAN.md                         active desktop backlog
│   ├── DESIGN_FOUNDATIONS.md           desktop design system foundations
│   ├── adr/                            architecture decision records
│   ├── initiatives/                    active V2 backend backlog + cloud spike plans
│   └── post-parity/                    PRDs, findings, resume docs
├── turbo.json                          unified pipelines (desktop + cloud)
├── package.json                        Bun workspaces root (name: "solarlayout")
└── .github/workflows/                  ci.yml + platform-deployment.yml + release.yml
```

**Why one repo, two surfaces:** post-merge it's mechanically simpler — one install, one CI run, one place for cross-cutting changes (e.g., adding a feature to the desktop that requires a new mvp_api endpoint no longer needs cross-repo coordination). The runtime separation is preserved through wire contracts (§13.4) and ADR-0004's "cloud is passive" principle.

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
       "user": { "name": "Acme Solar", "email": "ops@acme.example" },
       "plans": [
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


| PVlayout_Advance                                                                                                                                                             | Destination                                                                             | Status                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `core/layout_engine.py`                                                                                                                                                      | `python/pvlayout_engine/pvlayout_core/`                                                 | **Unchanged**                                   |
| `core/kmz_parser.py`, `icr_placer.py`, `road_manager.py`, `spacing_calc.py`, `string_inverter_manager.py`, `la_manager.py`, `energy_calculator.py`, `solar_transposition.py` | same                                                                                    | **Unchanged**                                   |
| `core/{kmz,dxf,pdf}_exporter.py`                                                                                                                                             | same                                                                                    | **Unchanged**; called via `/export/`*           |
| `core/{pvgis,pan,ond}_parser.py`                                                                                                                                             | same                                                                                    | **Unchanged**                                   |
| `core/edition.py`                                                                                                                                                            | same                                                                                    | **Unchanged**; consumed by entitlements mapping |
| `models/project.py`                                                                                                                                                          | `pvlayout_core/models/project.py` + `server/schemas.py` (pydantic twins)                | **Unchanged core; new wrapper**                 |
| `utils/geo_utils.py`                                                                                                                                                         | same                                                                                    | **Unchanged**                                   |
| `auth/license_client.py` (~73 LOC)                                                                                                                                           | `packages/entitlements-client` in TypeScript                                            | **Reimplemented in TS**                         |
| `auth/key_store.py` (~27 LOC)                                                                                                                                                | Rust `keyring` crate in `src-tauri/src/keyring.rs`                                      | **Reimplemented in Rust**                       |
| `auth/workers.py` (~53 LOC)                                                                                                                                                  | TanStack Query in React                                                                 | **Reimplemented in TS**                         |
| `gui/main_window.py` (~2,548 LOC)                                                                                                                                            | `apps/desktop/src/`                                                                     | **Rewritten in React**                          |
| `gui/input_panel.py` (~1,079 LOC)                                                                                                                                            | `apps/desktop/src/panels/InputPanel.tsx`                                                | **Rewritten in React**                          |
| `gui/{help,startup,license_info,license_key}_dialog.py`                                                                                                                      | `apps/desktop/src/dialogs/*.tsx`                                                        | **Rewritten in React**                          |
| `main.py`                                                                                                                                                                    | `apps/desktop/src-tauri/src/main.rs` + `python/pvlayout_engine/pvlayout_engine/main.py` | **Split**                                       |
| `PVLayout.spec`                                                                                                                                                              | `python/pvlayout_engine/pvlayout-engine.spec`                                           | **Reused pattern**                              |
| `PVLayout_{Basic,Pro,Pro_Plus}.spec`, `main_{basic,pro,pro_plus}.py`                                                                                                         | **Deleted**                                                                             | Obsolete under single-app paradigm              |


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

## 6.5. State architecture

State in the desktop app lives in exactly one of five places, by category. This is enforced via [ADR-0003](./adr/0003-state-architecture.md); summarized here.


| State category                                              | Mechanism                                           | Examples                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Server cache**                                            | TanStack Query                                      | `useEntitlementsQuery`, `useLayoutMutation`, `useUsageReportMutation`                  |
| **Cross-component client state**                            | Zustand (sliced by domain)                          | `useProjectStore`, `useLayoutParamsStore`, `useLayoutResultStore`, `useSelectionStore` |
| **Ephemeral UI state** (single component, no siblings care) | `useState`                                          | `paletteOpen`, dialog flags, hover state                                               |
| **Imperative handles & RAF guards**                         | `useRef`                                            | MapLibre `mapRef`, `propsRef`, `lastBoundariesKey`                                     |
| **Persistent preferences**                                  | `localStorage` (typed wrapper) or Zustand `persist` | `theme`, `unitsPreference`, `recentProjects`                                           |
| **OS-secret persistence**                                   | Tauri `keyring` plugin                              | `licenseKey`                                                                           |


Slices live at `apps/desktop/src/state/<slice>.ts`. TanStack Query keys come from `apps/desktop/src/state/queryKeys.ts`. Context is reserved for *configuration* injection (ThemeProvider, EntitlementsProvider) — never for writable state. Full convention details in ADR-0003.

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


| Platform    | Artifact                                  |
| ----------- | ----------------------------------------- |
| Windows x64 | `SolarLayout-Setup-<version>.msi`         |
| macOS x64   | `SolarLayout-<version>-x64.dmg`           |
| macOS arm64 | `SolarLayout-<version>-arm64.dmg`         |
| Linux x64   | `SolarLayout-<version>.AppImage` + `.deb` |


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
- Release triggered on tag push (`v`*). PRs run everything except signing/publishing.
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

Resolved in S8:

- **MapLibre basemap strategy** — no basemap. Canvas-first surface with our KMZ overlay on top. See [ADR 0002](./adr/0002-no-basemap.md).

Deferred to relevant spikes:

- **Telemetry granularity** (which events fire `/usage/report`, opt-in vs. opt-out) — decided in S12.
- **Crash reporting** (Sentry for both Rust shell and Python sidecar? free tier?) — decided in S14.
- **Subscription model redesign** (Free / Basic / Pro / Pro+, single active subscription, upgrade/downgrade) — deliberated in S13.7.

---

## 12. Design system & quality bar

**Quality bar:** the Claude Desktop app, adjusted for a canvas-first engineering tool. Reference screenshots for both themes are captured in `reference_screenshots_for_UX_dsktop/{light_theme,dark_theme}/` and treated as normative.

**Pattern-language references** (ordered by primacy):

1. **Claude Desktop** — typography discipline, motion, color restraint, chrome.
2. **Linear** — light-mode engineering-tool density; sidebar + list + detail pattern.
3. **Figma** — canvas + inspector interactions; tool rail on left.

**Canvas-first translation.** Our map canvas is the analog of Claude's chat surface. Claude's conversational chrome becomes, for us:


| Claude Desktop           | SolarLayout Desktop                                                            |
| ------------------------ | ------------------------------------------------------------------------------ |
| Conversation stream      | Map canvas                                                                     |
| Chat history sidebar     | Project file + recent projects                                                 |
| Skills / connectors rail | Tool rail (Select, Pan, Draw Rectangle, Draw Polygon, Draw Line, ICR, Measure) |
| Message input at bottom  | Command bar + tool drawer                                                      |
| Model / usage cards      | Summary panel (tables, ICRs, MWp, cable lengths)                               |
| `Type /` for skills      | `⌘K` command palette                                                           |


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

---

## 13. Cloud surface

Three Next.js / Hono apps and a Postgres database, all in this repo since the 2026-05-01 merge. The cloud is **passive storage + auth + billing** per [ADR-0004](./adr/0004-cloud-as-passive-storage.md): no engineering compute, no rendering, no model state. Desktop is the engineering tool; cloud holds entitlements, accepts opt-in artifact uploads, lists past designs, and runs the marketing/billing/admin surfaces.

### 13.1 Apps

| App | Domain | Stack | Hosted on | Purpose |
|---|---|---|---|---|
| `apps/mvp_web` | `solarlayout.in` (apex; `www.` redirects) | Next.js 16 App Router + Clerk + Stripe | Vercel | Marketing pages, sign-up/sign-in, pricing, Stripe checkout, user dashboard, license key issuance, downloads page, "your past designs" listing |
| `apps/mvp_admin` | `admin.solarlayout.in` | Next.js 16 App Router + Clerk | Vercel | Internal admin tool — user lookup, plan management, transaction view, manual entitlement adjustments. Clerk-gated to admin role only. |
| `apps/mvp_api` | `api.solarlayout.in` | Hono v4 on Bun runtime | Vercel | Entitlements API (`/v2/entitlements`), usage telemetry (`/v2/usage/report`), billing endpoints, Stripe webhook, project CRUD, S3 upload signing. License-key bearer auth for desktop; Clerk JWT for browser. |

All three deploy from this repo via `.github/workflows/platform-deployment.yml` (workflow_dispatch only — manual trigger). The deploy uses Vercel CLI, not Vercel's git integration. Vercel team is `Journium`.

### 13.2 Database

| Component | Technology | Notes |
|---|---|---|
| `packages/mvp_db` | Prisma 7 + `@prisma/extension-semantic-id` | Schema source of truth; generates client to `src/generated/prisma`. Module resolution is **NodeNext** — consumers depend on the built dist (see CLAUDE.md §11 workspace resolution). |
| Postgres | AWS RDS, us-east-1, instance `journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432` | Single instance hosts separate `staging` + `production` DBs. Both at migration HEAD as of 2026-05-01. Credentials in gitignored `.env.staging` + `.env.production` at repo root. |

Migrations are applied via `bunx prisma migrate deploy` after sourcing the relevant env file (see CLAUDE.md §8 for the command pattern). Local development uses Docker Compose Postgres on `localhost:5432`.

### 13.3 Object storage

| Bucket | Region | Purpose |
|---|---|---|
| `solarlayout-{local,staging,prod}-downloads` | ap-south-1 | Desktop installer artifacts, marketing PDFs |
| `solarlayout-{local,staging,prod}-projects` | ap-south-1 | User-uploaded KMZ / PDF / DXF artifacts (opt-in from desktop, listed on dashboard) |

AWS account `378240665051`. CI uses GitHub Actions OIDC; the trust policy currently still names `repo:SolarLayout/renewable_energy:*` — cosmetic, will update when the cable-engine workflow lands.

### 13.4 Wire contracts (desktop ↔ cloud)

The desktop app speaks to `api.solarlayout.in` over HTTPS. Two contracts matter:

- **`GET /v2/entitlements`** — license-key bearer auth. Returns the V2 envelope `{success: true, data: {...}}` with the user's plans, available feature keys, and calculation quota. Source of truth for feature-key strings is the registry per [ADR-0005](./adr/0005-feature-key-registry.md). Response shape lives in `packages/shared/src/types/v2.ts`; both ends mirror it.
- **`POST /v2/usage/report`** — license-key bearer auth. Telemetry sink for layout / export / energy-yield calls. Fire-and-forget on the desktop side; queued + retried on offline.

V2 errors use a `V2ErrorCode` discriminated union (also in `packages/shared`); both ends key off it for messaging. The wider V2 endpoint surface (project CRUD, S3 upload signing) is laid out in [docs/initiatives/post-parity-v2-backend-plan.md](./initiatives/post-parity-v2-backend-plan.md) and consumed by the desktop's V2 client extension.

Per the principle in CLAUDE.md §2 ("External contracts bind before code"): even though both ends now live in this repo, the boundary is real (different runtimes, JSON over HTTPS), and contract changes still flow one direction — `packages/shared` updates first, then the consumer mirrors.

### 13.5 Auth

| Surface | Mechanism | Why |
|---|---|---|
| Desktop ↔ mvp_api | License-key bearer (`sl_live_*`) | Desktop has no Clerk integration. Keys are issued by mvp_api on first authenticated dashboard request, persisted in OS keyring on the desktop, sent as `Authorization: Bearer sl_live_…` |
| Browser ↔ mvp_web / mvp_admin | Clerk session | Standard Clerk patterns; mvp_admin further gates by admin role |
| Browser ↔ mvp_api (when called from mvp_web's dashboard or mvp_admin) | Clerk JWT | mvp_api accepts Clerk JWTs for browser-originating calls; license-key bearer for desktop |
| Stripe → mvp_api | Stripe-signed webhook | Live at `api.solarlayout.in/webhooks/stripe`; verified per Stripe's signing guidance |

**Desktop never holds a Clerk token**, never authenticates against Clerk. The license-key model is intentional — no browser cookies, no OAuth flow, no token refresh, no SSO. The user pastes a key once; it lives in the OS keyring forever.

### 13.6 Deployment + CI

- **CI (`.github/workflows/ci.yml`):** desktop gates (lint/typecheck/test/build) + sidecar pytest, runs on every PR and main push. Clerk test publishable key is hardcoded in the workflow because `NEXT_PUBLIC_*` keys are public by design — it's needed for the Next.js prerender step.
- **Cloud deploy (`.github/workflows/platform-deployment.yml`):** `workflow_dispatch` only — manual trigger. Deploys mvp_web, mvp_admin, mvp_api to Vercel via Vercel CLI. Authentication via `VERCEL_TOKEN`. No git-integration auto-deploy on Vercel side.
- **Desktop release (`.github/workflows/release.yml`):** triggers on `v*` tag push; matrix builds across Windows, macOS x64/arm64, Linux; signs + notarizes; publishes installer artifacts.

