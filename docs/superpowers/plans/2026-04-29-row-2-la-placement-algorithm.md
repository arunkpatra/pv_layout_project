# Row #2 — LA placement algorithm (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port legacy `core/la_manager.py` (helper extraction + SAT branch) into the new project, extend the parity capture script to record LA positions, recapture the `phaseboundary2` baseline, and add a parity test that asserts count + per-position match against the legacy baseline.

**Architecture:** Two atomic commits on `main`. Commit 1 = capture infrastructure (script extension + recaptured baseline + manifest note). Commit 2 = la_manager port + parity test + PLAN.md flip. Splitting them keeps the row commit focused on the algorithm; the capture extension is reusable infrastructure for future T2 rows.

**Tech Stack:** Python 3.12, `dataclasses`, `shapely`, sidecar pytest. Legacy reference at `/Users/arunkpatra/codebase/PVlayout_Advance` branch `baseline-v1-20260429`.

**Spec:** [`docs/superpowers/specs/2026-04-29-row-2-la-placement-algorithm-design.md`](../specs/2026-04-29-row-2-la-placement-algorithm-design.md) (committed `ad0eae5`).

**Tier:** T2 (per [`docs/PLAN.md`](../../PLAN.md)) — port + numeric parity test against the legacy baseline. No spec-reviewer subagent (the change is mechanical: helper extraction + SAT branch port + parity test from existing pattern).

---

## File structure

**Phase A — capture infrastructure (commit 1):**

- Modify: `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py` — extend `_aggregate_results` and payload to include per-LA records
- Modify: `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json` — recapture; only additive change is a new `placed_las[]` block
- Modify: `docs/parity/baselines/baseline-v1-20260429/manifest.md` — note the LA-positions extension

**Phase B — algorithm port (commit 2):**

- Modify: `python/pvlayout_engine/pvlayout_core/core/la_manager.py` — module docstring, imports, SAT constants, helper extraction (`_build_grid`, `_snap_inside`), new helper (`_sat_gap_x_centers`), SAT-aware `place_lightning_arresters`
- Create: `python/pvlayout_engine/tests/parity/test_la_placement_parity.py` — FT parity test + SAT smoke test
- Modify: `docs/PLAN.md` — flip row #2 to `done`, bump status count

---

## Pre-flight

- [ ] **Step 0: Confirm legacy repo is at the baseline branch**

Run from repo root:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
```

Expected:

```
baseline-v1-20260429
397aa2ab460d8f773376f51b393407e5be67dca0
```

If the branch is wrong, run `git -C /Users/arunkpatra/codebase/PVlayout_Advance checkout baseline-v1-20260429` before proceeding (the recapture in Task 2 must run against this exact baseline). If the SHA has advanced beyond `397aa2a`, stop and surface — it means legacy moved since the last baseline and a re-baseline conversation is needed before this row continues.

- [ ] **Step 1: Confirm pytest baseline is 72 passed / 6 skipped**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: a line ending with `72 passed, 6 skipped` (with any number of warnings). This is the baseline before row #2; we'll confirm it grows to `74 passed, 6 skipped` at the end of Phase B.

---

# Phase A — capture infrastructure

## Task 1: Extend capture script with `placed_las[]`

**Files:**
- Modify: `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py`

The script currently dumps `dc_cable_runs[]` and `ac_cable_runs[]` but not LA positions. We add a `_serialize_la` helper, extend `_aggregate_results` to collect per-LA dicts, and add the `placed_las` key to the payload.

- [ ] **Step 1: Add `_serialize_la` helper next to `_serialize_cable`**

Locate the `_serialize_cable` function (currently at line 141). Immediately after its closing brace, add:

```python
def _serialize_la(la) -> Dict[str, Any]:
    """Convert legacy PlacedLA to JSON-friendly dict for parity comparison."""
    return {
        "x": la.x,
        "y": la.y,
        "width": la.width,
        "height": la.height,
        "radius": la.radius,
        "index": la.index,
    }
```

- [ ] **Step 2: Extend `_aggregate_results`**

In the `_aggregate_results` function, find this block:

```python
    dc_cables: List[Dict[str, Any]] = []
    ac_cables: List[Dict[str, Any]] = []

    for r in results:
```

Replace with:

```python
    dc_cables: List[Dict[str, Any]] = []
    ac_cables: List[Dict[str, Any]] = []
    las: List[Dict[str, Any]] = []

    for r in results:
```

Then find the inner loop's tail:

```python
        dc_cables.extend(_serialize_cable(c) for c in r.dc_cable_runs)
        ac_cables.extend(_serialize_cable(c) for c in r.ac_cable_runs)
```

Replace with:

```python
        dc_cables.extend(_serialize_cable(c) for c in r.dc_cable_runs)
        ac_cables.extend(_serialize_cable(c) for c in r.ac_cable_runs)
        las.extend(_serialize_la(la) for la in r.placed_las)
```

Finally find the return:

```python
    return {"counts": counts, "totals": totals, "dc_cable_runs": dc_cables, "ac_cable_runs": ac_cables}
```

Replace with:

```python
    return {
        "counts": counts,
        "totals": totals,
        "dc_cable_runs": dc_cables,
        "ac_cable_runs": ac_cables,
        "placed_las": las,
    }
```

- [ ] **Step 3: Add `placed_las` to the payload**

In `main()`, find:

```python
        "counts": agg["counts"],
        "totals": agg["totals"],
        "dc_cable_runs": agg["dc_cable_runs"],
        "ac_cable_runs": agg["ac_cable_runs"],
    }
```

Replace with:

```python
        "counts": agg["counts"],
        "totals": agg["totals"],
        "placed_las": agg["placed_las"],
        "dc_cable_runs": agg["dc_cable_runs"],
        "ac_cable_runs": agg["ac_cable_runs"],
    }
```

- [ ] **Step 4: Verify the script parses cleanly**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
uv run --project python/pvlayout_engine python -c "import ast; ast.parse(open('python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py').read()); print('OK')"
```

Expected: `OK`

If it errors with a syntax issue, re-read the file and fix the indentation or comma placement before continuing.

---

## Task 2: Recapture phaseboundary2 baseline

**Files:**
- Modify: `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json`

- [ ] **Step 1: Run the extended capture**

Run from repo root:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
uv run --project python/pvlayout_engine python python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py \
    --kmz python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz \
    --plant phaseboundary2 \
    --legacy-repo /Users/arunkpatra/codebase/PVlayout_Advance \
    --baseline baseline-v1-20260429
```

Expected output (the timings line will vary; the counts line must match):

```
[info] running legacy pipeline on phaseboundary2.kmz
[info] wrote docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json
[info] tables=611 inverters=62 las=22 dc_cables=<N> ac_cables=<M>
[info] total_dc=<X>m total_ac=<Y>m
```

The `tables=611 inverters=62 las=22` portion is the contract — these are the legacy reference numbers. If they differ, stop and investigate (legacy may have moved; see Pre-flight Step 0).

- [ ] **Step 2: Spot-check that `placed_las[]` is present and has 22 entries**

Run:

```bash
python3 -c "
import json
d = json.load(open('docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json'))
las = d.get('placed_las', [])
print('placed_las length:', len(las))
print('first:', las[0] if las else None)
print('last:', las[-1] if las else None)
"
```

Expected: `placed_las length: 22`, with `first` and `last` showing dicts containing `x`, `y`, `width=40.0`, `height=14.0`, `radius=100.0`, and `index` values from 1 to 22.

---

## Task 3: Verify the JSON diff is additive-only

**Files:**
- Inspect: `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json`

This step is the safety net: if the recapture changed any pre-existing fields (counts, totals, cable lists, timings), it means either the capture script lost determinism or legacy moved — both warrant stopping and investigating before the diff lands.

- [ ] **Step 1: Inspect the diff**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git diff -U0 docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json | head -80
```

Expected: lines added belong to one of these groups:
- A new `"placed_las": [ ... ]` block (22 records)
- `"captured_at": "..."` value updated (timestamp moves on every recapture — this is fine)
- `"timings_s": { ... }` values updated (wall-clock measurements move — this is fine)
- `"legacy_sha_at_capture"` may be the same as before (`397aa2a...`) — if it has changed, surface that as a heads-up

Lines that must NOT change:
- `"counts": {...}` — the six count integers (`placed_tables: 611`, `placed_string_inverters: 62`, `placed_las: 22`, `placed_icrs: 2`, `dc_cable_runs`, `ac_cable_runs`)
- `"totals": {...}` — the three rounded floats (`total_capacity_kwp`, `total_dc_cable_m`, `total_ac_cable_m`)
- Every entry inside `"dc_cable_runs": [...]` and `"ac_cable_runs": [...]`

- [ ] **Step 2: Programmatic check that counts and totals are unchanged**

Run:

```bash
git stash push -- docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json
python3 -c "
import json
old = json.load(open('docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json'))
print('OLD counts:', old['counts'])
print('OLD totals:', old['totals'])
print('OLD dc_cable_runs len:', len(old['dc_cable_runs']))
print('OLD ac_cable_runs len:', len(old['ac_cable_runs']))
"
git stash pop
python3 -c "
import json
new = json.load(open('docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json'))
print('NEW counts:', new['counts'])
print('NEW totals:', new['totals'])
print('NEW dc_cable_runs len:', len(new['dc_cable_runs']))
print('NEW ac_cable_runs len:', len(new['ac_cable_runs']))
print('NEW placed_las len:', len(new['placed_las']))
"
```

Expected: the OLD and NEW lines for `counts`, `totals`, and the cable list lengths match exactly. NEW also has `placed_las len: 22`.

If counts/totals/cables changed: stop. The recapture is supposed to be deterministic, and any drift signals either a script bug (Task 1 introduced a side effect) or legacy moved (Pre-flight Step 0 should have caught this). Don't proceed.

---

## Task 4: Update manifest with LA-positions note

**Files:**
- Modify: `docs/parity/baselines/baseline-v1-20260429/manifest.md`

- [ ] **Step 1: Add the note**

Find this section heading in the manifest:

```markdown
## Captured numbers — `phaseboundary2`
```

Below the existing table (after the `total_ac_cable_m` row and the structure-breakdown paragraphs that follow it), and before the next `## Params used` heading, insert:

```markdown
**LA positions:** `placed_las[]` (22 records: `x`, `y`, `width`, `height`, `radius`, `index`) added 2026-04-29 for row #2 parity test.
```

- [ ] **Step 2: Spot-check it landed**

Run:

```bash
grep -n "LA positions" docs/parity/baselines/baseline-v1-20260429/manifest.md
```

Expected: a single matching line under the "Captured numbers" section.

---

## Task 5: Commit Phase A — infrastructure

**Files:**
- Stage and commit:
  - `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py`
  - `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json`
  - `docs/parity/baselines/baseline-v1-20260429/manifest.md`

- [ ] **Step 1: Confirm only the expected files changed**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git status
```

Expected:

```
modified:   docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json
modified:   docs/parity/baselines/baseline-v1-20260429/manifest.md
modified:   python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py
```

If any other files appear, roll them back before committing — Phase A is strictly the capture-infrastructure change.

- [ ] **Step 2: Stage and commit**

Run:

```bash
git add python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py \
        docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json \
        docs/parity/baselines/baseline-v1-20260429/manifest.md
git commit -m "$(cat <<'EOF'
parity: extend baseline capture with placed_las positions

Add _serialize_la helper, extend _aggregate_results to collect per-LA
records, and add placed_las[] to the payload. Recapture phaseboundary2
baseline JSON — counts/totals/cables unchanged (deterministic legacy
code), placed_las[] added (22 records).

Enables row #2's per-position LA parity assertion without weakening
the existing cable-parity contract.
EOF
)" && git log -1 --stat
```

Expected: most-recent commit titled `parity: extend baseline capture with placed_las positions` showing 3 files changed.

---

# Phase B — algorithm port

## Task 6: Update `la_manager.py` — imports, constants, helpers

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/la_manager.py`

This task does the structural changes (imports, constants, helper functions). Task 7 rewrites the `place_lightning_arresters` body to use them.

- [ ] **Step 1: Update the module docstring**

Replace the current module docstring (lines 1–16) with:

```python
"""
Lightning Arrester (LA) manager.

Fixed-tilt placement logic:
  - Each LA has a physical footprint of 40 m (E-W) × 14 m (N-S).
  - Each LA protects a circular area of radius 100 m from its centre.
  - LAs are placed on a regular square grid with spacing = LA_RADIUS (100 m)
    so that adjacent protection circles overlap and every point inside the
    plant boundary is within 100 m of at least one LA.
  - Grid spacing of R guarantees the worst-case gap distance is R*√2/2 ≈ 70.7 m,
    well within the 100 m radius — providing a minimum 29 % coverage overlap.
  - Only grid positions whose centre lies inside usable_polygon are kept.
  - After the grid pass, any table whose centre is > LA_RADIUS from every
    placed LA gets an additional LA placed at the nearest valid position.
  - Any panel table whose footprint overlaps an LA rectangle is removed.

Single Axis Tracker (SAT) placement logic — identical grid logic as fixed tilt:
  - LA footprint is 1 m × 1 m (diameter 1 m pole/mast marker).
  - The same 100 m × 100 m grid is used (identical anchor + spacing to FT).
  - Each grid X position is snapped to the nearest E-W inter-row gap centre
    so that the LA pole sits in the gap between tracker columns, never on
    a tracker unit.
  - Duplicate (snapped_x, gy) pairs from different grid X values converging
    on the same gap are deduplicated — the LA count stays comparable to FT.
  - Coverage check (Step 2) and re-index run identically to fixed tilt.
  - No tracker units are removed (Step 3 is skipped for SAT).
"""
```

- [ ] **Step 2: Update the imports**

Find the existing `typing` import:

```python
import math
from typing import List, Optional, Tuple
```

Replace with:

```python
import math
from typing import List, Optional, Set, Tuple
```

Then find the `pvlayout_core.models.project` import block:

```python
from pvlayout_core.models.project import (
    LayoutResult, LayoutParameters,
    PlacedLA, LA_EW, LA_NS, LA_RADIUS,
)
```

Replace with:

```python
from pvlayout_core.models.project import (
    LayoutResult, LayoutParameters,
    PlacedLA, PlacedTable, LA_EW, LA_NS, LA_RADIUS,
    DesignType,
)
```

- [ ] **Step 3: Add SAT footprint constants**

Find the existing `GRID_SPACING` constant:

```python
# Grid spacing = protection radius → overlapping circles, full coverage
GRID_SPACING = LA_RADIUS   # 100 m
```

Replace with:

```python
# Grid spacing = protection radius → overlapping circles, full coverage
GRID_SPACING = LA_RADIUS   # 100 m

# For Single Axis Tracker layouts the LA is a pole/mast, not a building.
# Use a 1 m × 1 m footprint (diameter = 1 m) so no tracker units are displaced.
LA_SAT_W = 1.0   # metres (E-W)
LA_SAT_H = 1.0   # metres (N-S)


# ---------------------------------------------------------------------------
# Shared helper: build the standard 100 m × 100 m grid over a polygon
# ---------------------------------------------------------------------------

def _build_grid(poly) -> Tuple[List[float], List[float]]:
    """Return (xs, ys) — two sorted lists of 100 m grid coordinates
    centred on the polygon centroid and extended to cover its bounding box."""
    minx, miny, maxx, maxy = poly.bounds
    try:
        cx0 = poly.centroid.x
        cy0 = poly.centroid.y
    except Exception:
        cx0 = (minx + maxx) / 2.0
        cy0 = (miny + maxy) / 2.0

    xs: List[float] = []
    x = cx0
    while x >= minx - GRID_SPACING:
        xs.append(x); x -= GRID_SPACING
    x = cx0 + GRID_SPACING
    while x <= maxx + GRID_SPACING:
        xs.append(x); x += GRID_SPACING

    ys: List[float] = []
    y = cy0
    while y >= miny - GRID_SPACING:
        ys.append(y); y -= GRID_SPACING
    y = cy0 + GRID_SPACING
    while y <= maxy + GRID_SPACING:
        ys.append(y); y += GRID_SPACING

    return sorted(xs), sorted(ys)


# ---------------------------------------------------------------------------
# SAT helper: derive E-W inter-row gap centres from placed tracker tables
# ---------------------------------------------------------------------------

def _sat_gap_x_centers(tables: List[PlacedTable]) -> List[float]:
    """
    Return X coordinates of the midpoint of each E-W gap between adjacent
    tracker row columns.

    Steps:
      1. Round each table's left-edge X to 0.1 m and collect unique values.
      2. Cluster nearby values (within 0.5 m) to handle floating-point scatter.
      3. For each consecutive pair of clusters compute:
             gap_cx = (right_edge_of_left_col + left_edge_of_right_col) / 2
    """
    if not tables:
        return []

    raw = sorted(set(round(t.x, 1) for t in tables))

    # Cluster: merge values within 0.5 m
    clusters: List[float] = []
    for rx in raw:
        if not clusters or rx - clusters[-1] > 0.5:
            clusters.append(rx)

    # Representative width per cluster
    col_width: dict = {}
    for t in tables:
        closest = min(clusters, key=lambda c: abs(t.x - c))
        if closest not in col_width:
            col_width[closest] = t.width

    gap_xs: List[float] = []
    for i in range(len(clusters) - 1):
        c_left  = clusters[i]
        c_right = clusters[i + 1]
        right_edge = c_left + col_width.get(c_left, 0.0)
        left_edge  = c_right
        gap_xs.append((right_edge + left_edge) / 2.0)

    return gap_xs


# ---------------------------------------------------------------------------
# Shared helper: nudge a point to the nearest interior point of poly
# ---------------------------------------------------------------------------

def _snap_inside(gx: float, gy: float, poly) -> Tuple[float, float]:
    """Nudge a point that is outside poly to the nearest interior point."""
    try:
        if poly.contains(ShapelyPoint(gx, gy)):
            return gx, gy
        nearest = poly.exterior.interpolate(
            poly.exterior.project(ShapelyPoint(gx, gy)))
        dcx = poly.centroid.x - nearest.x
        dcy = poly.centroid.y - nearest.y
        dist = math.sqrt(dcx ** 2 + dcy ** 2) or 1.0
        return (nearest.x + dcx / dist * 0.5,
                nearest.y + dcy / dist * 0.5)
    except Exception:
        return gx, gy
```

- [ ] **Step 4: Verify the module imports cleanly**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.core.la_manager import (
    GRID_SPACING, LA_SAT_W, LA_SAT_H,
    _build_grid, _sat_gap_x_centers, _snap_inside,
    place_lightning_arresters,
)
print('GRID_SPACING:', GRID_SPACING)
print('LA_SAT_W:', LA_SAT_W, 'LA_SAT_H:', LA_SAT_H)
print('helpers callable:', all(callable(f) for f in [_build_grid, _sat_gap_x_centers, _snap_inside, place_lightning_arresters]))
"
```

Expected:

```
GRID_SPACING: 100.0
LA_SAT_W: 1.0 LA_SAT_H: 1.0
helpers callable: True
```

Note: at this point `place_lightning_arresters` still contains its old inline `_snap_inside` closure and the old inline grid loop — we'll replace its body in Task 7. Both old and new helpers coexist temporarily; that's fine because the old code shadows nothing module-level.

---

## Task 7: Rewrite `place_lightning_arresters` body with SAT branch

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/la_manager.py`

- [ ] **Step 1: Replace the function body**

Find the entire `place_lightning_arresters` function (it starts with `def place_lightning_arresters(` and currently contains the inline grid construction, the inline `_snap_inside` nested function, and Steps 1/2/3). Replace the **entire function** with:

```python
def place_lightning_arresters(
    result: LayoutResult,
    params: Optional[LayoutParameters] = None,
) -> None:
    """
    Compute and store LA positions in *result* (in-place).

    Both SAT and fixed-tilt use the same 100 m × 100 m grid logic.
    The only differences for SAT are:
      • Each grid X is snapped to the nearest inter-row gap centre.
      • LA footprint is 1 m × 1 m (pole marker) instead of 40 × 14 m.
      • No tracker units are removed (Step 3 skipped).
    """
    result.placed_las = []
    result.num_las    = 0

    poly = result.usable_polygon
    if poly is None or poly.is_empty:
        return

    is_sat = (result.design_type == DesignType.SINGLE_AXIS_TRACKER)

    # ── Choose footprint size ──────────────────────────────────────────────────
    la_w = LA_SAT_W if is_sat else LA_EW
    la_h = LA_SAT_H if is_sat else LA_NS

    # ── For SAT: derive inter-row gap X centres ────────────────────────────────
    gap_xs: List[float] = []
    if is_sat:
        gap_xs = _sat_gap_x_centers(result.placed_tables)
        if not gap_xs:
            # Only one tracker column (or no tables) — use polygon centroid X
            try:
                gap_xs = [poly.centroid.x]
            except Exception:
                minx, _, maxx, _ = poly.bounds
                gap_xs = [(minx + maxx) / 2.0]

    # ── Step 1: 100 m × 100 m grid pass ───────────────────────────────────────
    xs, ys = _build_grid(poly)

    placed: List[PlacedLA] = []
    seen:   Set[Tuple[float, float]] = set()   # dedup key for SAT snapping
    idx = 1

    for gx in xs:
        # SAT: snap grid X to nearest inter-row gap; FT: use grid X as-is
        place_x = min(gap_xs, key=lambda gapx: abs(gapx - gx)) if is_sat else gx

        for gy in ys:
            key = (round(place_x, 2), round(gy, 2))
            if key in seen:
                continue   # already added by a different grid column

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

    # ── Step 2: Coverage check — same logic for both SAT and FT ───────────────
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
                # Snap to nearest gap X then nudge inside poly
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

    # ── Step 3: Remove tables overlapping LA footprint (fixed tilt only) ──────
    if is_sat:
        return   # SAT: LA is a 1 m pole — no trackers displaced

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

    # Update capacity stats if params supplied
    if params is not None:
        mpt = params.table.modules_per_table()
        total_modules             = len(remaining) * mpt
        total_kwp                 = total_modules * params.module.wattage / 1000.0
        result.total_modules      = total_modules
        result.total_capacity_kwp = round(total_kwp, 2)
        result.total_capacity_mwp = round(total_kwp / 1000.0, 4)
```

- [ ] **Step 2: Verify the module still imports and FT smoke runs**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from shapely.geometry import Polygon as ShapelyPolygon
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.models.project import LayoutResult, DesignType, PlacedTable

poly = ShapelyPolygon([(0,0),(300,0),(300,300),(0,300)])
result = LayoutResult(
    boundary_name='ft-smoke',
    design_type=DesignType.FIXED_TILT,
    placed_tables=[PlacedTable(x=100, y=100, width=20, height=20, row_index=0, col_index=0)],
    usable_polygon=poly,
)
place_lightning_arresters(result, params=None)
print('FT smoke num_las:', result.num_las)
assert result.num_las >= 1
print('OK')
"
```

Expected:

```
FT smoke num_las: <some integer ≥ 1>
OK
```

- [ ] **Step 3: Run the existing P0 parity test as a regression check**

Run:

```bash
uv run pytest tests/parity/test_p00_bundled_mst_parity.py -v 2>&1 | tail -10
```

Expected: every test in that file still passes (it consumes `place_lightning_arresters` indirectly via the pipeline). If anything fails, the helper extraction broke FT parity — re-read Task 6 + Task 7 against the legacy code in `/Users/arunkpatra/codebase/PVlayout_Advance/core/la_manager.py` and fix.

---

## Task 8: Add LA parity test

**Files:**
- Create: `python/pvlayout_engine/tests/parity/test_la_placement_parity.py`

- [ ] **Step 1: Create the test file**

Write the entire file contents:

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

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.models.project import (
    DesignType,
    LayoutParameters,
    LayoutResult,
    PlacedTable,
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
    assert parsed.boundaries, f"no boundaries from {kmz_path}"
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
        PlacedTable(x=50.0, y=80.0, width=2.0, height=63.8, row_index=0, col_index=0),
        PlacedTable(x=55.5, y=80.0, width=2.0, height=63.8, row_index=0, col_index=1),
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

- [ ] **Step 2: Run the new test in isolation**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/parity/test_la_placement_parity.py -v 2>&1 | tail -15
```

Expected: both tests pass:

```
tests/parity/test_la_placement_parity.py::test_phaseboundary2_la_parity PASSED
tests/parity/test_la_placement_parity.py::test_sat_branch_smoke PASSED
```

If `test_phaseboundary2_la_parity` fails with a position drift on a specific LA index, that's the helper-extraction-introduced drift the spec §4 risk section anticipated: re-read Task 7's body against legacy and find the divergent spot. The most likely culprit is operator precedence in one of the arithmetic lines; eyeball each `± la_w / 2` and `± la_h / 2` carefully.

If `test_sat_branch_smoke` fails, the SAT branch has a runtime error — read the traceback and fix.

---

## Task 9: Run the full sidecar pytest suite

**Files:**
- No edit. Acceptance check from `docs/PLAN.md` row #2.

- [ ] **Step 1: Run the full suite**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: a line ending with `74 passed, 6 skipped` (or possibly `74 passed, 6 skipped, 11 warnings` — warnings are fine).

If the count is something other than 74 passed, identify the failing test from the longer output (`uv run pytest tests/ -q 2>&1 | grep -E "FAIL|ERROR"`) and fix before continuing.

---

## Task 10: Flip PLAN.md status

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Update Row #2 status to `done`**

Find:

```markdown
| 2 | LA placement algorithm | T2 | `core/la_manager.py` @ `9362083` | Sidecar pytest green; parity LA count + position match on phaseboundary2. | todo |
```

Replace with:

```markdown
| 2 | LA placement algorithm | T2 | `core/la_manager.py` @ `9362083` | Sidecar pytest green; parity LA count + position match on phaseboundary2. | **done** |
```

- [ ] **Step 2: Bump the count in the header status line**

Change:

```markdown
**Status:** 2 / 12 done.
```

to:

```markdown
**Status:** 3 / 12 done.
```

---

## Task 11: Commit Phase B — algorithm port

**Files:**
- Stage and commit:
  - `python/pvlayout_engine/pvlayout_core/core/la_manager.py`
  - `python/pvlayout_engine/tests/parity/test_la_placement_parity.py`
  - `docs/PLAN.md`

- [ ] **Step 1: Confirm only the expected files changed**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git status
```

Expected:

```
modified:   docs/PLAN.md
modified:   python/pvlayout_engine/pvlayout_core/core/la_manager.py

Untracked files:
        python/pvlayout_engine/tests/parity/test_la_placement_parity.py
```

If anything else is dirty, roll back the stray changes.

- [ ] **Step 2: Stage and commit**

Run:

```bash
git add python/pvlayout_engine/pvlayout_core/core/la_manager.py \
        python/pvlayout_engine/tests/parity/test_la_placement_parity.py \
        docs/PLAN.md
git commit -m "$(cat <<'EOF'
parity: row #2 — LA placement algorithm

Port legacy core/la_manager.py @ baseline-v1-20260429 commit 9362083:

- Extract _build_grid and _snap_inside to module-level helpers
  (previously inline / nested inside place_lightning_arresters);
  fixed-tilt path remains byte-equivalent.
- Add _sat_gap_x_centers helper.
- Add SAT branch to place_lightning_arresters: detect via
  result.design_type, use 1 m × 1 m pole footprint, snap each grid X
  to the nearest E-W inter-row gap centre, dedupe collisions, skip
  Step 3 (table-overlap removal) for SAT.
- Update module docstring to document both FT and SAT paths.

New parity test tests/parity/test_la_placement_parity.py asserts:
- phaseboundary2 produces exactly 22 LAs
- every LA's (x, y, width, height, radius, index) matches legacy
  baseline within 1e-6 m tolerance (deterministic; bit-exact in
  practice)
- SAT branch executes on a synthetic polygon + tracker tables
  without exception, produces ≥1 LA, does not remove tables

Sidecar pytest: 74 passed, 6 skipped, 0 failed.

Spec: docs/superpowers/specs/2026-04-29-row-2-la-placement-algorithm-design.md
Plan: docs/superpowers/plans/2026-04-29-row-2-la-placement-algorithm.md
PLAN row: docs/PLAN.md row #2 (T2).
EOF
)" && git log -1 --stat
```

- [ ] **Step 3: Verify the commit landed**

Run:

```bash
git log --oneline -5
```

Expected:

```
<sha2> parity: row #2 — LA placement algorithm
<sha1> parity: extend baseline capture with placed_las positions
<sha-spec-row2> docs: spec for PLAN row #2 — LA placement algorithm
<sha-plan-row1> parity: mark row #1 done in PLAN.md
<sha-row1>     parity: row #1 — project model field additions
```

(Exact hashes vary; the order of the top two `parity:` lines is what matters.)

---

## Acceptance recap (from `docs/PLAN.md` row #2)

`cd python/pvlayout_engine && uv run pytest tests/ -q` → 74 passed, 6 skipped, 0 failed.
LA count + position match on phaseboundary2 against legacy baseline.

Met by Task 9 (full suite) and Task 8 Step 2 (isolated parity test run).

---

## Out of scope (deferred to later rows — see spec §5)

- **SAT parity testing** — row #9 (tracker layout mode, T3) introduces a SAT plant + baseline; SAT LA parity assertions live there.
- **`complex-plant-layout` parity** — baseline still deferred; re-attempt once row #6 (layout engine + S11.5 caps) lands.
- **Pydantic schemas / TS types** — `pvlayout_core` only.
- **Frontend UI** — visual rendering of LAs is already wired (post-S11.5).
