# Finding #005 — Tracker layout engine port

**Row:** [docs/PLAN.md](../../PLAN.md) row #9 (T3)
**Date:** 2026-04-29
**Author:** Arun (port) — solar-domain decisions captured for Prasanta's end-of-port review
**Status:** committed; deferred review

## Background

Legacy added `core/tracker_layout_engine.py` (single function
`run_layout_tracker`, ~301 lines) on `baseline-v1-20260429` commit
`9362083` to enable Single Axis Tracker (HSAT) layouts. Row #9 ports
this verbatim into the new project as
`pvlayout_core/core/tracker_layout_engine.py` and wires it into
`run_layout_multi` via a `params.design_type` dispatch.

`LayoutParameters` already had all `tracker_*` fields, the
`DesignType.SINGLE_AXIS_TRACKER` enum, and the relevant `LayoutResult`
fields (`tilt_angle_deg`, `row_pitch_m`, `gcr_achieved`,
`boundary_polygon`, etc.). No data-model or wire-schema changes this
row.

## What landed

Two touch-points:

1. **NEW** `python/pvlayout_engine/pvlayout_core/core/tracker_layout_engine.py`
   (~301 lines, verbatim port of legacy with `core.X`/`models.X`/`utils.X`
   → `pvlayout_core.X` import-prefix substitution).

2. **EDIT** `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`
   `run_layout_multi`: add `params.design_type ==
   DesignType.SINGLE_AXIS_TRACKER` branch that calls
   `run_layout_tracker(...)`. FT path unchanged. Required adding
   `DesignType` to the `from pvlayout_core.models.project import …`
   line at the top of the file (the enum was previously not imported
   in `layout_engine.py` because the FT path didn't reference it).

Bit-exact parity verified on `phaseboundary2.kmz` and
`complex-plant-layout.kmz` in
`tests/parity/test_tracker_layout_engine_parity.py`:
- per-tracker-unit `(x, y, width, height, row_index, col_index)` within
  1e-6 m / strict equality
- per-result scalars: `total_modules`, `total_capacity_kwp`,
  `total_capacity_mwp`, `gcr_achieved`, `row_pitch_m`, `tilt_angle_deg`,
  `utm_epsg`, `design_type`, `total_area_acres`
- per-result areas: `total_area_m2`, `net_layout_area_m2` within 1e-6 m
- per-ICR `(x, y, index)` within 1e-6 m / strict equality

Full sidecar pytest: 101 passed, 6 skipped, 0 failed (was 98 → +3).

## Algorithm summary

### Tracker geometry

Legacy implements horizontal single-axis tracker (HSAT) layout. The
tracker has a North-South torque tube; modules are mounted across the
tube and rotate ±`max_angle_deg` from horizontal during the day to
follow the sun (East-West sweep).

Each tracker unit is placed as a `PlacedTable` with:
- `width`  = E-W aperture = `tracker_modules_across × mod_ew`
- `height` = N-S length   = `tracker_strings_per_tracker × tracker_modules_per_string × mod_ns`

where `(mod_ew, mod_ns)` depend on portrait/landscape orientation.

### Placement loop

The placement loop is the **mirror** of fixed-tilt:

| | Outer loop | Inner loop |
|---|---|---|
| FT | N-S (rows) | E-W (tables in row) |
| SAT | E-W (tracker columns) | N-S (units in column) |

`row_index` = E-W column number, `col_index` = N-S position within
column. (Naming follows the FT convention; semantics differ.)

E-W pitch: `max(trk_w + 0.5, params.tracker_pitch_ew_m)` (50 cm
clearance floor).
N-S step: `trk_ns + params.tracker_ns_gap_m`.

### ICR placement reuse

`place_icrs(placed, total_mwp_pre, usable_poly)` is called identically
to FT. The ICR clearance algorithm is layout-engine-agnostic — it
operates on placed boxes and the usable polygon.

### Downstream cabling hook

End-of-function mutation: `params.table = TableConfig(...)` repurposes
the FT-tilt `LayoutParameters.table` field so
`place_string_inverters` (which expects `modules_in_row` and
`rows_per_table`) can compute strings-per-tracker-unit. Mapping:

- `modules_in_row` ← `tracker_modules_per_string`
- `rows_per_table` ← `tracker_strings_per_tracker × tracker_modules_across`
  (clamped to ≥1)

This is an input-mutation-as-output side-effect (anti-pattern). See §6d
below.

## Open questions / refinement candidates (for end-of-port review)

a. **Portrait/Landscape docstring contradiction.** The legacy file
   contains two comment blocks describing the orientation convention
   inside `run_layout_tracker`. They contradict each other:

   - Lines 193–197 (block above section 4):
     "Portrait (P): long side (module.length) runs N-S"
   - Lines 203–205 (block above the orientation logic):
     "Portrait (P): module long side (length) runs E-W across the
     aperture"

   The implemented logic (`mod_ew = module.length if portrait else
   module.width`) matches the second comment. The first comment is
   stale. Trivial doc-only fix candidate post-parity.

b. **`+ 0.5 m` minimum pitch increment.** Hardcoded floor in
   `pitch_ew = max(trk_w + 0.5, params.tracker_pitch_ew_m)`. The 50 cm
   clearance prevents overlap when `tracker_pitch_ew_m` is set to or
   below `trk_w`, but the magnitude is unjustified in code. Should be
   either configurable on `LayoutParameters` or documented as
   industry-standard.

c. **`result.tilt_angle_deg` overload.** The field is documented as
   "static panel tilt from horizontal (degrees)" — appropriate for
   FT. SAT engine writes `params.tracker_max_angle_deg` here. Adds
   ambiguity for downstream consumers (exporters, UI inspectors). Two
   fix paths: (i) add a dedicated `LayoutResult.tracker_max_angle_deg`
   field and update the wire schema, or (ii) document the overload
   formally (FT writes static tilt, SAT writes max rotation).

d. **`params.table = TableConfig(...)` side-effect.** `run_layout_tracker`
   mutates the input dataclass as a way of communicating SAT-mode
   table geometry to `place_string_inverters` downstream. This is an
   input-mutated-as-output anti-pattern. Verbatim-ported; future
   cleanup options: return alongside `LayoutResult`, or set
   `LayoutResult.effective_table_config` so consumers read from the
   result instead of the input.

e. **`_make_valid_poly` duplication.** Verbatim copies in
   `pvlayout_core/core/layout_engine.py` (added in row #6) and
   `pvlayout_core/core/tracker_layout_engine.py`. Post-parity
   consolidation: extract to `pvlayout_core.utils.geo_utils` or a new
   `pvlayout_core.core._shapely_helpers` module.

f. **`TL_SETBACK_M = 15.0` duplicated module-level constant.** Also
   defined in `pvlayout_core/core/layout_engine.py` at the same value.
   Currently consistent; consolidate post-parity.

g. **`DesignType` import in `layout_engine.py`** (in-row scope
   adjustment, not a solar-domain decision). The new app's
   `layout_engine.py` previously imported only `LayoutParameters,
   LayoutResult, PlacedTable, M2_PER_ACRE` from
   `pvlayout_core.models.project`. Adding the SAT dispatch branch
   required `DesignType` too. One-line additive change to the import
   list. Documenting because the spec did not anticipate this.

## For end-of-port review

When Prasanta reviews the accumulated memos at end-of-port, the
decision points for this finding are:

1. Is `+ 0.5 m` the right minimum E-W pitch clearance for HSAT
   trackers, or should it be configurable / a different magnitude?
2. Should `LayoutResult.tilt_angle_deg` be split into FT-specific
   and SAT-specific fields, or is the overload acceptable with a
   docstring fix?
3. Is the `params.table` mutation an acceptable downstream interface
   for `place_string_inverters`, or should we restructure to a
   pull-from-result pattern?
4. Are the trivial doc-only / dedup fixes (portrait/landscape,
   `_make_valid_poly`, `TL_SETBACK_M`) worth a follow-up cleanup
   row, or live with the duplication post-parity?

Refinements, if any, become follow-up rows in PLAN.md raised after
the parity sweep is complete.
