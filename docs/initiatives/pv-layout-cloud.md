# Initiative: PV Layout Engine — Cloud Platform Port

**Status:** In Progress  
**Created:** 2026-04-19  
**Spike plan:** [pv-layout-spike-plan.md](./pv-layout-spike-plan.md)  
**Primary reference:** This document is the authoritative source for all work on this initiative. All architecture, spike, and implementation decisions must trace back to it.

---

## Living Document Policy

This document and the spike plan must never go out of sync with each other or with the codebase.

**Update this document when:**
- A functional requirement changes (new behavior, changed default, dropped feature)
- A new input parameter or output artifact is added or removed
- A technical constraint changes (e.g., new AWS service, different runtime)
- A scope decision is made (something moved in or out of scope)
- A future phase is promoted to current scope

**Update the spike plan when:**
- A spike is started, completed, or blocked (update status)
- A decision is made during a spike that affects future spikes (record in Decisions Log)
- A spike's scope changes
- A new spike is added

**Rule:** If you change something in one document that is referenced in the other, update both in the same commit. Never leave the two documents inconsistent.

---

## 1. Purpose and Context

A veteran solar engineer has produced a fully working Python desktop GUI application (`PVlayout_Advance`) that performs automated solar PV plant layout design. The application takes a KMZ site boundary file and engineering parameters as input and produces a complete layout with energy yield estimates and three export formats.

This initiative ports every capability of that Python application into the SolarDesign cloud platform — delivered as a cloud-native, web-based experience. The scope is the Python app's capabilities exactly. Nothing is added; nothing is removed.

**Source of truth for all functional behavior:** The Python app at `/Users/arunkpatra/codebase/PVlayout_Advance`. When in doubt about how something should behave, read the Python code — the engineer who built it is a domain expert and every behavior, default, and output format is intentional.

---

## 2. Scope

### In scope

Everything the Python desktop app currently does:

- KMZ file parsing (multi-boundary, exclusion zones, line obstructions)
- Coordinate projection (WGS84 → UTM, auto zone selection, global)
- Setback computation (perimeter road, transmission line corridor buffer)
- Shadow-free row pitch calculation (winter solstice solar noon formula)
- Tilt angle recommendation (latitude-based formula)
- Rectangular grid table placement within usable polygon
- ICR (Inverter Control Room) building placement (18 MWp per ICR rule)
- String inverter clustering (K-means) and placement
- DC cable routing (table → inverter)
- AC cable routing (inverter → ICR, Manhattan router)
- Lightning arrester grid placement with 100 m protection radius guarantee
- Energy yield calculation (PVGIS / NASA POWER irradiance fetch, 25-year model, full PR breakdown)
- Output: KMZ export (Google Earth)
- Output: PDF export (layout drawing + summary stats + energy report)
- Output: DXF export (CAD-compatible, UTM coordinates)
- Output: SVG layout preview with layer controls (AC cables, lightning arresters)
- Output: Rich stats dashboard (all layout + energy stats)

### Explicitly out of scope for this initiative

- Single-axis tracker layout (not in Python app)
- SLD (Single Line Diagram) generation
- IS 732 / IS 1255 cable schedules
- ALMM equipment library
- BoM / BoQ generation
- P75 / P90 simulation (Python app computes P50 only via PVGIS)
- Multi-scenario comparison
- Interactive canvas editing (drag ICRs, draw obstructions) — V2
- Multi-user / org / workspace support — separate initiative
- Email notifications — separate initiative
- Marketing copy update for global positioning — separate initiative

---

## 3. Users

Single-user platform for this initiative. No org/workspace/team model.

**Who they are:** Design engineers, EPC contractors, IPPs, and solar consultants — veteran practitioners who have used PVsyst, AutoCAD, and Excel in parallel and know exactly what they need. The engineer who built the Python app is the canonical representative user.

**What they bring to each session:** A KMZ file from the land or BD team, module specs, table configuration, and target design parameters. They know their site, they know solar, they do not need onboarding hand-holding on the domain — only on the platform.

---

## 4. Product Model

### 4.1 Projects

A **project** is the named outer shell for a site. It is persistent, identifiable, and long-lived. One KMZ file is associated with a project (the site boundary is the identity of the project). Users can update the project's KMZ when the land team delivers a revised boundary.

### 4.2 Versions (Runs)

Every generation run — whether triggered by a KMZ change, a parameter change, or a simple re-run — produces a new **version** of the project. Versions are immutable snapshots:

- Full input state: KMZ file + all parameter values at time of submission
- Full output state: all generated artifacts
- Labelled sequentially: v1, v2, v3 … with the most recent always marked **latest**

Users can inspect any prior version, compare parameters between versions, and download artifacts from any version. Nothing is ever overwritten.

### 4.3 Jobs (Internal)

Each version is backed by one or two **jobs** internally:

- **Layout job:** Runs the Python layout engine (KMZ parse → setbacks → grid placement → ICR → string inverters → cable routing → LAs → KMZ/DXF/SVG export)
- **Energy job:** Fetches irradiance from PVGIS or NASA POWER and computes the 25-year energy yield + PDF export

From the user's perspective, these are one work unit — one version. Internally they are separate jobs so each can be retried independently if it fails. Both must complete (or one fail definitively) before the version is considered settled.

---

## 5. Async Job Pipeline (High-Level)

```
User submits run (parameters + KMZ reference)
  → Hono API uploads KMZ to S3
  → Hono API writes Version record (status: QUEUED) to PostgreSQL
  → Hono API writes LayoutJob record (status: QUEUED) to PostgreSQL
  → [Local dev, USE_LOCAL_ENV=true]  Hono POST http://localhost:8000/layout — fire and forget → 202 Accepted
  → [Prod, USE_LOCAL_ENV=false] Hono sends { version_id } to SQS layout queue — fire and forget
  → Hono returns { versionId, status: "queued" } to UI immediately
  → UI reflects "queued" state and begins polling

Layout engine runs (local: Python HTTP server at port 8000; prod: Lambda via SQS):
  → Updates LayoutJob in DB: QUEUED → PROCESSING
  → Updates Version in DB: QUEUED → PROCESSING
  → Downloads input KMZ from S3
  → Runs full layout pipeline
  → Generates KMZ + SVG + DXF artifacts
  → Uploads artifacts to S3
  → Updates LayoutJob in DB: PROCESSING → COMPLETE (artifact S3 keys + statsJson)
  → Updates Version in DB: PROCESSING → COMPLETE
  → [Prod only] Enqueues { version_id } to SQS energy-jobs queue
  → On any error: LayoutJob = FAILED (errorDetail), Version = FAILED

Energy engine runs (prod: Lambda via SQS — added in Spike 7):
  → Fetches irradiance (PVGIS / NASA POWER)
  → Computes 25-year energy yield
  → Writes PDF artifact to S3
  → Updates EnergyJob in DB: COMPLETE (pdf S3 key + statsJson)
  → Updates Version in DB: COMPLETE (overall)

UI polls GET /projects/:id/versions/:versionId
  → Shows results: SVG preview + stats dashboard + download links
```

**DB ownership:** Hono API owns only the initial QUEUED writes. All subsequent state — status transitions, artifact S3 keys, statsJson, errorDetail — is written by the Python engine directly via psycopg2. Hono never polls or updates job status after firing the job.

**Retry semantics:** Lambda failures trigger SQS visibility timeout → automatic retry. Each job retries independently. Failed versions are marked with status and error detail — user can re-trigger.

**Notifications:** In-app only (status polling). Email notifications are a future initiative.

---

## 6. Functional Requirements

### 6.1 KMZ Parsing

**Source:** `core/kmz_parser.py`

- Accept KMZ (ZIP archive containing `doc.kml`) or raw KML files
- Parse all `<Placemark>` elements: `<Polygon>` and `<LineString>` geometries
- Classify polygons by spatial containment: a polygon fully contained within another is an obstacle (exclusion zone) of its parent boundary polygon
- If all polygons classify as obstacles (fallback), treat the largest polygon as the sole site boundary
- Associate `<LineString>` elements (transmission lines, canals) with the boundary polygon whose midpoint they fall inside
- Support multiple independent site boundaries within a single KMZ — all processed in one job
- Return: list of `BoundaryInfo` objects (boundary polygon + obstacle polygons + line obstructions) + overall site centroid (lat/lon)

### 6.2 Coordinate Handling

**Source:** `utils/geo_utils.py`

- All internal geometry operates in UTM metres (not WGS84 degrees)
- UTM zone auto-selected from site centroid:
  - `zone_number = int((lon + 180) / 6) + 1`
  - `EPSG = 32600 + zone_number` (northern hemisphere)
  - `EPSG = 32700 + zone_number` (southern hemisphere)
- `pyproj.Transformer` with `always_xy=True` for all WGS84 ↔ UTM conversions
- Global from day one — no geographic restrictions
- KMZ exports convert back to WGS84; DXF exports use raw UTM metres

### 6.3 Setback Computation

**Source:** `core/layout_engine.py`

- Perimeter road setback: `usable = boundary.buffer(-road_width_m)` using Shapely `buffer` with mitre join style
- Obstacle exclusion: subtract all obstacle polygons via `shapely.ops.unary_union` + `difference`
- Transmission line corridor: 15 m buffer around each `LineString` obstacle, subtracted from usable area
- Constant: `TL_SETBACK_M = 15.0`

### 6.4 Row Spacing and Tilt Calculation

**Source:** `core/spacing_calc.py`

**Tilt recommendation (auto-mode):**
```
tilt_deg = 0.76 × |latitude| + 3.1
clipped to [5°, 40°]
```

**Shadow-free pitch formula:**
```
solar_elevation = 90° - |latitude| - 23.45°    # winter solstice noon
pitch_m = table_height × cos(tilt) + table_height × sin(tilt) / tan(solar_elevation)
```
Guarantees zero inter-row shading at solar noon on the worst day of the year.

**GCR override:** If user provides GCR, `pitch_m = table_height / GCR`

**User pitch override:** If user provides pitch directly, the formula is bypassed.

**Table dimensions (derived from module + config):**
- Portrait orientation: `table_width = module_short × modules_in_row`, `table_height = module_long × rows_per_table`
- Landscape orientation: `table_width = module_long × modules_in_row`, `table_height = module_short × rows_per_table`

### 6.5 Grid Placement

**Source:** `core/layout_engine.py`

- Sweep rows South → North at `pitch_m` intervals
- Within each row, sweep West → East at `(table_width + table_gap_ew)` intervals
- Each candidate table is a Shapely `Polygon` (axis-aligned rectangle)
- Placement criterion: `usable_polygon.contains(table_box)` — entire table must be inside usable area
- Grid is strictly E-W / N-S aligned (no azimuth rotation in V1)

### 6.6 ICR Placement

**Source:** `core/icr_placer.py`

- ICR count: `ceil(total_capacity_mwp / 18)` — one ICR per 18 MWp
- ICR size: 40 m (E-W) × 14 m (N-S)
- Placement strategy: divide usable polygon into N equal E-W zones; place each ICR at N-S centre of its zone, searching ±50 m outward in 1 m steps for a valid interior position
- All tables whose bounding box intersects any ICR rectangle are removed
- Capacity stats are recalculated after ICR clearance

### 6.7 String Inverter Placement

**Source:** `core/string_inverter_manager.py`

**Sizing:**
```
string_kwp = modules_in_row × wattage_wp / 1000
strings_per_table = rows_per_table
tables_per_inverter = max_strings_per_inverter // strings_per_table
num_inverters = ceil(num_tables / tables_per_inverter)
inverter_capacity_kwp = max_strings_per_inverter × string_kwp
inverters_per_icr = 18,000 / inverter_capacity_kwp
```

**Clustering:** Pure-Python K-means. Seeds initialised by sorting tables diagonally (x + y) and taking evenly-spaced samples. Converges to `num_inverters` clusters.

**Inverter placement:** Each inverter (2 m × 1 m) placed within the nearest row-gap band to the cluster centroid. Row gaps detected by comparing consecutive row bottom coordinates. Scans ±30 m from centroid X for a valid interior position not overlapping any table.

**ICR assignment:** Inverters assigned to nearest ICR with capacity balancing — each ICR gets at most `ceil(num_inverters / num_icrs)` inverters.

### 6.8 Cable Routing

**Source:** `core/string_inverter_manager.py`

**DC cables (table → inverter):** Same Manhattan router as AC cables. Cable length = `(path_length + 10 m) × strings_per_table` (10 m overhead for table-plane routing).

**AC cables (inverter → ICR) — Manhattan router:** Six progressive patterns tried in order:
1. V→H→V through nearest row gap
2. H→V→H→V (horizontal escape first)
3. V→H→V with horizontal escape at ICR end
4. H→V→H→V→H→V (escapes at both ends)
5. Two row-gap V→H→V→H→V
6. Exhaustive 2-waypoint search through sampled interior points

Each segment validated: intersection with usable polygon must cover ≥99.9% of segment length. Always returns a path (fallback to centroid-via path).

### 6.9 Lightning Arrester Placement

**Source:** `core/la_manager.py`

- LA footprint: 40 m × 14 m (same as ICR)
- Protection radius: 100 m per unit
- Grid spacing: 100 m, centred on polygon centroid, extended to cover polygon bounds
- Only grid points whose centre falls inside usable polygon are kept
- Coverage guarantee: every table centre must be within 100 m of at least one LA — uncovered tables get an additional LA at the nearest valid interior point
- Tables overlapping any LA rectangle are removed
- Capacity stats recalculated after LA clearance

### 6.10 Energy Yield Calculation

**Source:** `core/energy_calculator.py`

**Irradiance sources (in priority order):**
1. PVGIS 5.2 `PVcalc` endpoint — returns GTI (in-plane) and GHI directly for site lat/lon, tilt, and azimuth
2. NASA POWER climatology — returns monthly GHI, summed to annual, tilted using Hay-Davies model
3. Manual entry — user provides GHI and GTI directly

**Performance Ratio:**
```
PR = (inverter_eff/100)
   × (1 - dc_loss/100)
   × (1 - ac_loss/100)
   × (1 - soiling/100)
   × (1 - temp_loss/100)
   × (1 - mismatch/100)
   × (1 - shading/100)
   × (availability/100)
   × (1 - transformer_loss/100)
   × (1 - other_loss/100)
```

**25-year energy model:**
```
specific_yield = GTI × PR                          (kWh/kWp/yr)
Year 1 (before LID) = capacity_kWp × specific_yield
Year 1 (actual) = Year 1 × (1 - first_year_LID_pct/100)
Year N (N ≥ 2) = Year 1 × (1 - annual_deg_pct/100)^(N-1)
CUF = Year1_kWh / (capacity_kWp × 8760) × 100
Lifetime energy = sum of Year 1 through Year 25
```

---

## 7. Input Parameters

All parameters the Python app exposes are exposed in V1. Same defaults as the Python app. User overrides only what they need.

### Module Specification

| Parameter | Default | Range | Notes |
|---|---|---|---|
| Module long side | 2.38 m | 0.5–5.0 m | |
| Module short side | 1.13 m | 0.5–3.0 m | |
| Wattage | 580 Wp | 100–1000 Wp | |

### Table Configuration

| Parameter | Default | Options/Range | Notes |
|---|---|---|---|
| Orientation | Portrait | Portrait / Landscape | Determines which dimension faces which axis |
| Modules per row | 28 | 1–100 | Along table width (E-W) |
| Rows per table | 2 | 1–10 | Along table height (N-S); also = strings per table |
| E-W gap between tables | 1.0 m | 0–20 m | Gap within same row |

### Layout Parameters

| Parameter | Default | Notes |
|---|---|---|
| Tilt angle | Auto | Auto = `0.76 × |lat| + 3.1`, clipped to [5°, 40°] |
| Row pitch | Auto | Auto = shadow-free formula from tilt and latitude |
| GCR | — | Alternative to pitch; overrides shadow formula if provided |
| Perimeter road width | 6.0 m | Applied as inward boundary setback |

### Inverter Configuration

| Parameter | Default | Notes |
|---|---|---|
| Max strings per inverter | 20 | Controls how many tables cluster to one inverter |

### Energy Parameters

| Parameter | Default | Notes |
|---|---|---|
| GHI (kWh/m²/yr) | Fetched | Set to 0 to trigger auto-fetch from PVGIS |
| GTI in-plane (kWh/m²/yr) | Fetched | Set to 0 to trigger auto-fetch from PVGIS |
| Inverter efficiency | 97% | |
| DC cable losses | 2% | |
| AC cable losses | 1% | |
| Soiling losses | 4% | |
| Temperature losses | 6% | |
| Module mismatch | 2% | |
| Shading losses | 2% | |
| Plant availability | 98% | |
| Transformer losses | 1% | |
| Other losses | 1% | |
| First-year LID degradation | 2% | Applied to Year 1 only |
| Annual degradation | 0.5%/yr | Compounded from Year 2 onwards |
| Plant lifetime | 25 years | |

### `inputSnapshot` Key Reference

Every `Version` record stores a complete `inputSnapshot` at submission time. The snapshot is immutable after creation. The following table maps every key to its Python source field, TypeScript type, and default value.

The full TypeScript type is `LayoutInputSnapshot` in `packages/shared/src/types/project.ts`.

| Key | Python field | Type | Default | Notes |
|-----|-------------|------|---------|-------|
| `module_long` | `ModuleSpec.long_side` | `number` | 2.38 | Module long dimension, metres |
| `module_short` | `ModuleSpec.short_side` | `number` | 1.13 | Module short dimension, metres |
| `wattage_wp` | `ModuleSpec.wattage` | `number` | 580 | Module rated power, Wp |
| `orientation` | `TableConfig.orientation` | `"portrait" \| "landscape"` | `"portrait"` | Portrait = long side N-S |
| `modules_in_row` | `TableConfig.modules_in_row` | `number` | 28 | Modules along table width (E-W) |
| `rows_per_table` | `TableConfig.rows_per_table` | `number` | 2 | Rows along table height (N-S); = strings/table |
| `table_gap_ew` | `TableConfig.gap_ew` | `number` | 1.0 | E-W gap between adjacent tables, metres |
| `tilt_deg` | `LayoutParams.tilt_deg` | `number \| null` | `null` | `null` = auto (0.76×\|lat\|+3.1, clipped 5–40°) |
| `row_pitch_m` | `LayoutParams.row_pitch` | `number \| null` | `null` | `null` = auto (shadow-free formula); overridden by GCR if set |
| `gcr` | `LayoutParams.gcr` | `number \| null` | `null` | `null` = not set; overrides shadow formula → pitch = table_height / GCR |
| `road_width_m` | `LayoutParams.road_width` | `number` | 6.0 | Perimeter road setback, metres |
| `max_strings_per_inverter` | `InverterConfig.max_strings` | `number` | 20 | Controls inverter cluster size |
| `ghi_kwh_m2_yr` | `EnergyParameters.ghi` | `number` | 0 | 0 = auto-fetch from PVGIS |
| `gti_kwh_m2_yr` | `EnergyParameters.gti` | `number` | 0 | 0 = auto-fetch from PVGIS |
| `inverter_eff_pct` | `EnergyParameters.inverter_eff` | `number` | 97 | Inverter conversion efficiency % |
| `dc_loss_pct` | `EnergyParameters.dc_loss` | `number` | 2 | DC cable resistive losses % |
| `ac_loss_pct` | `EnergyParameters.ac_loss` | `number` | 1 | AC cable resistive losses % |
| `soiling_pct` | `EnergyParameters.soiling` | `number` | 4 | Soiling losses % |
| `temp_loss_pct` | `EnergyParameters.temp_loss` | `number` | 6 | Temperature losses % |
| `mismatch_pct` | `EnergyParameters.mismatch` | `number` | 2 | Module mismatch losses % |
| `shading_pct` | `EnergyParameters.shading` | `number` | 2 | Near-horizon shading losses % |
| `availability_pct` | `EnergyParameters.availability` | `number` | 98 | Plant availability % |
| `transformer_loss_pct` | `EnergyParameters.transformer_loss` | `number` | 1 | Transformer losses % |
| `other_loss_pct` | `EnergyParameters.other_loss` | `number` | 1 | Other losses % |
| `first_year_lid_pct` | `EnergyParameters.first_year_lid` | `number` | 2 | Year 1 LID % (p-type silicon) |
| `annual_deg_pct` | `EnergyParameters.annual_deg` | `number` | 0.5 | Annual module degradation %/yr |
| `lifetime_years` | `EnergyParameters.lifetime` | `number` | 25 | Plant lifetime for energy forecast |

**Not in snapshot:** `irradiance_source` — set by the energy engine (Spike 7) after irradiance fetch and stored on `EnergyJob.irradianceSource`. It is an engine output, not a user input.

---

## 8. Output Artifacts

### 8.1 KMZ (Google Earth)

One KML folder per boundary containing sub-folders for:
- Boundary polygon (yellow outline, no fill)
- Exclusion zones (red polygons)
- Panel tables (blue filled rectangles, labelled R{row}-T{col})
- ICR buildings (blue, with dimensions in description)
- String inverters (lime green)
- Lightning arresters (dark red rectangles with labels)
- Summary placemark at boundary centroid (HTML description with all stats)
- Overall Summary folder for multi-boundary sites

### 8.2 PDF

Three pages:
- **Page 1:** A3 landscape layout drawing. Shows: boundary, obstacles, tables, ICRs, inverters, LA rectangles and labels. DC/AC cables and LA protection circles are hidden in PDF.
- **Page 2:** Summary report. Per-boundary table: area (acres), tables placed, total modules, capacity (MWp), row pitch, GCR achieved, ICR count, string inverter count, inverter capacity (kWp), DC cable length, AC cable length, LA count. Plus design parameters table and string inverter summary table.
- **Page 3:** Energy yield report (if energy calculation completed). Irradiance inputs, PR breakdown table, per-plant energy summary, 25-year generation forecast table.

### 8.3 DXF (CAD)

Format: R2010, coordinates in UTM metres. Layers:
- `BOUNDARY` (yellow)
- `OBSTACLES` (red)
- `TABLES` (blue)
- `ICR` (cyan)
- `OBSTRUCTIONS` (green)
- `INVERTERS` (lime)
- `DC_CABLES` (orange)
- `AC_CABLES` (magenta, deduplicated shared corridor segments)
- `LA` (dark red, rectangles + protection circles)
- `ANNOTATIONS` (labels and text)

### 8.4 SVG Layout Preview

- Rendered by matplotlib with `gid`-tagged layer groups
- Named groups: `boundary`, `obstacles`, `tables`, `icrs`, `inverters`, `dc-cables`, `ac-cables`, `la-footprints`, `la-circles`, `annotations`
- Served to frontend for zoom/pan interaction
- Client-side layer toggles (no server round-trip):
  - **AC Cables** — hidden by default, user can toggle on
  - **Lightning Arresters** — hidden by default, user can toggle on
- Default state (toggles off) matches the PDF layout view

### 8.5 Stats Dashboard (In-App)

Displayed alongside the SVG preview in the job results view. All stats below per boundary plus site totals for multi-boundary sites.

**Layout stats:**
- Total area (acres)
- Tables placed
- Total modules
- Total capacity (MWp DC)
- Row pitch (m) and GCR achieved
- ICR count
- String inverter count
- Inverter capacity (kWp)
- DC cable total length (m)
- AC cable total length (m)
- Lightning arrester count

**Energy stats** (shown once energy job completes):
- Irradiance source (PVGIS / NASA POWER / manual)
- GHI (kWh/m²/yr)
- GTI in-plane (kWh/m²/yr)
- Overall PR
- Specific yield (kWh/kWp/yr)
- Year 1 energy (MWh)
- CUF (%)
- 25-year lifetime energy (MWh)

---

## 9. UX Principles (This Initiative)

1. **Modern, not clunky.** Users are migrating from PVsyst + AutoCAD + Excel. The platform must feel demonstrably better — faster to understand, faster to use, zero re-entry of data.

2. **Fully responsive.** All views function correctly from desktop down to tablet. No mobile-only restrictions, no horizontal scroll hacks.

3. **Tooltips and popovers as first principle.** Every input parameter has a tooltip or popover explaining what it means, what the default is, and when to override it. This is not optional UX polish — it is a core feature. Engineers new to the platform should need no external documentation to understand the parameter form.

4. **Defaults pre-filled, overrides optional.** The parameter form arrives pre-populated with sensible defaults. The user changes only what is non-standard for their site. No empty forms to fill.

5. **V1 is configure-and-generate. V2 is interactive.** V1 architecture must not foreclose V2. The layout data model, the SVG layer structure, and the API contract should be designed with future interactivity in mind — even though V1 does not implement it.

6. **Jobs are transparent.** The user always knows: what state is their version in (queued / processing / complete / failed), which step is running (layout or energy), and why it failed if it fails.

7. **Multi-section parameter forms use a sticky section-jump nav.** When a form has 5+ labelled sections (e.g., the version submission form's 27 parameters), the layout is: sticky left-nav on desktop (≥1024 px) listing section names with the submit button always visible; horizontal scrollable chip nav on tablet/mobile with submit at the bottom. This pattern avoids accordion/tab hiding and keeps the engineer oriented without hunting for the submit button. Reference: Spike 4c implementation.

8. **Error messages are domain-specific.** All user-facing error messages follow `[What failed]. [Reason]. [Action].` structure using solar engineering terminology. "Layout run failed: KMZ polygon has no valid interior area after setback." not "500 Internal Server Error". See `docs/brand-voice.md` for the full standard.

---

## 10. Technical Constraints and Principles

1. **Python engine runs in a Dockerized Lambda.** The layout and energy computation is Python (Shapely, pyproj, requests). It runs in AWS Lambda with a Docker container image — not transpiled, not rewritten in TypeScript. The Python codebase is the compute layer.

2. **Lambda independence.** Each job (layout, energy) is an independent Lambda invocation. The platform's Hono API does not call the Lambda directly — it enqueues to SQS. The Lambda reads from SQS, processes, and writes results to PostgreSQL + S3.

2a. **Python owns DB state.** The Hono API writes the initial QUEUED records for Version and LayoutJob/EnergyJob on submit, then fires the job (HTTP in local dev, SQS in prod) and returns immediately. All subsequent DB writes — status transitions (PROCESSING, COMPLETE, FAILED), artifact S3 keys, statsJson, errorDetail — are performed by the Python engine directly using psycopg2-binary (raw SQL, no ORM). Hono never updates job status after the initial dispatch.

3. **Full state saved per version.** Every version record in PostgreSQL stores the complete input snapshot (all parameter values + KMZ S3 reference) and the complete output snapshot (artifact S3 URLs + computed stats). Nothing is recomputed on read.

4. **Artifacts in S3.** KMZ, PDF, DXF, and SVG files are stored in S3. The database stores only S3 URLs. Pre-signed URLs are used for client downloads.

5. **One KMZ per project.** The site boundary (KMZ) is the identity of the project. Multiple runs iterate on parameters against the same KMZ, or a revised KMZ can be uploaded and a new run triggered.

6. **Global coordinate support from day one.** The UTM zone auto-selection from the Python app is preserved. No geographic restrictions are imposed.

7. **No numpy, no pandas, no GDAL.** The Python engine uses stdlib + Shapely + pyproj + requests + simplekml + ezdxf + matplotlib. The Docker image must include these exact dependencies. `ezdxf` is currently missing from `requirements.txt` — this must be fixed before Dockerising.

8. **Spike order for outputs:** KMZ → PDF → DXF. Each is a separate spike.

9. **SVG from the start.** Matplotlib renders SVG (not PNG) so that the frontend can implement layer toggles without a second render. `gid` attributes are set on artists before export to produce named groups.

---

## 11. Known Gaps and Risks

| # | Gap / Risk | Mitigation |
|---|---|---|
| 1 | `ezdxf` missing from Python app's `requirements.txt` | Add to requirements before Dockerising |
| 2 | PVGIS has undocumented rate limits | Implement retry with backoff in energy Lambda; fallback to NASA POWER |
| 3 | AC cable Manhattan router is O(tables²) in worst case | Acceptable for V1 site sizes; profile and optimise before V2 |
| 4 | Matplotlib SVG output is verbose for large sites | Evaluate SVG file size on a 500 MW site; consider gzip compression on S3 |
| 5 | Single UTM zone assumption fails near zone boundaries | Document known limitation; handle gracefully with an error message |
| 6 | Energy Lambda makes synchronous HTTP calls to external APIs | Set explicit timeouts; retry logic; SQS visibility timeout must exceed max retry duration |

---

## 12. Future Phases (Out of Scope for This Initiative)

| Phase | Description |
|---|---|
| **V2: Interactive canvas** | Drag ICRs, draw obstruction polygons, toggle cable/LA visibility, re-generate on edit. SVG layer architecture from V1 is the foundation. |
| **Multi-user / B2B** | Org/workspace model, team members, role-based access, SAML SSO. |
| **Email notifications** | Job completion and failure notifications via Resend. |
| **Single-axis tracker** | Tracker layout mode, E-W orientation, bifacial rear irradiance. |
| **SLD generation** | DISCOM-compliant Single Line Diagram auto-generated from design. |
| **IS cable schedules** | IS 732 / IS 1255 cable sizing per CEIG standards. |
| **ALMM library** | MNRE ALMM-listed module and inverter selection with compliance flag. |
| **BoM / BoQ** | Bill of Materials and Bill of Quantities from design. |
| **P75 / P90 simulation** | Statistical yield exceedance calculations. |
| **Multi-scenario comparison** | Fixed tilt vs. tracker, string vs. central inverter, varying DC:AC ratios. |
| **DPR export** | Lender-ready Detailed Project Report. |
| **Marketing copy update** | Remove India-only positioning; reflect global support. |

---

## 13. Spike Plan

The full spike plan — scope, acceptance criteria, and status for each spike — lives in the companion document:

**→ [pv-layout-spike-plan.md](./pv-layout-spike-plan.md)**

**Summary of spikes (11 total):**

| # | Spike | Depends On |
|---|---|---|
| 1 | Data model (Prisma schema, API endpoints) | Platform foundation |
| 2a | `apps/layout-engine` scaffold (uv, copied core, health check) | Spike 1 |
| 2b | Layout compute local (svg_exporter, handlers, local KMZ test) | Spike 2a |
| 2c | S3 + DB integration (s3_client, db_client, production contract, 202 fire-and-forget) | Spike 2b |
| 3 | Lambda + SQS (prod) + local HTTP wiring (USE_LOCAL_ENV, Dockerfile, ECR, CI/CD) | Spike 2c |
| 4 | Project and version UI (forms, status polling, tooltips) | Spike 3 |
| 5 | SVG preview + stats dashboard (zoom/pan, layer toggles) | Spike 4 |
| 6 | KMZ download | Spike 5 |
| 7 | Energy job (PVGIS/NASA POWER, PDF, 25-year model) | Spike 3 |
| 8 | PDF download | Spike 7 |
| 9 | DXF download | Spike 8 |
| 10 | Error handling and retry UX | Spike 9 |
| 11 | End-to-end production smoke test | Spike 10 |

Do not edit spike details here. All spike detail is owned by the spike plan document. Update both documents in the same commit if a change affects both.
