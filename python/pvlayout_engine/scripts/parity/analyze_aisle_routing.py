"""Verify that the new app's AC cable trench routes through inter-row aisles.

Consumes a DXF file produced by the new app's `Export DXF` button (which
calls `pvlayout_core.core.dxf_exporter.export_dxf` with `include_cables=True`
by default — see `apps/desktop/src/panels/DeliverablesBand.tsx` and
`packages/sidecar-client/src/index.ts`).

The cable polylines are Manhattan paths produced by Patterns A / V / F in
`_route_ac_cable`. A typical Pattern A polyline is `[s → (s[0], gy) →
(e[0], gy) → e]` — a vertical-horizontal-vertical sequence. In 2D
projection, the HORIZONTAL segment at `y=gy` lies in a row-gap aisle
(the routing claim); the two VERTICAL segments cross table polygons
because they run at constant X across multiple table rows in that
column. This is a 2D-projection artifact, not a routing defect — in
real installations those vertical segments are trench-depth cable
beside/below the table frames.

The verification therefore separates segments by orientation and asks
the right question of each:

  1. Length passing OUTSIDE the plant fence (DXF layer `BOUNDARY`).
     Should be zero. Property-line correctness.
  2. HORIZONTAL segment length inside ROW-GAP Y-bands (DXF layer
     `TABLES` defines the rows; gap bands are the strips between them).
     Should be ≥ 95%. This is the actual "uses inter-row aisles"
     claim — every H-segment of an A-family path is supposed to be
     in a gap band.
  3. Length passing through table footprints, broken down by HORIZONTAL
     vs VERTICAL contribution. Reported diagnostically rather than as a
     pass/fail — vertical-cross-table is the expected 2D artefact;
     horizontal-cross-table would be the actual smoking gun (a
     horizontal segment at a Y that happens to lie inside a table row
     means the cable is running THROUGH a table along the long axis,
     which is not buildable).

Usage:

    cd python/pvlayout_engine
    uv run python scripts/parity/analyze_aisle_routing.py \\
        --dxf /path/to/phaseboundary2-output.dxf \\
        /path/to/complex-plant-layout-output.dxf \\
        --output-dir ../../docs/post-parity/findings/aisle-verification

Per-DXF outputs:
  <plant>-aisle-summary.txt       Human-readable per-DXF summary.
  <plant>-aisle-analysis.json     Per-cable detail (forensic drill-in).

The script is the regression analogue of
`tests/integration/test_cable_routing_constraints.py` — that one runs
the in-process pipeline; this one consumes a real Tauri-app DXF export
to verify the rendered/exported artifact (closing the loop end-to-end
through the UI + sidecar + DXF exporter).
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple

import ezdxf
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

LAYER_BOUNDARY = "BOUNDARY"
LAYER_TABLES = "TABLES"
LAYER_AC = "AC_CABLE_TRENCH"

# Pass criteria (locked with user 2026-05-02; see PRD-cable-routing-correctness.md
# + the analyzer docstring above for the 2D-projection rationale that informs
# why we measure horizontal segments separately).
THRESHOLD_FENCE_OVERSHOOT_FRACTION_MAX = 0.0  # 100% inside fence.
THRESHOLD_HORIZONTAL_IN_GAP_BAND_FRACTION_MIN = 0.95  # ≥95% of H-segment length in gap bands.
THRESHOLD_HORIZONTAL_IN_TABLE_FRACTION_MAX = 0.05  # ≤5% of H-segment length crossing tables (smoking gun).

# Segment orientation classification: a segment is "horizontal" if |dy| / length
# is below this fraction. The Pattern A family's H-segments are exactly
# horizontal in the table-aligned UTM frame, so 0.05 (3 deg) is conservative.
HORIZONTAL_TILT_TOLERANCE = 0.05
VERTICAL_TILT_TOLERANCE = 0.05

# Floating-point noise floor — Shapely intersect/difference on long
# polylines produces sub-mm artefacts. Treat anything below 1 cm as noise.
NUMERIC_NOISE_FLOOR_M = 0.01


@dataclass
class CableAnalysis:
    """Per-cable diagnostic record."""

    cable_id: int
    total_length_m: float
    inside_fence_m: float
    outside_fence_m: float
    horizontal_length_m: float
    vertical_length_m: float
    diagonal_length_m: float
    horizontal_in_gap_band_m: float
    horizontal_in_table_m: float
    vertical_in_table_m: float
    n_vertices: int
    starts_outside_fence: bool


@dataclass
class PlantAnalysis:
    """Per-plant aggregate + per-cable breakdown."""

    dxf_path: str
    n_tables: int
    n_ac_cables: int
    fence_area_m2: float
    table_pitch_y_estimate: float
    gap_band_count: int
    gap_band_total_height_m: float
    aggregate_total_m: float = 0.0
    aggregate_inside_fence_m: float = 0.0
    aggregate_outside_fence_m: float = 0.0
    aggregate_horizontal_m: float = 0.0
    aggregate_vertical_m: float = 0.0
    aggregate_diagonal_m: float = 0.0
    aggregate_horizontal_in_gap_band_m: float = 0.0
    aggregate_horizontal_in_table_m: float = 0.0
    aggregate_vertical_in_table_m: float = 0.0
    cables: List[CableAnalysis] = field(default_factory=list)


def _polyline_to_points(entity) -> List[Tuple[float, float]]:
    """Extract 2D point list from an LWPOLYLINE entity."""
    pts: List[Tuple[float, float]] = []
    for v in entity.vertices():
        # ezdxf LWPolyline.vertices yields (x, y[, start_w, end_w, bulge])
        try:
            x, y = float(v[0]), float(v[1])
        except (TypeError, IndexError):
            continue
        pts.append((x, y))
    return pts


def _read_dxf_layers(dxf_path: Path) -> Dict[str, List[List[Tuple[float, float]]]]:
    """Pull the geometries we need from the DXF, by layer."""
    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()
    layers: Dict[str, List[List[Tuple[float, float]]]] = {
        LAYER_BOUNDARY: [],
        LAYER_TABLES: [],
        LAYER_AC: [],
    }
    for entity in msp:
        if entity.dxftype() != "LWPOLYLINE":
            continue
        layer = entity.dxf.layer
        if layer not in layers:
            continue
        pts = _polyline_to_points(entity)
        if len(pts) < 2:
            continue
        layers[layer].append(pts)
    return layers


def _build_table_footprint(table_polylines: List[List[Tuple[float, float]]]) -> Any:
    """Union of all table-rectangle polygons from the TABLES layer.

    Returns a Shapely geometry (Polygon or MultiPolygon) or None if no tables.
    """
    polys = []
    for pts in table_polylines:
        if len(pts) < 3:
            continue
        try:
            poly = Polygon(pts)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if not poly.is_empty:
                polys.append(poly)
        except Exception:
            pass
    if not polys:
        return None
    return unary_union(polys)


def _build_fence(boundary_polylines: List[List[Tuple[float, float]]]) -> Any:
    """Union of all boundary polygons. Multi-boundary plants (e.g. complex-plant-layout)
    will produce a MultiPolygon — Shapely handles that uniformly downstream.
    """
    polys = []
    for pts in boundary_polylines:
        if len(pts) < 3:
            continue
        try:
            poly = Polygon(pts)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if not poly.is_empty:
                polys.append(poly)
        except Exception:
            pass
    if not polys:
        return None
    return unary_union(polys)


def _table_centroid(pts: List[Tuple[float, float]]) -> Tuple[float, float]:
    """Cheap centroid for a 4-point rectangle (or near-rectangle)."""
    n = len(pts)
    if n == 0:
        return (0.0, 0.0)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    return (cx, cy)


def _rows_from_extents(
    extents: List[Tuple[float, float]],
) -> Tuple[List[Tuple[float, float]], float]:
    """Cluster table Y-extents into row spans + estimate pitch. Helper for
    `_build_aisle_mask`. Returns ([(row_miny, row_maxy), ...], pitch).
    """
    if not extents:
        return [], 0.0
    extents = sorted(extents, key=lambda e: e[0])
    rows: List[Tuple[float, float]] = []
    cluster_min, cluster_max = extents[0]
    for miny, maxy in extents[1:]:
        if miny - cluster_min < 0.5:
            cluster_max = max(cluster_max, maxy)
        else:
            rows.append((cluster_min, cluster_max))
            cluster_min, cluster_max = miny, maxy
    rows.append((cluster_min, cluster_max))
    if len(rows) < 2:
        return rows, 0.0
    deltas = sorted(rows[i + 1][0] - rows[i][0] for i in range(len(rows) - 1))
    pitch = deltas[len(deltas) // 2] if deltas else 0.0
    return rows, pitch


def _build_aisle_mask(
    table_polylines: List[List[Tuple[float, float]]],
    fence: Any,
) -> Tuple[Any, float, int, float]:
    """Build the per-boundary union of row-gap aisle polygons.

    Each fence component is treated as an independent plant: tables inside
    it are clustered into rows, gap-bands are constructed between
    consecutive rows, and each gap-band is rendered as a Polygon clipped
    to the boundary's bounding box X-range. The final aisle mask is the
    union of all such band polygons across all fence components.

    This is the multi-boundary-correct version of the prior
    `_estimate_row_gap_bands` (which over-fragmented the row clusters by
    mixing tables from spatially-separate plants — see CR1
    aisle-verification 2026-05-02 finding on complex-plant-layout).

    Returns (aisle_mask_geometry_or_None, pitch_estimate_median_across_boundaries,
              total_band_count, total_band_height_summed).
    """
    if fence is None or not table_polylines:
        return None, 0.0, 0, 0.0

    # Iterate fence components (Polygon → 1; MultiPolygon → N).
    if hasattr(fence, "geoms"):
        components = list(fence.geoms)
    else:
        components = [fence]

    table_centroids = [(pts, _table_centroid(pts)) for pts in table_polylines]

    all_band_polys = []
    pitches: List[float] = []
    band_count = 0
    band_height_sum = 0.0

    from shapely.geometry import Point as _ShapelyPoint

    for comp in components:
        if comp.is_empty:
            continue
        # Tables whose centroid is inside this fence component.
        comp_tables: List[List[Tuple[float, float]]] = []
        for pts, (cx, cy) in table_centroids:
            try:
                if comp.contains(_ShapelyPoint(cx, cy)):
                    comp_tables.append(pts)
            except Exception:
                pass
        if not comp_tables:
            continue

        # Per-component (miny, maxy) extents → row clustering.
        extents = []
        for pts in comp_tables:
            ys = [p[1] for p in pts]
            if not ys:
                continue
            extents.append((min(ys), max(ys)))
        rows, pitch = _rows_from_extents(extents)
        if pitch > 0:
            pitches.append(pitch)
        if len(rows) < 2:
            continue

        # Use the component's bounding box for the X-range of each band
        # so the aisle polygon is confined to this plant's footprint.
        comp_minx, _, comp_maxx, _ = comp.bounds
        # 1 m padding so endpoint-near-band-edge doesn't get dropped by
        # float epsilon when intersecting a polyline.
        bx0, bx1 = comp_minx - 1.0, comp_maxx + 1.0

        for i in range(len(rows) - 1):
            y_top_this = rows[i][1]
            y_bot_next = rows[i + 1][0]
            if y_bot_next <= y_top_this:
                continue
            band = box(bx0, y_top_this, bx1, y_bot_next)
            all_band_polys.append(band)
            band_count += 1
            band_height_sum += y_bot_next - y_top_this

    if not all_band_polys:
        return None, 0.0, 0, 0.0

    aisle_mask = unary_union(all_band_polys)
    median_pitch = (
        sorted(pitches)[len(pitches) // 2] if pitches else 0.0
    )
    return aisle_mask, median_pitch, band_count, band_height_sum


def _length_in_aisle_mask(line: Any, aisle_mask: Any) -> float:
    """Length of a polyline lying inside the aisle-mask geometry (union
    of per-plant row-gap polygons). Returns 0 when either is empty.
    """
    if aisle_mask is None or line is None or line.is_empty:
        return 0.0
    try:
        inter = line.intersection(aisle_mask)
    except Exception:
        return 0.0
    if inter.is_empty:
        return 0.0
    return getattr(inter, "length", 0.0)


def _classify_segment(
    p1: Tuple[float, float], p2: Tuple[float, float]
) -> str:
    """Return "horizontal" | "vertical" | "diagonal" for a 2-point segment."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = (dx * dx + dy * dy) ** 0.5
    if length < NUMERIC_NOISE_FLOOR_M:
        return "diagonal"  # degenerate; classify as diagonal to be safe
    if abs(dy) / length < HORIZONTAL_TILT_TOLERANCE:
        return "horizontal"
    if abs(dx) / length < VERTICAL_TILT_TOLERANCE:
        return "vertical"
    return "diagonal"


def _analyze_one_cable(
    cable_id: int,
    cable_pts: List[Tuple[float, float]],
    fence: Any,
    tables_union: Any,
    aisle_mask: Any,
) -> CableAnalysis:
    line = LineString(cable_pts)
    total = line.length
    inside_fence = 0.0
    outside_fence = 0.0

    if fence is not None:
        try:
            fence_inter = line.intersection(fence)
            inside_fence = getattr(fence_inter, "length", 0.0)
        except Exception:
            inside_fence = 0.0
        outside_fence = max(0.0, total - inside_fence)

    # Per-segment orientation analysis. The cable polyline is a sequence
    # of vertex pairs; classify each segment as horizontal / vertical /
    # diagonal in the UTM frame, then measure how much of each segment
    # lies in a gap band (for horizontal segments — the "uses aisles"
    # metric) or crosses a table (split horizontal vs vertical so the
    # 2D-projection artefact of vertical-cross-table is visible but not
    # confused with the smoking-gun horizontal-cross-table).
    h_total = 0.0
    v_total = 0.0
    d_total = 0.0
    h_in_gap = 0.0
    h_in_tbl = 0.0
    v_in_tbl = 0.0

    for i in range(len(cable_pts) - 1):
        p1 = cable_pts[i]
        p2 = cable_pts[i + 1]
        seg = LineString([p1, p2])
        seg_len = seg.length
        if seg_len < NUMERIC_NOISE_FLOOR_M:
            continue
        kind = _classify_segment(p1, p2)
        if kind == "horizontal":
            h_total += seg_len
            if aisle_mask is not None:
                h_in_gap += _length_in_aisle_mask(seg, aisle_mask)
            if tables_union is not None:
                try:
                    h_in_tbl += getattr(seg.intersection(tables_union), "length", 0.0)
                except Exception:
                    pass
        elif kind == "vertical":
            v_total += seg_len
            if tables_union is not None:
                try:
                    v_in_tbl += getattr(seg.intersection(tables_union), "length", 0.0)
                except Exception:
                    pass
        else:
            d_total += seg_len

    starts_outside = False
    if fence is not None and cable_pts:
        try:
            from shapely.geometry import Point as _ShapelyPoint

            starts_outside = not fence.contains(_ShapelyPoint(cable_pts[0]))
        except Exception:
            pass

    return CableAnalysis(
        cable_id=cable_id,
        total_length_m=round(total, 3),
        inside_fence_m=round(inside_fence, 3),
        outside_fence_m=round(outside_fence, 3),
        horizontal_length_m=round(h_total, 3),
        vertical_length_m=round(v_total, 3),
        diagonal_length_m=round(d_total, 3),
        horizontal_in_gap_band_m=round(h_in_gap, 3),
        horizontal_in_table_m=round(h_in_tbl, 3),
        vertical_in_table_m=round(v_in_tbl, 3),
        n_vertices=len(cable_pts),
        starts_outside_fence=starts_outside,
    )


def analyze_dxf(dxf_path: Path) -> PlantAnalysis:
    layers = _read_dxf_layers(dxf_path)
    fence = _build_fence(layers[LAYER_BOUNDARY])
    tables_union = _build_table_footprint(layers[LAYER_TABLES])
    aisle_mask, pitch, band_count, band_height = _build_aisle_mask(
        layers[LAYER_TABLES], fence
    )

    fence_area = float(fence.area) if fence is not None else 0.0

    pa = PlantAnalysis(
        dxf_path=str(dxf_path),
        n_tables=len(layers[LAYER_TABLES]),
        n_ac_cables=len(layers[LAYER_AC]),
        fence_area_m2=round(fence_area, 1),
        table_pitch_y_estimate=round(pitch, 3),
        gap_band_count=band_count,
        gap_band_total_height_m=round(band_height, 3),
    )

    for i, pts in enumerate(layers[LAYER_AC]):
        ca = _analyze_one_cable(i, pts, fence, tables_union, aisle_mask)
        pa.cables.append(ca)
        pa.aggregate_total_m += ca.total_length_m
        pa.aggregate_inside_fence_m += ca.inside_fence_m
        pa.aggregate_outside_fence_m += ca.outside_fence_m
        pa.aggregate_horizontal_m += ca.horizontal_length_m
        pa.aggregate_vertical_m += ca.vertical_length_m
        pa.aggregate_diagonal_m += ca.diagonal_length_m
        pa.aggregate_horizontal_in_gap_band_m += ca.horizontal_in_gap_band_m
        pa.aggregate_horizontal_in_table_m += ca.horizontal_in_table_m
        pa.aggregate_vertical_in_table_m += ca.vertical_in_table_m

    return pa


def _format_summary(pa: PlantAnalysis) -> str:
    """Human-readable summary written to <plant>-aisle-summary.txt."""
    plant = Path(pa.dxf_path).stem
    total = pa.aggregate_total_m
    if total <= 0:
        return f"=== {plant} ===\nNo AC cables found in {pa.dxf_path}.\n"

    h_total = pa.aggregate_horizontal_m
    v_total = pa.aggregate_vertical_m
    d_total = pa.aggregate_diagonal_m

    pct_outside_fence = 100.0 * pa.aggregate_outside_fence_m / total
    pct_horizontal = 100.0 * h_total / total
    pct_vertical = 100.0 * v_total / total
    pct_diagonal = 100.0 * d_total / total

    pct_h_in_gap = (
        100.0 * pa.aggregate_horizontal_in_gap_band_m / h_total if h_total > 0 else 0.0
    )
    pct_h_in_tbl = (
        100.0 * pa.aggregate_horizontal_in_table_m / h_total if h_total > 0 else 0.0
    )
    pct_v_in_tbl = (
        100.0 * pa.aggregate_vertical_in_table_m / v_total if v_total > 0 else 0.0
    )

    n_fence_exit = sum(
        1 for c in pa.cables if c.outside_fence_m > NUMERIC_NOISE_FLOOR_M
    )

    pass_fence = pct_outside_fence <= THRESHOLD_FENCE_OVERSHOOT_FRACTION_MAX * 100.0 + 0.001
    pass_h_in_gap = pct_h_in_gap >= THRESHOLD_HORIZONTAL_IN_GAP_BAND_FRACTION_MIN * 100.0
    pass_h_in_tbl = pct_h_in_tbl <= THRESHOLD_HORIZONTAL_IN_TABLE_FRACTION_MAX * 100.0
    overall_pass = pass_fence and pass_h_in_gap and pass_h_in_tbl

    return (
        f"=== {plant} ===\n"
        f"DXF: {pa.dxf_path}\n"
        f"\n"
        f"Plant context:\n"
        f"  Fence area:                    {pa.fence_area_m2:>14,.1f} m^2\n"
        f"  Tables (DXF TABLES layer):     {pa.n_tables:>14,}\n"
        f"  AC cables (AC_CABLE_TRENCH):   {pa.n_ac_cables:>14,}\n"
        f"  Estimated row pitch (Y):       {pa.table_pitch_y_estimate:>14,.3f} m\n"
        f"  Row-gap bands detected:        {pa.gap_band_count:>14,}\n"
        f"  Row-gap total height:          {pa.gap_band_total_height_m:>14,.3f} m\n"
        f"\n"
        f"Aggregate cable lengths (total = {total:,.1f} m):\n"
        f"  Inside fence:                  {pa.aggregate_inside_fence_m:>14,.1f} m  ({100.0 * pa.aggregate_inside_fence_m / total:>5.2f}%)\n"
        f"  Outside fence (Class A):       {pa.aggregate_outside_fence_m:>14,.1f} m  ({pct_outside_fence:>5.2f}%)\n"
        f"  Horizontal segments:           {h_total:>14,.1f} m  ({pct_horizontal:>5.2f}%)\n"
        f"  Vertical segments:             {v_total:>14,.1f} m  ({pct_vertical:>5.2f}%)\n"
        f"  Diagonal segments (rare):      {d_total:>14,.1f} m  ({pct_diagonal:>5.2f}%)\n"
        f"\n"
        f"Aisle-routing claim — measured on HORIZONTAL segments only:\n"
        f"  H-length:                      {h_total:>14,.1f} m\n"
        f"  H-length inside row-gap bands: {pa.aggregate_horizontal_in_gap_band_m:>14,.1f} m  ({pct_h_in_gap:>5.2f}% of H)\n"
        f"  H-length crossing tables:      {pa.aggregate_horizontal_in_table_m:>14,.1f} m  ({pct_h_in_tbl:>5.2f}% of H)\n"
        f"\n"
        f"Diagnostic — VERTICAL segments crossing tables (expected; 2D-projection of trench-depth cables):\n"
        f"  V-length crossing tables:      {pa.aggregate_vertical_in_table_m:>14,.1f} m  ({pct_v_in_tbl:>5.2f}% of V)\n"
        f"  (This is NOT a defect — vertical cable runs at trench depth alongside table frames.\n"
        f"   The 2D rectangle in the DXF doesn't carry the depth distinction.)\n"
        f"\n"
        f"Per-cable counts:\n"
        f"  Total AC cables:               {pa.n_ac_cables:>14,}\n"
        f"  Cables exiting the fence:      {n_fence_exit:>14,}\n"
        f"\n"
        f"Pass criteria (CR1 verification, locked 2026-05-02):\n"
        f"  100% length inside fence:                      {'PASS' if pass_fence else 'FAIL'}  ({pct_outside_fence:>5.2f}% outside; threshold 0.00%)\n"
        f"  >=95% horizontal length in row-gap bands:      {'PASS' if pass_h_in_gap else 'FAIL'}  ({pct_h_in_gap:>5.2f}% in gaps; threshold 95.00%)\n"
        f"  <=5% horizontal length crossing tables:        {'PASS' if pass_h_in_tbl else 'FAIL'}  ({pct_h_in_tbl:>5.2f}% in tables; threshold 5.00%)\n"
        f"\n"
        f"Overall: {'PASS' if overall_pass else 'FAIL'}\n"
    )


def _to_jsonable(pa: PlantAnalysis) -> Dict[str, Any]:
    return {
        "dxf_path": pa.dxf_path,
        "n_tables": pa.n_tables,
        "n_ac_cables": pa.n_ac_cables,
        "fence_area_m2": pa.fence_area_m2,
        "table_pitch_y_estimate": pa.table_pitch_y_estimate,
        "gap_band_count": pa.gap_band_count,
        "gap_band_total_height_m": pa.gap_band_total_height_m,
        "aggregates": {
            "total_m": round(pa.aggregate_total_m, 3),
            "inside_fence_m": round(pa.aggregate_inside_fence_m, 3),
            "outside_fence_m": round(pa.aggregate_outside_fence_m, 3),
            "horizontal_m": round(pa.aggregate_horizontal_m, 3),
            "vertical_m": round(pa.aggregate_vertical_m, 3),
            "diagonal_m": round(pa.aggregate_diagonal_m, 3),
            "horizontal_in_gap_band_m": round(pa.aggregate_horizontal_in_gap_band_m, 3),
            "horizontal_in_table_m": round(pa.aggregate_horizontal_in_table_m, 3),
            "vertical_in_table_m": round(pa.aggregate_vertical_in_table_m, 3),
        },
        "cables": [c.__dict__ for c in pa.cables],
    }


def main() -> int:
    p = argparse.ArgumentParser(
        description="Verify AC cable trench routes through inter-row aisles."
    )
    p.add_argument(
        "--dxf",
        nargs="+",
        required=True,
        help="One or more DXF file paths produced by the new app's Export DXF.",
    )
    p.add_argument(
        "--output-dir",
        required=True,
        help="Directory for per-DXF JSON + summary outputs.",
    )
    args = p.parse_args()

    out_dir = Path(args.output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    overall_pass = True
    for dxf_path_str in args.dxf:
        dxf_path = Path(dxf_path_str).resolve()
        if not dxf_path.exists():
            sys.stderr.write(f"DXF not found: {dxf_path}\n")
            overall_pass = False
            continue

        plant = dxf_path.stem
        try:
            pa = analyze_dxf(dxf_path)
        except Exception as e:
            sys.stderr.write(f"Failed to analyze {dxf_path}: {type(e).__name__}: {e}\n")
            overall_pass = False
            continue

        summary = _format_summary(pa)
        sys.stdout.write(summary + "\n")

        (out_dir / f"{plant}-aisle-summary.txt").write_text(summary)
        (out_dir / f"{plant}-aisle-analysis.json").write_text(
            json.dumps(_to_jsonable(pa), indent=2)
        )

        if "FAIL" in summary.split("Overall: ")[-1]:
            overall_pass = False

    return 0 if overall_pass else 1


if __name__ == "__main__":
    sys.exit(main())
