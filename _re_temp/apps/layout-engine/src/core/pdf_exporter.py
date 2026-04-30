"""
PDF exporter: saves the plant layout as a two-page PDF.

Page 1 — Layout plot  (the live matplotlib Figure passed in)
Page 2 — Summary report (table + key statistics per boundary)
"""
import math
from datetime import date
from typing import List

import matplotlib

matplotlib.use("Agg")  # headless — no display required
import matplotlib.gridspec as gridspec
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.figure import Figure

from models.project import EnergyParameters, LayoutParameters, LayoutResult

# Colour palette matching the GUI
PLANT_COLOURS = ["#1a6faf", "#d94f00", "#2ca02c", "#9467bd",
                 "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22"]
HEADER_COLOUR = "#1a3a5c"


def export_pdf(
    results: List[LayoutResult],
    params: LayoutParameters,
    output_path: str,
    layout_figure: Figure = None,
    energy_params: EnergyParameters = None,
) -> None:
    """
    Write a PDF with up to three pages:
      Page 1 – the layout plot (copy of layout_figure if supplied)
      Page 2 – summary report table
      Page 3 – energy yield report (only if energy has been calculated)

    Parameters
    ----------
    results        : list of LayoutResult
    params         : LayoutParameters
    output_path    : file path for the .pdf file
    layout_figure  : the live matplotlib Figure from the GUI canvas (optional)
    energy_params  : EnergyParameters used for the energy calculation (optional)
    """
    if isinstance(results, LayoutResult):
        results = [results]

    with PdfPages(output_path) as pdf:

        # ---- Page 1: Layout plot --------------------------------------------
        if layout_figure is not None:
            orig_size = layout_figure.get_size_inches()
            layout_figure.set_size_inches(16.54, 11.69)   # A3 landscape
            pdf.savefig(layout_figure, bbox_inches="tight", dpi=150)
            layout_figure.set_size_inches(*orig_size)
        else:
            fig_blank, ax = plt.subplots(figsize=(16.54, 11.69))
            ax.text(0.5, 0.5, "Layout plot not available.\nGenerate the layout first.",
                    ha="center", va="center", fontsize=16,
                    transform=ax.transAxes)
            ax.axis("off")
            pdf.savefig(fig_blank, bbox_inches="tight")
            plt.close(fig_blank)

        # ---- Page 2: Summary report -----------------------------------------
        fig = _build_summary_figure(results, params)
        pdf.savefig(fig, bbox_inches="tight")
        plt.close(fig)

        # ---- Page 3: Energy yield report (only if calculated) ---------------
        has_energy = any(r.energy_result for r in results)
        if has_energy and energy_params is not None:
            fig_e = _build_energy_figure(results, energy_params)
            pdf.savefig(fig_e, bbox_inches="tight")
            plt.close(fig_e)

        # ---- PDF metadata ---------------------------------------------------
        d = pdf.infodict()
        d["Title"]   = "PV Plant Layout Report"
        d["Subject"] = "Automated PV layout summary"
        d["Creator"] = "PVlayout_Advance"


def _build_summary_figure(
    results: List[LayoutResult],
    params: LayoutParameters,
) -> Figure:
    """Build a matplotlib Figure containing the full text summary."""

    fig = plt.figure(figsize=(16.54, 11.69))   # A3 landscape
    fig.patch.set_facecolor("white")

    gs = gridspec.GridSpec(
        4, 1,
        figure=fig,
        top=0.93, bottom=0.04,
        hspace=0.45,
        height_ratios=[0.08, 0.38, 0.26, 0.28],
    )

    # ---- Title bar ----------------------------------------------------------
    ax_title = fig.add_subplot(gs[0])
    ax_title.set_facecolor(HEADER_COLOUR)
    ax_title.text(
        0.5, 0.5,
        f"PV Plant Layout — Summary Report    |    {date.today().strftime('%d %B %Y')}",
        ha="center", va="center",
        fontsize=16, fontweight="bold", color="white",
        transform=ax_title.transAxes,
    )
    ax_title.axis("off")

    # ---- Per-boundary summary table -----------------------------------------
    ax_tbl = fig.add_subplot(gs[1])
    ax_tbl.axis("off")
    ax_tbl.set_title("Layout Summary", fontsize=12, fontweight="bold",
                     loc="left", pad=6, color=HEADER_COLOUR)

    pitch_note = " *" if params.row_spacing is None else ""

    col_headers = [
        "Plant", "Area\n(acres)", "Tables", "Modules",
        "Cap.\n(MWp)", "Pitch\n(m)", "GCR", "ICR",
        "Str.\nInv.", "Inv.\n(kWp)", "DC Cable\n(m)", "AC Cable\n(m)", "LA",
    ]

    rows_data = []
    for r in results:
        rows_data.append([
            r.boundary_name,
            f"{r.total_area_acres:.3f}",
            f"{len(r.placed_tables)}",
            f"{r.total_modules:,}",
            f"{r.total_capacity_mwp:.4f}",
            f"{r.row_pitch_m:.2f}{pitch_note}",
            f"{r.gcr_achieved:.3f}",
            f"{len(r.placed_icrs)}",
            f"{r.num_string_inverters}",
            f"{r.inverter_capacity_kwp:.2f}",
            f"{r.total_dc_cable_m:,.0f}",
            f"{r.total_ac_cable_m:,.0f}",
            f"{r.num_las}",
        ])

    # TOTAL row
    if len(results) > 1:
        rows_data.append([
            "TOTAL",
            f"{sum(r.total_area_acres for r in results):.3f}",
            f"{sum(len(r.placed_tables) for r in results):,}",
            f"{sum(r.total_modules for r in results):,}",
            f"{sum(r.total_capacity_mwp for r in results):.4f}",
            "", "",
            f"{sum(len(r.placed_icrs) for r in results)}",
            f"{sum(r.num_string_inverters for r in results)}",
            "",
            f"{sum(r.total_dc_cable_m for r in results):,.0f}",
            f"{sum(r.total_ac_cable_m for r in results):,.0f}",
            f"{sum(r.num_las for r in results)}",
        ])

    tbl = ax_tbl.table(
        cellText=rows_data,
        colLabels=col_headers,
        loc="center",
        cellLoc="center",
    )
    tbl.auto_set_font_size(False)
    tbl.set_fontsize(8)
    tbl.scale(1, 1.6)

    # Style header row
    for col in range(len(col_headers)):
        cell = tbl[0, col]
        cell.set_facecolor(HEADER_COLOUR)
        cell.set_text_props(color="white", fontweight="bold")

    # Style plant rows with colour
    for row_idx, r in enumerate(results):
        col_hex = PLANT_COLOURS[row_idx % len(PLANT_COLOURS)]
        tbl[row_idx + 1, 0].set_facecolor(col_hex)
        tbl[row_idx + 1, 0].set_text_props(color="white", fontweight="bold")

    # Style TOTAL row
    if len(results) > 1:
        total_row = len(results) + 1
        for col in range(len(col_headers)):
            cell = tbl[total_row, col]
            cell.set_facecolor("#333333")
            cell.set_text_props(color="white", fontweight="bold")

    # ---- Module & table parameters ------------------------------------------
    ax_params = fig.add_subplot(gs[2])
    ax_params.axis("off")
    ax_params.set_title("Design Parameters", fontsize=12, fontweight="bold",
                        loc="left", pad=6, color=HEADER_COLOUR)

    param_cols = [
        ["Parameter", "Value"],
        ["Module wattage",       f"{params.module.wattage:.0f} Wp"],
        ["Module size (L×W)",    f"{params.module.length} m × {params.module.width} m"],
        ["Orientation",          params.table.orientation.value.title()],
        ["Modules per row",      str(params.table.modules_in_row)],
        ["Rows per table",       str(params.table.rows_per_table)],
        ["Modules per table",    str(params.table.modules_per_table())],
        ["E-W gap between tables", f"{params.table_gap_ew:.2f} m"],
        ["Perimeter road width", f"{params.perimeter_road_width:.1f} m"],
        ["Row pitch",            "Auto (latitude)" if params.row_spacing is None
                                 else f"{params.row_spacing:.2f} m (user)"],
        ["Max strings / inverter", str(params.max_strings_per_inverter)],
    ]

    ptbl = ax_params.table(
        cellText=param_cols[1:],
        colLabels=param_cols[0],
        loc="center",
        cellLoc="left",
        colWidths=[0.35, 0.25],
    )
    ptbl.auto_set_font_size(False)
    ptbl.set_fontsize(9)
    ptbl.scale(1, 1.5)
    for col in range(2):
        ptbl[0, col].set_facecolor(HEADER_COLOUR)
        ptbl[0, col].set_text_props(color="white", fontweight="bold")
    for row in range(1, len(param_cols)):
        ptbl[row, 0].set_text_props(fontweight="bold")

    # ---- String inverter summary --------------------------------------------
    ax_inv = fig.add_subplot(gs[3])
    ax_inv.axis("off")
    ax_inv.set_title("String Inverter & Cable Summary", fontsize=12, fontweight="bold",
                     loc="left", pad=6, color=HEADER_COLOUR)

    inv_rows = []
    for r in results:
        inv_rows.append([
            r.boundary_name,
            f"{r.string_kwp:.3f} kWp",
            f"{r.num_string_inverters}",
            f"{r.inverter_capacity_kwp:.2f} kWp",
            f"{r.inverters_per_icr:.1f}",
            f"{r.total_dc_cable_m:,.0f} m",
            f"{r.total_ac_cable_m:,.0f} m",
        ])
    if len(results) > 1:
        inv_rows.append([
            "TOTAL", "",
            f"{sum(r.num_string_inverters for r in results)}",
            "", "",
            f"{sum(r.total_dc_cable_m for r in results):,.0f} m",
            f"{sum(r.total_ac_cable_m for r in results):,.0f} m",
        ])

    inv_hdrs = ["Plant", "String kWp", "No. Inverters",
                "Inv. Capacity", "Inv./ICR", "DC Cable", "AC Cable"]
    itbl = ax_inv.table(
        cellText=inv_rows,
        colLabels=inv_hdrs,
        loc="center",
        cellLoc="center",
    )
    itbl.auto_set_font_size(False)
    itbl.set_fontsize(9)
    itbl.scale(1, 1.5)
    for col in range(len(inv_hdrs)):
        itbl[0, col].set_facecolor(HEADER_COLOUR)
        itbl[0, col].set_text_props(color="white", fontweight="bold")
    for row_idx in range(len(results)):
        col_hex = PLANT_COLOURS[row_idx % len(PLANT_COLOURS)]
        itbl[row_idx + 1, 0].set_facecolor(col_hex)
        itbl[row_idx + 1, 0].set_text_props(color="white", fontweight="bold")
    if len(results) > 1:
        tr = len(results) + 1
        for col in range(len(inv_hdrs)):
            itbl[tr, col].set_facecolor("#333333")
            itbl[tr, col].set_text_props(color="white", fontweight="bold")

    if params.row_spacing is None:
        fig.text(0.05, 0.01,
                 "* Row pitch auto-calculated from site latitude (zero inter-row shading at winter solstice solar noon)",
                 fontsize=7, color="#555555")

    return fig


def _build_energy_figure(
    results: List[LayoutResult],
    energy_params: EnergyParameters,
) -> "Figure":
    """Build Page 3: Energy Yield Report."""
    from core.energy_calculator import calculate_pr

    fig = plt.figure(figsize=(16.54, 11.69))
    fig.patch.set_facecolor("white")

    gs = gridspec.GridSpec(
        4, 1,
        figure=fig,
        top=0.93, bottom=0.04,
        hspace=0.55,
        height_ratios=[0.07, 0.30, 0.20, 0.43],
    )

    # ---- Title bar --------------------------------------------------------
    ax_title = fig.add_subplot(gs[0])
    ax_title.set_facecolor(HEADER_COLOUR)
    ax_title.text(
        0.5, 0.5,
        f"PV Plant Layout — Energy Yield Report    |    {date.today().strftime('%d %B %Y')}",
        ha="center", va="center",
        fontsize=16, fontweight="bold", color="white",
        transform=ax_title.transAxes,
    )
    ax_title.axis("off")

    # ---- PR breakdown + input parameters (two side-by-side tables) --------
    gs_top = gridspec.GridSpecFromSubplotSpec(
        1, 2, subplot_spec=gs[1], wspace=0.08
    )

    # Left: energy input parameters
    ax_inp = fig.add_subplot(gs_top[0])
    ax_inp.axis("off")
    ax_inp.set_title("Irradiance & Degradation Inputs", fontsize=11,
                     fontweight="bold", loc="left", pad=6, color=HEADER_COLOUR)
    pr_val = calculate_pr(energy_params)
    src_map = {"pvgis": "PVGIS (EU JRC)", "nasa_power": "NASA POWER",
               "manual": "Manual entry", "unavailable": "Not available"}
    source_str = src_map.get(energy_params.irradiance_source, energy_params.irradiance_source)
    inp_data = [
        ["GHI (annual)",            f"{energy_params.ghi_kwh_m2_yr:.1f} kWh/m²/yr"],
        ["GTI (in-plane)",          f"{energy_params.gti_kwh_m2_yr:.1f} kWh/m²/yr"],
        ["Irradiance source",       source_str],
        ["Overall PR",              f"{pr_val*100:.2f} %"],
        ["1st year degradation",    f"{energy_params.first_year_degradation_pct:.1f} %"],
        ["Annual degradation",      f"{energy_params.annual_degradation_pct:.2f} %/yr"],
        ["Plant lifetime",          f"{energy_params.plant_lifetime_years} years"],
    ]
    inp_tbl = ax_inp.table(
        cellText=inp_data,
        colLabels=["Parameter", "Value"],
        loc="center", cellLoc="left",
        colWidths=[0.55, 0.35],
    )
    inp_tbl.auto_set_font_size(False)
    inp_tbl.set_fontsize(9)
    inp_tbl.scale(1, 1.5)
    for col in range(2):
        inp_tbl[0, col].set_facecolor(HEADER_COLOUR)
        inp_tbl[0, col].set_text_props(color="white", fontweight="bold")
    for row in range(1, len(inp_data) + 1):
        inp_tbl[row, 0].set_text_props(fontweight="bold")

    # Right: PR breakdown
    ax_pr = fig.add_subplot(gs_top[1])
    ax_pr.axis("off")
    ax_pr.set_title("Performance Ratio Breakdown", fontsize=11,
                    fontweight="bold", loc="left", pad=6, color=HEADER_COLOUR)
    pr_data = [
        ["Inverter efficiency",  f"{energy_params.inverter_efficiency_pct:.1f} %",
         f"{energy_params.inverter_efficiency_pct/100:.3f}"],
        ["DC cable losses",      f"{energy_params.dc_cable_loss_pct:.1f} %",
         f"{1-energy_params.dc_cable_loss_pct/100:.3f}"],
        ["AC cable losses",      f"{energy_params.ac_cable_loss_pct:.1f} %",
         f"{1-energy_params.ac_cable_loss_pct/100:.3f}"],
        ["Soiling losses",       f"{energy_params.soiling_loss_pct:.1f} %",
         f"{1-energy_params.soiling_loss_pct/100:.3f}"],
        ["Temperature losses",   f"{energy_params.temperature_loss_pct:.1f} %",
         f"{1-energy_params.temperature_loss_pct/100:.3f}"],
        ["Module mismatch",      f"{energy_params.mismatch_loss_pct:.1f} %",
         f"{1-energy_params.mismatch_loss_pct/100:.3f}"],
        ["Shading losses",       f"{energy_params.shading_loss_pct:.1f} %",
         f"{1-energy_params.shading_loss_pct/100:.3f}"],
        ["Availability",         f"{energy_params.availability_pct:.1f} %",
         f"{energy_params.availability_pct/100:.3f}"],
        ["Transformer losses",   f"{energy_params.transformer_loss_pct:.1f} %",
         f"{1-energy_params.transformer_loss_pct/100:.3f}"],
        ["Other losses",         f"{energy_params.other_loss_pct:.1f} %",
         f"{1-energy_params.other_loss_pct/100:.3f}"],
        ["OVERALL PR",           "—",  f"{pr_val:.3f}"],
    ]
    pr_tbl = ax_pr.table(
        cellText=pr_data,
        colLabels=["Loss Component", "Input (%)", "Factor"],
        loc="center", cellLoc="center",
        colWidths=[0.42, 0.22, 0.18],
    )
    pr_tbl.auto_set_font_size(False)
    pr_tbl.set_fontsize(9)
    pr_tbl.scale(1, 1.37)
    for col in range(3):
        pr_tbl[0, col].set_facecolor(HEADER_COLOUR)
        pr_tbl[0, col].set_text_props(color="white", fontweight="bold")
    for row in range(1, len(pr_data)):
        pr_tbl[row, 0].set_text_props(fontweight="bold")
    # Highlight OVERALL PR row
    for col in range(3):
        pr_tbl[len(pr_data), col].set_facecolor("#1a3a5c")
        pr_tbl[len(pr_data), col].set_text_props(color="white", fontweight="bold")

    # ---- Per-plant energy summary -----------------------------------------
    ax_es = fig.add_subplot(gs[2])
    ax_es.axis("off")
    ax_es.set_title("Per-Plant Energy Summary", fontsize=11, fontweight="bold",
                    loc="left", pad=6, color=HEADER_COLOUR)

    es_hdrs = ["Plant", "Capacity\n(MWp)", "GTI\n(kWh/m²/yr)",
               "Specific Yield\n(kWh/kWp/yr)", "Year 1 Energy\n(MWh)",
               "CUF\n(%)", f"{energy_params.plant_lifetime_years}-yr Energy\n(MWh)"]
    es_data = []
    for r in results:
        er = r.energy_result
        if er:
            es_data.append([
                r.boundary_name,
                f"{r.total_capacity_mwp:.4f}",
                f"{er.gti_kwh_m2_yr:.1f}",
                f"{er.specific_yield_kwh_kwp_yr:.1f}",
                f"{er.year1_energy_mwh:,.1f}",
                f"{er.cuf_pct:.2f}",
                f"{er.lifetime_energy_mwh:,.1f}",
            ])
        else:
            es_data.append([r.boundary_name, f"{r.total_capacity_mwp:.4f}",
                             "—", "—", "—", "—", "—"])

    if len(results) > 1:
        total_kwp  = sum(r.total_capacity_kwp for r in results)
        total_mwp  = sum(r.total_capacity_mwp for r in results)
        total_yr1  = sum(r.energy_result.year1_energy_mwh  for r in results if r.energy_result)
        total_life = sum(r.energy_result.lifetime_energy_mwh for r in results if r.energy_result)
        avg_sy     = (sum(r.energy_result.specific_yield_kwh_kwp_yr
                          for r in results if r.energy_result)
                      / max(1, sum(1 for r in results if r.energy_result)))
        avg_cuf    = total_yr1 / (total_kwp * 8760 / 1000) * 100 if total_kwp > 0 else 0
        es_data.append([
            "TOTAL / AVG",
            f"{total_mwp:.4f}",
            "—",
            f"{avg_sy:.1f}",
            f"{total_yr1:,.1f}",
            f"{avg_cuf:.2f}",
            f"{total_life:,.1f}",
        ])

    es_tbl = ax_es.table(
        cellText=es_data,
        colLabels=es_hdrs,
        loc="center", cellLoc="center",
    )
    es_tbl.auto_set_font_size(False)
    es_tbl.set_fontsize(9)
    es_tbl.scale(1, 1.6)
    for col in range(len(es_hdrs)):
        es_tbl[0, col].set_facecolor(HEADER_COLOUR)
        es_tbl[0, col].set_text_props(color="white", fontweight="bold")
    for row_idx, r in enumerate(results):
        col_hex = PLANT_COLOURS[row_idx % len(PLANT_COLOURS)]
        es_tbl[row_idx + 1, 0].set_facecolor(col_hex)
        es_tbl[row_idx + 1, 0].set_text_props(color="white", fontweight="bold")
    if len(results) > 1:
        tr = len(results) + 1
        for col in range(len(es_hdrs)):
            es_tbl[tr, col].set_facecolor("#333333")
            es_tbl[tr, col].set_text_props(color="white", fontweight="bold")

    # ---- 25-year generation table -----------------------------------------
    ax_25 = fig.add_subplot(gs[3])
    ax_25.axis("off")
    ax_25.set_title(
        f"{energy_params.plant_lifetime_years}-Year Generation Forecast  "
        f"(Total Plant — all boundaries combined)",
        fontsize=11, fontweight="bold", loc="left", pad=6, color=HEADER_COLOUR
    )

    # Build aggregate yearly data (sum across all boundaries)
    max_years = energy_params.plant_lifetime_years
    yearly_total: list = [0.0] * max_years
    for r in results:
        if r.energy_result and r.energy_result.yearly_energy_mwh:
            for y, e in enumerate(r.energy_result.yearly_energy_mwh[:max_years]):
                yearly_total[y] += e

    table_25_data = []
    cumulative = 0.0
    for yr_idx, e_mwh in enumerate(yearly_total):
        yr = yr_idx + 1
        cumulative += e_mwh
        yr1_val = yearly_total[0] if yearly_total else 1.0
        deg_pct = (1 - e_mwh / yr1_val) * 100 if yr1_val > 0 else 0.0
        table_25_data.append([
            str(yr),
            f"{e_mwh:,.1f}",
            f"{cumulative/1000:,.2f}",
            f"{deg_pct:.1f}",
        ])

    # Split into two halves side by side to save vertical space
    half = math.ceil(len(table_25_data) / 2)
    left_data  = table_25_data[:half]
    right_data = table_25_data[half:]
    # Pad right half if needed
    while len(right_data) < len(left_data):
        right_data.append(["", "", "", ""])

    combined = [l + r for l, r in zip(left_data, right_data)]
    combined_hdrs = [
        "Year", "Energy\n(MWh)", "Cumul.\n(GWh)", "Deg.\n(%)",
        "Year", "Energy\n(MWh)", "Cumul.\n(GWh)", "Deg.\n(%)",
    ]

    t25 = ax_25.table(
        cellText=combined,
        colLabels=combined_hdrs,
        loc="center", cellLoc="center",
    )
    t25.auto_set_font_size(False)
    t25.set_fontsize(8)
    t25.scale(1, 1.18)
    for col in range(8):
        t25[0, col].set_facecolor(HEADER_COLOUR)
        t25[0, col].set_text_props(color="white", fontweight="bold")
    # Shade alternating rows lightly
    for row in range(1, len(combined) + 1):
        bg = "#f0f4f8" if row % 2 == 0 else "white"
        for col in range(8):
            t25[row, col].set_facecolor(bg)

    return fig
