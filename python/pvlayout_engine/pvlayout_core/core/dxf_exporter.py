"""
DXF exporter: writes all layout results to a single DXF file.

Layers:
  BOUNDARY     – plant boundary polygons (yellow)
  OBSTACLES    – exclusion zones (red)
  TABLES       – panel tables (blue)
  ICR          – inverter control rooms (cyan)
  OBSTRUCTIONS – user-drawn obstructions (green)
  INVERTERS    – string inverters (lime)
  DC_CABLES    – DC string cable routes (orange)  [only when include_cables=True]
  AC_CABLE_TRENCH – physical AC cable trench/tray route (magenta) [only when include_cables=True]
                    Geometry is the MST corridor through the plant; the per-
                    inverter copper BoM is reported separately in the PDF/KMZ
                    summary (see PRD §2.2).
  LA           – lightning arrester symbols        [only when include_la=True]
  ANNOTATIONS  – labels and text

All coordinates are in UTM metres (same projection used by the layout engine).
The boundary polygon is converted from WGS84 to UTM before drawing.
"""
import ezdxf
from ezdxf import bbox as ezdxf_bbox
from ezdxf import units as dxf_units
from typing import List

from pvlayout_core.models.project import LayoutResult, LayoutParameters
from pvlayout_core.utils.geo_utils import wgs84_to_utm


# DXF ACI colour indices
COL_YELLOW  = 2
COL_RED     = 1
COL_BLUE    = 5
COL_CYAN    = 4
COL_GREEN   = 3
COL_LIME    = 83
COL_ORANGE  = 30
COL_MAGENTA = 6
COL_WHITE   = 7
COL_MAROON  = 14   # dark red for LA


def _pts2d(pts) -> List[tuple]:
    """Convert list of (x, y) or (x, y, ...) to list of (x, y) tuples."""
    return [(float(p[0]), float(p[1])) for p in pts if len(p) >= 2]


def export_dxf(
    results: List[LayoutResult],
    params: LayoutParameters,
    output_path: str,
    include_la: bool = True,
    include_cables: bool = True,
) -> None:
    """
    Write a DXF file containing all layout elements.

    Parameters
    ----------
    results         : list of LayoutResult (one per boundary)
    params          : LayoutParameters
    output_path     : file path for the output .dxf file
    include_la      : if True, Lightning Arrester symbols and protection
                      circles are written to the LA layer.  If False (LA
                      toggle is OFF in the UI), the LA layer is not created
                      and no LA elements are exported.
    include_cables  : if True, DC and AC cable routes are written to
                      DC_CABLES / AC_CABLE_TRENCH layers.  If False (cable display
                      toggle is OFF in the UI), those layers are not created
                      and no cable polylines are exported.
    """
    if isinstance(results, LayoutResult):
        results = [results]

    doc = ezdxf.new("R2010")
    doc.units = dxf_units.M
    msp = doc.modelspace()

    # ---- Create layers -------------------------------------------------------
    layer_defs = [
        ("BOUNDARY",     COL_YELLOW),
        ("OBSTACLES",    COL_RED),
        ("TABLES",       COL_BLUE),
        ("ICR",          COL_CYAN),
        ("OBSTRUCTIONS", COL_GREEN),
        ("INVERTERS",    COL_LIME),
        ("ANNOTATIONS",  COL_WHITE),
    ]
    if include_cables:
        layer_defs.append(("DC_CABLES", COL_ORANGE))
        layer_defs.append(("AC_CABLE_TRENCH", COL_MAGENTA))
    if include_la:
        layer_defs.append(("LA", COL_MAROON))
    for lname, lcol in layer_defs:
        doc.layers.new(lname, dxfattribs={"color": lcol})

    for result in results:
        epsg = result.utm_epsg

        # ---- Boundary --------------------------------------------------------
        if result.boundary_wgs84:
            bnd_utm = _pts2d(wgs84_to_utm(result.boundary_wgs84, epsg))
            if len(bnd_utm) >= 2:
                msp.add_lwpolyline(
                    bnd_utm, close=True,
                    dxfattribs={"layer": "BOUNDARY", "lineweight": 50},
                )
                # Label
                cx = sum(p[0] for p in bnd_utm) / len(bnd_utm)
                cy = sum(p[1] for p in bnd_utm) / len(bnd_utm)
                msp.add_text(
                    result.boundary_name or "Plant",
                    dxfattribs={"layer": "ANNOTATIONS", "height": 10},
                ).set_placement((cx, cy), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

        # ---- Obstacles -------------------------------------------------------
        for obs_wgs84 in result.obstacle_polygons_wgs84:
            obs_utm = _pts2d(wgs84_to_utm(obs_wgs84, epsg))
            if len(obs_utm) >= 2:
                msp.add_lwpolyline(
                    obs_utm, close=True,
                    dxfattribs={"layer": "OBSTACLES"},
                )

        # ---- Panel tables ----------------------------------------------------
        for tbl in result.placed_tables:
            pts = [
                (tbl.x,             tbl.y),
                (tbl.x + tbl.width, tbl.y),
                (tbl.x + tbl.width, tbl.y + tbl.height),
                (tbl.x,             tbl.y + tbl.height),
            ]
            msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "TABLES"})

        # ---- ICR buildings ---------------------------------------------------
        for icr in result.placed_icrs:
            pts = [
                (icr.x,             icr.y),
                (icr.x + icr.width, icr.y),
                (icr.x + icr.width, icr.y + icr.height),
                (icr.x,             icr.y + icr.height),
            ]
            msp.add_lwpolyline(pts, close=True,
                               dxfattribs={"layer": "ICR", "lineweight": 35})
            msp.add_text(
                f"ICR-{icr.index}",
                dxfattribs={"layer": "ANNOTATIONS", "height": 5},
            ).set_placement(
                (icr.x + icr.width / 2, icr.y + icr.height / 2),
                align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
            )

        # ---- Internal roads --------------------------------------------------
        for road in result.placed_roads:
            pts = _pts2d(road.points_utm)
            if len(pts) >= 2:
                msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "OBSTRUCTIONS"})

        # ---- String inverters ------------------------------------------------
        for inv in result.placed_string_inverters:
            pts = [
                (inv.x,             inv.y),
                (inv.x + inv.width, inv.y),
                (inv.x + inv.width, inv.y + inv.height),
                (inv.x,             inv.y + inv.height),
            ]
            msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "INVERTERS"})
            msp.add_text(
                f"I{inv.index}",
                dxfattribs={"layer": "ANNOTATIONS", "height": 2},
            ).set_placement(
                (inv.x + inv.width / 2, inv.y + inv.height / 2),
                align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
            )

        # ---- Cable routes (only when cable display toggle is ON) -------------
        if include_cables:
            for cable in result.dc_cable_runs:
                pts = cable.route_utm if cable.route_utm else [cable.start_utm, cable.end_utm]
                pts2d = _pts2d(pts)
                if len(pts2d) >= 2:
                    msp.add_lwpolyline(
                        pts2d, close=False,
                        dxfattribs={"layer": "DC_CABLES", "lineweight": 13},
                    )
            for cable in result.ac_cable_runs:
                pts = cable.route_utm if cable.route_utm else [cable.start_utm, cable.end_utm]
                pts2d = _pts2d(pts)
                if len(pts2d) >= 2:
                    msp.add_lwpolyline(
                        pts2d, close=False,
                        dxfattribs={"layer": "AC_CABLE_TRENCH", "lineweight": 25},
                    )

        # ---- Lightning Arresters (only when LA toggle is ON) ------------------
        if include_la:
            import math
            for la in result.placed_las:
                # Rectangle footprint
                la_pts = [
                    (la.x,             la.y),
                    (la.x + la.width,  la.y),
                    (la.x + la.width,  la.y + la.height),
                    (la.x,             la.y + la.height),
                ]
                msp.add_lwpolyline(la_pts, close=True,
                                   dxfattribs={"layer": "LA", "lineweight": 35})
                la_cx = la.x + la.width / 2
                la_cy = la.y + la.height / 2
                # Protection circle
                msp.add_circle(
                    (la_cx, la_cy), la.radius,
                    dxfattribs={"layer": "LA"},
                )
                # Label
                msp.add_text(
                    f"LA-{la.index}",
                    dxfattribs={"layer": "ANNOTATIONS", "height": 5},
                ).set_placement(
                    (la_cx, la_cy),
                    align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
                )

    # Compute drawing extents + set the model-space viewport so the file
    # opens centred on the layout instead of at world-origin (0,0).
    # Smoke discovery 2026-05-01 (E1): without this, AutoCAD / viewers
    # opened the export with `$EXTMIN = 1e+20` / `$EXTMAX = -1e+20`
    # (uninitialised) and the user saw a blank canvas — entities were
    # there at UTM coordinates ~(550000, 2400000), miles away from the
    # default origin. Some viewers auto-zoom-extents on load, others
    # don't; valid extents + a sensible viewport ensure every viewer
    # opens to the correct view.
    #
    # Subtle ezdxf 1.x behavior: writing `doc.header["$EXTMIN"]` directly
    # appears to take in memory but is reset on `saveas()`. The proper
    # flow is to set the modelspace block's `dxf.extmin / extmax` first,
    # then call `doc.update_extents()` which copies them into the
    # header. (See ezdxf.document.Drawing.update_extents source — guard
    # `if bool(extmin) and bool(extmax)` requires the msp values to be
    # non-default before the header is touched.)
    box = ezdxf_bbox.extents(msp, fast=True)
    if box.has_data:
        msp.dxf.extmin = (box.extmin.x, box.extmin.y, 0)
        msp.dxf.extmax = (box.extmax.x, box.extmax.y, 0)
        doc.update_extents()
        # Centre the modelspace viewport on the drawing with a 10%
        # margin. Height is the vertical extent — ezdxf computes width
        # to match the aspect ratio of the active viewport.
        size_y = max(box.size.y, 1.0)
        doc.set_modelspace_vport(
            height=size_y * 1.1,
            center=(box.center.x, box.center.y),
        )

    doc.saveas(output_path)
