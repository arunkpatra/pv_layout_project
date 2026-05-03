"""
Detect legacy AC-cable boundary overshoots.

Two modes:

  --mode capture (default):
      Loads docs/parity/baselines/<baseline>/ground-truth/<plant>/numeric-baseline.json
      and analyses the polylines persisted there. Note: legacy persists ONLY
      the MST trench polylines (one per MST edge) in ``ac_cable_runs[]``; the
      per-inverter home-run routes (which feed ``total_ac_cable_m``) are
      computed transiently in ``_calc_individual_ac_total`` and discarded.
      So this mode tends to report 0 overshoot — that's an artefact of what
      the capture preserves, not evidence the per-inverter routes are clean.

  --mode reconstruct:
      Bootstraps the legacy repo onto sys.path (same trick the capture
      script uses), reruns the full pipeline, and instruments
      ``_route_ac_cable`` to record every per-inverter home-run polyline as
      it is generated inside ``_calc_individual_ac_total``. Each captured
      polyline is checked against the plant fence; overshooting cables are
      enumerated and written to overshoot-analysis-reconstructed.json.
      This is the mode that produces the killer "X cables, Y metres outside
      fence" evidence.

Source KMZ: python/pvlayout_engine/tests/golden/kmz/<plant>.kmz.
Legacy repo: --legacy-repo (default /Users/arunkpatra/codebase/PVlayout_Advance).

Usage:
    cd python/pvlayout_engine
    uv run python scripts/parity/detect_legacy_overshoots.py \\
        --plant phaseboundary2 --mode reconstruct

Note on the fence: The plant fence is reconstructed from the KMZ boundary
polygon, projected into the UTM zone the legacy capture used (auto-derived
from lon/lat centroid). ICR and obstacle subtraction is intentionally NOT
applied — we measure overshoot against the plant fence itself, the
conservative (most-permissive) geometry. A cable measured as outside the
fence is unambiguously outside the plant.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

# scripts/parity/detect_legacy_overshoots.py → parents[0]=parity, [1]=scripts,
# [2]=pvlayout_engine, [3]=python, [4]=repo root.
REPO_ROOT = Path(__file__).resolve().parents[4]
PVLE_ROOT = REPO_ROOT / "python" / "pvlayout_engine"
sys.path.insert(0, str(PVLE_ROOT))

from shapely.geometry import LineString, MultiPolygon, Polygon  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

from pvlayout_core.core.kmz_parser import parse_kmz  # noqa: E402
from pvlayout_core.utils.geo_utils import get_utm_epsg, wgs84_to_utm  # noqa: E402


def _build_fence_utm(kmz_path: Path) -> Tuple[Polygon, int]:
    """Reconstruct the plant-fence polygon in UTM from the source KMZ.

    For multi-boundary KMZs we union all top-level boundary polygons; for
    single-boundary KMZs the union is just the one polygon. Returns the
    UTM polygon plus the EPSG code used.
    """
    parsed = parse_kmz(str(kmz_path))
    if not parsed.boundaries:
        raise RuntimeError(f"No boundaries parsed from {kmz_path}")

    # UTM zone is selected from the centroid of ALL boundaries combined,
    # matching what layout_engine does at boundary-projection time.
    epsg = get_utm_epsg(parsed.centroid_lon, parsed.centroid_lat)

    polys = []
    for b in parsed.boundaries:
        coords_utm = wgs84_to_utm(b.coords, epsg)
        if len(coords_utm) < 3:
            continue
        p = Polygon(coords_utm)
        if not p.is_valid:
            p = p.buffer(0)
        if p.is_valid and not p.is_empty:
            polys.append(p)
    if not polys:
        raise RuntimeError(f"No valid boundaries in {kmz_path}")

    fence = unary_union(polys) if len(polys) > 1 else polys[0]
    return fence, epsg


def _route_outside_length(route: List[List[float]], fence) -> Tuple[float, float, int]:
    """For a single cable polyline, return:
      (total_length_m, outside_length_m, n_outside_segments)
    using shapely difference against the fence polygon.
    """
    if len(route) < 2:
        return 0.0, 0.0, 0
    line = LineString([(p[0], p[1]) for p in route])
    total = line.length
    outside = line.difference(fence)
    outside_len = outside.length if not outside.is_empty else 0.0

    # Count how many *segments* of the polyline have any non-trivial outside
    # component (purely for reporting; the headline number is outside_len_m).
    n_bad_segs = 0
    for i in range(len(route) - 1):
        seg = LineString([route[i], route[i + 1]])
        seg_out = seg.difference(fence)
        if (not seg_out.is_empty) and seg_out.length > 1e-3:
            n_bad_segs += 1

    return total, outside_len, n_bad_segs


def _percentile(sorted_xs: List[float], q: float) -> float:
    if not sorted_xs:
        return 0.0
    if len(sorted_xs) == 1:
        return sorted_xs[0]
    k = (len(sorted_xs) - 1) * q
    lo = int(k)
    hi = min(lo + 1, len(sorted_xs) - 1)
    frac = k - lo
    return sorted_xs[lo] * (1 - frac) + sorted_xs[hi] * frac


def analyse(plant: str, baseline: str = "baseline-v1-20260429") -> Dict[str, Any]:
    baseline_dir = (
        REPO_ROOT
        / "docs"
        / "parity"
        / "baselines"
        / baseline
        / "ground-truth"
        / plant
    )
    capture_path = baseline_dir / "numeric-baseline.json"
    # KMZ fixtures moved to pvlayout_core per cloud-offload C2.
    kmz_path = PVLE_ROOT.parent / "pvlayout_core" / "tests" / "golden" / "kmz" / f"{plant}.kmz"

    if not capture_path.exists():
        raise FileNotFoundError(
            f"Legacy capture not found at {capture_path}. "
            f"Run capture_legacy_baseline.py for this plant first."
        )
    if not kmz_path.exists():
        raise FileNotFoundError(f"KMZ not found at {kmz_path}")

    capture = json.loads(capture_path.read_text())
    fence, epsg = _build_fence_utm(kmz_path)

    ac_runs = capture.get("ac_cable_runs", [])

    per_cable: List[Dict[str, Any]] = []
    total_length = 0.0
    total_outside = 0.0
    overshooting_cables: List[Dict[str, Any]] = []

    for run in ac_runs:
        route = run.get("route_utm") or []
        idx = run.get("index")
        length_m_legacy = run.get("length_m", 0.0)
        rq = run.get("route_quality", "ok")
        total_len, outside_len, n_bad_segs = _route_outside_length(route, fence)
        total_length += total_len
        total_outside += outside_len
        rec = {
            "index": idx,
            "length_m_legacy_reported": length_m_legacy,
            "length_m_recomputed": round(total_len, 3),
            "outside_length_m": round(outside_len, 3),
            "outside_fraction": round(
                outside_len / total_len, 6
            )
            if total_len > 0
            else 0.0,
            "n_outside_segments": n_bad_segs,
            "legacy_route_quality": rq,
        }
        per_cable.append(rec)
        if outside_len > 0.01:  # > 1 cm outside → real overshoot
            overshooting_cables.append(rec)

    overshoots_sorted = sorted(
        [r["outside_length_m"] for r in overshooting_cables]
    )

    summary = {
        "plant": plant,
        "baseline": baseline,
        "fence_epsg": epsg,
        "fence_area_m2": round(fence.area, 1),
        "fence_is_multipolygon": isinstance(fence, MultiPolygon),
        "ac_cables_total": len(ac_runs),
        "ac_cables_with_overshoot": len(overshooting_cables),
        "ac_total_length_m": round(total_length, 1),
        "ac_total_outside_length_m": round(total_outside, 1),
        "ac_outside_fraction_overall": round(
            total_outside / total_length, 6
        )
        if total_length > 0
        else 0.0,
        "max_single_cable_overshoot_m": round(
            max(overshoots_sorted) if overshoots_sorted else 0.0, 3
        ),
        "median_overshoot_m_among_overshooting": round(
            _percentile(overshoots_sorted, 0.5), 3
        ),
        "p90_overshoot_m_among_overshooting": round(
            _percentile(overshoots_sorted, 0.9), 3
        ),
        "p99_overshoot_m_among_overshooting": round(
            _percentile(overshoots_sorted, 0.99), 3
        ),
        "legacy_total_ac_cable_m_reported": capture.get("totals", {}).get(
            "total_ac_cable_m"
        ),
    }

    out = {
        "summary": summary,
        "overshooting_cables": sorted(
            overshooting_cables, key=lambda r: -r["outside_length_m"]
        ),
        "per_cable": per_cable,
    }

    out_path = baseline_dir / "overshoot-analysis.json"
    out_path.write_text(json.dumps(out, indent=2))

    return out


def _print_human_summary(out: Dict[str, Any]) -> None:
    s = out["summary"]
    print(f"\n=== Overshoot analysis: {s['plant']} ({s['baseline']}) ===")
    print(f"Fence area:                      {s['fence_area_m2']:>12,.1f} m^2")
    print(f"Fence EPSG:                      {s['fence_epsg']}")
    print(
        f"AC cables (total):               {s['ac_cables_total']:>12d}"
    )
    print(
        f"AC cables with overshoot:        {s['ac_cables_with_overshoot']:>12d}  "
        f"({100*s['ac_cables_with_overshoot']/max(s['ac_cables_total'],1):.1f}% of cables)"
    )
    print(
        f"AC total length:                 {s['ac_total_length_m']:>12,.1f} m"
    )
    print(
        f"AC outside-fence length:         {s['ac_total_outside_length_m']:>12,.1f} m  "
        f"({100*s['ac_outside_fraction_overall']:.2f}% of total)"
    )
    print(
        f"Max single-cable overshoot:      {s['max_single_cable_overshoot_m']:>12,.2f} m"
    )
    print(
        f"Median overshoot (overshooters): {s['median_overshoot_m_among_overshooting']:>12,.2f} m"
    )
    print(
        f"P90 overshoot (overshooters):    {s['p90_overshoot_m_among_overshooting']:>12,.2f} m"
    )
    print(
        f"P99 overshoot (overshooters):    {s['p99_overshoot_m_among_overshooting']:>12,.2f} m"
    )
    print(
        f"Legacy reported total_ac_cable_m: {s['legacy_total_ac_cable_m_reported']}"
    )
    print()


def reconstruct(
    plant: str,
    legacy_repo: Path,
    baseline: str = "baseline-v1-20260429",
) -> Dict[str, Any]:
    """Re-run legacy pipeline with per-inverter polyline capture, then analyse.

    Bootstraps the legacy repo onto sys.path the same way capture_legacy_baseline.py
    does. Wraps legacy's ``_route_ac_cable`` so every call from within
    ``_calc_individual_ac_total`` records its polyline. Compares each polyline
    against the plant fence and writes overshoot-analysis-reconstructed.json.
    """
    if not (legacy_repo / "core" / "string_inverter_manager.py").exists():
        raise RuntimeError(
            f"Legacy repo not at expected layout: {legacy_repo}"
        )
    # IMPORTANT: must precede any pvlayout_core import that pulls
    # `from core.X` symbols (sys.path bootstrap convention from
    # capture_legacy_baseline.py).
    sys.path.insert(0, str(legacy_repo))

    from core.kmz_parser import parse_kmz as legacy_parse_kmz  # noqa: E402
    from core.layout_engine import run_layout_multi  # noqa: E402
    from core.la_manager import place_lightning_arresters  # noqa: E402
    from core import string_inverter_manager as sim  # noqa: E402
    from models.project import LayoutParameters  # noqa: E402

    # Build fence using the LEGACY's parse_kmz (paranoia: ensure identical
    # boundary semantics; in practice both parsers agree on the
    # `boundaries[i].coords` shape).
    # KMZ fixtures moved to pvlayout_core per cloud-offload C2.
    kmz_path = PVLE_ROOT.parent / "pvlayout_core" / "tests" / "golden" / "kmz" / f"{plant}.kmz"
    parsed = legacy_parse_kmz(str(kmz_path))
    if not parsed.boundaries:
        raise RuntimeError(f"No boundaries in {kmz_path}")
    epsg = get_utm_epsg(parsed.centroid_lon, parsed.centroid_lat)

    polys = []
    for b in parsed.boundaries:
        coords_utm = wgs84_to_utm(b.coords, epsg)
        if len(coords_utm) < 3:
            continue
        p = Polygon(coords_utm)
        if not p.is_valid:
            p = p.buffer(0)
        if p.is_valid and not p.is_empty:
            polys.append(p)
    fence = unary_union(polys) if len(polys) > 1 else polys[0]

    # Monkeypatch _route_ac_cable to capture every per-inverter polyline.
    # We can't disambiguate MST callers from individual callers by signature
    # alone — but we can record everything and tag by call-site frame name.
    captured: List[Dict[str, Any]] = []
    orig_route = sim._route_ac_cable

    def _spy(start, end, gap_ys, col_xs, usable, *args, **kwargs):
        route = orig_route(start, end, gap_ys, col_xs, usable, *args, **kwargs)
        # Frame inspection: which legacy function is calling us?
        import inspect
        caller = inspect.currentframe().f_back.f_code.co_name
        captured.append(
            {
                "caller": caller,
                "start": list(start),
                "end": list(end),
                "route": [list(p) for p in route],
            }
        )
        return route

    sim._route_ac_cable = _spy
    usable_polygons: List[Any] = []
    try:
        params = LayoutParameters()
        params.enable_cable_calc = True
        results = run_layout_multi(
            boundaries=parsed.boundaries,
            params=params,
            centroid_lat=parsed.centroid_lat,
            centroid_lon=parsed.centroid_lon,
        )
        for r in results:
            if r.usable_polygon is None:
                continue
            place_lightning_arresters(r, params)
            sim.place_string_inverters(r, params)
            usable_polygons.append(r.usable_polygon)
    finally:
        sim._route_ac_cable = orig_route

    # Legacy's Pattern F violates ``usable_polygon`` (the table-setback
    # polygon, after obstacles + perimeter setbacks are subtracted), which
    # is STRICTER than the plant fence. Build the usable union for
    # secondary comparison.
    usable_union = (
        unary_union(usable_polygons)
        if len(usable_polygons) > 1
        else (usable_polygons[0] if usable_polygons else fence)
    )

    # Filter to per-inverter home-runs (the BoM cable set):
    indiv = [
        c for c in captured if c["caller"] == "_calc_individual_ac_total"
    ]
    mst = [c for c in captured if c["caller"] == "_route_ac_mst"]

    # Analyse overshoots on the per-inverter set against TWO references:
    #   - fence: the plant boundary polygon (most permissive — overshoot here
    #     means cable is unambiguously outside the plant property).
    #   - usable: the table-setback polygon (Pattern F's actual referent;
    #     stricter — Pattern F's _score counts segments outside this).
    overshoots: List[Dict[str, Any]] = []
    indiv_total = 0.0
    indiv_outside_fence = 0.0
    indiv_outside_usable = 0.0
    fence_overshoot_lengths: List[float] = []
    usable_overshoot_lengths: List[float] = []
    n_overshoot_fence = 0
    n_overshoot_usable = 0

    for i, rec in enumerate(indiv):
        total_len, outside_fence_len, n_bad_fence = _route_outside_length(
            rec["route"], fence
        )
        _, outside_usable_len, n_bad_usable = _route_outside_length(
            rec["route"], usable_union
        )
        indiv_total += total_len
        indiv_outside_fence += outside_fence_len
        indiv_outside_usable += outside_usable_len

        is_fence_overshoot = outside_fence_len > 0.01
        is_usable_overshoot = outside_usable_len > 0.01
        if is_fence_overshoot:
            n_overshoot_fence += 1
            fence_overshoot_lengths.append(outside_fence_len)
        if is_usable_overshoot:
            n_overshoot_usable += 1
            usable_overshoot_lengths.append(outside_usable_len)

        if is_fence_overshoot or is_usable_overshoot:
            overshoots.append(
                {
                    "rank": i,
                    "start": rec["start"],
                    "end": rec["end"],
                    "n_route_pts": len(rec["route"]),
                    "length_m": round(total_len, 3),
                    "outside_fence_m": round(outside_fence_len, 3),
                    "outside_usable_m": round(outside_usable_len, 3),
                    "n_segments_outside_fence": n_bad_fence,
                    "n_segments_outside_usable": n_bad_usable,
                }
            )

    # Same analysis for MST trench (sanity check; expected to be clean).
    mst_total = 0.0
    mst_outside = 0.0
    mst_overshoots = 0
    for rec in mst:
        total_len, outside_len, _ = _route_outside_length(rec["route"], fence)
        mst_total += total_len
        mst_outside += outside_len
        if outside_len > 0.01:
            mst_overshoots += 1

    fence_overshoot_lengths.sort()
    usable_overshoot_lengths.sort()
    summary = {
        "plant": plant,
        "baseline": baseline,
        "mode": "reconstructed",
        "fence_epsg": epsg,
        "fence_area_m2": round(fence.area, 1),
        "usable_polygon_area_m2": round(usable_union.area, 1),
        "individual_home_runs": {
            "n_routed": len(indiv),
            "total_route_length_m": round(indiv_total, 1),
            "vs_plant_fence": {
                "n_with_overshoot": n_overshoot_fence,
                "fraction_with_overshoot": round(
                    n_overshoot_fence / max(len(indiv), 1), 4
                ),
                "total_outside_length_m": round(indiv_outside_fence, 1),
                "fraction_outside_overall": round(
                    indiv_outside_fence / indiv_total, 6
                )
                if indiv_total > 0
                else 0.0,
                "max_overshoot_m": round(
                    max(fence_overshoot_lengths)
                    if fence_overshoot_lengths
                    else 0.0,
                    3,
                ),
                "min_overshoot_m": round(
                    min(fence_overshoot_lengths)
                    if fence_overshoot_lengths
                    else 0.0,
                    3,
                ),
                "median_overshoot_m": round(
                    _percentile(fence_overshoot_lengths, 0.5), 3
                ),
                "p90_overshoot_m": round(
                    _percentile(fence_overshoot_lengths, 0.9), 3
                ),
            },
            "vs_usable_polygon": {
                "n_with_overshoot": n_overshoot_usable,
                "fraction_with_overshoot": round(
                    n_overshoot_usable / max(len(indiv), 1), 4
                ),
                "total_outside_length_m": round(indiv_outside_usable, 1),
                "fraction_outside_overall": round(
                    indiv_outside_usable / indiv_total, 6
                )
                if indiv_total > 0
                else 0.0,
                "max_overshoot_m": round(
                    max(usable_overshoot_lengths)
                    if usable_overshoot_lengths
                    else 0.0,
                    3,
                ),
                "min_overshoot_m": round(
                    min(usable_overshoot_lengths)
                    if usable_overshoot_lengths
                    else 0.0,
                    3,
                ),
                "median_overshoot_m": round(
                    _percentile(usable_overshoot_lengths, 0.5), 3
                ),
                "p90_overshoot_m": round(
                    _percentile(usable_overshoot_lengths, 0.9), 3
                ),
            },
        },
        "mst_trench": {
            "n_edges": len(mst),
            "n_with_overshoot_vs_fence": mst_overshoots,
            "total_route_length_m": round(mst_total, 1),
            "total_outside_fence_length_m": round(mst_outside, 1),
        },
    }

    out = {
        "summary": summary,
        "overshooting_individual_cables": sorted(
            overshoots,
            key=lambda r: -max(r["outside_fence_m"], r["outside_usable_m"]),
        ),
    }

    out_dir = (
        REPO_ROOT
        / "docs"
        / "parity"
        / "baselines"
        / baseline
        / "ground-truth"
        / plant
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "overshoot-analysis-reconstructed.json"
    out_path.write_text(json.dumps(out, indent=2))

    return out


def _print_reconstruct_summary(out: Dict[str, Any]) -> None:
    s = out["summary"]
    indiv = s["individual_home_runs"]
    mst = s["mst_trench"]
    fb = indiv["vs_plant_fence"]
    ub = indiv["vs_usable_polygon"]
    print(
        f"\n=== Reconstructed overshoot analysis: {s['plant']} ({s['baseline']}) ==="
    )
    print(
        f"Plant fence area:    {s['fence_area_m2']:,.1f} m^2 (EPSG {s['fence_epsg']})"
    )
    print(
        f"Usable poly area:    {s['usable_polygon_area_m2']:,.1f} m^2  "
        f"(after table-setbacks + obstacles)"
    )
    print()
    print(
        f"INDIVIDUAL HOME-RUNS (legacy BoM cable set, n={indiv['n_routed']}, "
        f"total {indiv['total_route_length_m']:,.1f} m):"
    )
    print(f"  vs PLANT FENCE (overshoot = unambiguously outside the plant):")
    print(
        f"    Cables overshooting:    {fb['n_with_overshoot']:>4d}  "
        f"({100*fb['fraction_with_overshoot']:.1f}%)"
    )
    print(
        f"    Outside-fence length:   {fb['total_outside_length_m']:>8,.1f} m  "
        f"({100*fb['fraction_outside_overall']:.3f}%)"
    )
    print(
        f"    Min/Median/Max:         {fb['min_overshoot_m']:.2f} / "
        f"{fb['median_overshoot_m']:.2f} / {fb['max_overshoot_m']:.2f} m"
    )
    print(f"  vs USABLE POLYGON (Pattern F's referent, table-setback inside):")
    print(
        f"    Cables overshooting:    {ub['n_with_overshoot']:>4d}  "
        f"({100*ub['fraction_with_overshoot']:.1f}%)"
    )
    print(
        f"    Outside-usable length:  {ub['total_outside_length_m']:>8,.1f} m  "
        f"({100*ub['fraction_outside_overall']:.3f}%)"
    )
    print(
        f"    Min/Median/Max:         {ub['min_overshoot_m']:.2f} / "
        f"{ub['median_overshoot_m']:.2f} / {ub['max_overshoot_m']:.2f} m"
    )
    print()
    print("MST TRENCH (visualization geometry):")
    print(f"  Edges:                        {mst['n_edges']}")
    print(
        f"  Edges overshooting fence:     {mst['n_with_overshoot_vs_fence']}"
    )
    print(
        f"  Total trench length:          {mst['total_route_length_m']:,.1f} m"
    )
    print(
        f"  Trench outside fence:         {mst['total_outside_fence_length_m']:,.1f} m"
    )
    print()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--plant",
        required=True,
        help="Plant slug under docs/parity/baselines/.../ground-truth/",
    )
    ap.add_argument(
        "--baseline",
        default="baseline-v1-20260429",
        help="Baseline directory name",
    )
    ap.add_argument(
        "--mode",
        choices=("capture", "reconstruct"),
        default="reconstruct",
        help="capture = analyse persisted polylines (MST trench only); "
        "reconstruct = re-run legacy and capture per-inverter routes",
    )
    ap.add_argument(
        "--legacy-repo",
        type=Path,
        default=Path("/Users/arunkpatra/codebase/PVlayout_Advance"),
        help="Path to PVlayout_Advance checkout at baseline-v1-20260429",
    )
    args = ap.parse_args()

    if args.mode == "capture":
        out = analyse(args.plant, args.baseline)
        _print_human_summary(out)
    else:
        out = reconstruct(args.plant, args.legacy_repo, args.baseline)
        _print_reconstruct_summary(out)


if __name__ == "__main__":
    main()
