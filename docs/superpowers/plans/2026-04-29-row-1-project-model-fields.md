# Row #1 — Project model field additions (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port legacy `models/project.py` field additions (DesignType + 8 LayoutParameters tracker fields + 2 EnergyParameters SAT fields + 3 LayoutResult fields) into `python/pvlayout_engine/pvlayout_core/models/project.py` while preserving all S11.5 additions.

**Architecture:** Single-file additive edit. All new fields have safe defaults so existing constructors continue to work. No behaviour change — Row #1 only adds data shape that downstream rows (#4–#9) will consume. Direction one-way: legacy is read-only.

**Tech Stack:** Python 3.12, `dataclasses`, `enum.Enum`, `typing`. Sidecar pytest under `python/pvlayout_engine/tests/`.

**Spec:** [`docs/superpowers/specs/2026-04-29-row-1-project-model-fields-design.md`](../specs/2026-04-29-row-1-project-model-fields-design.md) (committed `90f1e83`).

**Tier:** T1 (per [`docs/PLAN.md`](../../PLAN.md)) — port + sidecar pytest + commit. No reviewer subagents. No memo. The diff and the green tests are the audit trail.

---

## File structure

**Modify (one file):**
- `python/pvlayout_engine/pvlayout_core/models/project.py`
  - `DesignType` enum (currently line 9–10) — add one value
  - `LayoutParameters` dataclass (currently line 64–94) — append 8 fields at end
  - `EnergyParameters` dataclass — insert 2 fields after `site_azimuth_pvgis` (currently line 258)
  - `LayoutResult` dataclass — insert 3 fields at three positions (after `boundary_name`, after `usable_polygon`, after `obstacle_polygons_wgs84`)

**Verify:**
- `python/pvlayout_engine/tests/` — entire pytest suite runs unchanged. No new tests required (T1, additive defaults).

**Commit at end:** one atomic commit `parity: row #1 — project model field additions`. No intra-row commits.

---

## Pre-flight

- [ ] **Step 0: Confirm target file matches expected baseline**

Run from repo root:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
sed -n '9,11p;64,67p;258,259p;318,319p;325,326p;337,338p' python/pvlayout_engine/pvlayout_core/models/project.py
```

Expected output (line numbers reflect current state — if these don't match, line numbers below are stale and need re-reading before editing):

```
class DesignType(Enum):
    FIXED_TILT = "fixed_tilt"

@dataclass
class LayoutParameters:
    """All parameters that drive the layout calculation."""
    design_type: DesignType = DesignType.FIXED_TILT
    site_azimuth_pvgis: float = 0.0  # 0=South for NH, 180=North for SH

    boundary_name: str = ""
    placed_tables: List[PlacedTable] = field(default_factory=list)
    usable_polygon: Any = field(default=None, repr=False, compare=False)
    total_modules: int = 0
    obstacle_polygons_wgs84: List[List[Tuple[float, float]]] = field(default_factory=list)
    # String inverter layout
```

If lines have shifted (e.g. someone touched the file since this plan was written), re-read the file and adjust line numbers in tasks below before applying edits.

---

## Task 1: Add `SINGLE_AXIS_TRACKER` to `DesignType` enum

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/models/project.py:9-11`

- [ ] **Step 1: Apply the edit**

Replace this block:

```python
class DesignType(Enum):
    FIXED_TILT = "fixed_tilt"
```

with:

```python
class DesignType(Enum):
    FIXED_TILT = "fixed_tilt"
    SINGLE_AXIS_TRACKER = "single_axis_tracker"
```

Note: legacy uses column-aligned spacing (`FIXED_TILT           = "fixed_tilt"`). We use the new project's existing one-space style for diff cleanliness — string values are what matters semantically.

- [ ] **Step 2: Verify import still works**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "from pvlayout_core.models.project import DesignType; print(list(DesignType))"
```

Expected:

```
[<DesignType.FIXED_TILT: 'fixed_tilt'>, <DesignType.SINGLE_AXIS_TRACKER: 'single_axis_tracker'>]
```

---

## Task 2: Append SAT parameters to `LayoutParameters`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/models/project.py:93-94` (append after `dc_per_string_allowance_m: float = 10.0`)

- [ ] **Step 1: Apply the edit**

After this existing line at the end of `LayoutParameters`:

```python
    ac_termination_allowance_m: float = 4.0
    dc_per_string_allowance_m: float = 10.0
```

append a blank line and this block (preserving the existing closing blank line before `@dataclass class PlacedTable`):

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
    tracker_modules_across: int = 1               # modules side-by-side E-W (1, 2, 4 …)
    tracker_strings_per_tracker: int = 2          # strings sharing one torque-tube unit
    tracker_modules_per_string: int = 28          # modules per string along N-S axis
    # "portrait"  (P): module long side runs E-W across the aperture
    # "landscape" (L): module long side runs N-S along the torque tube
    tracker_orientation: str = "portrait"
    tracker_pitch_ew_m: float = 5.5               # E-W pitch between tracker rows (m)
    tracker_ns_gap_m: float = 2.0                 # N-S service gap between tracker units (m)
    tracker_max_angle_deg: float = 55.0           # maximum rotation angle ± (degrees)
    tracker_height_m: float = 1.5                 # tracker column/hub height from ground (m)
```

Comment block ported verbatim from legacy. Field declarations use the new project's one-space-after-colon style (legacy used column-aligned `=` — semantically identical, diff-cleaner this way).

- [ ] **Step 2: Verify the dataclass instantiates with defaults**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.models.project import LayoutParameters
p = LayoutParameters()
print('tracker_modules_across:', p.tracker_modules_across)
print('tracker_orientation:', p.tracker_orientation)
print('tracker_max_angle_deg:', p.tracker_max_angle_deg)
print('ac_termination_allowance_m (S11.5 preserved):', p.ac_termination_allowance_m)
"
```

Expected:

```
tracker_modules_across: 1
tracker_orientation: portrait
tracker_max_angle_deg: 55.0
ac_termination_allowance_m (S11.5 preserved): 4.0
```

---

## Task 3: Insert SAT fields into `EnergyParameters`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/models/project.py` — after line containing `site_azimuth_pvgis: float = 0.0` (currently line 258), before the `monthly_ghi_kwh_m2` block.

- [ ] **Step 1: Apply the edit**

Find this existing block:

```python
    # Site geometry — set from layout result; used for GHI→GTI transposition
    site_lat: float = 20.0        # degrees (+ = North)
    site_tilt_deg: float = 20.0   # panel tilt from horizontal (degrees)
    site_azimuth_pvgis: float = 0.0  # 0=South for NH, 180=North for SH

    # Monthly irradiance (12 values — kWh/m²/month).
```

Replace it with:

```python
    # Site geometry — set from layout result; used for GHI→GTI transposition
    site_lat: float = 20.0        # degrees (+ = North)
    site_tilt_deg: float = 20.0   # panel tilt from horizontal (degrees)
    site_azimuth_pvgis: float = 0.0  # 0=South for NH, 180=North for SH

    # Single Axis Tracker flags — set automatically when design_type == SAT
    is_sat: bool = False              # True → use HSAT tracking angle model
    sat_max_angle_deg: float = 55.0   # tracker rotation limit ±degrees

    # Monthly irradiance (12 values — kWh/m²/month).
```

The relationship between `LayoutParameters.tracker_max_angle_deg` (input) and `EnergyParameters.sat_max_angle_deg` (energy-model derived) is set by downstream code outside this row's scope. Row #1 just adds the fields with safe defaults.

- [ ] **Step 2: Verify the dataclass instantiates with defaults**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.models.project import EnergyParameters
e = EnergyParameters()
print('is_sat:', e.is_sat)
print('sat_max_angle_deg:', e.sat_max_angle_deg)
print('site_azimuth_pvgis (still present):', e.site_azimuth_pvgis)
"
```

Expected:

```
is_sat: False
sat_max_angle_deg: 55.0
site_azimuth_pvgis (still present): 0.0
```

---

## Task 4: Insert three fields into `LayoutResult` at legacy positions

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/models/project.py` — three insertion points inside the `LayoutResult` dataclass (currently starts at line 315):
  1. After `boundary_name: str = ""` (line 318)
  2. After `usable_polygon: Any = field(default=None, repr=False, compare=False)` (line 325)
  3. After `obstacle_polygons_wgs84: List[List[Tuple[float, float]]] = field(default_factory=list)` (line 337)

- [ ] **Step 1: Apply edit 1 — `design_type` after `boundary_name`**

Find:

```python
@dataclass
class LayoutResult:
    """Output of the layout engine."""
    boundary_name: str = ""
    placed_tables: List[PlacedTable] = field(default_factory=list)
```

Replace with:

```python
@dataclass
class LayoutResult:
    """Output of the layout engine."""
    boundary_name: str = ""
    design_type: DesignType = DesignType.FIXED_TILT   # SAT vs fixed-tilt
    placed_tables: List[PlacedTable] = field(default_factory=list)
```

- [ ] **Step 2: Apply edit 2 — `boundary_polygon` after `usable_polygon`**

Find:

```python
    # Shapely usable polygon (post road-setback) — used to validate ICR drag position
    usable_polygon: Any = field(default=None, repr=False, compare=False)
    total_modules: int = 0
```

Replace with:

```python
    # Shapely usable polygon (post road-setback) — used to validate ICR drag position
    usable_polygon: Any = field(default=None, repr=False, compare=False)
    # Shapely full boundary polygon (pre road-setback) — used for cable routing so
    # cables may run inside the perimeter road band but not outside the plant fence.
    boundary_polygon: Any = field(default=None, repr=False, compare=False)
    total_modules: int = 0
```

- [ ] **Step 3: Apply edit 3 — `water_obstacle_polygons_wgs84` after `obstacle_polygons_wgs84`**

Find:

```python
    obstacle_polygons_wgs84: List[List[Tuple[float, float]]] = field(default_factory=list)
    # String inverter layout
    placed_string_inverters: List[PlacedStringInverter] = field(default_factory=list)
```

Replace with:

```python
    obstacle_polygons_wgs84: List[List[Tuple[float, float]]] = field(default_factory=list)
    # Water-body obstacles (ponds, canals, reservoirs) — rendered in blue on the canvas
    water_obstacle_polygons_wgs84: List[List[Tuple[float, float]]] = field(default_factory=list)
    # String inverter layout
    placed_string_inverters: List[PlacedStringInverter] = field(default_factory=list)
```

- [ ] **Step 4: Verify the dataclass instantiates with defaults**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.models.project import LayoutResult, DesignType
r = LayoutResult()
print('design_type:', r.design_type)
print('boundary_polygon:', r.boundary_polygon)
print('water_obstacle_polygons_wgs84:', r.water_obstacle_polygons_wgs84)
print('ac_cable_m_per_inverter (S11.5 preserved):', r.ac_cable_m_per_inverter)
print('ac_cable_m_per_icr (S11.5 preserved):', r.ac_cable_m_per_icr)
"
```

Expected:

```
design_type: DesignType.FIXED_TILT
boundary_polygon: None
water_obstacle_polygons_wgs84: []
ac_cable_m_per_inverter (S11.5 preserved): {}
ac_cable_m_per_icr (S11.5 preserved): {}
```

---

## Task 5: S11.5 surface preservation check

**Files:**
- Inspect (no edit unless something is missing): `python/pvlayout_engine/pvlayout_core/models/project.py`

This is a guard step — confirm S11.5 fields that legacy doesn't have are still present.

- [ ] **Step 1: Run the preservation check**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.models.project import LayoutParameters, LayoutResult, CableRun
import dataclasses

lp_fields = {f.name for f in dataclasses.fields(LayoutParameters)}
lr_fields = {f.name for f in dataclasses.fields(LayoutResult)}
cr_fields = {f.name for f in dataclasses.fields(CableRun)}

required = {
    'LayoutParameters.ac_termination_allowance_m': 'ac_termination_allowance_m' in lp_fields,
    'LayoutParameters.dc_per_string_allowance_m': 'dc_per_string_allowance_m' in lp_fields,
    'CableRun.route_quality': 'route_quality' in cr_fields,
    'LayoutResult.ac_cable_m_per_inverter': 'ac_cable_m_per_inverter' in lr_fields,
    'LayoutResult.ac_cable_m_per_icr': 'ac_cable_m_per_icr' in lr_fields,
}
for k, v in required.items():
    print(('OK  ' if v else 'MISS') + ' ' + k)
assert all(required.values()), 'S11.5 surface regression!'
print('All S11.5 fields preserved.')
"
```

Expected: every line starts with `OK  ` and the final line is `All S11.5 fields preserved.`

If any line starts with `MISS`, stop — the corresponding field was inadvertently removed during an edit. Re-read the target file and restore.

- [ ] **Step 2: Verify `Dict` is still imported**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
grep -n "^from typing" python/pvlayout_engine/pvlayout_core/models/project.py
```

Expected:

```
5:from typing import Any, Dict, List, Optional, Tuple
```

`Dict` must remain (S11.5 needs it for `ac_cable_m_per_inverter: Dict[int, float]` and `ac_cable_m_per_icr: Dict[int, float]`). Legacy removed it; we don't follow that — see spec §2.5.

---

## Task 6: Run sidecar pytest

**Files:**
- No edit. Run the acceptance command from `docs/PLAN.md` row #1.

- [ ] **Step 1: Run the suite**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q
```

Expected: `72 passed, 6 skipped` (with no failures). The exact summary line will read something like:

```
72 passed, 6 skipped in <N>s
```

If a test fails, stop and investigate — the additions are pure dataclass fields with safe defaults; any failure is either a typo (Step 0 line drift not handled, broken indentation, accidental field removal) or a test that previously relied on `dataclasses.fields(...)` returning a specific count. The S11.5 preservation check from Task 5 should have caught field removals; investigate count-based assertions if failure mode is the latter.

If 6 skipped is not the count, that is fine as long as the failures count is 0 — record the actual passed/skipped numbers in the commit body so future readers can compare.

---

## Task 7: Commit

**Files:**
- Stage and commit `python/pvlayout_engine/pvlayout_core/models/project.py` only.

- [ ] **Step 1: Confirm only the target file changed**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git status
git diff --stat
```

Expected: only `python/pvlayout_engine/pvlayout_core/models/project.py` shown as modified. Insertions ≈ 25 lines; deletions = 0.

If anything else changed (tests touched, other files modified), stop and roll back the unrelated changes — Row #1 is additive-only and touches one file.

- [ ] **Step 2: Stage and commit**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/pvlayout_engine/pvlayout_core/models/project.py
git commit -m "$(cat <<'EOF'
parity: row #1 — project model field additions

Port legacy field additions from PVlayout_Advance models/project.py
@ baseline-v1-20260429 commit 9362083:

- DesignType.SINGLE_AXIS_TRACKER enum value.
- LayoutParameters: 8 SAT/HSAT tracker fields (modules_across,
  strings_per_tracker, modules_per_string, orientation, pitch_ew_m,
  ns_gap_m, max_angle_deg, height_m).
- EnergyParameters: is_sat, sat_max_angle_deg.
- LayoutResult: design_type, boundary_polygon,
  water_obstacle_polygons_wgs84.

All S11.5 surface preserved (allowances, route_quality, per-ICR /
per-inverter AC subtotals, Dict import). Additive only — every new
field has a safe default; existing constructors and tests continue
to work. No behaviour change; enables downstream rows #4–#9.

Spec: docs/superpowers/specs/2026-04-29-row-1-project-model-fields-design.md
PLAN row: docs/PLAN.md row #1 (T1).
EOF
)"
```

- [ ] **Step 3: Verify the commit landed**

Run:

```bash
git log -1 --stat
```

Expected: most recent commit titled `parity: row #1 — project model field additions`, single file changed: `python/pvlayout_engine/pvlayout_core/models/project.py`.

---

## Task 8: Flip PLAN.md status

**Files:**
- Modify: `docs/PLAN.md` — Row #1 status cell + header status count.

- [ ] **Step 1: Update Row #1 status to `done`**

In `docs/PLAN.md`, change row 1's `Status` cell from `todo` to `**done**`:

Before:

```markdown
| 1 | Project model field additions | T1 | `models/project.py` @ `9362083` | Sidecar pytest green. | todo |
```

After:

```markdown
| 1 | Project model field additions | T1 | `models/project.py` @ `9362083` | Sidecar pytest green. | **done** |
```

- [ ] **Step 2: Bump the count in the header status line**

Change:

```markdown
**Status:** 1 / 12 done.
```

to:

```markdown
**Status:** 2 / 12 done.
```

- [ ] **Step 3: Commit the PLAN.md update**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add docs/PLAN.md
git commit -m "$(cat <<'EOF'
parity: mark row #1 done in PLAN.md

Project model field additions shipped — sidecar pytest green
(72 passed, 6 skipped, 0 failed).
EOF
)"
```

- [ ] **Step 4: Verify final state**

Run:

```bash
git log --oneline -3
```

Expected (top three commits, newest first):

```
<sha2> parity: mark row #1 done in PLAN.md
<sha1> parity: row #1 — project model field additions
6627dfa parity(p0): baseline-reference cleanup + BACKLOG.md + SHA recording
```

(The `6627dfa` line will be whatever the previous tip on the current branch is.)

---

## Acceptance recap (from `docs/PLAN.md` row #1)

`cd python/pvlayout_engine && uv run pytest tests/ -q` → 72 passed, 6 skipped, 0 failed.

Met by Task 6.

---

## Out of scope (deferred to later rows — see spec §6)

- Pydantic API schemas in `python/pvlayout_engine/pvlayout_engine/`.
- Generated TS types in `packages/sidecar-client/`.
- Logic that consumes the new fields (rows #4 KMZ, #5 satellite water, #6 layout engine, #7 transposition, #8 energy, #9 tracker mode).
- Frontend UI exposing tracker-mode parameters.

These rows will edit other files; Row #1 strictly adds shape.
