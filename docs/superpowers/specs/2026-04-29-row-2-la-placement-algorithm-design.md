# Row #2 — LA placement algorithm port (design)

**PLAN row:** [`docs/PLAN.md`](../../PLAN.md) row #2
**Tier:** T2 (port + numeric parity test)
**Source:** legacy `core/la_manager.py` @ branch `baseline-v1-20260429`, originating commit `9362083`
**Target:** `python/pvlayout_engine/pvlayout_core/core/la_manager.py`
**Acceptance:** `cd python/pvlayout_engine && uv run pytest tests/ -q` green; new parity test asserts LA count + per-position match on `phaseboundary2` against the legacy baseline.
**Date:** 2026-04-29

---

## 1. Goal

Port legacy `core/la_manager.py` into the new project's vendored copy. Two visible changes:

1. **Refactor (no behaviour change):** extract `_build_grid` and `_snap_inside` from inline code in `place_lightning_arresters` to module-level helpers; this matches legacy's structure and is required for SAT reuse.
2. **Add SAT branch (net new):** legacy gained a Single-Axis-Tracker placement path that uses a 1 m × 1 m pole footprint, snaps each grid X to the nearest E-W inter-row gap centre, and skips Step 3 (table-overlap removal) entirely. The new app currently has no SAT path; this row adds it.

Direction is one-way: legacy → new project. Legacy is read-only reference per [CLAUDE.md §7](../../../CLAUDE.md). Nothing in this row modifies any file under `/Users/arunkpatra/codebase/PVlayout_Advance`.

For fixed-tilt layouts the FT path is **byte-equivalent** before and after the helper extraction. The phaseboundary2 parity test asserts this literally: every LA's `(x, y, width, height, radius, index)` matches legacy bit-exact (1e-6 m floating-point tolerance for cleanliness; the algorithm is deterministic).

For SAT layouts there is no parity baseline (phaseboundary2 is FT). SAT is smoke-tested only in this row — a synthetic polygon + two tracker tables, asserting `place_lightning_arresters` returns without exception and produces ≥1 LA. Functional SAT verification belongs to row #9 (tracker layout mode, T3) where a real SAT plant + baseline will exist.

This row depends on row #1 having landed (`DesignType.SINGLE_AXIS_TRACKER` enum value, `LayoutResult.design_type` field). Both are in place at commit `8d60c55`.

## 2. Changes

### 2.1 `python/pvlayout_engine/pvlayout_core/core/la_manager.py`

**Imports:** add `DesignType` to the existing import from `pvlayout_core.models.project`. Add `Set` to the typing import (used by SAT dedup).

```python
from typing import List, Optional, Set, Tuple

from shapely.geometry import Point as ShapelyPoint, box as shapely_box
from shapely.ops import unary_union

from pvlayout_core.models.project import (
    LayoutResult, LayoutParameters,
    PlacedLA, PlacedTable, LA_EW, LA_NS, LA_RADIUS,
    DesignType,
)
```

**Module constants:** add SAT pole footprint constants alongside the existing `GRID_SPACING`:

```python
GRID_SPACING = LA_RADIUS   # 100 m

# For Single Axis Tracker layouts the LA is a pole/mast, not a building.
# Use a 1 m × 1 m footprint (diameter = 1 m) so no tracker units are displaced.
LA_SAT_W = 1.0   # metres (E-W)
LA_SAT_H = 1.0   # metres (N-S)
```

**Module-level helpers (extracted/added):**

```python
def _build_grid(poly) -> Tuple[List[float], List[float]]:
    """Return (xs, ys) — two sorted lists of 100 m grid coordinates
    centred on the polygon centroid and extended to cover its bounding box."""
    # Body lifted verbatim from current inline code in place_lightning_arresters
    # Step 1, with `cx0`/`cy0` derived from poly.centroid (or bounds fallback).


def _sat_gap_x_centers(tables: List[PlacedTable]) -> List[float]:
    """X coordinates of the midpoint of each E-W gap between adjacent
    tracker row columns. Cluster tolerance 0.5 m; rounds table.x to 0.1 m."""
    # Body ported verbatim from legacy.


def _snap_inside(gx: float, gy: float, poly) -> Tuple[float, float]:
    """Nudge a point that is outside poly to the nearest interior point."""
    # Body lifted from current inline nested function in
    # place_lightning_arresters Step 2; gains explicit `poly` parameter.
```

The current new app has `_snap_inside` as a nested closure over `poly` inside `place_lightning_arresters`. Lifting it to module level (with `poly` as an explicit parameter) is required because SAT's Step 2 needs to call it from the same control flow.

**`place_lightning_arresters` body — SAT-aware:**

```python
def place_lightning_arresters(
    result: LayoutResult,
    params: Optional[LayoutParameters] = None,
) -> None:
    result.placed_las = []
    result.num_las    = 0

    poly = result.usable_polygon
    if poly is None or poly.is_empty:
        return

    is_sat = (result.design_type == DesignType.SINGLE_AXIS_TRACKER)

    # Choose footprint
    la_w = LA_SAT_W if is_sat else LA_EW
    la_h = LA_SAT_H if is_sat else LA_NS

    # SAT only: derive E-W gap centres
    gap_xs: List[float] = []
    if is_sat:
        gap_xs = _sat_gap_x_centers(result.placed_tables)
        if not gap_xs:
            try:
                gap_xs = [poly.centroid.x]
            except Exception:
                minx, _, maxx, _ = poly.bounds
                gap_xs = [(minx + maxx) / 2.0]

    # Step 1: 100 m × 100 m grid pass
    xs, ys = _build_grid(poly)

    placed: List[PlacedLA] = []
    seen: Set[Tuple[float, float]] = set()   # SAT dedup key
    idx = 1

    for gx in xs:
        place_x = min(gap_xs, key=lambda gapx: abs(gapx - gx)) if is_sat else gx
        for gy in ys:
            key = (round(place_x, 2), round(gy, 2))
            if key in seen:
                continue
            try:
                inside = poly.contains(ShapelyPoint(place_x, gy))
            except Exception:
                inside = False
            if inside:
                seen.add(key)
                placed.append(PlacedLA(
                    x=place_x - la_w / 2,
                    y=gy      - la_h / 2,
                    width=la_w, height=la_h,
                    radius=LA_RADIUS,
                    index=idx,
                ))
                idx += 1

    # Step 2: coverage check — same logic for both SAT and FT
    def _nearest_la_dist(tx: float, ty: float) -> float:
        if not placed:
            return float("inf")
        return min(
            math.sqrt((la.x + la.width  / 2 - tx) ** 2 +
                      (la.y + la.height / 2 - ty) ** 2)
            for la in placed
        )

    for tbl in result.placed_tables:
        t_cx = tbl.x + tbl.width  / 2
        t_cy = tbl.y + tbl.height / 2
        if _nearest_la_dist(t_cx, t_cy) > LA_RADIUS:
            if is_sat:
                best_gx = min(gap_xs, key=lambda gx: abs(gx - t_cx))
                sx, sy  = _snap_inside(best_gx, t_cy, poly)
            else:
                sx, sy = _snap_inside(t_cx, t_cy, poly)
            key = (round(sx, 2), round(sy, 2))
            if key not in seen:
                seen.add(key)
                placed.append(PlacedLA(
                    x=sx - la_w / 2,
                    y=sy - la_h / 2,
                    width=la_w, height=la_h,
                    radius=LA_RADIUS,
                    index=idx,
                ))
                idx += 1

    # Re-index cleanly
    for i, la in enumerate(placed):
        la.index = i + 1

    result.placed_las = placed
    result.num_las    = len(placed)

    # Step 3: remove tables overlapping LA footprint — fixed tilt only
    if is_sat:
        return

    if not placed or not result.placed_tables:
        return

    la_union = unary_union([
        shapely_box(la.x, la.y, la.x + la.width, la.y + la.height)
        for la in placed
    ])

    remaining = []
    for tbl in result.placed_tables:
        tbl_box = shapely_box(tbl.x, tbl.y, tbl.x + tbl.width, tbl.y + tbl.height)
        if not tbl_box.intersects(la_union):
            remaining.append(tbl)

    result.placed_tables = remaining

    if params is not None:
        mpt = params.table.modules_per_table()
        total_modules             = len(remaining) * mpt
        total_kwp                 = total_modules * params.module.wattage / 1000.0
        result.total_modules      = total_modules
        result.total_capacity_kwp = round(total_kwp, 2)
        result.total_capacity_mwp = round(total_kwp / 1000.0, 4)
```

**Module docstring:** updated to document both FT and SAT paths, mirroring legacy's docstring (which calls out the SAT differences explicitly).

**FT bit-exactness rationale.** The FT path runs through identical code paths post-refactor:
- Step 1: `_build_grid` returns the same `(xs, ys)` tuples as the inline code (same centroid origin, same outward expansion, same `sorted(...)` returned). For FT, `is_sat=False` makes `place_x = gx` (no SAT snap), and `seen`-based dedup is a strict superset — under FT the key is always `(round(gx,2), round(gy,2))` for distinct grid points, so dedup never fires.
- Step 2: `_nearest_la_dist` and `_snap_inside` produce identical values; `seen` membership check is again a strict superset that never fires for FT (Step 1 grid keys never collide with snapped table-centre keys to within 0.01 m in real plants, and even if one did the dedup is correct behaviour — it just means we don't double-place an LA at the same spot).
- Step 3: untouched.

The 1e-6 m parity tolerance covers any floating-point reordering Python may do across function calls vs inline code (none expected, but cheap insurance).

### 2.2 `python/pvlayout_engine/tests/parity/test_la_placement_parity.py` — new

Pattern matches [`test_p00_bundled_mst_parity.py`](../../../python/pvlayout_engine/tests/parity/test_p00_bundled_mst_parity.py).

```python
"""
Parity test for LA placement (Row #2 of docs/PLAN.md).

Asserts the new app's place_lightning_arresters produces identical
PlacedLA records to the legacy reference at baseline-v1-20260429
on phaseboundary2.kmz, given LayoutParameters() defaults +
enable_cable_calc=True.

Skips when baseline JSON lacks placed_las[] (capture script not yet
extended); fails when la_manager port is missing.
"""

import json
import math
from pathlib import Path

import pytest

from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.models.project import (
    DesignType, LayoutParameters, LayoutResult, PlacedTable,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
KMZ_DIR = REPO_ROOT / "python/pvlayout_engine/tests/golden/kmz"
BASELINE_DIR = (
    REPO_ROOT / "docs/parity/baselines/baseline-v1-20260429/ground-truth"
)
POS_TOL = 1e-6   # metres


def _load_baseline(plant: str) -> dict:
    p = BASELINE_DIR / plant / "numeric-baseline.json"
    if not p.exists():
        pytest.skip(f"baseline missing: {p}")
    return json.loads(p.read_text())


def _run_pipeline_through_la(kmz_path: Path):
    """Run new app pipeline up to LA placement (skip string inverters)."""
    parsed = parse_kmz(str(kmz_path))
    assert parsed.boundaries
    params = LayoutParameters()
    params.enable_cable_calc = True
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    valid = []
    for r in results:
        if r.usable_polygon is None:
            continue
        place_lightning_arresters(r, params)
        valid.append(r)
    return valid


def test_phaseboundary2_la_parity():
    """Row #2 acceptance: count + per-position match against legacy."""
    baseline = _load_baseline("phaseboundary2")
    if "placed_las" not in baseline:
        pytest.skip(
            "baseline JSON has no placed_las[]; recapture with extended "
            "capture_legacy_baseline.py"
        )

    expected = baseline["placed_las"]
    results = _run_pipeline_through_la(KMZ_DIR / "phaseboundary2.kmz")
    actual = [la for r in results for la in r.placed_las]

    # Count parity
    assert len(actual) == len(expected), (
        f"LA count drift: new app {len(actual)} vs legacy {len(expected)}"
    )
    assert len(actual) == 22, f"phaseboundary2 should have 22 LAs, got {len(actual)}"

    # Per-position parity (bit-exact in practice)
    for i, (a, e) in enumerate(zip(actual, expected)):
        assert math.isclose(a.x,      e["x"],      abs_tol=POS_TOL), f"LA[{i}].x"
        assert math.isclose(a.y,      e["y"],      abs_tol=POS_TOL), f"LA[{i}].y"
        assert math.isclose(a.width,  e["width"],  abs_tol=POS_TOL), f"LA[{i}].width"
        assert math.isclose(a.height, e["height"], abs_tol=POS_TOL), f"LA[{i}].height"
        assert math.isclose(a.radius, e["radius"], abs_tol=POS_TOL), f"LA[{i}].radius"
        assert a.index == e["index"], f"LA[{i}].index"


def test_sat_branch_smoke():
    """SAT branch executes without exception on a synthetic 200×200 m polygon
    with two tracker tables; produces ≥1 LA. No parity assertion — phaseboundary2
    is FT. Functional SAT verification is row #9's job."""
    from shapely.geometry import Polygon as ShapelyPolygon

    poly = ShapelyPolygon([(0, 0), (200, 0), (200, 200), (0, 200)])

    # Two synthetic tracker tables 5.5 m apart in E-W → one inter-row gap
    tables = [
        PlacedTable(x=50.0,  y=80.0, width=2.0, height=63.8, row_index=0, col_index=0),
        PlacedTable(x=55.5,  y=80.0, width=2.0, height=63.8, row_index=0, col_index=1),
    ]

    result = LayoutResult(
        boundary_name="sat-smoke",
        design_type=DesignType.SINGLE_AXIS_TRACKER,
        placed_tables=tables,
        usable_polygon=poly,
    )

    place_lightning_arresters(result, params=None)

    assert result.num_las >= 1, "SAT smoke: expected at least one LA"
    # SAT pole footprint
    for la in result.placed_las:
        assert la.width  == 1.0
        assert la.height == 1.0
    # Step 3 must NOT remove tables in SAT mode
    assert len(result.placed_tables) == 2, "SAT must not remove tracker tables"
```

### 2.3 `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py`

Add `placed_las` block to the JSON payload, mirroring how `dc_cable_runs` and `ac_cable_runs` are dumped. Concretely, alongside the existing per-result aggregation:

```python
# Inside the loop that aggregates per-result data into payload:
payload["placed_las"].extend([
    {
        "x":      la.x,
        "y":      la.y,
        "width":  la.width,
        "height": la.height,
        "radius": la.radius,
        "index":  la.index,
    }
    for la in r.placed_las
])
```

Initialise `payload["placed_las"] = []` in the same block where `dc_cable_runs` / `ac_cable_runs` lists are initialised.

The exact insertion point will be determined when the implementation plan reads the script. Pattern is "wherever the existing cable-run dumps happen, do the same for LAs."

### 2.4 `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json`

Recapture once via the extended script. Existing content regenerates identically (deterministic legacy code, identical KMZ + params); the diff shows only the additive `placed_las[]` block (22 records). The HEAD SHA at recapture is recorded under `legacy_sha_at_capture` as before — likely still `397aa2ab460d8f773376f51b393407e5be67dca0` since legacy hasn't moved.

If the legacy HEAD has advanced, that advance is noted in the recapture commit message and a follow-up may be needed (per the [parity baseline](../../parity/baselines/baseline-v1-20260429/manifest.md) re-baseline policy from memory).

### 2.5 `docs/parity/baselines/baseline-v1-20260429/manifest.md`

Add one bullet under "Captured numbers — phaseboundary2" or as its own subsection:

> **LA positions:** `placed_las[]` (22 records: `x`, `y`, `width`, `height`, `radius`, `index`) added 2026-04-29 for row #2 parity test.

### 2.6 `docs/PLAN.md`

Flip row #2 to **done**, bump status header `2 / 12 done.` → `3 / 12 done.`

## 3. Acceptance

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q
```

- All existing tests still pass (regression net for row #1's field additions).
- `tests/parity/test_la_placement_parity.py::test_phaseboundary2_la_parity` passes (new — count + per-position match on phaseboundary2).
- `tests/parity/test_la_placement_parity.py::test_sat_branch_smoke` passes (new — SAT branch import + execute).

Expected count: previous 72 passed → **74 passed** after this row (two new tests). Skips remain at 6.

## 4. Risks

- **Helper extraction silent drift.** Lifting `_snap_inside` from a closure to a module-level function with explicit `poly` could pick up a subtle reordering of operations. Mitigated by the parity test asserting bit-exact (1e-6 m) match — any drift fails fast.
- **Capture script side-effects.** Re-running `capture_legacy_baseline.py` against a moved legacy HEAD would silently regenerate other fields with new values. Mitigated by inspecting the JSON diff: it should contain only the additive `placed_las[]` block; counts/totals/cables shouldn't change. If they do, stop and investigate (legacy moved → re-baseline conversation).
- **SAT smoke test flakiness.** Hard-coded 200×200 m polygon + two tables is a synthetic toy; if real SAT plants need more LAs to satisfy Step 2 coverage we'd see that in row #9. The smoke test only asserts the path executes and produces ≥1 LA, which is a low bar that should never fail unless the SAT branch has a runtime exception.

## 5. Out of scope

- **SAT parity testing.** Row #9 (tracker layout mode, T3) introduces a SAT plant + baseline; SAT LA parity assertions live there.
- **`complex-plant-layout` parity.** Baseline still deferred per [manifest.md](../../parity/baselines/baseline-v1-20260429/manifest.md). Re-attempt once row #6 (layout engine + S11.5 caps) lands; the plant may then be tractable for legacy capture.
- **Pydantic schemas / TS types.** Same as row #1 — `pvlayout_core` only; consumer surfaces follow downstream.
- **Frontend UI.** No LA UX changes in this row. Visual rendering of LAs is already wired (post-S11.5).

## 6. Implementation order (for the implementation plan)

1. Extend `capture_legacy_baseline.py` (add `placed_las[]` aggregation).
2. Recapture phaseboundary2 — verify diff is additive-only.
3. Update `manifest.md` with the LA-positions note.
4. Commit infrastructure: `parity: extend baseline capture with placed_las positions`.
5. Edit `pvlayout_core/core/la_manager.py` per §2.1.
6. Add `tests/parity/test_la_placement_parity.py` per §2.2.
7. Run `uv run pytest tests/ -q` from `python/pvlayout_engine/`. Expect 74 passed, 6 skipped, 0 failed.
8. Flip `docs/PLAN.md` row #2 + status count.
9. Commit row: `parity: row #2 — LA placement algorithm`.

Two atomic commits on `main` (infrastructure + row). The PLAN.md flip can ride with the row commit since it's a one-line docs change.

## 7. Cross-references

- [`docs/PLAN.md`](../../PLAN.md) row #2.
- [`docs/superpowers/specs/2026-04-29-row-1-project-model-fields-design.md`](2026-04-29-row-1-project-model-fields-design.md) — row #1 added `DesignType.SINGLE_AXIS_TRACKER` and `LayoutResult.design_type`, both of which row #2 reads.
- [`docs/parity/baselines/baseline-v1-20260429/manifest.md`](../../parity/baselines/baseline-v1-20260429/manifest.md) — baseline authority + extension note (§2.5).
- [`python/pvlayout_engine/tests/parity/test_p00_bundled_mst_parity.py`](../../../python/pvlayout_engine/tests/parity/test_p00_bundled_mst_parity.py) — parity-test pattern reference.
- Legacy source at `/Users/arunkpatra/codebase/PVlayout_Advance/core/la_manager.py` on branch `baseline-v1-20260429`.
- New project target at `/Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/la_manager.py`.
