"""
Capture legacy numeric baseline for parity verification.

Runs the full layout pipeline using LEGACY's flat-namespace core/ (imported via
sys.path bootstrap), on a given KMZ, with cable calc enabled. Dumps placed counts,
cable totals, and per-cable polylines to JSON:

    docs/parity/baselines/<baseline>/ground-truth/<plant>/numeric-baseline.json

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
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List


def _resolve_legacy_sha(legacy_repo: Path) -> str:
    """Capture the resolved HEAD SHA of the legacy repo for audit trail.
    Branch is the moving authority; SHA is the snapshot at capture time."""
    try:
        return subprocess.check_output(
            ["git", "-C", str(legacy_repo), "rev-parse", "HEAD"],
            text=True,
        ).strip()
    except Exception as e:
        return f"<unresolved: {e}>"


def _bootstrap_legacy(legacy_repo: Path) -> None:
    """Insert legacy repo at front of sys.path so `from core.X` and `from models.X`
    resolve to legacy's flat layout, NOT the new project's pvlayout_core/."""
    if not (legacy_repo / "core" / "string_inverter_manager.py").exists():
        sys.exit(
            f"[error] legacy repo not found / not at expected layout: {legacy_repo}"
        )
    # Insert at front so legacy wins over any vendored pvlayout_core namespace
    sys.path.insert(0, str(legacy_repo))


def _build_default_params():
    """Build a LayoutParameters using the dataclass defaults (which are the
    GUI input-panel defaults) plus enable_cable_calc=True.

    Legacy and new-project LayoutParameters dataclasses are byte-identical at
    this baseline, with defaults: wattage=580 Wp, modules_in_row=28,
    rows_per_table=2, max_strings_per_inverter=20, design_mode=STRING_INVERTER,
    enable_cable_calc=False.

    These defaults produce the S11.5 gate memo's reference numbers
    (placed_tables=611, placed_string_inverters=62, placed_las=22 on
    phaseboundary2) when run through the new project's S11.5 pipeline.
    The legacy capture in this script will produce different cable counts
    (bundled DC + MST AC topology) but the same table / inverter / LA counts.
    """
    # These imports resolve to legacy flat namespace after _bootstrap_legacy()
    from models.project import LayoutParameters

    p = LayoutParameters()
    p.enable_cable_calc = True
    return p


def _run_legacy_pipeline(kmz_path: Path):
    """Import legacy modules (after sys.path bootstrap) and run the full pipeline.

    Pipeline order matches time_cable_calc.py in the new project:
      1. parse_kmz          -> KMZParseResult (.boundaries, .centroid_lat/lon)
      2. run_layout_multi   -> List[LayoutResult]  (includes ICR placement internally)
      3. place_lightning_arresters  (per result)
      4. place_string_inverters     (per result, computes cables when enable_cable_calc=True)
    """
    from core.kmz_parser import parse_kmz
    from core.layout_engine import run_layout_multi
    from core.la_manager import place_lightning_arresters
    from core.string_inverter_manager import place_string_inverters

    params = _build_default_params()

    t0 = time.perf_counter()
    parsed = parse_kmz(str(kmz_path))
    t_parse = time.perf_counter() - t0

    if not parsed.boundaries:
        sys.exit(f"[error] no boundaries parsed from {kmz_path}")

    t0 = time.perf_counter()
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    t_layout = time.perf_counter() - t0

    # Filter out boundaries with no usable polygon (e.g., layout-engine
    # error paths emit empty LayoutResult with usable_polygon=None).
    # Returning only valid results keeps the contract with _aggregate_results
    # explicit — error-path LayoutResults don't pollute the totals.
    t_la = 0.0
    t_cables = 0.0
    valid_results = []
    for r in results:
        if r.usable_polygon is None:
            continue

        t0 = time.perf_counter()
        place_lightning_arresters(r, params)
        t_la += time.perf_counter() - t0

        t0 = time.perf_counter()
        place_string_inverters(r, params)
        t_cables += time.perf_counter() - t0

        valid_results.append(r)

    timings = {
        "parse_s": round(t_parse, 3),
        "layout_s": round(t_layout, 3),
        "la_s": round(t_la, 3),
        "cables_s": round(t_cables, 3),
    }
    return valid_results, timings


def _serialize_cable(cr) -> Dict[str, Any]:
    """Convert legacy CableRun to JSON-friendly dict.
    Legacy CableRun has no route_quality field — emit 'ok' by convention."""
    return {
        "index": cr.index,
        "cable_type": cr.cable_type,
        "start_utm": list(cr.start_utm),
        "end_utm": list(cr.end_utm),
        "route_utm": [list(p) for p in cr.route_utm],
        "length_m": cr.length_m,
        "route_quality": "ok",  # legacy has no quality tagging; default
    }


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


def _aggregate_results(results) -> Dict[str, Any]:
    """Aggregate counts and totals across all LayoutResult objects."""
    counts: Dict[str, int] = {
        "placed_tables": 0,
        "placed_string_inverters": 0,
        "placed_las": 0,
        "placed_icrs": 0,
        "dc_cable_runs": 0,
        "ac_cable_runs": 0,
    }
    totals: Dict[str, float] = {
        "total_capacity_kwp": 0.0,
        "total_dc_cable_m": 0.0,
        "total_ac_cable_m": 0.0,
    }
    dc_cables: List[Dict[str, Any]] = []
    ac_cables: List[Dict[str, Any]] = []
    las: List[Dict[str, Any]] = []

    for r in results:
        counts["placed_tables"] += len(r.placed_tables)
        counts["placed_string_inverters"] += len(r.placed_string_inverters)
        counts["placed_las"] += len(r.placed_las)
        counts["placed_icrs"] += len(r.placed_icrs)
        counts["dc_cable_runs"] += len(r.dc_cable_runs)
        counts["ac_cable_runs"] += len(r.ac_cable_runs)
        totals["total_capacity_kwp"] += r.total_capacity_kwp
        totals["total_dc_cable_m"] += r.total_dc_cable_m
        totals["total_ac_cable_m"] += r.total_ac_cable_m
        dc_cables.extend(_serialize_cable(c) for c in r.dc_cable_runs)
        ac_cables.extend(_serialize_cable(c) for c in r.ac_cable_runs)
        las.extend(_serialize_la(la) for la in r.placed_las)

    totals["total_capacity_kwp"] = round(totals["total_capacity_kwp"], 2)
    totals["total_dc_cable_m"] = round(totals["total_dc_cable_m"], 1)
    totals["total_ac_cable_m"] = round(totals["total_ac_cable_m"], 1)

    return {
        "counts": counts,
        "totals": totals,
        "dc_cable_runs": dc_cables,
        "ac_cable_runs": ac_cables,
        "placed_las": las,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture legacy numeric baseline")
    parser.add_argument("--kmz", required=True, type=Path)
    parser.add_argument("--plant", required=True, help="Plant slug, e.g. phaseboundary2")
    parser.add_argument("--legacy-repo", required=True, type=Path)
    parser.add_argument("--baseline", required=True, help="Baseline ID, e.g. baseline-v1-20260429")
    parser.add_argument(
        "--out-root",
        type=Path,
        default=Path("docs/parity/baselines"),
    )
    args = parser.parse_args()

    if not args.kmz.exists():
        sys.exit(f"[error] KMZ not found: {args.kmz}")

    _bootstrap_legacy(args.legacy_repo)

    print(f"[info] running legacy pipeline on {args.kmz.name}")
    results, timings = _run_legacy_pipeline(args.kmz)

    agg = _aggregate_results(results)

    out_dir = args.out_root / args.baseline / "ground-truth" / args.plant
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "numeric-baseline.json"

    # Cable type breakdown / pattern distribution: legacy doesn't expose pattern stats
    # (PVLAYOUT_PATTERN_STATS is an S11.5 addition to the new project). Emit cable
    # counts only; pattern distribution will be captured in P1 once we have it on
    # both sides.
    legacy_sha = _resolve_legacy_sha(args.legacy_repo)

    payload = {
        "plant": args.plant,
        "baseline": args.baseline,
        "legacy_sha_at_capture": legacy_sha,
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
        "counts": agg["counts"],
        "totals": agg["totals"],
        "placed_las": agg["placed_las"],
        "dc_cable_runs": agg["dc_cable_runs"],
        "ac_cable_runs": agg["ac_cable_runs"],
    }

    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)

    print(f"[info] wrote {out_path}")
    print(
        f"[info] tables={payload['counts']['placed_tables']} "
        f"inverters={payload['counts']['placed_string_inverters']} "
        f"las={payload['counts']['placed_las']} "
        f"dc_cables={payload['counts']['dc_cable_runs']} "
        f"ac_cables={payload['counts']['ac_cable_runs']}"
    )
    print(
        f"[info] total_dc={payload['totals']['total_dc_cable_m']}m "
        f"total_ac={payload['totals']['total_ac_cable_m']}m"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
