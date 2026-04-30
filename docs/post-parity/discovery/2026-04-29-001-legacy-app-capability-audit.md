# Legacy App Capability Audit — PVlayout_Advance

**Date:** 2026-04-29
**Author:** Discovery audit (Claude)
**Source:** `/Users/arunkpatra/codebase/PVlayout_Advance` @ branch `baseline-v1-20260429` (HEAD `397aa2a`)
**Purpose:** Inventory of every capability exposed by the legacy PyQt5 desktop app, to seed the post-parity scoping plan now that the domain-logic parity sweep is closed.

This document is descriptive, not prescriptive. It captures what the legacy app *does*; what we choose to port, redesign, or drop is the next step.

---

## 1. Top-level entry points

The repo ships **four `main_*.py` entry points** plus four matching PyInstaller spec files. All four launch the same `MainWindow` — the only differences are the application title, the `Edition` enum value passed to `MainWindow`, and (in the spec files) which build is produced.

| Entry point | App name | Edition | Build target |
|---|---|---|---|
| `main.py` | "PV Plant Layout" | none (legacy "advanced", all features visible) | `PVLayout.spec`, `PVlayout_Advance_v27.spec` |
| `main_basic.py` | "PVLayout Basic" | `Edition.BASIC` | `PVLayout_Basic.spec` |
| `main_pro.py` | "PVLayout Pro" | `Edition.PRO` | `PVLayout_Pro.spec` |
| `main_pro_plus.py` | "PVLayout Pro Plus" | `Edition.PRO_PLUS` | `PVLayout_Pro_Plus.spec` |

Each entry point: builds a `QApplication`, sets icon, runs `StartupDialog`, then opens `MainWindow(design_mode=…, design_type=…)`.

The "real" entry point that everything else funnels through is `main.py` — it asks the user for both **design type** (Fixed Tilt / Single Axis Tracker) and **inverter topology** (String / Central) before launching the main window. The edition-specific entry points hard-code `edition=…` but otherwise behave identically.

PyInstaller wiring lives in [`PVLayout.spec`](/Users/arunkpatra/codebase/PVlayout_Advance/PVLayout.spec) and siblings. `keyring` backends are explicitly listed in `hiddenimports` so the OS credential store works in the bundled binary.

**Implication for new app:** the single-binary paradigm in this repo means we collapse all four entries into one. The startup-mode dialog (design type × inverter topology) is real, recurring product logic and must be preserved as the launch experience.

---

## 2. Top-level UI surfaces

No `.ui` files exist — all UI is hand-coded PyQt5 in [`gui/`](/Users/arunkpatra/codebase/PVlayout_Advance/gui/). Surface inventory:

| File | Class | Purpose |
|---|---|---|
| `gui/startup_dialog.py:StartupDialog` | Modal | 2×2 card grid: pick `(DesignType, DesignMode)`. Shown once at app launch. |
| `gui/main_window.py:MainWindow` | `QMainWindow` | The application. Splitter: left input panel (~360 px fixed) + right canvas + summary table. |
| `gui/main_window.py:AnalysisOverlay` | Custom widget | Full-window dim with progress card; used for layout, cable, PVGIS, and energy phases. |
| `gui/input_panel.py:InputPanel` | Scrolling form | Left sidebar — every layout/energy input. Long file (~1390 LOC). |
| `gui/help_dialog.py:HelpDialog` | Tabbed modal | Multi-tab help text (Getting Started, Inputs, ICR, Obstructions, Cables, …). |
| `gui/kmz_help_dialog.py:KmzHelpDialog` | Modal | Detailed KMZ-preparation guide, opened from the ⓘ button next to KMZ browse. |
| `gui/license_key_dialog.py:LicenseKeyDialog` | Modal | Single password-style entry for `sl_live_*` license key + "Buy a license" link. |
| `gui/license_info_dialog.py:LicenseInfoDialog` | Modal | Read-only account view: name, email, plan(s), remaining calculations, "Change Key". |
| `gui/boundary_validation_dialog.py:BoundaryValidationDialog` | Modal | Pre-flight: lists open-ring boundaries with checkboxes to exclude individually. |
| `gui/water_body_mode_dialog.py:WaterBodyModeDialog` | Modal | Choose KMZ-defined water vs satellite auto-detect. **Currently disabled** in code (`_water_detect_mode = "kmz"`) — see §6/§9. |
| `gui/satellite_detection_dialog.py:SatelliteDetectionDialog` | Modal | Two-phase detection: progress bar then preview with apply/skip. **Wired but disabled.** |
| `gui/energy_timeseries_window.py:EnergyTimeSeriesWindow` | Modeless dialog | Two stacked daily charts (energy + GTI) with a year-day slider and crosshair tooltips. Source: `_compute_hourly_series` in same file. |

### Main-window layout

`MainWindow._build_ui` ([`gui/main_window.py:753`](/Users/arunkpatra/codebase/PVlayout_Advance/gui/main_window.py#L753)):

- **Menu bar** (very thin):
  - **File** → "Move to String / Central Window…" (Ctrl+N), separator, "Exit" (Ctrl+Q)
  - **Help** → "How to Use This Tool" (F1)
- **App toolbar** (top): single right-aligned "My Account" button (toggles based on license state).
- **License banner** (yellow/red, dismissible): inserted at top of central widget when no key, invalid key, or quota exhausted.
- **Splitter** (horizontal):
  - **Left** (`InputPanel` in `QScrollArea`): the multi-group input form (see §3 for fields). Below the scroll area, a pinned **"⊕ Move to String / Central Window"** button.
  - **Right**:
    - Matplotlib `NavigationToolbar` + a **"⛶ Expand Plot"** button that detaches the canvas into a resizable `QDialog`.
    - The matplotlib `FigureCanvas` (the layout plot).
    - "Layout & Energy Summary" `QTableWidget` (edition + design-mode aware columns; ~14–22 columns possible).
    - **Monthly Energy Breakdown** `QTableWidget` (12 months + Annual; only visible after Calculate Energy).
- **Status bar**: left = layout summary message; permanent right widget = quota counter ("N calculations remaining" or "0 calculations remaining" in red).

Below the canvas, on the **left panel** (also relevant UI surfaces inside `InputPanel` plus a few buttons added by `MainWindow`):

- **Generate Layout** (primary CTA, 36 px tall, bold).
- **Export** group: Export KMZ, Export DXF (entitlement-gated), Export PDF.
- **Energy Yield** group: "Calculate Energy", "📊 Show Energy Chart", "Export 15-min CSV", and a status label.
- **ICR Tip** label (visible only when ICR-drag entitlement is on).
- **Obstructions** group: "Draw Rectangle", "Draw Polygon" (toggleable), "Undo Last", "Clear All", hint label.
- **AC Cables / DC Cables toggle** (label changes with design mode): single ON/OFF push button.
- **Lightning Arresters toggle**: ON/OFF push button.

---

## 3. User-actions catalogue

The legacy app is single-document — there is **no project save/load**, no recent files, no auto-save, no undo history (other than per-domain undo for obstructions). State is in memory; export-only.

### File / project lifecycle

| Action | Where wired | Notes |
|---|---|---|
| New session window | `MainWindow._on_new_session` ([main_window.py:1202](/Users/arunkpatra/codebase/PVlayout_Advance/gui/main_window.py#L1202)) | Re-runs `StartupDialog`, opens a fresh independent `MainWindow`. Both windows live in `app._extra_windows`. Available from File menu (Ctrl+N) and the pinned bottom button. |
| Exit | `MainWindow.close()` via `Ctrl+Q` | Standard Qt close. |
| **(Missing)** Open / Save project | — | No project file format. The KMZ + form values are ephemeral. |
| **(Missing)** Recent files | — | Not implemented. |

### Ingest

| Action | Where | What happens |
|---|---|---|
| Browse KMZ | `InputPanel._browse_kmz` | `QFileDialog` for `*.kmz *.kml`. Sets `_water_detect_mode = "kmz"` (satellite mode currently disabled in code). |
| Load PAN file (PVsyst module) | `InputPanel._browse_pan` → `core/pan_parser.py:parse_pan` | Auto-fills module length/width/wattage, μ_Pmpp, NOCT, bifacial detection + bifaciality factor. |
| Load OND file (PVsyst inverter) | `InputPanel._browse_ond` → `core/ond_parser.py:parse_ond` | Auto-fills inverter European-weighted efficiency and Pnom (kW). |
| Load PVGIS hourly file | `InputPanel._browse_pvgis_file` → `core/pvgis_file_parser.py:parse_pvgis_file` | Loads CSV with flexible columns: time + GHI (W/m²), optional GTI, optional ambient temp. Populates annual GHI/GTI/temp. Required for 15-min CSV export. Format reminder dialog fires when the user selects "Hourly GHI file". |
| PVGIS API fetch (live) | `MainWindow._start_pvgis_fetch` → `GHIFetchWorker` → `core/energy_calculator.py:fetch_solar_irradiance` | Internet fetch of annual + monthly GHI/GTI from PVGIS EU JRC; falls back to NASA POWER. Triggered by clicking Calculate Energy in PVGIS-API mode. |
| Custom module specs (manual) | `InputPanel._module_group` | Manual length / width / wattage / bifacial entry — works without a PAN file. |
| KMZ help dialog | ⓘ button next to KMZ browse | Static guide. |

### Drawing & editing

| Action | Where | What happens |
|---|---|---|
| Boundary input | KMZ-only — no in-app boundary drawing tool | Boundaries always come from the KMZ. |
| Boundary validation | `core/kmz_parser.py:validate_boundaries` + `BoundaryValidationDialog` | Open rings flagged; user can exclude individual boundaries before generation. |
| Water-body marking | KMZ-named polygons (water keywords: pond, lake, canal, river, reservoir, water, wetland, swamp, tank); satellite auto-detection wired but disabled at runtime. | `kmz_parser._is_water_name`. |
| Obstruction — Rectangle | `MainWindow.RoadDrawer` (DRAW_RECT) → `core/road_manager.py:add_road` | Click-and-drag on the canvas; live preview. Calls `recompute_tables` so layout rebuilds instantly. |
| Obstruction — Polygon | `RoadDrawer` (DRAW_POLYGON) | Click vertices; double-click or right-click to close (≥3 pts). Same `add_road` path. |
| Undo last obstruction | `MainWindow._undo_road` → `road_manager.remove_last_road` | Removes the most recent road and rebuilds layout. |
| Clear all obstructions | `MainWindow._clear_roads` → `road_manager.clear_roads` | Wipes all user-drawn obstructions. |
| **(Missing)** General undo/redo | — | No global history. Only obstruction-list operations are reversible. |

### Layout generation

| Action | Where | What happens |
|---|---|---|
| Generate Layout | `MainWindow._on_generate` → entitlements re-fetch (if keyed) → `_run_layout` → `LayoutWorker` → `core/layout_engine.run_layout_multi` | Validates KMZ exists, runs boundary-validation dialog if open rings, then a `QThread` runs the engine. The `AnalysisOverlay` dims the window with progress + elapsed. After geometry, `CableWorker` runs LA placement + string-inverter placement (and cable routing if enabled). |
| Multi-boundary | First-class. KMZ may contain multiple plant polygons; each renders with a distinct color; summary has TOTAL row. | `parse_kmz` + `run_layout_multi`. |
| Auto-tilt / auto-pitch | Default. `params.tilt_angle = None` and `row_spacing = None` cause the engine to derive them from latitude (zero shading at winter solstice noon). | `core/spacing_calc.py`, `core/layout_engine.py`. |
| Override tilt | Checkbox + spin (Fixed Tilt only). | `InputPanel._spacing_group`. |
| Override row pitch | Checkbox + spin (Fixed Tilt only). | Same. |
| SAT-specific dials | E-W pitch (m), N-S service gap, max rotation angle, tracker hub height, modules across tracker, modules per string, strings per tracker, P/L config. | `InputPanel._tracker_group`. Live "aperture / N-S length / GCR / modules" preview label. |
| Cable calculation toggle | "Calculate cables (String DC + AC to ICR)" / "(String DC + DC to Central Inv.)" checkbox. Triggers a "performance notice" dialog when enabled. | `InputPanel._on_cable_calc_toggled`. |

### Inspection & manipulation

| Action | Where | What happens |
|---|---|---|
| ICR drag-and-drop | `MainWindow.ICRDragger` ([main_window.py:451](/Users/arunkpatra/codebase/PVlayout_Advance/gui/main_window.py#L451)) | Click an ICR rectangle, drag, release. Drop is accepted only if the new position fits inside `result.usable_polygon` (else snap-back). On accept: `road_manager.recompute_tables` → `_refresh_inverters` → redraw. |
| Pan/zoom | matplotlib `NavigationToolbar` (built-in). | Standard MPL toolbar; ICR drag is suppressed while toolbar mode is active. |
| Expand plot | `MainWindow._on_expand_plot` | Detaches canvas into a resizable `QDialog`; pan/zoom and ICR drag remain functional in the dialog. Returns canvas on close. |
| Show/hide AC (or DC) cables | `MainWindow._toggle_ac_cables` | Toggles visibility of `ac_line_collections`. Label changes by design mode. |
| Show/hide LAs | `MainWindow._toggle_las` | Toggles LA rectangles + protection circles + labels. |
| LA placement override | **Not exposed in UI.** LA placement is fully automatic (`core/la_manager.place_lightning_arresters`). |
| Panel-table inspection | Hover/click — none in legacy. Panels render as a `PatchCollection`. |
| Plant labels / boundary labels | Auto-rendered. | `_draw_layout` includes proportional plant-name labels and ICR/LA index labels. |

### Layout summary table

`MainWindow._summary_headers` ([main_window.py:2563](/Users/arunkpatra/codebase/PVlayout_Advance/gui/main_window.py#L2563)) — column set is **dynamic**, depending on (DesignMode, DesignType, FEATURE_AC_DC, FEATURE_CABLES, FEATURE_ENERGY):
- Always: Plant, Area (acres), MMS-Tables/Trackers, Modules, Cap. (MWp), Tilt/Max Ang, Pitch/E-W Pitch, ICR, LA.
- String-Inverter: + Str. Inv., Inv. kWp.
- Central-Inverter: + SMBs, SMB kWp, C.Inv., C.Inv kWp.
- With cables: + Str.DC (m), AC-ICR (m) (or DC-CInv (m)).
- With energy: + P50/P75/P90 Yr1 (MWh), CUF (%), 25yr P50 (MWh).
- TOTAL row when ≥2 plants.

### Energy modelling

| Action | Where | What happens |
|---|---|---|
| Calculate Energy | `MainWindow._on_calculate_energy` → either GHI-file path or PVGIS-API path → `core/energy_calculator.calculate_energy` per result. | Computes Year 1 + 25-yr lifetime energy, P-values (P50/P75/P90 by default, configurable), CUF, monthly breakdown when monthly data is available. |
| GHI → GTI transposition | `core/solar_transposition.py` (Liu-Jordan / HSAT). | Auto-derives in-plane irradiance from horizontal when only GHI is present. |
| Sandia/SAPM module-temperature loss | `core/energy_calculator.calculate_temperature_loss_sandia` driven by mounting type, GTI, ambient temp, wind speed. Live recompute on every input change. |
| Show Energy Chart | `EnergyTimeSeriesWindow` | Daily 24-hour view of energy + GTI with year-slider, crosshair, hover annotation. |
| Export 15-min CSV | `MainWindow._on_export_15min` → `core/energy_calculator.export_15min_csv` | Year-1 35040-row CSV of DateTime / GHI / GTI / Energy. Requires PVGIS hourly file loaded (≠ API mode). |
| P-values config | `InputPanel.p1/p2/p3_spin` (default 50/75/90), `uncertainty_spin`. |

### Export

| Action | Where | What happens |
|---|---|---|
| Export KMZ | `MainWindow._on_export_kmz` → `core/kmz_exporter.export_kmz` | Always available after a layout. Includes obstructions folder. |
| Export DXF | `MainWindow._on_export_dxf` → `core/dxf_exporter.export_dxf` | Entitlement-gated (`FEATURE_DXF`). |
| Export PDF | `MainWindow._on_export_pdf` → `core/pdf_exporter.export_pdf` | Always available. Multi-page A3 landscape: layout plot, summary, energy PR breakdown, monthly + 25-yr lifetime tables. Hides DC/AC cables and LA circles for the layout page; force-shows LA rectangles. |

### Preferences & settings

| Setting | Persisted? | Where |
|---|---|---|
| License key | Yes — OS credential store via `keyring` (`auth/key_store.py`). Service `solarlayout`, account `license_key`. | Survives reinstall via OS Keychain / Credential Manager / Secret Service. |
| **All other settings** | **Not persisted.** | Every spin box, checkbox, file path, water-detect mode, etc. resets on app launch to hard-coded defaults. |
| **(Missing)** Theme / dark mode | — | Not implemented. |
| **(Missing)** Unit toggles (m/ft, MWp/MW, etc.) | — | Hard-coded SI / industry units. |
| **(Missing)** Default-values dialog | — | Defaults are hard-coded in `InputPanel._double_spin` calls. |

### Help / about / licensing

| Action | Where |
|---|---|
| How to Use (F1) | `HelpDialog` — multi-tab static help. Per-feature tabs are added dynamically (ICR, Obstructions, Strings & Cables) by `MainWindow._show_help`. |
| KMZ prep guide | `KmzHelpDialog` — dedicated dialog, opened from ⓘ. |
| About / Version | **No "About" dialog** in the codebase. |
| Enter license key | `LicenseKeyDialog` (banner "Enter key" or My Account → Change Key). |
| View account | `LicenseInfoDialog` — shown via the toolbar "My Account" button after the entitlements re-fetch. |
| Buy a license | Hyperlink to `https://solarlayout.in/pricing` from `LicenseKeyDialog`. |
| Quota indicator | Permanent right-aligned label in status bar; turns red at 0. |
| License banner | Yellow ("no key" / "invalid key") or red ("calculations exhausted"). Dismissible. |

---

## 4. Workflows

These are the canonical end-to-end paths. They drive UX scoping more than the action list.

1. **Cold-start, fully manual layout (no PAN/OND):**
   StartupDialog → MainWindow → Browse KMZ → tweak module specs / table config / spacing → Generate Layout → review summary → Export KMZ + Export PDF.

2. **Pro-grade layout with cables and obstructions:**
   StartupDialog → Browse KMZ → Load .PAN → Load .OND → tick "Calculate cables" (acknowledge warning) → Generate Layout → review canvas → drag ICRs into preferred positions → use Draw Rectangle / Draw Polygon to add internal roads / exclusion zones → Undo Last if regretted → toggle AC cables visibility ON → Export PDF / DXF.

3. **Energy yield modelling (Pro Plus):**
   Generate layout (as above) → in Energy Yield section, leave "PVGIS API" selected → click Calculate Energy (overlay shows PVGIS fetch then Calculate Energy phase) → review monthly breakdown table + summary P50/P75/P90/CUF columns → Show Energy Chart for daily-resolution sanity check → optionally switch to "Hourly GHI file (CSV)" and re-run for site-specific yield → Export 15-min CSV (only with file path) → Export PDF.

4. **SAT (single axis tracker) layout:**
   StartupDialog → pick SAT card → SAT-specific tracker group replaces table+spacing groups → enter modules-per-string, modules-across, E-W pitch, N-S gap, max rotation, hub height, P/L config → Generate Layout → SAT-specific summary columns ("Trackers", "Max Ang", "E-W Pitch") render → otherwise identical downstream.

5. **Multi-boundary site:**
   KMZ contains multiple plant polygons (potentially mixed with named water polygons inside or alongside) → Generate Layout produces N `LayoutResult`s, each colored, with a TOTAL row in the summary → cables/inverters/LAs computed per-boundary → exports cover all boundaries.

6. **Side-by-side string vs central comparison:**
   Open File → "Move to String / Central Window…" → second `MainWindow` opens with the alternate inverter topology, same KMZ workflow → both windows persist (`app._extra_windows`).

7. **Boundary repair flow:**
   Browse KMZ with open-ring boundary → click Generate → `BoundaryValidationDialog` appears with each broken boundary listed and excludable → user excludes problem rings → layout proceeds on remainder. (Or cancels and edits in Google Earth.)

---

## 5. Edition gating map

The legacy code has **two** parallel gating systems — a build-time `Edition` enum and a runtime `availableFeatures` set from the entitlements API. The `Edition` enum is used by the PDF exporter (`core/edition.has_cables`, `has_energy`, etc.), but the live UI gating in `MainWindow` is driven entirely by API feature keys. Both must be understood; the new app collapses to the API path only.

### Edition enum (build-time, [`core/edition.py`](/Users/arunkpatra/codebase/PVlayout_Advance/core/edition.py))

| Capability | Basic | Pro | Pro Plus |
|---|---|---|---|
| Layout + summary | yes | yes | yes |
| KMZ export | yes | yes | yes |
| PDF export | yes | yes | yes |
| Lightning arresters | yes | yes | yes |
| Cable routing (string DC + AC/DC) + cable visibility toggle | — | yes | yes |
| Obstructions (Draw Rect/Poly) | — | yes | yes |
| ICR drag-and-drop | — | yes | yes |
| DXF export | — | — | yes |
| Energy yield, 15-min CSV export, P50/P75/P90 | — | — | yes |
| Plant AC capacity & DC/AC ratio | — | — | — (disabled in all editions) |

### API feature-key set ([`gui/main_window.py:59-64`](/Users/arunkpatra/codebase/PVlayout_Advance/gui/main_window.py#L59))

```
FEATURE_CABLES        = "cable_routing"
FEATURE_OBSTRUCTIONS  = "obstructions"
FEATURE_ICR_DRAG      = "icr_drag"
FEATURE_DXF           = "dxf_export"
FEATURE_ENERGY        = "energy_yield"
FEATURE_AC_DC         = "ac_dc_ratio"
```

Notes on runtime behaviour ([`_apply_entitlement_features`](/Users/arunkpatra/codebase/PVlayout_Advance/gui/main_window.py#L1438)):
- **Fail-open when no key** — if no key is loaded, `_entitlements is None` and `_has_feature` returns `True` for every key. The user can do everything until they enter a key. (Comment: "freemium-forward design.")
- **Obstructions** is **always visible**, regardless of entitlements (`_obstruction_section.setVisible(True)` unconditionally). The `FEATURE_OBSTRUCTIONS` key exists but is not actually consulted at runtime — gap to flag.
- **DXF** has a special rule: granted whenever `dxf_export` OR `energy_yield` is in `availableFeatures`. Effectively: any plan that gives you energy gives you DXF.
- **AC/DC ratio columns** are **always hidden** — `_has_feature(FEATURE_AC_DC)` short-circuits to `False`. The columns and computation exist in code but ship dark.
- **ICR drag** is gated by `FEATURE_ICR_DRAG` — if absent, panels still place but the dragger isn't connected and the hint label hides.
- **Cable toggle and Energy section** are *visible-but-disabled* without entitlement (greyed out with an "Upgrade at solarlayout.in/pricing" tooltip).

### Quota / usage telemetry

- `GET https://api.solarlayout.in/entitlements` (Bearer token = license key) returns `{ data: { user, plans, availableFeatures, remainingCalculations } }`. ([`auth/license_client.py`](/Users/arunkpatra/codebase/PVlayout_Advance/auth/license_client.py))
- `POST https://api.solarlayout.in/usage/report` `{ feature: "plant_layout" }` is fired after every successful layout to decrement quota. **All plans** report — not just Pro Plus. (`MainWindow._on_cable_done` last block.)
- Status codes the UI handles: `200` ok, `401` invalid/revoked → clear key, `402` quota exhausted → red banner.

---

## 6. Hidden / power-user features

- **Multi-window**: `app._extra_windows` retains references to extra `MainWindow`s opened via "Move to String / Central Window". Each is fully independent — a user can run String-Inverter and Central-Inverter analyses side by side on the same KMZ.
- **Expand Plot dialog**: detaches the canvas into a maximisable window, allowing larger work area for ICR drag and obstruction drawing on dense layouts. Surprisingly easy to miss as a feature.
- **Plot keyboard / NavigationToolbar**: matplotlib's standard pan/zoom/home/save buttons are exposed verbatim. The "save figure" button on that toolbar is a parallel image export path — not a curated user-facing flow but functional.
- **Boundary validation auto-repair**: water bodies and obstacles with self-intersections are auto-repaired silently by `kmz_parser` (only plant boundary open rings are surfaced to the user).
- **Auto-detect bifacial from PAN**: loading a PAN with bifaciality keys auto-checks the bifacial checkbox and fills the φ factor — without user action.
- **Sandia model live trace**: `pan_temp_label` shows the literal Sandia formula with substituted values, e.g. `28 + 600×exp(-3.56+-0.075×3.0) = 41.9 °C`. Useful for engineering review.
- **Live tracker preview label**: `_trk_dim_label` updates aperture / N-S length / GCR / modules-per-tracker as you change spin boxes. Implicit teaching aid.
- **Satellite water detection** ([`core/satellite_water_detector.py`](/Users/arunkpatra/codebase/PVlayout_Advance/core/satellite_water_detector.py), [`gui/satellite_detection_dialog.py`](/Users/arunkpatra/codebase/PVlayout_Advance/gui/satellite_detection_dialog.py), [`gui/water_body_mode_dialog.py`](/Users/arunkpatra/codebase/PVlayout_Advance/gui/water_body_mode_dialog.py)) — fully implemented, fetches Esri World Imagery tiles, vectorises water pixels, opens a two-phase preview dialog. Currently **disabled at the call site** (`_water_detect_mode = "kmz"` hard-coded in `_browse_kmz`, comment: "Satellite water-body detection is currently OFF. Water bodies are taken from KMZ-defined polygons only"). Retained in code, presumably toggled back on in a future product decision.
- **Hidden AC capacity / DC-AC ratio columns** — `FEATURE_AC_DC` short-circuits `False` regardless of entitlements; full implementation ships dark.
- **No CLI flags / env vars / config files**: the entry points use `sys.argv` only to construct `QApplication` (Qt-required); nothing app-specific is parsed. No `QSettings`, no dotenv, no JSON/YAML config. The only persistent state is the keyring entry. This is a clean slate for the new app.
- **Two parallel quota paths**: the entitlements re-fetch on every Generate (~200 ms latency) is intentional — the same key may be active on multiple machines, so local cache is treated as stale. Worth preserving.
- **Cable-calc warning dialog**: enabling the cable checkbox triggers a "performance notice" with "Enable Now" / "Not Now (Recommended)" — implicit guidance that cable routing is slow on large sites.
- **GHI file format reminder dialog**: switching weather source to "Hourly GHI file (CSV)" pops a 3-column-format reminder modal.
- **Tests for auth only**: `tests/auth/{test_key_store, test_license_client, test_workers}.py`. No tests for the GUI or domain logic in the legacy repo.

---

## 7. What's already covered by the parity sweep

The parity sweep landed `core/`, `models/`, `utils/` verbatim into [`python/pvlayout_engine/pvlayout_core/`](/Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/) and exposed several routes via FastAPI ([`pvlayout_engine/routes/`](/Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_engine/routes/)).

Domain modules confirmed ported (file-for-file):
- `core/kmz_parser.py` (incl. `validate_boundaries`, water-keyword detection)
- `core/layout_engine.py`, `core/tracker_layout_engine.py`, `core/spacing_calc.py`
- `core/icr_placer.py`, `core/road_manager.py`, `core/la_manager.py`
- `core/string_inverter_manager.py`
- `core/energy_calculator.py`, `core/solar_transposition.py`, `core/pvgis_file_parser.py`
- `core/pan_parser.py`, `core/ond_parser.py`
- `core/kmz_exporter.py`, `core/dxf_exporter.py`, `core/pdf_exporter.py`
- `core/satellite_water_detector.py` (ported even though disabled in legacy UI)
- `core/edition.py` (build-time edition flags — likely unused in new app, but copied for parity)
- `models/project.py`, `utils/geo_utils.py`

Sidecar routes that exist today: `dxf`, `kmz`, `layout`, `pdf`, `session`, `water`. The HTTP surface partially mirrors the layout + export + boundary-validation operations that the legacy GUI invokes synchronously.

**So everything below the GUI line is done.** The job ahead is the GUI layer + the orchestration the GUI performed (workers, dialogs, banners, gating UI, drag interactions, persistence).

---

## 8. What's NOT covered — the post-parity work surface

Major gap categories, ordered roughly by surface area:

1. **Application shell & navigation** — Tauri window chrome, menu bar (File, Help — and likely more in modern app), keyboard shortcuts (Ctrl+N, Ctrl+Q, F1 minimum), status bar with quota indicator, license banner, app toolbar with My Account button, multi-window support ("Move to String / Central"), expand-plot dialog equivalent.

2. **Startup flow** — `StartupDialog` equivalent: design type × inverter topology selection. May need to expand into a richer "new project" experience for the modern app since project save/load is on the table.

3. **Left input panel — the form** — the entire `InputPanel` (~1400 LOC of PyQt5) re-expressed as a React form: KMZ input, Module Specifications (manual + PAN load + bifacial), MMS-Table Config (Fixed Tilt) OR Tracker Config (SAT) groups (mutually exclusive), Spacing & Tilt with override checkboxes and live auto-value display, Site Parameters (perimeter road), Inverter (max strings, max SMB for CI, cable-calc toggle with performance warning), Energy Yield (weather source radio + GHI file browse + format reminder dialog, OND load, GHI/GTI/source label, ambient temp, mounting type combo, wind speed, PAN-derived temp model trace, ground albedo, full PR breakdown row by row, degradation, P-values + uncertainty). Many fields have rich tooltips containing engineering guidance that should not be lost.

4. **Right canvas** — Canvas-first map/plot equivalent of the matplotlib `FigureCanvas`: render boundaries, panel tables, ICRs, string inverters/SMBs, LAs + protection circles, DC and AC cable runs (with deduplication of shared trunk segments), obstructions, water bodies, plant labels, proportional label sizing, navigation toolbar (pan/zoom/reset), expand-plot detached window, layered visibility controls. ADR-0002 already commits to MapLibre + deck.gl — but the legacy MPL semantics (UTM coords, dual-zoom redraws, label sizing rules) need a faithful translation.

5. **Drawing & editing tools**:
   - **ICR drag-and-drop** (`ICRDragger`): hit-test, semi-transparent dragging, validity check via `usable_polygon`, snap-back on invalid drop, on-accept layout rebuild via `recompute_tables`. This is the headline differentiator.
   - **Obstruction rectangle tool** (click-and-drag with live preview).
   - **Obstruction polygon tool** (click vertices, double-click or right-click to close, ≥3 pts, dashed preview).
   - **Undo last / Clear all** for obstructions.
   - **Cable visibility toggles** (AC, DC).
   - **LA visibility toggle**.

6. **Summary tables** (right side, below canvas): the highly dynamic per-edition + per-design-type column-layout summary table; the monthly IEC 61724-1 breakdown table (12 months + Annual). Both update on every layout / energy / ICR move / obstruction change. Color-coded plant rows + TOTAL row.

7. **Long-running operations UX**: the `AnalysisOverlay` pattern — full-window dim with progress card, asymptotic progress bar, elapsed timer, two-phase ("Generating Layout" → "Calculating Cable Routes"), cable-mode slow creep. Operations that need this: Generate Layout, Cable calculation, PVGIS fetch, Calculate Energy, 15-min CSV export, satellite detection (when re-enabled).

8. **Modal dialogs**:
   - StartupDialog (design + topology cards).
   - HelpDialog (multi-tab F1 help — content can be reflowed as a modern docs surface).
   - KmzHelpDialog (KMZ prep guide).
   - BoundaryValidationDialog (open-ring exclusion list).
   - CableCalcWarningDialog (performance notice).
   - GHIFileFormatReminder (3-column reminder).
   - EnergyTimeSeriesWindow (daily chart with year-day slider, crosshair, hover annotation, energy + GTI panes).
   - WaterBodyModeDialog + SatelliteDetectionDialog (currently disabled — design decision needed on whether to re-enable in the new app).
   - LicenseKeyDialog + LicenseInfoDialog ("My Account" surface).

9. **Entitlements integration**:
   - Keyring storage (`solarlayout` / `license_key`) — equivalent in Tauri using OS keychain bindings.
   - `GET /entitlements` re-fetch on every Generate.
   - `POST /usage/report` after every successful layout (all plans).
   - 401 → clear key + banner; 402 → red banner; network error → fail-open.
   - Quota label in status bar (number + red at 0).
   - License banner (yellow / red).
   - "My Account" button toggling.
   - Fail-open behaviour when no key is loaded.
   - Feature-key gating across the entire UI (cables / DXF / energy / icr_drag / ac_dc / obstructions). New app must source feature keys from the renewable_energy backend per ADR-0005 — *not* re-invent the legacy strings.

10. **Export workflows**: file-save dialogs for KMZ, DXF, PDF, 15-min CSV. PDF requires the layout figure — in the new app, the canvas-rendered scene must be captured for PDF. The current sidecar route `/pdf` accepts the data but the matplotlib-based PDF generator runs server-side; the legacy app actually passes the live `Figure` to `export_pdf` for page-1 rendering, which is a coupling to remove.

11. **Energy time-series chart** (`EnergyTimeSeriesWindow`): two stacked daily plots, year-day slider (0–364), crosshair with hover annotation showing time + energy + GTI, monthly day-list combo. This is a substantial visualisation surface in its own right.

12. **Persistence beyond license key**: the legacy app persists *only* the license key. Modern desktop user expectations include project save/load, recent files, "remember last KMZ folder", remembered window size/position, theme preference, default unit / mounting / albedo values, etc. None of this exists in legacy and all of it is fair game for the new app's design.

13. **Theme & polish**: legacy is pure stock Qt with hand-tuned hex stylesheets per widget. The new app has the Claude-Desktop quality bar; nothing about the visual language transfers.

14. **Help / About**: Help is a static multi-tab `HelpDialog`; there is no About dialog (no version, no license terms, no third-party-attributions surface). Modern app needs both — and likely a more navigable docs experience than the tab dialog.

15. **Settings / preferences surface**: legacy has none. New app should at minimum surface theme, unit defaults, telemetry/analytics opt-in (separate from license-required calculation reporting), default export folder, last-used parameters, optional offline-first behaviour rules.

---

## 9. Open questions / surprises

1. **Satellite water detection — ship it or drop it?** The full pipeline is implemented and ported into `pvlayout_core`, but disabled in legacy with the comment "currently OFF". This is a real product decision for Prasanta: do we re-enable in the new app (with a `WaterBodyModeDialog`-style mode picker) or drop? If we keep, network access + tile-server attribution becomes a concern.

2. **`FEATURE_OBSTRUCTIONS` is dead-keyed.** The string is defined but `_apply_entitlement_features` always sets `_obstruction_section` visible. New app should either honor the gate or remove the key from the registry. (Per ADR-0005 we shouldn't ship dead feature keys.)

3. **`FEATURE_AC_DC` ships dark in all plans** — `_has_feature(FEATURE_AC_DC)` short-circuits `False`. Is this a "wired but not yet released" feature? If so, post-parity is the time to either ship or excise.

4. **DXF gating special case** — DXF is granted whenever Energy is granted, even if `dxf_export` isn't returned. Is this a backwards-compat hack or intentional bundling? Worth a contract conversation with the entitlements API owner.

5. **No project file format.** This is the single biggest UX gap. A user who loads a KMZ, sets 30+ inputs, generates, and drags ICRs has no way to come back tomorrow. Decision: introduce a project file (suggested `.pvproj` / JSON) in the new app? If yes, what's the schema, do we version it, and do we save the layout result or only the inputs?

6. **No global undo/redo.** Only obstructions have undo. ICR drag, parameter changes, weather source changes — none are reversible. The Cmd-Z expectation in a modern desktop app is universal; explicit decision needed on undo scope.

7. **Two simultaneous `MainWindow`s.** Real feature, used to compare String vs Central topologies. In the new app: do we replicate as multiple windows (Tauri allows it), as a single-window "compare mode" with two canvases, or as tabs? Material UX decision.

8. **Auto-fetch on Generate quota check.** Every Generate triggers a network round-trip to `api.solarlayout.in` before computation. This is per-design (multi-machine quota staleness) but the offline UX is "fail-open and proceed". Worth a explicit ADR if not already covered.

9. **PDF coupling to live figure.** `export_pdf(self._results, self._params, path, layout_figure=self.figure, …)` — page 1 of the PDF *is* the live matplotlib figure. In the new app the canvas is React+MapLibre, not MPL. PDF generation either needs a server-side re-render (existing `pdf` route does this) or a canvas-snapshot approach. Engineering decision.

10. **No "About" dialog, no version display.** Users in regulated industries often need to record the software version on their report. The PDF exporter sets a header but no clear app-version is exposed in the UI. Add to scope.

11. **Tooltip-heavy domain knowledge.** `InputPanel` tooltips encode hours of solar engineering guidance (Sandia coefficients, μ_Pmpp interpretation, P-value lender's case definitions, etc.). They are content as much as UX — worth a content-audit pass when re-implementing.

12. **Plant-AC capacity columns lurking.** The AC/DC ratio computation runs (`_compute_dc_ac_ratios`) and stores values on every result, but the columns are hidden. Either ship or remove during cleanup.

13. **Cable performance warning.** The "cable calculation can be slow" warning is a UX patch over a perf issue. New app could either keep the warning, fix the underlying perf, or move cable-calc to an explicit later step rather than a checkbox at form-submit time.

14. **Boundary-validation strictness.** Only plant boundaries with open rings are surfaced; water/obstacle self-intersections are silently auto-repaired. This is a sensible default but invisible to the user — should we expose a "what was repaired?" log somewhere?

15. **Single edition concept's runtime debt.** `core/edition.py` (the enum) and the API feature-key constants in `gui/main_window.py` are two parallel taxonomies. Single-app paradigm + ADR-0005 mean we should retire the enum entirely on the new app side and make API feature keys the only source of truth. Legacy `core/edition.py` is still used by `core/pdf_exporter.py` — minor but real coupling to clean up.

---

**End of audit.** ~3,100 words.
