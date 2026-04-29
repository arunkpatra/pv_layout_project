# Row #9 Spec — Single-axis-tracker layout mode

**PLAN.md row:** [docs/PLAN.md](../../PLAN.md) row #9 (T3).
**Source:** legacy `core/tracker_layout_engine.py` (new file) @ `baseline-v1-20260429` commit `9362083`.
**Acceptance (PLAN.md):** New mode produces output; parity check on a SAT plant; discovery memo committed.

---

## 1. Goal

Port the SAT (Horizontal Single-Axis Tracker) layout engine from legacy into the new app, wire it into `run_layout_multi` via `params.design_type` dispatch, and verify bit-exact parity on real KMZ fixtures via in-process sys.path bootstrap. Capture the solar-domain decisions in a T3 discovery memo for end-of-port review.

This is the first row that adds a wholly new layout pathway — every prior row was a port of a fix or extension to an existing module. Pre-conditions are already met: `LayoutParameters` carries all `tracker_*` fields, `DesignType.SINGLE_AXIS_TRACKER` enum is defined, `LayoutResult` shape is unchanged, and downstream consumers (`place_icrs`, `BoundaryInfo`, `geo_utils`) are already ported.

---

## 2. Port surface — one new file, one dispatch edit

### 2.1 NEW `pvlayout_core/core/tracker_layout_engine.py` (~301 lines)

Verbatim port of legacy `core/tracker_layout_engine.py` @ `9362083`. Single public function:

```python
def run_layout_tracker(
    boundary_wgs84: List[Tuple[float, float]],
    obstacles_wgs84: List[List[Tuple[float, float]]],
    params: LayoutParameters,
    centroid_lat: float,
    centroid_lon: float,
    boundary_name: str = "",
    line_obstructions_wgs84: List[List[Tuple[float, float]]] = None,
    water_obstacles_wgs84: List[List[Tuple[float, float]]] = None,
) -> LayoutResult
```

**Algorithm (identical to legacy):**

1. UTM projection (`get_utm_epsg`, `wgs84_to_utm`).
2. Boundary polygon construction with `_make_valid_poly` repair (same helper as `layout_engine.py`).
3. Perimeter road setback via `boundary.buffer(-road_w, join_style=2)`.
4. (3a) Subtract solid obstacles via `unary_union`/`difference`.
5. (3b) Subtract water obstacles (same pattern).
6. (3c) Buffer line obstructions to `TL_SETBACK_M = 15.0 m` and subtract; append buffered polygons to `obstacle_polygons_wgs84` for downstream cable routing visibility.
7. Tracker unit dimensions:
   - `portrait = (params.tracker_orientation.lower() != "landscape")`
   - `mod_ew = module.length if portrait else module.width`
   - `mod_ns = module.width  if portrait else module.length`
   - `trk_w  = tracker_modules_across × mod_ew`  *(E-W aperture)*
   - `trk_ns = tracker_strings_per_tracker × tracker_modules_per_string × mod_ns`  *(N-S length)*
8. Pitch + step:
   - `pitch_ew = max(trk_w + 0.5, params.tracker_pitch_ew_m)`
   - `ns_step  = trk_ns + params.tracker_ns_gap_m`
9. Placement loop: outer = E-W (`row_index`), inner = N-S (`col_index`). For each candidate `box(x, y, x+trk_w, y+trk_ns)`, append to `placed` if `usable_poly.contains(trk_box)`. The order is the **mirror** of FT layout (FT outer = N-S rows, inner = E-W tables).
10. Initial capacity computed pre-ICR; `place_icrs(placed, total_mwp_pre, usable_poly)` then trims overlapping tables.
11. Post-ICR mutation of `params.table = TableConfig(...)` so `place_string_inverters` can compute strings-per-table.
12. Populate `result.placed_tables`, `result.placed_icrs`, `result.tables_pre_icr`, `result.usable_polygon`, `result.boundary_polygon`, `result.total_modules`, `result.total_capacity_kwp/mwp`, `result.tilt_angle_deg = params.tracker_max_angle_deg`, `result.row_pitch_m`, `result.gcr_achieved = trk_w / pitch_ew`, `result.utm_epsg`, `result.total_area_m2/acres`, `result.net_layout_area_m2`. `result.design_type = DesignType.SINGLE_AXIS_TRACKER`.

**Module-level constant:** `TL_SETBACK_M = 15.0` (matches `layout_engine.py`).

**Helper:** `_make_valid_poly(p)` — verbatim duplicate of the helper in `layout_engine.py` (post-row-#6). Port preserves the duplication; consolidation is a post-parity refactor.

**Import-prefix substitution:** legacy uses `from models.project import …`, `from core.icr_placer import place_icrs`, `from core.kmz_parser import BoundaryInfo`, `from utils.geo_utils import get_utm_epsg, wgs84_to_utm`, plus a lazy `from utils.geo_utils import utm_to_wgs84` inside the line-obstruction block. New app uses `pvlayout_core.X.Y` everywhere.

### 2.2 EDIT `pvlayout_core/core/layout_engine.py:259-290` — `run_layout_multi` dispatch

Replace the unconditional `r = run_layout(...)` with a `params.design_type` branch. Current new-app code:

```python
for i, b in enumerate(boundaries):
    name = b.name if b.name else f"Plant {i + 1}"
    try:
        r = run_layout(
            boundary_wgs84=b.coords,
            obstacles_wgs84=b.obstacles,
            params=params,
            centroid_lat=centroid_lat,
            centroid_lon=centroid_lon,
            boundary_name=name,
            line_obstructions_wgs84=b.line_obstructions,
            water_obstacles_wgs84=getattr(b, "water_obstacles", []),
        )
        results.append(r)
    except Exception as exc:
        ...
```

becomes:

```python
for i, b in enumerate(boundaries):
    name = b.name if b.name else f"Plant {i + 1}"
    try:
        water_obs = getattr(b, "water_obstacles", [])
        if params.design_type == DesignType.SINGLE_AXIS_TRACKER:
            from pvlayout_core.core.tracker_layout_engine import run_layout_tracker
            r = run_layout_tracker(
                boundary_wgs84=b.coords,
                obstacles_wgs84=b.obstacles,
                params=params,
                centroid_lat=centroid_lat,
                centroid_lon=centroid_lon,
                boundary_name=name,
                line_obstructions_wgs84=b.line_obstructions,
                water_obstacles_wgs84=water_obs,
            )
        else:
            r = run_layout(
                boundary_wgs84=b.coords,
                obstacles_wgs84=b.obstacles,
                params=params,
                centroid_lat=centroid_lat,
                centroid_lon=centroid_lon,
                boundary_name=name,
                line_obstructions_wgs84=b.line_obstructions,
                water_obstacles_wgs84=water_obs,
            )
        results.append(r)
    except Exception as exc:
        ...
```

**Lazy import** of `run_layout_tracker` matches legacy and keeps `tracker_layout_engine.py` out of the import path for FT-only callers.

### 2.3 No other touch-points

- `LayoutParameters`: no change — `tracker_*` fields already defined.
- `LayoutResult`: no change — all fields tracker writes already exist.
- `DesignType` enum: no change.
- Sidecar Pydantic schemas (`schemas.py`) and adapters (`adapters.py`): no change — `design_type` already serializes; `LayoutResult` shape unchanged. **No wire-schema passthrough work this row.**
- Sidecar routes (`/layout`, `/refresh-inverters`, `/add-road`): no change — all flow through `run_layout_multi`'s dispatch.

---

## 3. Parity test

**File:** `python/pvlayout_engine/tests/parity/test_tracker_layout_engine_parity.py` (new).

**Pattern:** sys.path bootstrap, in-process cross-compare against legacy `baseline-v1-20260429`. Identical structure to row #6's `test_layout_engine_parity.py`.

### 3.1 Bootstrap helper

Module-scoped fixture `legacy_layout`:
- Skip if `/Users/arunkpatra/codebase/PVlayout_Advance` doesn't exist.
- Purge `sys.modules` entries for `core.`, `models.`, `utils.`.
- Insert `LEGACY_REPO` at `sys.path[0]`.
- Import legacy `core.layout_engine.run_layout_multi`, `core.kmz_parser.parse_kmz`, `models.project.{LayoutParameters, ModuleSpec, DesignType, TableConfig}`.
- Yield callables.
- On teardown, remove `LEGACY_REPO` from `sys.path`, purge again.

### 3.2 Fixtures

Real KMZs from `python/pvlayout_engine/tests/golden/kmz/`:
- `phaseboundary2.kmz` — small, single boundary, no water/obstacles. Validates the SAT placement loop on simple geometry.
- `complex-plant-layout.kmz` — multiple boundaries, water obstacles, line obstructions. Exercises sections 3a + 3b of `run_layout_tracker`.

### 3.3 Test cases

**`test_tracker_module_importable`** — assert `run_layout_tracker` resolves from the new namespace and is callable.

**`test_run_layout_tracker_phaseboundary2_bit_exact(legacy_layout)`** — load `phaseboundary2.kmz` bytes, parse via legacy `parse_kmz` (we trust row-#4's parser parity); build a `LayoutParameters` instance separately for legacy and new with `design_type=DesignType.SINGLE_AXIS_TRACKER` and tracker defaults (`modules_across=1`, `strings_per_tracker=2`, `modules_per_string=28`, `pitch_ew_m=5.5`, `ns_gap_m=2.0`, `max_angle_deg=55.0`, `orientation="portrait"`, `module=ModuleSpec(length=2.278, width=1.134, wattage=540)`); call legacy `run_layout_multi(...)` and new `run_layout_multi(...)` in same process; assert bit-exact equality on:

Per-`LayoutResult` scalars:
- `len(placed_tables)`, `total_modules`, `total_capacity_kwp`, `total_capacity_mwp`
- `gcr_achieved`, `row_pitch_m`, `tilt_angle_deg`
- `total_area_m2`, `total_area_acres`, `net_layout_area_m2`
- `utm_epsg`, `design_type`, `boundary_name`

Per-`PlacedTable` (full list `==`):
- `(x, y, width, height, row_index, col_index)`

Per-`PlacedICR` (full list `==`):
- `(cx, cy, mwp)` — verifies `place_icrs` integration is symmetric

**`test_run_layout_tracker_complex_plant_bit_exact(legacy_layout)`** — identical structure on `complex-plant-layout.kmz`. Iterates over each `LayoutResult` in the returned list (one per boundary) and asserts the same fields per-result. Drives water-subtraction (3a) and line-obstruction setback (3b) inside `run_layout_tracker`.

### 3.4 Tolerance posture

Strict `==` on tuples of floats, integer counts, scalar floats. Per `feedback_bit_exact_parity_assertions.md`, this has held across all prior layout-engine ports. Only loosen if a strict assertion fails and the diff is FP-floor (< ULP × magnitude).

### 3.5 The `params.table` mutation gotcha

`run_layout_tracker` mutates `params.table = TableConfig(...)` at the end. Both legacy and new tests construct their own `params` instance, so the mutation is symmetric and bit-exact equality holds. Document this in the test file's module docstring so future readers don't share a single `params` between legacy and new calls.

---

## 4. T3 discovery memo

**File:** `docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md`.

Same shape as memos 001–004. Required sections:

1. **Background** — row #9, baseline commit `9362083`, two touch-points (new file + dispatch edit) enumerated.
2. **What landed** — file/line citations; pytest count delta; bit-exact verification scope.
3. **Algorithm summary** — short overview of HSAT geometry, axis convention (N-S torque tube), placement loop ordering, ICR reuse.
4. **Open questions / refinement candidates for end-of-port review:**

   a. **Portrait/Landscape docstring contradiction.** Legacy's two comment blocks within `run_layout_tracker` (one before tracker dimensions, one inside the orientation logic) describe the convention differently. Code matches the second comment. Stale docstring; trivial doc-only fix candidate.

   b. **`+ 0.5 m` minimum pitch increment.** Hardcoded floor in `pitch_ew = max(trk_w + 0.5, params.tracker_pitch_ew_m)`. Magnitude unjustified in code. Should be either configurable or documented as industry-standard.

   c. **`result.tilt_angle_deg` overload.** Field is documented as static FT tilt; SAT engine repurposes it to hold `tracker_max_angle_deg`. Adds ambiguity for downstream readers (exporters, UI). Worth either adding `result.tracker_max_angle_deg` or formally documenting the overload.

   d. **`params.table = TableConfig(...)` side-effect** at end of `run_layout_tracker`. Input dataclass mutated as output side-effect. Verbatim-ported as-is; future cleanup would return alongside `LayoutResult` or set `LayoutResult.effective_table_config`.

   e. **`_make_valid_poly` duplication.** Verbatim copies in `layout_engine.py` and `tracker_layout_engine.py`. Post-parity consolidate to `pvlayout_core.utils.geo_utils` or similar.

   f. **`TL_SETBACK_M = 15.0` duplicated** module-level constant (also in `layout_engine.py`). Currently consistent; consolidate post-parity.

5. **For end-of-port review** — closing pattern from 003/004. Decision points: orientation docstring, pitch floor magnitude, `tilt_angle_deg` overload, `params.table` side-effect anti-pattern.

---

## 5. Acceptance criteria

Mapped to PLAN.md row #9's "Acceptance" + tier ceremony:

1. `uv run pytest tests/ -q` from `python/pvlayout_engine` is **green**. Target: prior `98 passed → ~101 passed`, **6 skipped**, **0 failed** (3 new parity tests).
2. `test_tracker_layout_engine_parity.py::test_run_layout_tracker_phaseboundary2_bit_exact` and `::test_run_layout_tracker_complex_plant_bit_exact` assert bit-exact placed-table coords + scalar fields + ICR list via sys.path bootstrap.
3. Discovery memo `docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md` committed.
4. PLAN.md row #9 `Status` flipped to `done`; status header bumped `8 / 12 done` → `9 / 12 done`.
5. Atomic commit per row: `parity: row #9 — single-axis-tracker layout mode`. Intra-row `wip:` checkpoints; squash before close.

---

## 6. Out of scope (deferred)

- All six refinements in §4 — accumulate into Prasanta's end-of-port review per the 2026-04-29 policy.
- **SAT-specific `place_string_inverters` cabling validation.** The bit-exact parity test catches placement drift; cabling parity is a separate dimension (would require a full BOQ comparison). If `place_string_inverters` happens to be bit-incompatible with SAT-mode `params.table`, the parity test won't notice (it doesn't compare the `params` mutation). Defer dedicated SAT-cabling-parity to a follow-up if a real bug surfaces in Prasanta's review or in production.
- **Frontend SAT mode toggle UI** — post-parity per CLAUDE.md §2.
- **DXF / PDF / KMZ exporter SAT specifics** — covered (or not) by rows 10–12.
- **Refactoring `_make_valid_poly` / `TL_SETBACK_M` duplication** — post-parity cleanup.

---

## 7. Pre-implementation operational notes

- Row #9 doesn't add new dependencies; `uv sync --extra dev` not needed unless something else triggers it.
- The legacy reference repo at `/Users/arunkpatra/codebase/PVlayout_Advance` must be checked out at `baseline-v1-20260429` for the parity test to run; otherwise the test self-skips.
- `python/pvlayout_engine/tests/golden/kmz/{phaseboundary2,complex-plant-layout}.kmz` must be present (already committed; used by row #6's parity test).
- Verify before commit: parity tests pass with `LEGACY_REPO` actually pointing at the legacy checkout; full pytest from `python/pvlayout_engine` is `0 failed`.
