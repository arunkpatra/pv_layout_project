"""
Headless SVG layout renderer.
Produces a single combined SVG for all layout boundaries with gid-tagged
layer groups so the frontend can toggle individual layers without re-fetching.

Groups (always present, even if empty):
  boundary, obstacles, tables, icrs, inverters,
  dc-cables, ac-cables, la-footprints, la-circles, annotations
"""
import matplotlib

matplotlib.use("Agg")  # headless — MUST be before any other matplotlib import

from typing import List

import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PatchCollection

from models.project import LayoutResult
from utils.geo_utils import wgs84_to_utm


def export_svg(results: List[LayoutResult], output_path: str) -> None:
    """Render all layout results to a single combined SVG file."""
    fig, ax = plt.subplots(figsize=(20, 16))
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_facecolor("none")
    fig.patch.set_facecolor("none")

    for result in results:
        _draw_result(ax, result)

    fig.savefig(output_path, format="svg", bbox_inches="tight")
    plt.close(fig)


def _draw_result(ax, result: LayoutResult) -> None:
    epsg = result.utm_epsg

    # ── Boundary ──────────────────────────────────────────────────────────
    if result.boundary_wgs84 and epsg:
        utm_pts = wgs84_to_utm(result.boundary_wgs84, epsg)
        patch = mpatches.Polygon(
            utm_pts, closed=True,
            fill=False, edgecolor="#f0c040", linewidth=1.5,
        )
        patch.set_gid("boundary")
        ax.add_patch(patch)
    else:
        dummy = mpatches.Rectangle((0, 0), 0, 0, visible=False)
        dummy.set_gid("boundary")
        ax.add_patch(dummy)

    # ── Obstacles ─────────────────────────────────────────────────────────
    obs_patches = []
    if epsg:
        for obs in result.obstacle_polygons_wgs84:
            utm_pts = wgs84_to_utm(obs, epsg)
            obs_patches.append(
                mpatches.Polygon(
                    utm_pts, closed=True,
                    facecolor="#cc3333", edgecolor="#ff6666",
                    alpha=0.5, linewidth=1.0,
                )
            )
    col = PatchCollection(obs_patches, match_original=True)
    col.set_gid("obstacles")
    ax.add_collection(col)

    # ── Tables ────────────────────────────────────────────────────────────
    table_patches = [
        mpatches.Rectangle(
            (t.x, t.y), t.width, t.height,
            facecolor="#3a6ea5", edgecolor="#5a9edf", linewidth=0.3,
        )
        for t in result.placed_tables
    ]
    col = PatchCollection(table_patches, match_original=True)
    col.set_gid("tables")
    ax.add_collection(col)

    # ── ICRs ──────────────────────────────────────────────────────────────
    icr_patches = [
        mpatches.Rectangle(
            (icr.x, icr.y), icr.width, icr.height,
            facecolor="#2a4a8a", edgecolor="#4a7adf", linewidth=1.0,
        )
        for icr in result.placed_icrs
    ]
    col = PatchCollection(icr_patches, match_original=True)
    col.set_gid("icrs")
    ax.add_collection(col)

    # ── String inverters ──────────────────────────────────────────────────
    inv_patches = [
        mpatches.Rectangle(
            (inv.x, inv.y), inv.width, inv.height,
            facecolor="#7fff00", edgecolor="#ffffff", linewidth=0.5,
        )
        for inv in result.placed_string_inverters
    ]
    col = PatchCollection(inv_patches, match_original=True)
    col.set_gid("inverters")
    ax.add_collection(col)

    # ── DC cables ─────────────────────────────────────────────────────────
    dc_segs = [
        c.route_utm if c.route_utm else [c.start_utm, c.end_utm]
        for c in result.dc_cable_runs
    ]
    lc = LineCollection(dc_segs, colors="#ff8c00", linewidths=0.5, alpha=0.7)
    lc.set_gid("dc-cables")
    ax.add_collection(lc)

    # ── AC cables ─────────────────────────────────────────────────────────
    ac_segs = [
        c.route_utm if c.route_utm else [c.start_utm, c.end_utm]
        for c in result.ac_cable_runs
    ]
    lc = LineCollection(ac_segs, colors="#cc00ff", linewidths=0.8, alpha=0.7)
    lc.set_gid("ac-cables")
    ax.add_collection(lc)

    # ── LA footprints ─────────────────────────────────────────────────────
    la_patches = [
        mpatches.Rectangle(
            (la.x, la.y), la.width, la.height,
            facecolor="#8b0000", edgecolor="#ff4444", linewidth=0.8,
        )
        for la in result.placed_las
    ]
    col = PatchCollection(la_patches, match_original=True)
    col.set_gid("la-footprints")
    ax.add_collection(col)

    # ── LA protection circles ─────────────────────────────────────────────
    circle_patches = [
        mpatches.Circle(
            (la.x + la.width / 2, la.y + la.height / 2), la.radius,
            fill=False, edgecolor="#ff4444",
            linewidth=0.5, linestyle="--", alpha=0.4,
        )
        for la in result.placed_las
    ]
    col = PatchCollection(circle_patches, match_original=True)
    col.set_gid("la-circles")
    ax.add_collection(col)

    # ── Annotations ───────────────────────────────────────────────────────
    # Empty PatchCollection acts as the anchor group for future text annotations.
    ann_col = PatchCollection([], match_original=True)
    ann_col.set_gid("annotations")
    ax.add_collection(ann_col)

    ax.autoscale_view()
