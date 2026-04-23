"""
KMZ exporter: writes all layout results back to a single KMZ file.

Output structure per boundary:
  - Folder "<Plant Name>"
      ├─ Boundary polygon
      ├─ Exclusion Zones (if any)
      ├─ Panel Tables
      └─ Summary placemark (capacity MWp, area acres, pitch, table count)
  - Folder "Overall Summary"  (aggregate across all boundaries)
"""
import simplekml
import zipfile
import os
from typing import List, Tuple

from pvlayout_core.models.project import LayoutResult, LayoutParameters, DesignMode
from pvlayout_core.utils.geo_utils import utm_to_wgs84

COLOUR_OBSTACLE = simplekml.Color.changealpha("99", simplekml.Color.red)
COLOUR_ICR      = simplekml.Color.changealpha("dd", simplekml.Color.blue)
COLOUR_ROAD     = simplekml.Color.changealpha("bb", simplekml.Color.gray)
COLOUR_INVERTER = simplekml.Color.changealpha("ee", simplekml.Color.lime)
COLOUR_DC_CABLE = "cc0080ff"   # ABGR: alpha=cc, B=00, G=80, R=ff (orange)
COLOUR_AC_CABLE = simplekml.Color.changealpha("dd", simplekml.Color.red)
COLOUR_LA       = "cc00008b"   # ABGR: alpha=cc, dark-red (LA rectangle)

# Per-plant palette — 8 colours matching the matplotlib PLANT_COLOURS palette.
# KML format is AABBGGRR (alpha, blue, green, red — all hex pairs).
# matplotlib hex: #RRGGBB  →  KML fill (alpha=cc): cc BB GG RR
#                            KML border (alpha=ff): ff BB GG RR
_PLANT_KML_FILLS = [
    "ccaf6f1a",   # #1a6faf  steel blue
    "cc004fd9",   # #d94f00  burnt orange
    "cc2ca02c",   # #2ca02c  forest green
    "ccbd6794",   # #9467bd  purple
    "cc4b568c",   # #8c564b  brown
    "ccc277e3",   # #e377c2  pink
    "cc7f7f7f",   # #7f7f7f  grey
    "cc22bdbc",   # #bcbd22  olive/yellow-green
]
_PLANT_KML_LINES = [
    "ffaf6f1a",   # full-opacity versions for outlines
    "ff004fd9",
    "ff2ca02c",
    "ffbd6794",
    "ff4b568c",
    "ffc277e3",
    "ff7f7f7f",
    "ff22bdbc",
]
# Boundary fill is very light (alpha=33) so the plot background is visible
_PLANT_KML_BND_FILLS = [
    "33af6f1a",
    "33004fd9",
    "332ca02c",
    "33bd6794",
    "334b568c",
    "33c277e3",
    "337f7f7f",
    "3322bdbc",
]


def _table_corners_wgs84(
    x: float, y: float, w: float, h: float, epsg: int
) -> List[Tuple[float, float]]:
    corners_utm = [(x, y), (x+w, y), (x+w, y+h), (x, y+h), (x, y)]
    return utm_to_wgs84(corners_utm, epsg)


def _energy_html(result: LayoutResult) -> str:
    """Return HTML rows for energy yield fields (empty string if not calculated)."""
    er = result.energy_result
    if er is None or er.year1_energy_mwh <= 0:
        return ""
    return (
        f"<hr/>"
        f"<b>Performance Ratio</b>    : {er.performance_ratio*100:.2f} %<br/>"
        f"<b>In-plane irradiance</b>  : {er.gti_kwh_m2_yr:.1f} kWh/m²/yr<br/>"
        f"<b>Specific yield</b>       : {er.specific_yield_kwh_kwp_yr:.1f} kWh/kWp/yr<br/>"
        f"<b>Year 1 energy</b>        : {er.year1_energy_mwh:,.1f} MWh<br/>"
        f"<b>CUF / PLF</b>            : {er.cuf_pct:.2f} %<br/>"
        f"<b>25-year total energy</b> : {er.lifetime_energy_mwh/1000:,.2f} GWh<br/>"
    )


def _boundary_summary_html(result: LayoutResult, params: LayoutParameters) -> str:
    pitch_label = (
        f"{result.row_pitch_m:.2f} m <i>(auto-calculated)</i>"
        if params.row_spacing is None
        else f"{result.row_pitch_m:.2f} m <i>(user-defined)</i>"
    )
    html = (
        f"<b>{result.boundary_name}</b><br/>"
        f"<hr/>"
        f"<b>Boundary area</b>    : {result.total_area_acres:.3f} acres "
        f"({result.total_area_m2/10000:.3f} ha)<br/>"
        f"<b>Design type</b>      : {params.design_type.value.replace('_',' ').title()}<br/>"
        f"<b>Module</b>           : {params.module.wattage:.0f} Wp  "
        f"({params.module.length} m × {params.module.width} m)<br/>"
        f"<b>Tilt angle</b>       : {result.tilt_angle_deg:.1f}°<br/>"
        f"<b>Row pitch</b>        : {pitch_label}<br/>"
        f"<b>GCR</b>              : {result.gcr_achieved:.3f}<br/>"
        f"<b>Total tables</b>     : {len(result.placed_tables)}<br/>"
        f"<b>Total modules</b>    : {result.total_modules}<br/>"
        f"<b>Plant capacity</b>   : {result.total_capacity_mwp:.4f} MWp "
        f"({result.total_capacity_kwp:.2f} kWp)<br/>"
        f"<b>ICR buildings</b>   : {len(result.placed_icrs)} "
        f"(40 m × 14 m each)<br/>"
    )
    # ---- Inverter topology (mode-dependent) ----
    if params.design_mode == DesignMode.CENTRAL_INVERTER:
        html += (
            f"<b>SMBs</b>                 : {result.num_string_inverters} "
            f"(capacity: {result.inverter_capacity_kwp:.2f} kWp each)<br/>"
            f"<b>Central Inverters</b>    : {result.num_central_inverters} "
            f"(capacity: {result.central_inverter_capacity_kwp:.2f} kWp each)<br/>"
        )
    else:
        html += (
            f"<b>String inverters</b> : {result.num_string_inverters} "
            f"(capacity: {result.inverter_capacity_kwp:.2f} kWp each)<br/>"
            f"<b>Inv. per ICR</b>    : {result.inverters_per_icr:.1f}<br/>"
        )
    # ---- AC capacity & DC/AC ratio (only if energy has been calculated) ----
    if result.plant_ac_capacity_mw > 0:
        html += (
            f"<b>Plant AC capacity</b>: {result.plant_ac_capacity_mw:.4f} MW<br/>"
            f"<b>DC/AC ratio</b>      : {result.dc_ac_ratio:.3f}<br/>"
        )
    # ---- Cable totals (mode-dependent) ----
    if params.design_mode == DesignMode.CENTRAL_INVERTER:
        html += (
            f"<b>String DC cable total</b>  : {result.total_dc_cable_m:,.0f} m  (MMS → SMB)<br/>"
            f"<b>DC cable total</b>         : {result.total_ac_cable_m:,.0f} m  (SMB → Central Inverter)<br/>"
        )
    else:
        html += (
            f"<b>String DC cable total</b>  : {result.total_dc_cable_m:,.0f} m  (MMS → Str. Inverter)<br/>"
            f"<b>AC cable total</b>         : {result.total_ac_cable_m:,.0f} m  (Str. Inverter → ICR)<br/>"
        )
    html += f"<b>Lightning arresters</b>: {result.num_las} (40 m × 14 m each, r=100 m)<br/>"
    html += _energy_html(result)
    return html


def export_kmz(
    results: List[LayoutResult],
    params: LayoutParameters,
    output_path: str,
) -> None:
    """
    Write a KMZ file containing layouts for all boundaries.

    Parameters
    ----------
    results     : list of LayoutResult (one per boundary)
    params      : LayoutParameters
    output_path : file path for the output .kmz file
    """
    # Accept a single LayoutResult for backwards compatibility
    if isinstance(results, LayoutResult):
        results = [results]

    kml = simplekml.Kml(name="PV Plant Layout")

    total_tables   = 0
    total_modules  = 0
    total_mwp      = 0.0
    total_acres    = 0.0

    for idx, result in enumerate(results):
        # Per-plant colour (cycles through 8-colour palette)
        _ci = idx % len(_PLANT_KML_FILLS)
        col_fill = _PLANT_KML_FILLS[_ci]
        col_line = _PLANT_KML_LINES[_ci]
        col_bnd_fill = _PLANT_KML_BND_FILLS[_ci]

        plant_folder = kml.newfolder(name=result.boundary_name or f"Plant {idx+1}")
        epsg = result.utm_epsg

        # ---- Boundary ----
        if result.boundary_wgs84:
            bnd = plant_folder.newpolygon(name="Boundary")
            bnd.outerboundaryis = result.boundary_wgs84
            bnd.style.linestyle.color = col_line
            bnd.style.linestyle.width = 2.5
            bnd.style.polystyle.color = col_bnd_fill
            bnd.style.polystyle.fill  = 1

            # ---- Plant name label at boundary centroid ----
            lons = [p[0] for p in result.boundary_wgs84]
            lats = [p[1] for p in result.boundary_wgs84]
            clon = sum(lons) / len(lons)
            clat = sum(lats) / len(lats)
            _plant_name = result.boundary_name or f"Plant {idx+1}"
            name_pnt = plant_folder.newpoint(
                name=_plant_name,
                coords=[(clon, clat)]
            )
            # No icon — label only
            name_pnt.style.iconstyle.scale = 0
            name_pnt.style.labelstyle.color = col_line
            name_pnt.style.labelstyle.scale = 1.4

        # ---- Obstacles ----
        if result.obstacle_polygons_wgs84:
            obs_folder = plant_folder.newfolder(name="Exclusion Zones")
            for i, obs in enumerate(result.obstacle_polygons_wgs84):
                op = obs_folder.newpolygon(name=f"Obstacle {i+1}")
                op.outerboundaryis = obs
                op.style.linestyle.color = simplekml.Color.red
                op.style.linestyle.width = 1
                op.style.polystyle.color = COLOUR_OBSTACLE

        # ---- Tables ----
        if result.placed_tables:
            tbl_folder = plant_folder.newfolder(name="MMS-Tables")
            modules_per_table = params.table.modules_per_table()
            for tbl in result.placed_tables:
                corners = _table_corners_wgs84(tbl.x, tbl.y, tbl.width, tbl.height, epsg)
                pol = tbl_folder.newpolygon(name=f"R{tbl.row_index+1}-T{tbl.col_index+1}")
                pol.outerboundaryis = corners
                pol.description = (
                    f"Row {tbl.row_index+1}, MMS-Table {tbl.col_index+1} | "
                    f"Modules: {modules_per_table} | "
                    f"{modules_per_table * params.module.wattage/1000:.2f} kWp"
                )
                pol.style.linestyle.color = simplekml.Color.white
                pol.style.linestyle.width = 1
                pol.style.polystyle.color = col_fill      # per-plant color

        # ---- ICR Buildings ----
        if result.placed_icrs:
            icr_folder = plant_folder.newfolder(name="ICR Buildings")
            for icr in result.placed_icrs:
                corners = _table_corners_wgs84(icr.x, icr.y, icr.width, icr.height, epsg)
                pol = icr_folder.newpolygon(name=f"ICR-{icr.index}")
                pol.outerboundaryis = corners
                pol.description = (
                    f"<b>Inverter Control Room {icr.index}</b><br/>"
                    f"Dimensions: {icr.height:.0f} m (N-S) × {icr.width:.0f} m (E-W)"
                )
                pol.style.linestyle.color = simplekml.Color.white
                pol.style.linestyle.width = 2
                pol.style.polystyle.color = COLOUR_ICR

        # ---- Internal Roads ----
        if result.placed_roads:
            road_folder = plant_folder.newfolder(name="Obstructions")
            for road in result.placed_roads:
                corners_wgs84 = utm_to_wgs84(road.points_utm, epsg)
                pol = road_folder.newpolygon(name=f"Road-{road.index}")
                pol.outerboundaryis = corners_wgs84
                pol.description = f"Obstruction {road.index} ({road.road_type})"
                pol.style.linestyle.color = simplekml.Color.white
                pol.style.linestyle.width = 1
                pol.style.polystyle.color = COLOUR_ROAD

        # ---- String Inverters / SMBs ----
        if result.placed_string_inverters:
            _is_ci_kmz = (params.design_mode == DesignMode.CENTRAL_INVERTER)
            _inv_folder_name = "SMBs" if _is_ci_kmz else "String Inverters"
            sinv_folder = plant_folder.newfolder(name=_inv_folder_name)
            for inv in result.placed_string_inverters:
                corners = _table_corners_wgs84(inv.x, inv.y, inv.width, inv.height, epsg)
                _inv_label = "SMB" if _is_ci_kmz else "String Inverter"
                pol = sinv_folder.newpolygon(name=f"{'SMB' if _is_ci_kmz else 'INV'}-{inv.index}")
                pol.outerboundaryis = corners
                pol.description = (
                    f"<b>{_inv_label} {inv.index}</b><br/>"
                    f"Capacity: {inv.capacity_kwp:.2f} kWp<br/>"
                    f"Assigned MMS-Tables: {inv.assigned_table_count}"
                )
                pol.style.linestyle.color = simplekml.Color.white
                pol.style.linestyle.width = 1
                pol.style.polystyle.color = COLOUR_INVERTER

        # DC String Cables and AC Cables are intentionally excluded from KMZ
        # (quantities are captured in the summary placemark description)

        # ---- Lightning Arresters — footprint rectangles only ----
        # (Protection circles are omitted from KMZ; full detail is in DXF)
        if result.placed_las:
            la_folder = plant_folder.newfolder(name="Lightning Arresters")
            for la in result.placed_las:
                corners = _table_corners_wgs84(la.x, la.y, la.width, la.height, epsg)
                pol = la_folder.newpolygon(name=f"LA-{la.index}")
                pol.outerboundaryis = corners
                pol.description = (
                    f"<b>Lightning Arrester {la.index}</b><br/>"
                    f"Footprint: {la.height:.0f} m (N-S) × {la.width:.0f} m (E-W)<br/>"
                    f"Protection radius: {la.radius:.0f} m"
                )
                pol.style.linestyle.color = simplekml.Color.white
                pol.style.linestyle.width = 2
                pol.style.polystyle.color = COLOUR_LA
                # Blue label so LA names show clearly in Google Earth
                pol.style.labelstyle.color = simplekml.Color.cyan
                pol.style.labelstyle.scale = 1.1

        # ---- Summary placemark ----
        if result.boundary_wgs84:
            # Reuse the centroid already computed for the name label above
            pnt = plant_folder.newpoint(
                name=f"{result.boundary_name or f'Plant {idx+1}'} — Details",
                coords=[(clon, clat)]
            )
            pnt.description = _boundary_summary_html(result, params)
            pnt.style.iconstyle.color = col_line
            pnt.style.labelstyle.color = col_line

        total_tables  += len(result.placed_tables)
        total_modules += result.total_modules
        total_mwp     += result.total_capacity_mwp
        total_acres   += result.total_area_acres

    # ---- Overall summary ----
    if len(results) > 1:
        summary_folder = kml.newfolder(name="Overall Summary")
        # Place at centroid of first boundary
        if results[0].boundary_wgs84:
            lons = [p[0] for p in results[0].boundary_wgs84]
            lats = [p[1] for p in results[0].boundary_wgs84]
            clon, clat = sum(lons)/len(lons), sum(lats)/len(lats)
        else:
            clon, clat = 0.0, 0.0

        pnt = summary_folder.newpoint(name="Overall Summary", coords=[(clon, clat)])
        has_energy = any(r.energy_result for r in results)
        rows = "".join(
            f"<tr><td>{r.boundary_name}</td>"
            f"<td align='right'>{r.total_area_acres:.3f}</td>"
            f"<td align='right'>{len(r.placed_tables)}</td>"
            f"<td align='right'>{r.total_modules}</td>"
            f"<td align='right'>{r.total_capacity_mwp:.4f}</td>"
            f"<td align='right'>{r.row_pitch_m:.2f}</td>"
            + (f"<td align='right'>{r.energy_result.year1_energy_mwh:,.1f}</td>"
               f"<td align='right'>{r.energy_result.cuf_pct:.2f}</td>"
               f"<td align='right'>{r.energy_result.lifetime_energy_mwh/1000:,.2f}</td>"
               if r.energy_result else "<td>—</td><td>—</td><td>—</td>")
            + "</tr>"
            for r in results
        )
        total_yr1  = sum(r.energy_result.year1_energy_mwh  for r in results if r.energy_result)
        total_life = sum(r.energy_result.lifetime_energy_mwh for r in results if r.energy_result)
        energy_hdrs = ("<th>Yr1 Energy (MWh)</th><th>CUF (%)</th><th>25yr (GWh)</th>"
                       if has_energy else "")
        energy_totals = (f"<td align='right'><b>{total_yr1:,.1f}</b></td>"
                         f"<td></td>"
                         f"<td align='right'><b>{total_life/1000:,.2f}</b></td>"
                         if has_energy else "")
        pnt.description = (
            f"<b>Overall Project Summary — {len(results)} Plant(s)</b><br/>"
            f"<table border='1' cellpadding='3'>"
            f"<tr><th>Plant</th><th>Area (acres)</th><th>MMS-Tables</th>"
            f"<th>Modules</th><th>Capacity (MWp)</th><th>Pitch (m)</th>"
            f"{energy_hdrs}</tr>"
            f"{rows}"
            f"<tr><td><b>TOTAL</b></td>"
            f"<td align='right'><b>{total_acres:.3f}</b></td>"
            f"<td align='right'><b>{total_tables}</b></td>"
            f"<td align='right'><b>{total_modules}</b></td>"
            f"<td align='right'><b>{total_mwp:.4f}</b></td>"
            f"<td></td>"
            f"{energy_totals}</tr>"
            f"</table>"
        )

    # ---- Save as KMZ ----
    kml_path = output_path.replace(".kmz", "_tmp.kml")
    kml.save(kml_path)
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(kml_path, arcname="doc.kml")
    os.remove(kml_path)
