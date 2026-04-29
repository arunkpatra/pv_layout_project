# Row #1 — Project model field additions (design)

**PLAN row:** [`docs/PLAN.md`](../../PLAN.md) row #1
**Tier:** T1 (port + sidecar pytest + commit)
**Source:** legacy `models/project.py` @ branch `baseline-v1-20260429`, originating commit `9362083`
**Target:** `python/pvlayout_engine/pvlayout_core/models/project.py`
**Acceptance:** `cd python/pvlayout_engine && uv run pytest tests/ -q` → 72 passed, 6 skipped, 0 failed
**Date:** 2026-04-29

---

## 1. Goal

Port legacy `models/project.py` field additions into the new project's vendored copy. The port is **additive only**: take legacy's new fields, leave the new project's S11.5 additions in place.

**Direction is one-way: legacy → new project. Legacy is read-only reference per [CLAUDE.md §7](../../../CLAUDE.md). Nothing in this row modifies any file under `/Users/arunkpatra/codebase/PVlayout_Advance`.** "Field preservation" in this spec means preserving both sets of field additions in our local file — not bidirectional code edits between repos.

This row is an enabling change for downstream rows that consume these fields (rows #4 KMZ autodetection, #5 satellite water detection, #6 layout engine, #9 tracker mode). Row #1 itself adds no behaviour — only data shape.

## 2. Changes

### 2.1 `DesignType` enum (line 9)

Add one value:

```python
class DesignType(Enum):
    FIXED_TILT = "fixed_tilt"
    SINGLE_AXIS_TRACKER = "single_axis_tracker"  # NEW
```

Legacy formats both lines with column-aligned spacing; preserve existing project's formatting style (no column alignment) for diff cleanliness — the value-string is the only thing that matters semantically.

### 2.2 `LayoutParameters` (line 65) — 8 tracker fields

Appended **at the end of the dataclass** (after the existing S11.5 allowances), not at legacy's position. Rationale: cleanest diff against the current new-project file; placement doesn't affect semantics; future readers see "S11.5 additions, then SAT additions" rather than legacy's interleaved layout.

```python
    # ── Single Axis Tracker (SAT / HSAT) parameters ──────────────────────────
    # Only used when design_type == DesignType.SINGLE_AXIS_TRACKER.
    # The tracker rotation axis runs North–South; panels sweep East–West.
    #
    # Layout geometry:
    #   tracker_width  (E-W aperture) = tracker_modules_across × module.width
    #   tracker_ns_len (N-S length)   = tracker_modules_per_string × module.length
    #   E-W pitch between tracker rows = tracker_width / tracker_gcr
    #   N-S step inside a row          = tracker_ns_len + tracker_ns_gap_m
    tracker_modules_across: int      = 1        # modules side-by-side E-W (1, 2, 4 …)
    tracker_strings_per_tracker: int = 2        # strings sharing one torque-tube unit
    tracker_modules_per_string: int  = 28       # modules per string along N-S axis
    # "portrait"  (P): module long side runs E-W across the aperture
    # "landscape" (L): module long side runs N-S along the torque tube
    tracker_orientation: str         = "portrait"
    tracker_pitch_ew_m: float        = 5.5      # E-W pitch between tracker rows (m)
    tracker_ns_gap_m: float          = 2.0      # N-S service gap between tracker units (m)
    tracker_max_angle_deg: float     = 55.0     # maximum rotation angle ± (degrees)
    tracker_height_m: float          = 1.5      # tracker column/hub height from ground (m)
```

Comment block ported verbatim from legacy.

### 2.3 `EnergyParameters` (line 188) — 2 SAT fields

Inserted after `site_azimuth_pvgis` (matches legacy position):

```python
    # Single Axis Tracker flags — set automatically when design_type == SAT
    is_sat: bool = False                # True → use HSAT tracking angle model
    sat_max_angle_deg: float = 55.0     # tracker rotation limit ±degrees
```

The relationship between `LayoutParameters.tracker_max_angle_deg` (input) and `EnergyParameters.sat_max_angle_deg` (energy-model derived) is set by downstream code outside row #1's scope. Row #1 just adds the fields with safe defaults.

### 2.4 `LayoutResult` (line 316) — 3 fields in legacy positions

```python
    # Right after boundary_name:
    design_type: DesignType = DesignType.FIXED_TILT   # SAT vs fixed-tilt

    # Right after usable_polygon:
    # Shapely full boundary polygon (pre road-setback) — used for cable routing so
    # cables may run inside the perimeter road band but not outside the plant fence.
    boundary_polygon: Any = field(default=None, repr=False, compare=False)

    # Right after obstacle_polygons_wgs84:
    # Water-body obstacles (ponds, canals, reservoirs) — rendered in blue on the canvas
    water_obstacle_polygons_wgs84: List[List[Tuple[float, float]]] = field(default_factory=list)
```

### 2.5 Imports

`Dict` stays in the typing import line. Legacy removed it (no longer uses it); we still need it for the S11.5 `ac_cable_m_per_inverter: Dict[int, float]` and `ac_cable_m_per_icr: Dict[int, float]` fields. (This is local-file-state preservation — we read legacy as authority for the *new* fields it added, but the S11.5 fields the new project already had stay regardless of what legacy looks like.)

## 3. Preserved (S11.5 surface — must not regress)

These fields exist in the new project from S11.5 and have no legacy counterpart. They stay verbatim:

- `LayoutParameters.ac_termination_allowance_m: float = 4.0`
- `LayoutParameters.dc_per_string_allowance_m: float = 10.0`
- `CableRun.route_quality: str = "ok"`
- `LayoutResult.ac_cable_m_per_inverter: Dict[int, float]`
- `LayoutResult.ac_cable_m_per_icr: Dict[int, float]`

## 4. Acceptance

`cd python/pvlayout_engine && uv run pytest tests/ -q` returns the same 72 passed / 6 skipped / 0 failed as the post-P0 baseline. No new tests required for T1: the additions are pure dataclass fields with safe defaults; existing tests instantiating `LayoutParameters()`, `EnergyParameters()`, `LayoutResult()` keep passing because all new fields have defaults.

## 5. Risks

- **Constructor compat:** every new field has a default → existing positional / keyword constructors continue to work. ✓
- **Serialization compat:** dataclasses with defaults serialize the same way; new fields appear in `dataclasses.asdict()` output. Downstream Pydantic schemas may silently drop or pass-through the new fields depending on schema strictness — out of scope for row #1.
- **Type compatibility:** `boundary_polygon: Any` matches `usable_polygon: Any` style; no new typing dependency.

## 6. Out of scope for this row

These changes are **explicitly NOT** in row #1 and will be addressed by downstream rows that USE the fields:

- Pydantic API schemas in `python/pvlayout_engine/pvlayout_engine/` that mirror these dataclasses.
- Generated TS types in `packages/sidecar-client/` (regenerated when sidecar OpenAPI changes).
- Any logic that consumes the new fields:
  - `design_type` switch — row #9 (tracker layout mode)
  - `boundary_polygon` cable routing — already exists for Pattern V; future rows may use it
  - `water_obstacle_polygons_wgs84` — rows #4 (KMZ autodetect) and #5 (satellite water)
  - `is_sat` / `sat_max_angle_deg` — row #7 (transposition) and row #8 (energy calc)
- Any frontend UI to expose tracker-mode parameters — deferred to post-parity per `docs/PLAN.md` "Out of scope" section.

## 7. Implementation order (for the implementation plan)

When this spec moves to writing-plans, the implementation will be a single step:

1. Edit `python/pvlayout_engine/pvlayout_core/models/project.py` per §2.
2. Run `uv run pytest tests/ -q` from `python/pvlayout_engine/`.
3. Commit: `parity: row #1 — project model field additions`.

No spec reviewer subagent (T1). No discovery memo. No PLAN.md flip yet — that's the close-out step in the implementation plan.

## 8. Cross-references

- [`docs/PLAN.md`](../../PLAN.md) — row #1 entry.
- [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) — `pvlayout_core` is canonical for domain data shapes.
- Legacy source file at `/Users/arunkpatra/codebase/PVlayout_Advance/models/project.py` on branch `baseline-v1-20260429`.
- New project target at `/Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/models/project.py`.
