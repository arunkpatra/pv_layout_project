# P0 — Quick-Win Port + Discovery Memos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the four missing legacy functions (`_bundle_dc_cables`, `_build_mst_edges`, `_calc_individual_ac_total`, `_route_ac_mst`) from legacy `baseline-v1-20260429` into `pvlayout_core/`, preserve all S11.5 additions, and pre-file three discovery memos for Prasanta.

**Architecture:** Port four functions verbatim from legacy with two adaptations: (1) accept parameterised allowances from `LayoutParameters`, (2) thread `route_poly` through to `_route_ac_cable` so Pattern V remains globally available. Capture `_last_route_quality` after each routing call to populate `CableRun.route_quality`. Replace the new-project's per-cable DC and AC loops in `place_string_inverters` with calls to the ported bundled / MST functions. All S11.5 machinery (search-space caps, Pattern V, `route_quality`, parameterised allowances, per-ICR/inverter subtotals, `PVLAYOUT_PATTERN_STATS` instrumentation) **stays**.

**Tech Stack:** Python 3.12, Shapely 2.x, pytest, uv. No new dependencies.

**Reference parity scope:** [`docs/parity/PLAN.md`](../PLAN.md) §5 P0.
**Authoritative source:** legacy `string_inverter_manager.py` at branch `baseline-v1-20260429` / commit `9362083` (read-only; do not modify).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py` | Modify | Add four ported functions; restructure `place_string_inverters` body |
| `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py` | Create | Headless script that imports legacy via sys.path, runs full pipeline on a KMZ, dumps numerics to JSON |
| `python/pvlayout_engine/tests/parity/__init__.py` | Create | Empty package init |
| `python/pvlayout_engine/tests/parity/test_p00_bundled_mst_parity.py` | Create | Regression test asserting new app totals + counts match legacy fixture (with documented Pattern V delta) |
| `docs/parity/baselines/baseline-v1-20260429/manifest.md` | Create | Baseline metadata: commit, capture date, plant set, params used |
| `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json` | Create | Legacy numeric output dump for phaseboundary2 |
| `docs/parity/baselines/baseline-v1-20260429/ground-truth/complex-plant-layout/numeric-baseline.json` | Create | Same for complex-plant-layout |
| `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/screenshots/` | Create | Manual screenshot artifacts (legacy + new) |
| `docs/parity/baselines/baseline-v1-20260429/ground-truth/complex-plant-layout/screenshots/` | Create | Same |
| `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/exports/` | Create | Legacy KMZ + PDF + DXF exports |
| `docs/parity/baselines/baseline-v1-20260429/ground-truth/complex-plant-layout/exports/` | Create | Same |
| `docs/parity/findings/2026-04-29-001-pattern-v.md` | Create | Discovery memo: Pattern V (visibility-graph fallback) |
| `docs/parity/findings/2026-04-29-002-search-space-caps.md` | Create | Discovery memo: search-space caps in `_route_ac_cable` |
| `docs/parity/findings/2026-04-29-003-route-quality-field.md` | Create | Discovery memo: `CableRun.route_quality` field |
| `CLAUDE.md` | Modify | §2 add `docs/parity/PLAN.md` as required session-start read |
| `docs/SPIKE_PLAN.md` | Modify | Top-of-file note: parity track active; existing spikes paused |
| `docs/gates/p00.md` | Create | P0 gate memo |

---

## Task 1: Write the legacy numeric-capture script

**Files:**
- Create: `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py`
- Reference: `python/pvlayout_engine/scripts/debug/time_cable_calc.py` (existing similar script — use as pattern)

**Why:** P0's tests need numeric ground truth from legacy. Easiest reproducible source is a script that imports legacy's `core/`, `models/`, `utils/` flat namespace via sys.path manipulation, runs the standard pipeline on a KMZ, and dumps key numeric outputs to JSON.

- [ ] **Step 1: Create scripts/parity/ directory + empty __init__.py**

```bash
mkdir -p /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/scripts/parity
touch /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/scripts/parity/__init__.py
```

- [ ] **Step 2: Write the capture script**

Path: `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py`

```python
"""
Capture legacy numeric baseline for parity verification.

Runs the full layout pipeline using LEGACY's vendored core (imported via sys.path),
on a given KMZ, with cable calc enabled. Dumps numeric outputs + pattern distribution
to a JSON file in docs/parity/baselines/<baseline>/ground-truth/<plant>/numeric-baseline.json.

Usage:
    cd /Users/arunkpatra/codebase/pv_layout_project
    uv run python python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py \\
        --kmz python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz \\
        --plant phaseboundary2 \\
        --legacy-repo /Users/arunkpatra/codebase/PVlayout_Advance \\
        --baseline baseline-v1-20260429

Prerequisite: legacy repo must be checked out at the target baseline branch /
commit before running (`git -C $LEGACY_REPO checkout baseline-v1-20260429`).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any, Dict


def _bootstrap_legacy(legacy_repo: Path) -> None:
    """Insert legacy repo at front of sys.path so `from core.X` and `from models.X`
    resolve to legacy's flat layout, NOT the new project's pvlayout_core/."""
    if not (legacy_repo / "core" / "string_inverter_manager.py").exists():
        sys.exit(f"[error] legacy repo not found / not at expected layout: {legacy_repo}")
    # Insert at front so legacy wins over any vendored namespace
    sys.path.insert(0, str(legacy_repo))


def _build_default_params(legacy_models):
    """Build a LayoutParameters mimicking the legacy GUI's input-panel defaults
    (the ones used to produce the canonical phaseboundary2 numbers in S11.5 gate memo)."""
    LayoutParameters = legacy_models.LayoutParameters
    DesignMode = legacy_models.DesignMode
    TableSpec = legacy_models.TableSpec
    ModuleSpec = legacy_models.ModuleSpec

    # Default values match legacy GUI input panel defaults (see PVlayout_Advance/gui/input_panel.py).
    # These are the same values that produce the S11.5 gate memo's reference numbers
    # (placed_tables=611, placed_string_inverters=62, placed_las=22 on phaseboundary2).
    p = LayoutParameters(
        module=ModuleSpec(wattage=545, length=2.279, width=1.134),
        table=TableSpec(rows_per_table=2, modules_in_row=28),
        # Spacing / GCR / tilt / azimuth — legacy defaults
    )
    p.enable_cable_calc = True
    p.design_mode = DesignMode.STRING_INVERTER
    p.max_strings_per_inverter = 30
    return p


def _run_legacy_pipeline(kmz_path: Path):
    """Import legacy modules (after sys.path bootstrap) and run the full pipeline."""
    from core.kmz_parser import parse_kmz
    from core.layout_engine import generate_layout
    from core.icr_placer import place_icrs
    from core.la_manager import place_lightning_arresters
    from core.string_inverter_manager import place_string_inverters
    import models.project as legacy_models

    params = _build_default_params(legacy_models)

    t0 = time.perf_counter()
    boundaries = parse_kmz(str(kmz_path))
    t_parse = time.perf_counter() - t0

    if not boundaries:
        sys.exit(f"[error] no boundaries parsed from {kmz_path}")

    # Use the first boundary (phaseboundary2 + complex-plant-layout are single-boundary)
    result = boundaries[0]

    t0 = time.perf_counter()
    generate_layout(result, params)
    t_layout = time.perf_counter() - t0

    t0 = time.perf_counter()
    place_icrs(result, params)
    t_icrs = time.perf_counter() - t0

    t0 = time.perf_counter()
    place_lightning_arresters(result, params)
    t_la = time.perf_counter() - t0

    t0 = time.perf_counter()
    place_string_inverters(result, params)
    t_cables = time.perf_counter() - t0

    return result, {
        "parse_s": round(t_parse, 3),
        "layout_s": round(t_layout, 3),
        "icrs_s": round(t_icrs, 3),
        "la_s": round(t_la, 3),
        "cables_s": round(t_cables, 3),
    }


def _serialize_cable(cr) -> Dict[str, Any]:
    """Convert legacy CableRun to JSON-friendly dict.
    Legacy CableRun has no route_quality field — emit "ok" by convention."""
    return {
        "index": cr.index,
        "cable_type": cr.cable_type,
        "start_utm": list(cr.start_utm),
        "end_utm": list(cr.end_utm),
        "route_utm": [list(p) for p in cr.route_utm],
        "length_m": cr.length_m,
        "route_quality": "ok",  # legacy has no quality tagging; default
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture legacy numeric baseline")
    parser.add_argument("--kmz", required=True, type=Path)
    parser.add_argument("--plant", required=True, help="Plant slug, e.g. phaseboundary2")
    parser.add_argument("--legacy-repo", required=True, type=Path)
    parser.add_argument("--baseline", required=True, help="Baseline ID, e.g. baseline-v1-20260429")
    parser.add_argument("--out-root", type=Path,
                        default=Path("docs/parity/baselines"))
    args = parser.parse_args()

    if not args.kmz.exists():
        sys.exit(f"[error] KMZ not found: {args.kmz}")

    _bootstrap_legacy(args.legacy_repo)

    print(f"[info] running legacy pipeline on {args.kmz.name}")
    result, timings = _run_legacy_pipeline(args.kmz)

    out_dir = args.out_root / args.baseline / "ground-truth" / args.plant
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "numeric-baseline.json"

    # Cable type breakdown / pattern distribution: legacy doesn't expose pattern stats
    # (PVLAYOUT_PATTERN_STATS is an S11.5 addition). Emit cable counts only; pattern
    # distribution will be captured in P1 once we have it on both sides.
    payload = {
        "plant": args.plant,
        "baseline": args.baseline,
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "legacy_repo": str(args.legacy_repo),
        "params_summary": {
            "enable_cable_calc": True,
            "design_mode": "STRING_INVERTER",
            "module_wattage": 545,
            "rows_per_table": 2,
            "modules_in_row": 28,
            "max_strings_per_inverter": 30,
        },
        "timings_s": timings,
        "counts": {
            "placed_tables": len(result.placed_tables),
            "placed_string_inverters": len(result.placed_string_inverters),
            "placed_las": len(result.placed_las),
            "placed_icrs": len(result.placed_icrs),
            "dc_cable_runs": len(result.dc_cable_runs),
            "ac_cable_runs": len(result.ac_cable_runs),
        },
        "totals": {
            "total_capacity_kwp": round(result.total_capacity_kwp, 2),
            "total_dc_cable_m": round(result.total_dc_cable_m, 1),
            "total_ac_cable_m": round(result.total_ac_cable_m, 1),
        },
        "dc_cable_runs": [_serialize_cable(c) for c in result.dc_cable_runs],
        "ac_cable_runs": [_serialize_cable(c) for c in result.ac_cable_runs],
    }

    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)

    print(f"[info] wrote {out_path}")
    print(f"[info] tables={payload['counts']['placed_tables']} "
          f"inverters={payload['counts']['placed_string_inverters']} "
          f"las={payload['counts']['placed_las']} "
          f"dc_cables={payload['counts']['dc_cable_runs']} "
          f"ac_cables={payload['counts']['ac_cable_runs']}")
    print(f"[info] total_dc={payload['totals']['total_dc_cable_m']}m "
          f"total_ac={payload['totals']['total_ac_cable_m']}m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Smoke-test the script imports work**

Run from new project root:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
uv run python -c "
import sys
sys.path.insert(0, '/Users/arunkpatra/codebase/PVlayout_Advance')
from core.kmz_parser import parse_kmz
print('legacy import OK')
"
```

Expected: `legacy import OK`. If it fails (missing dep, etc.), install the missing dep into the new project's venv via `uv add <pkg>`.

- [ ] **Step 4: Commit the script**

```bash
git add python/pvlayout_engine/scripts/parity/__init__.py \
        python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py
git commit -m "$(cat <<'EOF'
parity(p0): legacy numeric-capture script

Runs full pipeline using legacy's flat-namespace core/ via sys.path bootstrap;
dumps placed counts, totals, and per-cable polylines to JSON for parity tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Capture legacy numeric baseline on both reference plants

**Files:**
- Create: `docs/parity/baselines/baseline-v1-20260429/manifest.md`
- Create: `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json` (auto-generated by script)
- Create: `docs/parity/baselines/baseline-v1-20260429/ground-truth/complex-plant-layout/numeric-baseline.json` (auto-generated)

- [ ] **Step 1: Verify legacy is at the correct baseline**

Run:

```bash
git -C /Users/arunkpatra/codebase/PVlayout_Advance log -1 --oneline baseline-v1-20260429
```

Expected: `9362083 feat: SAT energy fix, GHI file format hint, cable/DXF/edition improvements`

- [ ] **Step 2: Check out the baseline branch in legacy**

```bash
git -C /Users/arunkpatra/codebase/PVlayout_Advance checkout baseline-v1-20260429
```

Expected: branch checked out, working tree clean.

- [ ] **Step 3: Run the capture script on phaseboundary2**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
uv run python python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py \
    --kmz python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz \
    --plant phaseboundary2 \
    --legacy-repo /Users/arunkpatra/codebase/PVlayout_Advance \
    --baseline baseline-v1-20260429
```

Expected output (approximate; values are confirmed by reading the JSON):
```
[info] running legacy pipeline on phaseboundary2.kmz
[info] wrote docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/numeric-baseline.json
[info] tables=611 inverters=62 las=22 dc_cables=<bundled-count> ac_cables=<mst-count>
[info] total_dc=<legacy-bundled-total>m total_ac=<legacy-mst+individual-total>m
```

Note: `dc_cables` count and `ac_cables` count will be SIGNIFICANTLY smaller than 611 / 62 — that's the bundled / MST topology. The exact numbers will be captured in the JSON.

- [ ] **Step 4: Run the capture script on complex-plant-layout**

```bash
uv run python python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py \
    --kmz python/pvlayout_engine/tests/golden/kmz/complex-plant-layout.kmz \
    --plant complex-plant-layout \
    --legacy-repo /Users/arunkpatra/codebase/PVlayout_Advance \
    --baseline baseline-v1-20260429
```

- [ ] **Step 5: Write the baseline manifest**

Path: `docs/parity/baselines/baseline-v1-20260429/manifest.md`

```markdown
# Baseline: baseline-v1-20260429

**Legacy commit:** `9362083`
**Legacy branch:** `baseline-v1-20260429` (on `/Users/arunkpatra/codebase/PVlayout_Advance`)
**Captured:** 2026-04-29 (auto-fill exact timestamp from JSON)
**Captured by:** Arun (manual run of `capture_legacy_baseline.py`)

## Plants

| Plant | KMZ | Numeric baseline |
|---|---|---|
| `phaseboundary2` | `python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz` | `ground-truth/phaseboundary2/numeric-baseline.json` |
| `complex-plant-layout` | `python/pvlayout_engine/tests/golden/kmz/complex-plant-layout.kmz` | `ground-truth/complex-plant-layout/numeric-baseline.json` |

## Params used

See `params_summary` field in each `numeric-baseline.json`. These match legacy GUI's default input-panel values (module 545W, table 2×28, max 30 strings/inverter, String Inverter design mode, cable_calc enabled).

## Visual + export ground truth

Captured manually in P0 Task 3:
- `ground-truth/<plant>/screenshots/legacy-cables-on.png`
- `ground-truth/<plant>/screenshots/legacy-cables-off.png`
- `ground-truth/<plant>/exports/legacy.kmz`
- `ground-truth/<plant>/exports/legacy.pdf`
- `ground-truth/<plant>/exports/legacy.dxf`

## Tolerance for parity verification

See `docs/parity/PLAN.md` §4.

## Re-capture procedure

To re-capture this baseline (same legacy commit):

```bash
git -C /Users/arunkpatra/codebase/PVlayout_Advance checkout baseline-v1-20260429
cd /Users/arunkpatra/codebase/pv_layout_project
uv run python python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py \
    --kmz python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz \
    --plant phaseboundary2 \
    --legacy-repo /Users/arunkpatra/codebase/PVlayout_Advance \
    --baseline baseline-v1-20260429
# repeat for complex-plant-layout
```
```

- [ ] **Step 6: Commit the captured baselines**

```bash
git add docs/parity/baselines/baseline-v1-20260429/
git commit -m "$(cat <<'EOF'
parity(p0): capture legacy numeric baseline (baseline-v1-20260429)

Numeric outputs from legacy commit 9362083 on phaseboundary2 + complex-plant-layout.
Source of truth for parity verification in P0+ tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Capture legacy visual + export ground truth (manual)

**Files:**
- Create: `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/screenshots/legacy-cables-on.png`
- Create: `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/screenshots/legacy-cables-off.png`
- Create: `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/exports/legacy.kmz` / `legacy.pdf` / `legacy.dxf`
- Create: same for `complex-plant-layout`

This task is mostly user-action. Arun runs the legacy GUI app, takes screenshots, exports the three formats. I commit the artifacts.

- [ ] **Step 1: Launch legacy app on the baseline branch**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git checkout baseline-v1-20260429
# Use whatever Python env legacy normally runs in
python main.py
```

- [ ] **Step 2: Process phaseboundary2.kmz**

In legacy GUI:
1. License: enter Pro Plus license (so cables are available).
2. Open: `python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz` (or copy KMZ to legacy and open from there).
3. Set input panel defaults — module 545W / 2.279m / 1.134m, table 2 rows × 28 modules, max strings 30, String Inverter mode.
4. Check "Calculate cables".
5. Click Generate Layout.
6. Once layout completes, **screenshot**:
   - With AC cables visible (toggle ON) → save as `legacy-cables-on.png`
   - With AC cables hidden (toggle OFF) → save as `legacy-cables-off.png`
7. Export menu → Export KMZ → save as `legacy.kmz`
8. Export menu → Export PDF → save as `legacy.pdf`
9. Export menu → Export DXF → save as `legacy.dxf`

Save all to: `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/{screenshots,exports}/`

- [ ] **Step 3: Repeat for complex-plant-layout.kmz**

Same procedure; output dir: `.../ground-truth/complex-plant-layout/{screenshots,exports}/`

- [ ] **Step 4: Commit ground truth artifacts**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add docs/parity/baselines/baseline-v1-20260429/ground-truth/
git commit -m "$(cat <<'EOF'
parity(p0): legacy visual + export ground truth on baseline-v1-20260429

Screenshots (cables-on / cables-off) and KMZ/PDF/DXF exports captured manually
from legacy app on phaseboundary2 + complex-plant-layout. Reference for visual
side-by-side gate at P0 close.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Write the failing parity regression test

**Files:**
- Create: `python/pvlayout_engine/tests/parity/__init__.py` (empty)
- Create: `python/pvlayout_engine/tests/parity/test_p00_bundled_mst_parity.py`
- Reference: existing `python/pvlayout_engine/tests/integration/test_layout_s11_5_cables.py` (use as pattern)

- [ ] **Step 1: Create the parity tests package**

```bash
touch /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/tests/parity/__init__.py
```

- [ ] **Step 2: Write the regression test**

Path: `python/pvlayout_engine/tests/parity/test_p00_bundled_mst_parity.py`

```python
"""
P0 parity regression test — bundled DC + MST AC port.

Runs the new project's pipeline on the same KMZs that produced the legacy
baseline JSON, asserts that counts + totals match within tolerance.

Pattern V divergence: on phaseboundary2, 15 AC cables route INSIDE the polygon
in the new app (via Pattern V) vs OUTSIDE in legacy (via Pattern F best-effort).
The new app's total_ac_cable_m is therefore expected to be LOWER than legacy by
roughly the outside-detour length sum (~14474.8m legacy → ~12361.0m new app on
phaseboundary2 per S11.5 gate memo).

This delta is documented in docs/parity/findings/2026-04-29-001-pattern-v.md and
acknowledged here as expected.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pvlayout_core.core.icr_placer import place_icrs
from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import generate_layout
from pvlayout_core.core.string_inverter_manager import place_string_inverters
from pvlayout_core.models.project import (
    DesignMode,
    LayoutParameters,
    ModuleSpec,
    TableSpec,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
KMZ_DIR = REPO_ROOT / "python/pvlayout_engine/tests/golden/kmz"
BASELINE_DIR = REPO_ROOT / "docs/parity/baselines/baseline-v1-20260429/ground-truth"


def _build_default_params() -> LayoutParameters:
    """Match the params used by capture_legacy_baseline.py — exact GUI defaults."""
    p = LayoutParameters(
        module=ModuleSpec(wattage=545, length=2.279, width=1.134),
        table=TableSpec(rows_per_table=2, modules_in_row=28),
    )
    p.enable_cable_calc = True
    p.design_mode = DesignMode.STRING_INVERTER
    p.max_strings_per_inverter = 30
    return p


def _run_pipeline(kmz_path: Path):
    boundaries = parse_kmz(str(kmz_path))
    assert boundaries, f"no boundaries from {kmz_path}"
    result = boundaries[0]
    params = _build_default_params()
    generate_layout(result, params)
    place_icrs(result, params)
    place_lightning_arresters(result, params)
    place_string_inverters(result, params)
    return result


def _load_baseline(plant: str) -> dict:
    p = BASELINE_DIR / plant / "numeric-baseline.json"
    assert p.exists(), f"baseline JSON missing: {p}; run capture_legacy_baseline.py"
    return json.loads(p.read_text())


# Expected pattern-V deltas per plant (AC total only; DC + counts are exact-match).
# Documented in docs/parity/findings/2026-04-29-001-pattern-v.md.
PATTERN_V_AC_DELTA_M = {
    "phaseboundary2": -2113.8,        # legacy 14474.8 → new ~12361.0; delta = -2113.8m (within ±50m)
    "complex-plant-layout": None,     # captured at runtime — Pattern V firing rate unknown a priori
}
PATTERN_V_AC_DELTA_TOL_M = 50.0       # ±50m tolerance on the expected delta


@pytest.mark.parametrize("plant", ["phaseboundary2", "complex-plant-layout"])
def test_p00_counts_match_legacy(plant: str) -> None:
    """Counts must match exactly. Pattern V doesn't change cable count — only routing."""
    baseline = _load_baseline(plant)
    result = _run_pipeline(KMZ_DIR / f"{plant}.kmz")

    assert len(result.placed_tables) == baseline["counts"]["placed_tables"]
    assert len(result.placed_string_inverters) == baseline["counts"]["placed_string_inverters"]
    assert len(result.placed_las) == baseline["counts"]["placed_las"]
    assert len(result.placed_icrs) == baseline["counts"]["placed_icrs"]
    assert len(result.dc_cable_runs) == baseline["counts"]["dc_cable_runs"]
    assert len(result.ac_cable_runs) == baseline["counts"]["ac_cable_runs"]


@pytest.mark.parametrize("plant", ["phaseboundary2", "complex-plant-layout"])
def test_p00_total_dc_matches_legacy(plant: str) -> None:
    """DC total must match within ±0.1m. Pattern V doesn't affect DC routing."""
    baseline = _load_baseline(plant)
    result = _run_pipeline(KMZ_DIR / f"{plant}.kmz")

    legacy_dc = baseline["totals"]["total_dc_cable_m"]
    new_dc = result.total_dc_cable_m
    assert abs(new_dc - legacy_dc) < 0.1, (
        f"{plant}: DC total drift > ±0.1m: legacy={legacy_dc} new={new_dc} "
        f"delta={new_dc - legacy_dc:.3f}"
    )


@pytest.mark.parametrize("plant", ["phaseboundary2", "complex-plant-layout"])
def test_p00_total_ac_matches_legacy_modulo_pattern_v(plant: str) -> None:
    """AC total: legacy expects ±0.1m match; new app's Pattern V re-routes 15
    boundary-violation cables on phaseboundary2 inside the polygon, producing
    a known delta. Assert the delta is within the documented expected range."""
    baseline = _load_baseline(plant)
    result = _run_pipeline(KMZ_DIR / f"{plant}.kmz")

    legacy_ac = baseline["totals"]["total_ac_cable_m"]
    new_ac = result.total_ac_cable_m
    delta = new_ac - legacy_ac

    expected_delta = PATTERN_V_AC_DELTA_M.get(plant)
    if expected_delta is None:
        # complex-plant-layout: Pattern V firing rate unknown until first measurement.
        # Just assert delta is reasonable (less than 10% of total).
        assert abs(delta) < legacy_ac * 0.10, (
            f"{plant}: AC total delta exceeds 10%: legacy={legacy_ac} new={new_ac} "
            f"delta={delta:.1f}m. If Pattern V fires extensively on this plant, "
            f"update PATTERN_V_AC_DELTA_M to record the calibrated expected value."
        )
        # Update test on first run after measurement: capture and assert.
    else:
        assert abs(delta - expected_delta) < PATTERN_V_AC_DELTA_TOL_M, (
            f"{plant}: AC delta drift > tolerance: legacy={legacy_ac} new={new_ac} "
            f"delta={delta:.1f}m expected={expected_delta:.1f}m "
            f"tolerance=±{PATTERN_V_AC_DELTA_TOL_M:.1f}m"
        )
```

- [ ] **Step 3: Run the test — should FAIL (red phase)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/parity/test_p00_bundled_mst_parity.py -v
```

Expected: tests FAIL because new app currently produces per-cable individual routing (611 DC + 62 AC on phaseboundary2), not bundled / MST. Counts will mismatch immediately.

Specifically: `test_p00_counts_match_legacy[phaseboundary2]` will fail with `dc_cable_runs` count mismatch (611 vs legacy bundled count, e.g. ~70).

This RED phase is the parity-spike's working baseline — Tasks 5–6 close the gap.

- [ ] **Step 4: Commit the failing test**

```bash
git add python/pvlayout_engine/tests/parity/__init__.py \
        python/pvlayout_engine/tests/parity/test_p00_bundled_mst_parity.py
git commit -m "$(cat <<'EOF'
parity(p0): failing regression test for bundled DC + MST AC parity

Red phase. Asserts new app's counts + totals match legacy baseline JSON within
documented tolerance (DC strict ±0.1m; AC accommodates Pattern V re-routing of
15 boundary-violation cables on phaseboundary2).

Tests FAIL until Task 5+6 port the missing legacy functions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Port the four legacy functions into pvlayout_core

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py` (add four functions; keep existing functions intact)
- Reference (read-only, source): legacy `core/string_inverter_manager.py` at lines 460–733 (`_bundle_dc_cables`, `_build_mst_edges`, `_calc_individual_ac_total`, `_route_ac_mst`)

The functions are added BEFORE `place_string_inverters` (after the existing `_route_length` definition around line 870).

**Three adaptations vs verbatim legacy:**
1. **Pass `route_poly` through to `_route_ac_cable`** — preserves Pattern V global availability.
2. **Use parameterised allowances** from `LayoutParameters` for the per-cable allowance fields (legacy uses `+4.0` and `+10.0` literals; new project parameterises these as `ac_termination_allowance_m` and `dc_per_string_allowance_m`).
3. **Capture `_last_route_quality`** after each `_route_ac_cable` call to populate `CableRun.route_quality`. The horizontal-collector cable (which doesn't go through `_route_ac_cable`) gets `"ok"` by construction (it's a straight horizontal segment validated against the polygon).

The `+5.0` collector / trunk allowances inside `_bundle_dc_cables` stay as literals (not parameterised in this port; if Prasanta wants them parameterised, that's a discovery memo follow-up).

- [ ] **Step 1: Read legacy source for reference**

(Subagent task: open legacy `core/string_inverter_manager.py:460-733` and read the four functions to be ported.)

- [ ] **Step 2: Add `_bundle_dc_cables` to new project**

Path: `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`

Insert AFTER `_route_length` (~line 870 in current file) and BEFORE `place_string_inverters`:

```python
# ---------------------------------------------------------------------------
# DC cable bundling — ported from legacy baseline-v1-20260429 (P0 parity port)
# Source: PVlayout_Advance/core/string_inverter_manager.py:460
# Adaptations:
#   1. Threads route_poly through to _route_ac_cable (preserves Pattern V)
#   2. Uses params.dc_per_string_allowance_m (S11.5 parameterisation) instead
#      of legacy's hard-coded 10.0 in the fallback path. The +5.0 collector /
#      trunk allowances stay as literals (not parameterised this round).
#   3. Captures _last_route_quality on each routed CableRun (S11.5 tagging)
# ---------------------------------------------------------------------------

def _bundle_dc_cables(
    groups: list,
    placed_inverters: list,
    gap_ys: List[float],
    col_xs: List[float],
    usable,
    strings_per_table: int,
    dc_per_string_allowance_m: float,
    route_poly=None,
) -> Tuple[List[CableRun], float]:
    """
    Bundle DC cable runs by row within each inverter cluster.

    For each cluster:
      • Group tables by row Y (1 m rounding tolerance).
      • When ≥2 tables share a row AND a straight horizontal path is clear of
        obstacles, emit ONE horizontal collector cable spanning all table centres
        in that row, then ONE trunk cable from the inverter to the junction
        (the table centre in that row nearest the inverter).
      • When the horizontal path is blocked by an obstacle, or there is only
        one table in the row, fall back to routing that table directly to the
        inverter (original per-table behaviour).

    This reduces the drawn cable count from N_tables to ≈ 2 × N_rows, which
    dramatically de-clutters the layout while keeping every table electrically
    connected. The trunk length is multiplied by the number of tables in the
    row so that the reported total conductor length remains accurate.
    """
    dc_cables: List[CableRun] = []
    total_dc = 0.0
    cable_idx = 0

    for inv_idx, group in enumerate(groups):
        inv = placed_inverters[inv_idx]
        i_cx = inv.x + INV_EW / 2
        i_cy = inv.y + INV_NS / 2

        # --- Group tables in this cluster by row (1 m tolerance on centre Y) ---
        row_dict: Dict[int, list] = {}
        for t in group:
            ry = int(round(t.y + t.height / 2))
            row_dict.setdefault(ry, []).append(t)

        for _ry, row_tables in sorted(row_dict.items()):
            row_y = sum(t.y + t.height / 2 for t in row_tables) / len(row_tables)
            sorted_tbls = sorted(row_tables, key=lambda t: t.x + t.width / 2)
            tx_list = [t.x + t.width / 2 for t in sorted_tbls]
            n_tbls = len(sorted_tbls)

            # Junction X: table centre in this row nearest the inverter
            junction_x = min(tx_list, key=lambda x: abs(x - i_cx))
            junction_pt = (junction_x, row_y)

            if n_tbls >= 2:
                left_x, right_x = tx_list[0], tx_list[-1]
                h_route = [(left_x, row_y), (right_x, row_y)]
                h_clear = (usable is None) or _path_ok(h_route, usable)

                if h_clear:
                    # ── Horizontal collector ──────────────────────────────
                    cable_idx += 1
                    h_len = (right_x - left_x + 5.0) * strings_per_table
                    total_dc += h_len
                    dc_cables.append(CableRun(
                        start_utm=(left_x, row_y), end_utm=(right_x, row_y),
                        route_utm=h_route,
                        index=cable_idx, cable_type="dc",
                        length_m=round(h_len, 1),
                        route_quality="ok",  # straight horizontal, validated above
                    ))

                    # ── Trunk: inverter → row junction ────────────────────
                    trunk_route = _route_ac_cable(
                        (i_cx, i_cy), junction_pt, gap_ys, col_xs, usable,
                        route_poly=route_poly,
                    )
                    trunk_q = _last_route_quality
                    trunk_len = (_route_length(trunk_route) + 5.0) * n_tbls
                    total_dc += trunk_len
                    cable_idx += 1
                    dc_cables.append(CableRun(
                        start_utm=(i_cx, i_cy), end_utm=junction_pt,
                        route_utm=trunk_route,
                        index=cable_idx, cable_type="dc",
                        length_m=round(trunk_len, 1),
                        route_quality=trunk_q,
                    ))

                else:
                    # Obstacle blocks the horizontal collector → route each
                    # table individually (same as the original behaviour)
                    for t in sorted_tbls:
                        t_cx = t.x + t.width / 2
                        route = _route_ac_cable(
                            (t_cx, row_y), (i_cx, i_cy), gap_ys, col_xs, usable,
                            route_poly=route_poly,
                        )
                        route_q = _last_route_quality
                        clen = (_route_length(route) + dc_per_string_allowance_m) * strings_per_table
                        total_dc += clen
                        cable_idx += 1
                        dc_cables.append(CableRun(
                            start_utm=(t_cx, row_y), end_utm=(i_cx, i_cy),
                            route_utm=route,
                            index=cable_idx, cable_type="dc",
                            length_m=round(clen, 1),
                            route_quality=route_q,
                        ))

            else:
                # Single table in this row → route directly to inverter
                t = sorted_tbls[0]
                t_cx = t.x + t.width / 2
                route = _route_ac_cable(
                    (t_cx, row_y), (i_cx, i_cy), gap_ys, col_xs, usable,
                    route_poly=route_poly,
                )
                route_q = _last_route_quality
                clen = (_route_length(route) + dc_per_string_allowance_m) * strings_per_table
                total_dc += clen
                cable_idx += 1
                dc_cables.append(CableRun(
                    start_utm=(t_cx, row_y), end_utm=(i_cx, i_cy),
                    route_utm=route,
                    index=cable_idx, cable_type="dc",
                    length_m=round(clen, 1),
                    route_quality=route_q,
                ))

    return dc_cables, total_dc
```

- [ ] **Step 3: Add `_build_mst_edges` to new project**

Insert AFTER `_bundle_dc_cables`:

```python
def _build_mst_edges(pts: List[Tuple[float, float]]) -> List[Tuple[int, int]]:
    """
    Prim's Minimum Spanning Tree over *pts* using Manhattan distance.
    Node 0 is the root (ICR centre).
    Returns a list of (parent_idx, child_idx) directed edges.

    Ported verbatim from legacy baseline-v1-20260429 string_inverter_manager.py:588.
    No adaptations needed — this is pure graph algorithm, no _route_ac_cable calls.
    """
    n = len(pts)
    if n <= 1:
        return []
    in_tree = [False] * n
    key      = [float('inf')] * n
    parent   = [-1] * n
    key[0]   = 0.0
    edges: List[Tuple[int, int]] = []

    for _ in range(n):
        # Node with smallest key not yet in tree
        u = min((i for i in range(n) if not in_tree[i]), key=lambda i: key[i])
        in_tree[u] = True
        if parent[u] != -1:
            edges.append((parent[u], u))
        ux, uy = pts[u]
        for v in range(n):
            if not in_tree[v]:
                d = abs(pts[v][0] - ux) + abs(pts[v][1] - uy)
                if d < key[v]:
                    key[v] = d
                    parent[v] = u

    return edges
```

- [ ] **Step 4: Add `_route_ac_mst` to new project**

Insert AFTER `_build_mst_edges`:

```python
def _route_ac_mst(
    icr_groups: Dict[int, list],
    icr_centers: List[Tuple[float, float]],
    gap_ys: List[float],
    col_xs: List[float],
    usable,
    ac_cable_factor: float,
    ac_termination_allowance_m: float,
    route_poly=None,
) -> Tuple[List[CableRun], float]:
    """
    MST-based AC (or SMB→inverter DC) cable routing.

    For each ICR group, a Minimum Spanning Tree is built over the set
    {ICR centre} ∪ {inverter centres} using Manhattan distance as the
    edge weight. Each MST edge becomes one CableRun.

    Benefits over direct inverter→ICR routing:
      • Nearby inverters share a common cable segment (tree trunk) instead of
        running N parallel wires to the same ICR.
      • Total conductor length is reduced (MST property).
      • Fewer visually distinct routes on the map.

    Ported from legacy baseline-v1-20260429:649 with adaptations:
      1. ac_termination_allowance_m parameterised (legacy hard-coded 4.0).
      2. route_poly threaded to _route_ac_cable (S11.5 Pattern V).
      3. _last_route_quality captured on each CableRun.
    """
    ac_cables: List[CableRun] = []
    total_ac  = 0.0
    cable_idx = 0

    for icr_idx, inv_group in icr_groups.items():
        if not inv_group:
            continue
        icr_pt = icr_centers[icr_idx]

        if len(inv_group) == 1:
            # Single inverter — direct route to ICR (no MST needed)
            inv = inv_group[0]
            i_cx = inv.x + INV_EW / 2
            i_cy = inv.y + INV_NS / 2
            route = _route_ac_cable(
                (i_cx, i_cy), icr_pt, gap_ys, col_xs, usable,
                route_poly=route_poly,
            )
            route_q = _last_route_quality
            path_len = _route_length(route)
            clen     = (path_len + ac_termination_allowance_m) * ac_cable_factor
            total_ac += clen
            cable_idx += 1
            ac_cables.append(CableRun(
                start_utm=(i_cx, i_cy), end_utm=icr_pt,
                route_utm=route,
                index=cable_idx, cable_type="ac",
                length_m=round(clen, 1),
                route_quality=route_q,
            ))
            continue

        # Build MST: node 0 = ICR, nodes 1..N = inverters
        inv_pts  = [(inv.x + INV_EW / 2, inv.y + INV_NS / 2) for inv in inv_group]
        all_pts  = [icr_pt] + inv_pts
        mst_edges = _build_mst_edges(all_pts)

        for u_idx, v_idx in mst_edges:
            p_u = all_pts[u_idx]
            p_v = all_pts[v_idx]
            route = _route_ac_cable(
                p_u, p_v, gap_ys, col_xs, usable,
                route_poly=route_poly,
            )
            route_q  = _last_route_quality
            path_len = _route_length(route)
            clen     = (path_len + ac_termination_allowance_m) * ac_cable_factor
            total_ac += clen
            cable_idx += 1
            ac_cables.append(CableRun(
                start_utm=p_u, end_utm=p_v,
                route_utm=route,
                index=cable_idx, cable_type="ac",
                length_m=round(clen, 1),
                route_quality=route_q,
            ))

    return ac_cables, total_ac
```

- [ ] **Step 5: Add `_calc_individual_ac_total` to new project**

Insert AFTER `_route_ac_mst`:

```python
def _calc_individual_ac_total(
    icr_groups: Dict[int, list],
    icr_centers: List[Tuple[float, float]],
    gap_ys: List[float],
    col_xs: List[float],
    usable,
    ac_cable_factor: float,
    ac_termination_allowance_m: float,
    route_poly=None,
) -> Tuple[float, Dict[int, float], Dict[int, float]]:
    """
    Compute total AC cable quantity as the SUM of individual routed lengths
    from every inverter (string mode) or SMB (central mode) to its assigned ICR.

    Each device gets its own dedicated cable run — no MST trunk sharing.
    This gives the correct bill-of-materials quantity to order.

    Ported from legacy baseline-v1-20260429:620 with adaptations:
      1. ac_termination_allowance_m parameterised (legacy hard-coded 4.0).
      2. route_poly threaded to _route_ac_cable (S11.5 Pattern V).
      3. Returns per-inverter and per-ICR subtotals (S11.5 ac_cable_m_per_*
         additions). Legacy returned only the scalar total.
    """
    total = 0.0
    per_inv: Dict[int, float] = {}
    per_icr: Dict[int, float] = {}

    for icr_idx, inv_group in icr_groups.items():
        if not inv_group:
            continue
        icr_pt = icr_centers[icr_idx]
        icr_subtotal = 0.0
        for inv in inv_group:
            i_cx = inv.x + INV_EW / 2
            i_cy = inv.y + INV_NS / 2
            route    = _route_ac_cable(
                (i_cx, i_cy), icr_pt, gap_ys, col_xs, usable,
                route_poly=route_poly,
            )
            path_len = _route_length(route)
            clen     = (path_len + ac_termination_allowance_m) * ac_cable_factor
            total   += clen
            icr_subtotal += clen
            per_inv[inv.index] = round(clen, 1)
        per_icr[icr_idx] = round(icr_subtotal, 1)

    return total, per_inv, per_icr
```

- [ ] **Step 6: Run sidecar pytest to confirm no syntax errors**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q --co
```

Expected: collection succeeds (no ImportError, no SyntaxError). Test runtime not yet relevant — `place_string_inverters` still uses old loops.

- [ ] **Step 7: Commit the four ported functions (no behavior change yet — they're not called)**

```bash
git add python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py
git commit -m "$(cat <<'EOF'
parity(p0): port four bundled/MST functions from legacy

Ports _bundle_dc_cables, _build_mst_edges, _route_ac_mst, _calc_individual_ac_total
from legacy baseline-v1-20260429 (lines 460-733). Functions are added but not yet
called — place_string_inverters body still uses S11.5 per-cable routing. Task 6
adapts the body to call these.

Adaptations:
- route_poly threaded to _route_ac_cable (S11.5 Pattern V availability)
- Allowances parameterised from LayoutParameters (S11.5 Phase D)
- _last_route_quality captured per CableRun (S11.5 quality tagging)
- _calc_individual_ac_total returns per-ICR / per-inverter subtotals
  (S11.5 Phase E additions)

Source: PVlayout_Advance commit 9362083, branch baseline-v1-20260429.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Adapt `place_string_inverters` to call the bundled / MST paths

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py` (replace lines 1011–1109 — the per-cable DC + AC loops)

**What changes:**
- DC loop (lines 1011–1042 in current new project) → single call to `_bundle_dc_cables`.
- AC loop (lines 1071–1109) → call `_route_ac_mst` for `result.ac_cable_runs` (visual) + `_calc_individual_ac_total` for `result.total_ac_cable_m` (quantity).
- All S11.5 surrounding machinery (`_reset_vis_cache`, `_build_route_polygon`, `gap_ys`, `col_xs`, `usable`, `route_poly`, allowance reads, ICR centres, ICR group assignment, `_PATTERN_STATS_ENABLED`, `_emit_pattern_stats`) **stays**.

- [ ] **Step 1: Replace the DC loop in `place_string_inverters`**

In `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`, find the section that currently reads (around line 1011):

```python
    dc_cables: List[CableRun] = []
    total_dc = 0.0
    if _PATTERN_STATS_ENABLED:
        _reset_pattern_stats()
    for t in tables:
        inv = tbl_to_inv.get(id(t))
        if inv is None:
            continue
        # ... per-table _route_ac_cable call + cable append ...
    result.dc_cable_runs    = dc_cables
    result.total_dc_cable_m = round(total_dc, 1)
    if _PATTERN_STATS_ENABLED:
        _emit_pattern_stats("DC", len(dc_cables))
```

Replace it with:

```python
    # ---- DC cable runs — row-bundled (table → inverter), legacy parity ---
    # Uses _bundle_dc_cables(): one horizontal collector per row per cluster
    # + one trunk per row to the inverter. Per legacy baseline-v1-20260429.
    # S11.5 additions preserved: route_poly threaded to _route_ac_cable so
    # Pattern V remains available; allowance parameterised; route_quality tagged.
    if _PATTERN_STATS_ENABLED:
        _reset_pattern_stats()
    dc_cables, total_dc = _bundle_dc_cables(
        groups, placed_inverters,
        gap_ys, col_xs, usable,
        strings_per_table,
        dc_per_string_allowance_m,
        route_poly=route_poly,
    )
    result.dc_cable_runs    = dc_cables
    result.total_dc_cable_m = round(total_dc, 1)
    if _PATTERN_STATS_ENABLED:
        _emit_pattern_stats("DC", len(dc_cables))
```

The `tbl_to_inv` map built earlier is now unused for DC routing (the bundling function doesn't need it). Leave it in place — it's cheap and may be useful for future per-table operations; removing it is scope creep.

- [ ] **Step 2: Replace the AC loop in `place_string_inverters`**

Find the section that currently reads (around line 1071):

```python
    ac_cables: List[CableRun] = []
    total_ac = 0.0
    ac_m_per_inverter: Dict[int, float] = {}
    ac_m_per_icr: Dict[int, float] = {}
    if _PATTERN_STATS_ENABLED:
        _reset_pattern_stats()
    for icr_idx, inv_group in icr_groups.items():
        # ... per-inverter _route_ac_cable + per-icr aggregation ...

    result.ac_cable_runs    = ac_cables
    result.total_ac_cable_m = round(total_ac, 1)
    result.ac_cable_m_per_inverter = ac_m_per_inverter
    result.ac_cable_m_per_icr = ac_m_per_icr
    if _PATTERN_STATS_ENABLED:
        _emit_pattern_stats("AC", len(ac_cables))
```

Replace it with:

```python
    # ---- AC/DC cable runs — MST-based visual + individual-routed quantity ----
    # Visual routes (ac_cable_runs): MST so nearby inverters share trunks.
    # Quantity (total_ac_cable_m): sum of individual routes per inverter →ICR.
    # Per legacy baseline-v1-20260429 (split visual vs quantity).
    if _PATTERN_STATS_ENABLED:
        _reset_pattern_stats()

    # Visual: MST tree, each edge a CableRun.
    ac_cables, _mst_total = _route_ac_mst(
        icr_groups, icr_centers,
        gap_ys, col_xs, usable,
        ac_cable_factor,
        ac_termination_allowance_m,
        route_poly=route_poly,
    )
    result.ac_cable_runs = ac_cables

    # Quantity: every inverter individually routed; sum gives BOM length.
    # Returns per-ICR / per-inverter subtotals (S11.5 Phase E).
    total_ac, ac_m_per_inverter, ac_m_per_icr = _calc_individual_ac_total(
        icr_groups, icr_centers,
        gap_ys, col_xs, usable,
        ac_cable_factor,
        ac_termination_allowance_m,
        route_poly=route_poly,
    )
    result.total_ac_cable_m = round(total_ac, 1)
    result.ac_cable_m_per_inverter = ac_m_per_inverter
    result.ac_cable_m_per_icr = ac_m_per_icr

    if _PATTERN_STATS_ENABLED:
        _emit_pattern_stats("AC", len(ac_cables))
```

- [ ] **Step 3: Run sidecar pytest to spot import / type errors**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q --co
```

Expected: collection succeeds.

- [ ] **Step 4: Run the parity test — should now PASS modulo Pattern V delta**

```bash
uv run pytest tests/parity/test_p00_bundled_mst_parity.py -v
```

Expected:
- `test_p00_counts_match_legacy[phaseboundary2]` PASS
- `test_p00_counts_match_legacy[complex-plant-layout]` PASS
- `test_p00_total_dc_matches_legacy[phaseboundary2]` PASS (DC unaffected by Pattern V)
- `test_p00_total_dc_matches_legacy[complex-plant-layout]` PASS
- `test_p00_total_ac_matches_legacy_modulo_pattern_v[phaseboundary2]` PASS (delta within tolerance)
- `test_p00_total_ac_matches_legacy_modulo_pattern_v[complex-plant-layout]` PASS or REVEAL — if Pattern V doesn't fire on complex-plant-layout, delta should be near 0; if it does, calibrate `PATTERN_V_AC_DELTA_M["complex-plant-layout"]` and re-run.

If any test other than the AC-modulo-V one fails, investigate before proceeding. Most likely culprits: missing `route_poly=` keyword, signature mismatch, ICR-group iteration order difference.

- [ ] **Step 5: Run all sidecar tests for regression**

```bash
uv run pytest tests/ -q
```

Expected: all existing tests still pass (the four new functions don't break anything; the loop refactor is internally consistent). Pattern-V-related tests in `tests/integration/test_layout_s11_5_cables.py` should still pass — Pattern V is preserved.

- [ ] **Step 6: Commit the loop adaptation**

```bash
git add python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py
git commit -m "$(cat <<'EOF'
parity(p0): adapt place_string_inverters to use bundled DC + MST AC

Replaces per-cable individual routing (S11.5 default) with legacy bundled +
MST routing. All S11.5 additions preserved (Pattern V, search-space caps,
route_quality, parameterised allowances, per-ICR/inverter subtotals,
PVLAYOUT_PATTERN_STATS instrumentation).

Crow's-feet visual symptom is resolved: AC cables now draw as MST tree;
DC cables draw as row collectors + trunks per legacy baseline-v1-20260429.

Closes the algorithm gap from PLAN.md §1; the visual side-by-side gate runs
in Task 7 (manual). Pattern V's 15 boundary-routed cables on phaseboundary2
remain a documented divergence — see Pattern V discovery memo.

Parity tests pass: test_p00_bundled_mst_parity.py.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Visual side-by-side gate (manual)

This is mostly Arun's work. Side-by-side comparison of legacy + new app on the same KMZ.

- [ ] **Step 1: Launch new app**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/apps/desktop
bun run tauri dev
```

- [ ] **Step 2: Process phaseboundary2.kmz in new app**

In Tauri window:
1. License: Pro Plus (or whatever level shows cables).
2. Open `python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz`.
3. Set input panel: same defaults as legacy (module 545W, 2×28, max 30 strings, String Inverter mode).
4. Toggle "Calculate cables" ON.
5. Click Generate Layout.
6. Wait for completion.
7. Screenshot the canvas with AC cables visible → save as `new-app-cables-on.png`
8. Toggle AC cables OFF → screenshot → save as `new-app-cables-off.png`

Save to: `docs/parity/baselines/baseline-v1-20260429/ground-truth/phaseboundary2/screenshots/`

- [ ] **Step 3: Side-by-side comparison on phaseboundary2**

Open the two screenshots side-by-side:
- `legacy-cables-on.png` (from Task 3)
- `new-app-cables-on.png` (from Step 2)

Acceptance: cable topology indistinguishable EXCEPT for the 15 boundary-violation cables (which legacy routes outside the polygon and the new app routes via Pattern V inside). Those 15 cables are documented as expected divergence.

If the topology differs in any other way (e.g., DC bundling looks different, MST tree shape differs), STOP — there's a bug in the port. Investigate before proceeding.

- [ ] **Step 4: Repeat for complex-plant-layout.kmz**

Same procedure. Expect Pattern V firing more / fewer times depending on plant geometry.

- [ ] **Step 5: Commit new-app screenshots**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add docs/parity/baselines/baseline-v1-20260429/ground-truth/*/screenshots/new-app-*.png
git commit -m "$(cat <<'EOF'
parity(p0): new-app screenshots for visual side-by-side gate

Captured on phaseboundary2 + complex-plant-layout post-port. Indistinguishable
from legacy modulo Pattern V's documented 15-cable divergence on phaseboundary2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Write the Pattern V discovery memo

**Files:**
- Create: `docs/parity/findings/2026-04-29-001-pattern-v.md`

This memo describes the S11.5 Pattern V addition for Prasanta's review.

- [ ] **Step 1: Write the memo**

Path: `docs/parity/findings/2026-04-29-001-pattern-v.md`

```markdown
# Finding 001 — Pattern V (visibility-graph fallback)

**Date:** 2026-04-29
**Sync run:** new project commit `<HEAD>` vs legacy `baseline-v1-20260429` (`9362083`)
**Status:** triaged
**For:** Prasanta (solar-domain authority); discussion via Arun's daily comms.

## Classification

**new-project-discovery** — addition originating in the new project (commit `6a7bf32`, S11.5, ADR-0007), not present in legacy. Default action: discovery memo for Prasanta's evaluation.

## Summary

The new project's `_route_ac_cable` has an extra pattern (Pattern V) inserted between Pattern E and Pattern F. Pattern V is a textbook visibility-graph + Dijkstra fallback that routes a cable along polygon-boundary vertices when patterns A–E fail to find a strict-Manhattan path inside the polygon. It exists to fix a correctness bug we found on `phaseboundary2.kmz` while exercising cable calc through the new app's pipeline.

## Evidence

### The bug we found

On `phaseboundary2.kmz` with cable calc enabled, **15 AC cables route 34–64 m OUTSIDE the plant boundary** in legacy (and also pre-Pattern-V in the new project). Those 15 cables fall through legacy's pattern dispatch all the way to Pattern F (best-effort), which does not enforce inside-polygon constraints — it just picks the path with the fewest out-of-polygon segments and returns even if some segments leave the boundary.

This is a real correctness issue: cables drawn outside the plant fence are not physically installable.

### Pattern F's behaviour (legacy `string_inverter_manager.py:414-444`)

Legacy Pattern F (`_score()` at line 435 counts out-of-boundary segments rather than rejecting them; the path with fewest violations wins). The "best-effort" naming is honest — it routes outside if no inside route is found by the Manhattan templates.

### Pattern V's solution (new project `string_inverter_manager.py:295-348`)

Pattern V builds a visibility graph on the polygon's exterior and interior ring vertices, snaps the start/end points inside, and runs Dijkstra (heap-based) to find the shortest inside-polygon path. The path is always inside the polygon by construction.

Implementation references textbook computational geometry:
- Preparata & Shamos, *Computational Geometry: An Introduction* (1985)
- de Berg et al., *Computational Geometry: Algorithms and Applications* ch. 15

### Polygon used

Pattern V uses a purpose-built `route_poly` (the plant fence boundary minus ICR footprints), not `usable_polygon` (the table-setback polygon, which can be a disjoint MultiPolygon on plants with narrow-neck setbacks). This is what allows V to route across narrow necks that disconnect `usable_polygon` into pieces. See `_build_route_polygon` in `string_inverter_manager.py`.

Patterns A–F continue to use `usable_polygon` (keeps Manhattan routes close to row gaps — the visual convention). Only Pattern V uses `route_poly`.

### Performance

Per S11.5 gate memo (`docs/gates/s11_5.md`):
- Pre-Pattern-V baseline (with search-space caps, no V): would have left 15 cables at Pattern F (boundary violations).
- Post-Pattern-V: 15 V-routed cables, 0 boundary violations. Wall-clock ~4 s instrumented (vs 460 s for the un-capped baseline).

Pattern V's own cost is negligible (the visibility graph is built once per `place_string_inverters` call and cached; Dijkstra runs in O((V+E) log V) per cable).

### Visual cost

Pattern V's routes contain Euclidean (diagonal) segments between polygon-boundary vertices, NOT strict Manhattan H/V. This is the only place in the codebase that produces non-axis-aligned cable segments. Acceptable trade-off because Pattern V exists specifically as a fallback when Manhattan templates fail — and an inside-polygon diagonal is preferable to an outside-polygon Manhattan.

## Reproduction

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
PVLAYOUT_PATTERN_STATS=1 uv run python scripts/debug/time_cable_calc.py
```

Output line shows pattern distribution. Expected on `phaseboundary2`:
```
[PVLAYOUT_PATTERN_STATS] AC: cables=62 patterns={A=41, A2=3, A3=3, V=15} ...
```

## Proposed action

Discovery memo for Prasanta's evaluation. Possible outcomes:

1. **Prasanta wants legacy to adopt Pattern V** → Arun ports the V machinery (`_build_boundary_vis_graph`, `_dijkstra`, `_visible_neighbors`, `_build_route_polygon`, `_route_visibility`, the V dispatch in `_route_ac_cable`) from new project to legacy. ~300 LOC.
2. **Prasanta prefers a different solution** (e.g., loosen Pattern A4/B caps, add a different fallback, accept boundary violations as a flagged warning rather than route-fix) → new project adopts Prasanta's preference; revert Pattern V; restore legacy's behaviour. The 15 cables show as `boundary_violation` per the `route_quality` tagging, optionally surfaced visually in the UI.
3. **Prasanta accepts Pattern V in new project as-is, doesn't adopt in legacy** → status quo. Document the divergence in PLAN.md §3 retirement criteria as an explicit "known intentional divergence." When legacy retires, the divergence resolves naturally.

## Alternative interpretations

- Could the 15-cable divergence on `phaseboundary2` be a quirk of the specific KMZ (boundary geometry too aggressive)? No — `_build_route_polygon` produces a 220,625 m² contiguous route polygon for `phaseboundary2`. The cables that fail Manhattan are a function of the polygon shape, not a KMZ pathology.
- Could Pattern V be too aggressive (route diagonals where Manhattan would have worked)? Pattern V only fires when patterns A–E have already failed, so it doesn't replace working Manhattan routes. It's a strict fallback.

## Resolution

(To be filled by Arun after Prasanta's input.)
```

- [ ] **Step 2: Commit the memo**

```bash
git add docs/parity/findings/2026-04-29-001-pattern-v.md
git commit -m "$(cat <<'EOF'
parity(p0): discovery memo 001 — Pattern V (visibility-graph fallback)

Memo for Prasanta on the S11.5 addition that fixes 15 boundary-violating
cables on phaseboundary2. Three outcome paths proposed (port to legacy,
revert in new, or accept divergence).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Write the search-space caps discovery memo

**Files:**
- Create: `docs/parity/findings/2026-04-29-002-search-space-caps.md`

- [ ] **Step 1: Write the memo**

Path: `docs/parity/findings/2026-04-29-002-search-space-caps.md`

```markdown
# Finding 002 — Search-space caps in `_route_ac_cable` patterns A2–E

**Date:** 2026-04-29
**Sync run:** new project commit `<HEAD>` vs legacy `baseline-v1-20260429` (`9362083`)
**Status:** triaged
**For:** Prasanta (solar-domain authority); discussion via Arun's daily comms.

## Classification

**new-project-discovery** — performance optimisation originating in S11.5 (commit `6a7bf32`, ADR-0007), not in legacy. Default action: discovery memo + post-port re-evaluation.

## Summary

The new project's `_route_ac_cable` has search-space caps in patterns A2, A3, A4, B, and E that limit the number of candidate paths considered. Caps don't exist in legacy. They were added when the new project's `place_string_inverters` was using per-cable individual routing (no MST, no DC bundling) — a topology that on `phaseboundary2` produced 13.9 million `_path_ok` calls and a 460-second wall-clock for cable calc.

**Now that P0 has ported the legacy bundled DC + MST AC topology, the caps may be unnecessary or wrong-sized.** This memo flags it for joint evaluation.

## The caps (new project `string_inverter_manager.py:684-688`)

```python
A2_A3_NEAREST_COLS = 8       # Pattern A2/A3: limit col-X sweep to nearest 8
A4_NEAREST_COLS    = 5       # Pattern A4: limit each end's col sweep to nearest 5 (5×5 grid)
B_NEAREST_GAPS     = 8       # Pattern B: limit gap×gap sweep to nearest 8 each (8×8 = 64)
E_SINGLE_WAYPOINTS = 15      # Pattern E: limit single-waypoint sweep to 15
E_TWO_WAYPOINT_MAX = 10      # Pattern E: skip O(N²) two-waypoint sweep when |W| > 10
```

Without caps (legacy default): A4 considers 49² candidates per cable; B considers 113² candidates; E iterates O(N²) over the full waypoint list.

## Why they were added

S11.5 spec § "Pre-port baseline" measured the un-capped baseline at 460 s on `phaseboundary2` with the per-cable topology (62 AC cables, 15 falling through to Pattern F). The 15 Pattern F cables each ran A4 and B searches that succeed on zero candidates, burning 49² + 113² ≈ 15,000 path checks per cable.

With caps applied: same plant runs in 4.4 s (104× faster) — see `docs/gates/s11_5.md` § "Post-port run."

## Why they may now be unnecessary

P0 has now ported the bundled DC + MST AC topology. The cable-count drops from per-cable individual routing to:
- DC: ~70 bundled cables (vs 611 per-table) on `phaseboundary2`
- AC: MST tree edges only (≤ N inverters = 62; typically far fewer with shared trunks)

With ~10× fewer cables hitting `_route_ac_cable`, even the un-capped legacy patterns may complete in well under the user-perceptible threshold. A cap that helps the per-cable topology may be over-restrictive for the bundled / MST one.

## Concretely

When Pattern A4 / B searches succeed (the common case), the cap clips off candidates that legacy would have considered. On bundled-DC trunk routes and MST-AC edges, this could mean missing a slightly-better-quality path. The numerical impact is small — the cap-permitted candidates include the most-likely-best ones — but it's a difference from legacy behaviour.

## Reproduction

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
PVLAYOUT_PATTERN_STATS=1 uv run python scripts/debug/time_cable_calc.py
```

Output shows `_path_ok` call counts. Compare with cap values to measure cap engagement.

## Proposed action

Discovery memo for Prasanta's evaluation. Possible outcomes:

1. **Prasanta wants caps removed** → un-cap A2/A3/A4/B/E in new project; verify performance is still acceptable on `phaseboundary2` and `complex-plant-layout` post-bundling/MST. If performance regresses, retain caps.
2. **Prasanta wants caps in legacy** → port the cap constants + early-exit logic from new project to legacy. ~30 LOC change.
3. **Prasanta accepts caps in new project as-is** → status quo. Document as expected divergence.

**Recommended evaluation**: instrumented runs on `phaseboundary2` and `complex-plant-layout` post-P0 with caps removed (or temporarily set to ∞). If wall-clock stays under 30 s and AC totals don't shift more than ±0.1m, caps can be removed; the perf justification is gone.

## Resolution

(To be filled by Arun after Prasanta's input + post-P0 instrumented re-measurement.)
```

- [ ] **Step 2: Commit the memo**

```bash
git add docs/parity/findings/2026-04-29-002-search-space-caps.md
git commit -m "$(cat <<'EOF'
parity(p0): discovery memo 002 — search-space caps in _route_ac_cable

Memo for Prasanta on S11.5 perf optimisations that may no longer be needed
post-bundling/MST. Recommends post-P0 re-measurement before deciding
keep/remove/port-to-legacy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Write the `route_quality` field discovery memo

**Files:**
- Create: `docs/parity/findings/2026-04-29-003-route-quality-field.md`

- [ ] **Step 1: Write the memo**

Path: `docs/parity/findings/2026-04-29-003-route-quality-field.md`

```markdown
# Finding 003 — `CableRun.route_quality` field

**Date:** 2026-04-29
**Sync run:** new project commit `<HEAD>` vs legacy `baseline-v1-20260429` (`9362083`)
**Status:** triaged
**For:** Prasanta (solar-domain authority); discussion via Arun's daily comms.

## Classification

**new-project-discovery** — additive data field originating in S11.5 (commit `6a7bf32`, ADR-0007), not in legacy. Default action: discovery memo for Prasanta's evaluation; tied to Pattern V follow-up (Finding 001).

## Summary

The new project's `CableRun` dataclass has an extra field `route_quality: str` (default `"ok"`, range `{"ok", "best_effort", "boundary_violation"}`) that tags each cable with the quality of its routed path. Legacy `CableRun` doesn't have this field.

The tagging is populated by `_route_ac_cable` based on which pattern resolved the route:
- `"ok"` — patterns A, A2, A3, A4, B, C, D, E, V succeeded with all-inside-polygon path
- `"best_effort"` — Pattern F succeeded but with all segments inside polygon (rare; typically Pattern V handles these now)
- `"boundary_violation"` — Pattern F returned a path with at least one segment outside the polygon

## Why it was added

To surface the 15 boundary-violation cables on `phaseboundary2` (which Pattern V resolves now — see Finding 001) so EPC reviewers can see at a glance whether any cable routes outside the plant fence. Even with Pattern V, the tag remains useful as a regression guard: if Pattern V ever fails to find an inside path, those cables fall through to Pattern F and get tagged `boundary_violation`.

## Field plumbing

- `pvlayout_core/models/project.py:164` — field on `CableRun` dataclass.
- `pvlayout_core/core/string_inverter_manager.py` — `_last_route_quality` module-level transport variable (line 68); set inside `_route_ac_cable` at each pattern return (lines ~810, 832, 862, 866); read by `place_string_inverters` after each `_route_ac_cable` call to populate the `CableRun` it constructs.
- `pvlayout_engine/schemas.py:148` — Pydantic mirror of the field (default `"ok"`).
- `pvlayout_engine/adapters.py:265` — `getattr` with default `"ok"` for backwards-compatible deserialization.

## Cost / impact

- **Storage:** ~5 bytes per CableRun (a short string).
- **Wire:** included in JSON responses; not used by frontend yet (`apps/desktop/src/project/layoutToGeoJson.ts:104-133` doesn't copy it into GeoJSON properties — that's a P3 deliverable).
- **Tests:** existing tests pass with default `"ok"`; no breakage. Future P3 visual rendering will paint `boundary_violation` cables distinctly.

## Reproduction

After running cable calc, inspect any boundary-violation route's tag:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.layout_engine import generate_layout
from pvlayout_core.core.icr_placer import place_icrs
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.string_inverter_manager import place_string_inverters
from pvlayout_core.models.project import LayoutParameters, ModuleSpec, TableSpec, DesignMode

p = LayoutParameters(module=ModuleSpec(545, 2.279, 1.134), table=TableSpec(2, 28))
p.enable_cable_calc = True
p.design_mode = DesignMode.STRING_INVERTER
p.max_strings_per_inverter = 30

bounds = parse_kmz('tests/golden/kmz/phaseboundary2.kmz')
r = bounds[0]
generate_layout(r, p); place_icrs(r, p); place_lightning_arresters(r, p)
place_string_inverters(r, p)

from collections import Counter
c = Counter(c.route_quality for c in r.ac_cable_runs)
print('AC route_quality:', dict(c))
"
```

Expected output: `AC route_quality: {'ok': N}` (with Pattern V handling all the boundary cases). If you see `boundary_violation` in the count, that's Pattern V failing — flag immediately.

## Proposed action

Discovery memo for Prasanta's evaluation.

Outcomes track Finding 001 (Pattern V) outcomes:

1. **If Pattern V is adopted in legacy** → also port `route_quality` field. Pure addition; backwards-compatible.
2. **If Pattern V is reverted in new project** → keep `route_quality` field as the documentation of the 15-cable issue. Frontend still surfaces them in P3 (rendered as warning-coloured dashed lines).
3. **If Pattern V is accepted in new project only** → keep `route_quality` field; legacy doesn't need it (its boundary cases just stay as best-effort routes without explicit tagging).

## Resolution

(To be filled by Arun after Prasanta's input on Finding 001.)
```

- [ ] **Step 2: Commit the memo**

```bash
git add docs/parity/findings/2026-04-29-003-route-quality-field.md
git commit -m "$(cat <<'EOF'
parity(p0): discovery memo 003 — CableRun.route_quality field

Memo for Prasanta on the S11.5 additive data field that tags cable route
quality. Tied to Finding 001 (Pattern V) outcomes; mostly self-resolves.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update `CLAUDE.md` §2 to reference `docs/parity/PLAN.md`

**Files:**
- Modify: `CLAUDE.md` (§2 area)

- [ ] **Step 1: Open `CLAUDE.md` and locate §2 read-list**

Find the existing §2 "Read these before touching code or planning work" list:

```markdown
### Read these before touching code or planning work
1. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — stack, component boundaries, runtime flows, module mapping, security model, design system §12.
2. **[docs/SPIKE_PLAN.md](./docs/SPIKE_PLAN.md)** — the 17-spike project plan. We execute these sequentially with human gates between each.
```

- [ ] **Step 2: Add `docs/parity/PLAN.md` as a third item**

Replace with:

```markdown
### Read these before touching code or planning work
1. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — stack, component boundaries, runtime flows, module mapping, security model, design system §12.
2. **[docs/SPIKE_PLAN.md](./docs/SPIKE_PLAN.md)** — the 17-spike project plan. We execute these sequentially with human gates between each.
3. **[docs/parity/PLAN.md](./docs/parity/PLAN.md)** — **active parity sprint** (2026-04-29 → ~2026-05-29) bringing pvlayout_core to legacy `baseline-v1-20260429` parity, then retiring legacy. Spike sequence is paused; parity-spike track P0–P5 takes precedence per Q7 of the brainstorming interview output.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
parity(p0): CLAUDE.md §2 references docs/parity/PLAN.md

Adds the parity plan as a required session-start read alongside
ARCHITECTURE.md and SPIKE_PLAN.md, per PLAN.md §8 cross-references.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update `docs/SPIKE_PLAN.md` with parity-track note

**Files:**
- Modify: `docs/SPIKE_PLAN.md` (top of file)

- [ ] **Step 1: Add a top-of-file callout**

Before the existing first heading in `docs/SPIKE_PLAN.md`, prepend:

```markdown
> **⚠ Parity sprint active 2026-04-29 → ETA ~2026-05-29.** See [`docs/parity/PLAN.md`](./parity/PLAN.md). Existing spike sequence is paused per Q7 of the brainstorming interview output; the parity-spike track P0–P5 takes precedence. S11 polish, S12, S13, S13.5, and S13.8 resume only if/when they fold into P4 retirement-readiness, or post-retirement.

```

- [ ] **Step 2: Commit**

```bash
git add docs/SPIKE_PLAN.md
git commit -m "$(cat <<'EOF'
parity(p0): SPIKE_PLAN.md top-of-file note — parity sprint active

Existing spike sequence paused per PLAN.md §5 / Q7. P0-P5 parity-spike track
takes precedence; existing spikes resume post-retirement or fold into P4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Write P0 gate memo

**Files:**
- Create: `docs/gates/p00.md`

- [ ] **Step 1: Write the gate memo**

Path: `docs/gates/p00.md`

```markdown
# Gate — P0: Quick-Win Port + Discovery Memos

**Status:** Awaiting verification
**Spike:** P0 (parity track)
**Spec:** [`docs/parity/PLAN.md`](../parity/PLAN.md) §5 P0
**Plan:** [`docs/parity/plans/p00-quick-win-port.md`](../parity/plans/p00-quick-win-port.md)
**Started:** 2026-04-29
**Author:** Arun (review); Claude (drafting + execution)

---

## 1. Summary

P0 ports four functions from legacy `baseline-v1-20260429` (`_bundle_dc_cables`, `_build_mst_edges`, `_calc_individual_ac_total`, `_route_ac_mst`) into `pvlayout_core/core/string_inverter_manager.py`, restructures `place_string_inverters` to call them, and pre-files three discovery memos for Prasanta on the S11.5 additions (Pattern V, search-space caps, `route_quality`).

All S11.5 surface (Pattern V machinery, search-space caps, `route_quality` tagging, parameterised allowances on `LayoutParameters`, per-ICR/inverter subtotals on `LayoutResult`, `PVLAYOUT_PATTERN_STATS` instrumentation) is preserved. The port is additive: legacy's bundled / MST functions land on top of the S11.5 surface, not in place of it.

The crow's-feet visual symptom is resolved: AC cables now draw as MST trees, DC cables as row collectors + trunks per legacy.

## 2. What shipped

- `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py` — headless capture script.
- `docs/parity/baselines/baseline-v1-20260429/manifest.md` — baseline metadata.
- `docs/parity/baselines/baseline-v1-20260429/ground-truth/{phaseboundary2,complex-plant-layout}/numeric-baseline.json` — captured legacy numerics.
- `docs/parity/baselines/baseline-v1-20260429/ground-truth/{phaseboundary2,complex-plant-layout}/screenshots/legacy-cables-{on,off}.png` — manual screenshots.
- `docs/parity/baselines/baseline-v1-20260429/ground-truth/{phaseboundary2,complex-plant-layout}/exports/legacy.{kmz,pdf,dxf}` — manual exports.
- `python/pvlayout_engine/tests/parity/test_p00_bundled_mst_parity.py` — regression tests.
- `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py` — four ported functions + adapted `place_string_inverters`.
- `docs/parity/findings/2026-04-29-{001,002,003}-*.md` — three discovery memos.
- `CLAUDE.md` §2 reference to `docs/parity/PLAN.md`.
- `docs/SPIKE_PLAN.md` top-of-file parity callout.

## 3. What to run

### Static gates
```bash
cd /Users/arunkpatra/codebase/pv_layout_project
bun run lint && bun run typecheck && bun run test && bun run build
cd python/pvlayout_engine && uv run pytest tests/ -q && cd ../..
```
Expected: all green.

### Parity gates
```bash
cd python/pvlayout_engine
uv run pytest tests/parity/test_p00_bundled_mst_parity.py -v
```
Expected:
- All `test_p00_counts_match_legacy[*]` PASS
- All `test_p00_total_dc_matches_legacy[*]` PASS
- `test_p00_total_ac_matches_legacy_modulo_pattern_v[phaseboundary2]` PASS (delta within ±50m of expected -2113.8m)
- `test_p00_total_ac_matches_legacy_modulo_pattern_v[complex-plant-layout]` PASS (delta < 10% of total)

### Visual side-by-side
Open both screenshots side-by-side per plant:
- `docs/parity/baselines/baseline-v1-20260429/ground-truth/<plant>/screenshots/legacy-cables-on.png`
- `docs/parity/baselines/baseline-v1-20260429/ground-truth/<plant>/screenshots/new-app-cables-on.png`

Expected: indistinguishable cable topology except for Pattern V's 15 cables on phaseboundary2.

## 4. Acceptance checklist

- [ ] Static gates green.
- [ ] Parity tests pass on both reference plants.
- [ ] Visual side-by-side: phaseboundary2 indistinguishable modulo Pattern V's 15 cables.
- [ ] Visual side-by-side: complex-plant-layout indistinguishable modulo any Pattern V firing.
- [ ] Three discovery memos pre-filed and visible to Prasanta.
- [ ] Prasanta acknowledges the memos (async; not gating P1 entry).
- [ ] Arun signoff.

## 5. Known limitations / divergences (expected)

- **Pattern V re-routes 15 AC cables on phaseboundary2** inside the polygon — legacy routes them outside via Pattern F. Documented in Finding 001. Net effect: `total_ac_cable_m` on phaseboundary2 is ~2113.8m lower in new app than legacy (the over-counting of outside-detour portions is removed).
- `route_quality` field has no frontend visual treatment yet — that's P3.
- Search-space caps may be over-restrictive post-bundling/MST. Documented in Finding 002. Re-evaluation deferred to discussion outcome / P1 instrumentation.

## 6. On sign-off

1. Flip P0 to 🟢 in `docs/parity/PLAN.md` §0 header.
2. Update `docs/parity/.sync-state.json` (creating it) to record `9362083` as last-baselined commit.
3. Commit STATUS flip.
4. Start P1 (sync skill + inventory).
```

- [ ] **Step 2: Commit**

```bash
git add docs/gates/p00.md
git commit -m "$(cat <<'EOF'
parity(p0): gate memo for P0 close

Awaiting Arun verification: static gates, parity tests, visual side-by-side,
discovery memos seen by Prasanta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (run after writing the plan)

**Spec coverage** (against `docs/parity/PLAN.md` §5 P0):
- [x] Port the four functions verbatim from legacy → Tasks 5
- [x] Adapt `place_string_inverters` to call bundled-DC + MST-AC paths → Task 6
- [x] All S11.5 additions preserved → Tasks 5–6 explicitly preserve
- [x] Pre-file three discovery memos → Tasks 8, 9, 10
- [x] Capture legacy ground truth (numeric + screenshots + exports) → Tasks 1, 2, 3
- [x] Manual side-by-side visual gate → Task 7
- [x] Update `CLAUDE.md` §2 → Task 11
- [x] Gate memo `docs/gates/p00.md` → Task 13

**Placeholder scan:** No "TBD", "TODO", "implement later", or vague stubs. Memo content is concrete; test code is concrete; ported function code is concrete with adaptations spelled out.

**Type consistency:**
- `_bundle_dc_cables` signature matches `place_string_inverters` call site in Task 6.
- `_route_ac_mst` signature matches call site.
- `_calc_individual_ac_total` returns `(total, per_inv, per_icr)` tuple — this is a deliberate change from legacy (which returned only `total`); the new signature matches what `place_string_inverters` needs in Task 6 to populate `result.ac_cable_m_per_inverter` and `result.ac_cable_m_per_icr`. Documented in Task 5 Step 5.
- `_build_mst_edges` is verbatim port; same signature as legacy.

**Adaptation consistency:** All four ported functions thread `route_poly` through to `_route_ac_cable` and capture `_last_route_quality` per cable. Allowance parameters (`dc_per_string_allowance_m`, `ac_termination_allowance_m`) are accepted as positional args, matching the new project's parameterised constants.

---

## Execution Handoff

Plan complete and saved to `docs/parity/plans/p00-quick-win-port.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best when tasks have clear acceptance + verification commands and parallel sub-tasks (e.g., the three discovery memos in Tasks 8/9/10 can run in parallel).

**2. Inline Execution** — Execute tasks in this session using `executing-plans` skill, batch execution with checkpoints for review. Best when tasks have heavy interdependencies or you want to keep all decisions in one conversation thread.

Given user_working_style Rule 6 (agentic-coding pace; user time is the bottleneck) and Rule 4 (prefers automation), my recommendation is **subagent-driven** with these adjustments:

- **Tasks 1, 4, 5, 6** (the technical port + tests) — subagents execute; I review.
- **Tasks 2, 3, 7** (manual capture + visual gate) — Arun executes; subagents do nothing here.
- **Tasks 8, 9, 10** (discovery memos) — subagents execute in parallel; I review.
- **Tasks 11, 12, 13** (CLAUDE.md, SPIKE_PLAN.md, gate memo) — subagents execute; I review.

Which approach?
