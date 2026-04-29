"""
PDF exporter: saves the plant layout as a multi-page PDF.

Page 1  — Layout plot  (the live matplotlib Figure passed in)
Page 2  — Summary report (tables + key statistics per boundary)
Page 3  — Energy yield: PR breakdown, inputs, per-plant summary
Page 4  — (only when monthly data available)
          Monthly IEC 61724-1 breakdown + 25-year generation table
Page 3* — (no monthly) Energy inputs + 25-year table on a single page

Title rule
----------
All section titles are drawn INSIDE their axes using ax.text() at va="top".
Every table uses bbox=[0, 0, 1, TABLE_BODY] so the top fraction is reserved for
the title.  This prevents ax.set_title() text from bleeding into adjacent subplots.
"""
import math
from datetime import date
from typing import List

import matplotlib
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.figure import Figure

from pvlayout_core.models.project import LayoutResult, LayoutParameters, EnergyParameters, DesignMode
from pvlayout_core.core.edition import Edition, has_cables, has_energy as _ed_has_energy, has_ac_dc_ratio


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PLANT_COLOURS = ["#1a6faf", "#d94f00", "#2ca02c", "#9467bd",
                 "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22"]
HEADER_COLOUR  = "#1a3a5c"
PAGE_W, PAGE_H = 16.54, 11.69   # A3 landscape, inches

# Fraction of axes height reserved for the in-axes section title.
# The table bbox = [0, 0, 1, 1 - TITLE_FRAC]
TITLE_FRAC = 0.13


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _section_title(ax, text: str, fontsize: int = 11) -> None:
    """Draw a bold section header at the very top of *ax* (inside the axes)."""
    ax.text(
        0.0, 0.99, text,
        transform=ax.transAxes,
        fontsize=fontsize, fontweight="bold", color=HEADER_COLOUR,
        va="top", ha="left",
    )


def _table_bbox(title_frac: float = TITLE_FRAC):
    """Return [left, bottom, width, height] in axes coords for a table."""
    return [0.0, 0.0, 1.0, 1.0 - title_frac]


def _style_header_row(tbl, ncols: int, colour: str = HEADER_COLOUR) -> None:
    for col in range(ncols):
        tbl[0, col].set_facecolor(colour)
        tbl[0, col].set_text_props(color="white", fontweight="bold")


def _style_total_row(tbl, row_idx: int, ncols: int,
                     colour: str = "#333333") -> None:
    for col in range(ncols):
        tbl[row_idx, col].set_facecolor(colour)
        tbl[row_idx, col].set_text_props(color="white", fontweight="bold")


def _title_bar(ax, text: str) -> None:
    """Fill *ax* with HEADER_COLOUR and draw centred white title text."""
    ax.set_facecolor(HEADER_COLOUR)
    ax.text(
        0.5, 0.5, text,
        ha="center", va="center",
        fontsize=15, fontweight="bold", color="white",
        transform=ax.transAxes,
    )
    ax.axis("off")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def export_pdf(
    results: List[LayoutResult],
    params: LayoutParameters,
    output_path: str,
    layout_figure: Figure = None,
    energy_params: EnergyParameters = None,
    edition: Edition = Edition.PRO_PLUS,
) -> None:
    """
    Write a PDF with 2–4 pages (edition-dependent):
      Page 1 – layout plot
      Page 2 – summary report (content varies by edition)
      Page 3 – energy yield (Pro Plus only)
      Page 4 – monthly IEC table + 25-yr forecast (Pro Plus only, when monthly data)
    """
    if isinstance(results, LayoutResult):
        results = [results]

    # Strip water bodies, obstacles and failed/empty results so they never
    # appear in any PDF summary or energy table — only real plant results shown.
    results = [
        r for r in results
        if not getattr(r, "is_water", False)
        and getattr(r, "utm_epsg", 0)
        and r.placed_tables   # must have at least one placed table
    ]

    with PdfPages(output_path) as pdf:

        # ---- Page 1: Layout plot ----------------------------------------
        if layout_figure is not None:
            orig_size = layout_figure.get_size_inches()
            layout_figure.set_size_inches(PAGE_W, PAGE_H)

            # Re-scale all text annotations proportionally for A3 PDF.
            #
            # The screen figure is small (matplotlib default ≈ 6.4 × 4.8 in);
            # for PDF it is enlarged to A3 (16.54 × 11.69 in).  Font sizes are
            # in absolute points and do NOT scale with the figure resize.
            #
            # Strategy: compute a scale factor = (A3 m-per-in) / (screen m-per-in)
            # and multiply every existing font size by that factor, then clamp.
            # This preserves relative sizes between plant-name labels (larger)
            # and ICR / LA labels (smaller), while keeping all text proportional
            # to the physical plant extent.
            _ax = layout_figure.axes[0] if layout_figure.axes else None
            _saved_fs: list = []
            if _ax is not None:
                try:
                    _x0, _x1 = _ax.get_xlim()
                    _y0, _y1 = _ax.get_ylim()
                    _xr = max(abs(_x1 - _x0), 1.0)
                    _yr = max(abs(_y1 - _y0), 1.0)
                    # A3 effective axes ≈ 13.5" × 9.5" → m-per-in at PDF scale
                    _A3_W_IN, _A3_H_IN = 13.5, 9.5
                    _m_per_in_pdf = max(_xr / _A3_W_IN, _yr / _A3_H_IN)
                    # Screen figure ≈ 12.8" × 8.4" (typical Qt canvas size)
                    _SCR_W_IN, _SCR_H_IN = 12.8, 8.4
                    _m_per_in_scr = max(_xr / _SCR_W_IN, _yr / _SCR_H_IN)
                    # Ratio: if PDF m-per-in > screen m-per-in, fonts must shrink.
                    # font_pdf = font_screen × (screen_m_per_in / pdf_m_per_in)
                    _scale = _m_per_in_scr / max(_m_per_in_pdf, 0.01)
                    for _txt in _ax.texts:
                        _orig = _txt.get_fontsize()
                        _saved_fs.append(_orig)
                        # Scale and clamp to [2.5, 14] pt
                        _txt.set_fontsize(max(2.5, min(14.0, _orig * _scale)))
                except Exception:
                    pass   # leave fonts unchanged if geometry is unavailable

            pdf.savefig(layout_figure, bbox_inches="tight", dpi=150)

            # Restore original font sizes so the screen canvas is unchanged
            if _ax is not None and _saved_fs:
                for _txt, _fs in zip(_ax.texts, _saved_fs):
                    try:
                        _txt.set_fontsize(_fs)
                    except Exception:
                        pass

            layout_figure.set_size_inches(*orig_size)
        else:
            fig_blank, ax = plt.subplots(figsize=(PAGE_W, PAGE_H))
            ax.text(0.5, 0.5,
                    "Layout plot not available.\nGenerate the layout first.",
                    ha="center", va="center", fontsize=16,
                    transform=ax.transAxes)
            ax.axis("off")
            pdf.savefig(fig_blank, bbox_inches="tight")
            plt.close(fig_blank)

        # ---- Page 2: Summary report -------------------------------------
        fig2 = _build_summary_figure(results, params, edition=edition)
        pdf.savefig(fig2, bbox_inches="tight")
        plt.close(fig2)

        # ---- Pages 3 (+ 4): Energy yield (Pro Plus only) ----------------
        has_energy = any(r.energy_result for r in results)
        if _ed_has_energy(edition) and has_energy and energy_params is not None:
            _er0 = next((r.energy_result for r in results if r.energy_result), None)
            has_monthly = _er0 is not None and len(_er0.monthly_energy_mwh) == 12

            if has_monthly:
                # Two pages for energy
                fig3a = _build_energy_page_inputs(results, params, energy_params)
                fig3b = _build_energy_page_monthly(results, energy_params)
                for fig_e in (fig3a, fig3b):
                    pdf.savefig(fig_e, bbox_inches="tight")
                    plt.close(fig_e)
            else:
                # Single energy page
                fig3 = _build_energy_page_single(results, params, energy_params)
                pdf.savefig(fig3, bbox_inches="tight")
                plt.close(fig3)

        # ---- PDF metadata -----------------------------------------------
        d = pdf.infodict()
        d["Title"]   = "PV Plant Layout Report"
        d["Subject"] = "Automated PV layout summary"
        d["Creator"] = "PVlayout_Advance"


# ---------------------------------------------------------------------------
# Page 2: Summary
# ---------------------------------------------------------------------------

def _build_summary_figure(
    results: List[LayoutResult],
    params: LayoutParameters,
    edition: Edition = Edition.PRO_PLUS,
) -> Figure:
    """A3 landscape — layout summary tables (edition-aware)."""

    fig = plt.figure(figsize=(PAGE_W, PAGE_H))
    fig.patch.set_facecolor("white")

    gs = gridspec.GridSpec(
        4, 1, figure=fig,
        top=0.94, bottom=0.04,
        hspace=0.65,
        height_ratios=[0.07, 0.42, 0.25, 0.26],
    )

    # ---- Title bar --------------------------------------------------------
    from pvlayout_core.core.edition import edition_name as _ed_name
    _title_bar(
        fig.add_subplot(gs[0]),
        f"PV Plant Layout [{_ed_name(edition)}] — Summary Report    |    "
        f"{date.today().strftime('%d %B %Y')}",
    )

    # ---- Layout Summary table --------------------------------------------
    ax_tbl = fig.add_subplot(gs[1])
    ax_tbl.axis("off")
    _section_title(ax_tbl, "Layout Summary", fontsize=12)

    pitch_note = " *" if params.row_spacing is None else ""
    tilt_note  = " *" if params.tilt_angle is None else ""

    _is_ci      = (params.design_mode == DesignMode.CENTRAL_INVERTER)
    _show_cable = has_cables(edition)
    _show_ratio = has_ac_dc_ratio(edition)

    # Build column header list for this edition
    col_headers = ["Plant", "Area\n(acres)", "MMS-\nTables", "Modules",
                   "Cap.\n(MWp)", "Tilt\n(°)", "Pitch\n(m)", "ICR"]
    if _is_ci:
        col_headers += ["SMBs", "SMB\n(kWp)", "C.Inv.", "C.Inv\n(kWp)"]
    else:
        col_headers += ["Str.\nInv.", "Inv.\n(kWp)"]
    if _show_ratio:
        col_headers += ["Plant AC\n(MW)", "DC/AC\nRatio"]
    if _show_cable:
        if _is_ci:
            col_headers += ["Str.DC\nCable (m)", "DC Cable\n(SMB→CInv)\n(m)"]
        else:
            col_headers += ["Str.DC\nCable (m)", "AC Cable\n(Inv→ICR)\n(m)"]
    col_headers.append("LA")

    def _row_vals(r):
        v = [
            r.boundary_name,
            f"{r.total_area_acres:.3f}",
            f"{len(r.placed_tables)}",
            f"{r.total_modules:,}",
            f"{r.total_capacity_mwp:.4f}",
            f"{r.tilt_angle_deg:.1f}{tilt_note}",
            f"{r.row_pitch_m:.2f}{pitch_note}",
            f"{len(r.placed_icrs)}",
        ]
        if _is_ci:
            v += [
                f"{r.num_string_inverters}",
                f"{r.inverter_capacity_kwp:.2f}",
                f"{r.num_central_inverters}",
                f"{r.central_inverter_capacity_kwp:.2f}" if r.central_inverter_capacity_kwp > 0 else "—",
            ]
        else:
            v += [f"{r.num_string_inverters}", f"{r.inverter_capacity_kwp:.2f}"]
        if _show_ratio:
            v += [
                f"{r.plant_ac_capacity_mw:.4f}" if r.plant_ac_capacity_mw > 0 else "—",
                f"{r.dc_ac_ratio:.3f}" if r.dc_ac_ratio > 0 else "—",
            ]
        if _show_cable:
            v += [f"{r.total_dc_cable_m:,.0f}", f"{r.total_ac_cable_m:,.0f}"]
        v.append(f"{r.num_las}")
        return v

    rows_data = [_row_vals(r) for r in results]

    if len(results) > 1:
        _tot_ac = sum(r.plant_ac_capacity_mw for r in results)
        _tot_dc = sum(r.total_capacity_mwp for r in results)
        tot = [
            "TOTAL",
            f"{sum(r.total_area_acres for r in results):.3f}",
            f"{sum(len(r.placed_tables) for r in results):,}",
            f"{sum(r.total_modules for r in results):,}",
            f"{_tot_dc:.4f}",
            "", "",
            f"{sum(len(r.placed_icrs) for r in results)}",
        ]
        if _is_ci:
            tot += [
                f"{sum(r.num_string_inverters for r in results)}",
                "",
                f"{sum(r.num_central_inverters for r in results)}",
                "",
            ]
        else:
            tot += [f"{sum(r.num_string_inverters for r in results)}", ""]
        if _show_ratio:
            tot += [
                f"{_tot_ac:.4f}" if _tot_ac > 0 else "—",
                f"{_tot_dc / _tot_ac:.3f}" if _tot_ac > 0 else "—",
            ]
        if _show_cable:
            tot += [
                f"{sum(r.total_dc_cable_m for r in results):,.0f}",
                f"{sum(r.total_ac_cable_m for r in results):,.0f}",
            ]
        tot.append(f"{sum(r.num_las for r in results)}")
        rows_data.append(tot)

    tbl = ax_tbl.table(
        cellText=rows_data,
        colLabels=col_headers,
        loc="center", cellLoc="center",
        bbox=_table_bbox(),
    )
    tbl.auto_set_font_size(False)
    tbl.set_fontsize(8)
    _style_header_row(tbl, len(col_headers))
    for row_idx, r in enumerate(results):
        col_hex = PLANT_COLOURS[row_idx % len(PLANT_COLOURS)]
        tbl[row_idx + 1, 0].set_facecolor(col_hex)
        tbl[row_idx + 1, 0].set_text_props(color="white", fontweight="bold")
    if len(results) > 1:
        _style_total_row(tbl, len(results) + 1, len(col_headers))

    # ---- Design Parameters -----------------------------------------------
    ax_params = fig.add_subplot(gs[2])
    ax_params.axis("off")
    _section_title(ax_params, "Design Parameters", fontsize=12)

    param_data = [
        ["Module wattage",           f"{params.module.wattage:.0f} Wp"],
        ["Module size (L×W)",        f"{params.module.length} m × {params.module.width} m"],
        ["Orientation",              params.table.orientation.value.title()],
        ["Modules per row",          str(params.table.modules_in_row)],
        ["Rows per table",           str(params.table.rows_per_table)],
        ["Modules per table",        str(params.table.modules_per_table())],
        ["E-W gap between tables",   f"{params.table_gap_ew:.2f} m"],
        ["Perimeter road width",     f"{params.perimeter_road_width:.1f} m"],
        ["Row pitch",                "Auto (latitude)" if params.row_spacing is None
                                     else f"{params.row_spacing:.2f} m (user)"],
        ["Max strings / inverter",   str(params.max_strings_per_inverter)],
    ]
    ptbl = ax_params.table(
        cellText=param_data,
        colLabels=["Parameter", "Value"],
        loc="center", cellLoc="left",
        colWidths=[0.35, 0.25],
        bbox=_table_bbox(),
    )
    ptbl.auto_set_font_size(False)
    ptbl.set_fontsize(9)
    _style_header_row(ptbl, 2)
    for row in range(1, len(param_data) + 1):
        ptbl[row, 0].set_text_props(fontweight="bold")

    # ---- Inverter / SMB & Cable Summary (edition-aware) -----------------
    ax_inv = fig.add_subplot(gs[3])
    ax_inv.axis("off")
    _is_ci_inv  = (params.design_mode == DesignMode.CENTRAL_INVERTER)
    _show_cab   = has_cables(edition)
    _show_rat   = has_ac_dc_ratio(edition)

    if _is_ci_inv:
        _inv_sec_title = "SMB & Central Inverter Summary"
    elif _show_cab:
        _inv_sec_title = "String Inverter & Cable Summary"
    else:
        _inv_sec_title = "String Inverter Summary"
    _section_title(ax_inv, _inv_sec_title, fontsize=12)

    def _inv_row(r):
        v = [r.boundary_name, f"{r.string_kwp:.3f} kWp"]
        if _is_ci_inv:
            v += [
                f"{r.num_string_inverters}",
                f"{r.inverter_capacity_kwp:.2f} kWp",
                f"{r.num_central_inverters}",
                f"{r.central_inverter_capacity_kwp:.2f} kWp" if r.central_inverter_capacity_kwp > 0 else "—",
            ]
        else:
            v += [
                f"{r.num_string_inverters}",
                f"{r.inverter_capacity_kwp:.2f} kWp",
                f"{r.inverters_per_icr:.1f}",
            ]
        if _show_rat:
            v += [
                f"{r.plant_ac_capacity_mw:.4f} MW" if r.plant_ac_capacity_mw > 0 else "—",
                f"{r.dc_ac_ratio:.3f}" if r.dc_ac_ratio > 0 else "—",
            ]
        if _show_cab:
            v += [f"{r.total_dc_cable_m:,.0f} m", f"{r.total_ac_cable_m:,.0f} m"]
        return v

    inv_rows = [_inv_row(r) for r in results]

    if len(results) > 1:
        _tot_ac2 = sum(r.plant_ac_capacity_mw for r in results)
        _tot_dc2 = sum(r.total_capacity_mwp for r in results)
        tot2 = ["TOTAL", ""]
        if _is_ci_inv:
            tot2 += [
                f"{sum(r.num_string_inverters for r in results)}",
                "",
                f"{sum(r.num_central_inverters for r in results)}",
                "",
            ]
        else:
            tot2 += [f"{sum(r.num_string_inverters for r in results)}", "", ""]
        if _show_rat:
            tot2 += [
                f"{_tot_ac2:.4f} MW" if _tot_ac2 > 0 else "—",
                f"{_tot_dc2 / _tot_ac2:.3f}" if _tot_ac2 > 0 else "—",
            ]
        if _show_cab:
            tot2 += [
                f"{sum(r.total_dc_cable_m for r in results):,.0f} m",
                f"{sum(r.total_ac_cable_m for r in results):,.0f} m",
            ]
        inv_rows.append(tot2)

    # Build headers to match data columns
    if _is_ci_inv:
        inv_hdrs = ["Plant", "String\nkWp", "No.\nSMBs",
                    "SMB\nCapacity", "No.\nC.Inv.", "C.Inv\nCapacity"]
    else:
        inv_hdrs = ["Plant", "String\nkWp", "No. String\nInverters",
                    "Inv.\nCapacity", "Inv./\nICR"]
    if _show_rat:
        inv_hdrs += ["Plant AC\nCapacity", "DC/AC\nRatio"]
    if _show_cab:
        if _is_ci_inv:
            inv_hdrs += ["Str.DC\nCable (m)", "DC Cable\n(SMB→CInv) (m)"]
        else:
            inv_hdrs += ["String DC\nCable (m)", "AC Cable\n(Inv→ICR) (m)"]

    itbl = ax_inv.table(
        cellText=inv_rows,
        colLabels=inv_hdrs,
        loc="center", cellLoc="center",
        bbox=_table_bbox(),
    )
    itbl.auto_set_font_size(False)
    itbl.set_fontsize(9)
    _style_header_row(itbl, len(inv_hdrs))
    for row_idx in range(len(results)):
        col_hex = PLANT_COLOURS[row_idx % len(PLANT_COLOURS)]
        itbl[row_idx + 1, 0].set_facecolor(col_hex)
        itbl[row_idx + 1, 0].set_text_props(color="white", fontweight="bold")
    if len(results) > 1:
        _style_total_row(itbl, len(results) + 1, len(inv_hdrs))

    # ---- Footnotes -------------------------------------------------------
    footnotes = []
    if params.tilt_angle is None:
        footnotes.append("* Tilt auto-calculated from site latitude")
    if params.row_spacing is None:
        footnotes.append(
            "* Row pitch auto-calculated from site latitude "
            "(zero inter-row shading at winter solstice solar noon)"
        )
    if footnotes:
        fig.text(0.05, 0.01, "   |   ".join(footnotes),
                 fontsize=7, color="#555555")

    return fig


# ---------------------------------------------------------------------------
# Shared helper: PR breakdown + input tables (used on energy pages)
# ---------------------------------------------------------------------------

def _build_pr_and_inputs(gs_sub, fig, energy_params: EnergyParameters,
                         params: LayoutParameters,
                         results: List[LayoutResult]) -> None:
    """
    Fill a 1×2 GridSpecFromSubplotSpec with:
      Left  — Irradiance & Degradation inputs table
      Right — Performance Ratio breakdown table
    Both get in-axes titles via _section_title().
    """
    from pvlayout_core.core.energy_calculator import calculate_pr
    pr_val = calculate_pr(energy_params)

    src_map = {
        "pvgis":       "PVGIS (EU JRC)",
        "nasa_power":  "NASA POWER",
        "manual":      "Manual entry",
        "unavailable": "Not available",
    }
    source_str = src_map.get(
        energy_params.irradiance_source, energy_params.irradiance_source
    )

    # ---- Left: input parameters ----------------------------------------
    ax_inp = fig.add_subplot(gs_sub[0])
    ax_inp.axis("off")
    _section_title(ax_inp, "Irradiance & Degradation Inputs", fontsize=10)

    module_row   = [["Module (PAN file)", energy_params.module_name or "—"]]
    _is_ci_inp = (params.design_mode == DesignMode.CENTRAL_INVERTER)
    pnom_str = (f"{energy_params.inverter_pnom_kw:.1f} kW / inverter"
                if energy_params.inverter_pnom_kw > 0 else "—")
    _inv_lbl   = "Central Inverter (OND file)" if _is_ci_inp else "String Inverter (OND file)"
    _pnom_lbl  = "Central Inverter Pnom"       if _is_ci_inp else "String Inverter Pnom"
    inverter_row = [
        [_inv_lbl,  energy_params.inverter_name or "—"],
        [_pnom_lbl, pnom_str],
    ]
    has_file_temp = len(energy_params.hourly_temp_c) >= 365
    temp_src_note = " (from file)" if has_file_temp else " (annual avg)"
    pan_rows = (
        [
            ["μ_Pmpp (power temp. coeff.)",
             f"{energy_params.mu_pmpp_pct_per_c:+.3f} %/°C"],
            ["NOCT",                f"{energy_params.noct_c:.1f} °C"],
            ["Avg. ambient temp.",
             f"{energy_params.ambient_temp_avg_c:.1f} °C{temp_src_note}"],
        ]
        if energy_params.mu_pmpp_pct_per_c != 0.0
        else [[
            "Avg. ambient temp.",
            f"{energy_params.ambient_temp_avg_c:.1f} °C{temp_src_note}",
        ]]
    )

    monthly_t_row = [[
        "Monthly T source",
        "Hourly file (actual)" if has_file_temp else "Sinusoidal seasonal model",
    ]]

    # Bifacial rows (shown only when bifacial module is selected)
    if energy_params.is_bifacial:
        er0 = results[0].energy_result
        gain_pct = er0.bifacial_gain_pct if (er0 and er0.bifacial_gain_pct > 0) else 0.0
        bifacial_rows = [
            ["Module type",          "Bifacial"],
            ["Bifaciality factor φ", f"{energy_params.bifaciality_factor:.2f}"],
            ["Ground albedo ρ",      f"{energy_params.ground_albedo:.2f}"],
            ["Bifacial energy gain", f"+{gain_pct:.1f} %"],
        ]
    else:
        bifacial_rows = [["Module type", "Monofacial"]]

    # PVGIS correction factor row
    pvgis_corr_row = (
        [["PVGIS correction factor", "× 1.05  (applied to energy yield)"]]
        if energy_params.weather_source == "pvgis_api"
        else [["PVGIS correction factor", "—  (hourly file used)"]]
    )

    inp_data = (
        module_row + inverter_row + pan_rows + monthly_t_row
        + bifacial_rows
        + [
            ["GHI (annual)",         f"{energy_params.ghi_kwh_m2_yr:.1f} kWh/m²/yr"],
            ["GTI (in-plane)",       f"{energy_params.gti_kwh_m2_yr:.1f} kWh/m²/yr"],
            ["Irradiance source",    source_str],
        ]
        + pvgis_corr_row
        + [
            ["Overall PR",           f"{pr_val * 100:.2f} %"],
            ["1st year degradation", f"{energy_params.first_year_degradation_pct:.1f} %"],
            ["Annual degradation",   f"{energy_params.annual_degradation_pct:.2f} %/yr"],
            ["Plant lifetime",       f"{energy_params.plant_lifetime_years} years"],
        ]
    )
    inp_tbl = ax_inp.table(
        cellText=inp_data,
        colLabels=["Parameter", "Value"],
        loc="center", cellLoc="left",
        colWidths=[0.55, 0.35],
        bbox=_table_bbox(),
    )
    inp_tbl.auto_set_font_size(False)
    inp_tbl.set_fontsize(9)
    _style_header_row(inp_tbl, 2)
    for row in range(1, len(inp_data) + 1):
        inp_tbl[row, 0].set_text_props(fontweight="bold")

    # ---- Right: PR breakdown -------------------------------------------
    ax_pr = fig.add_subplot(gs_sub[1])
    ax_pr.axis("off")
    _section_title(ax_pr, "Performance Ratio Breakdown  (IEC 61724)", fontsize=10)

    _is_ci_pr = (params.design_mode == DesignMode.CENTRAL_INVERTER)
    pr_data = [
        ["Central Inverter efficiency" if _is_ci_pr else "String Inverter efficiency",
         f"{energy_params.inverter_efficiency_pct:.1f} %",
         f"{energy_params.inverter_efficiency_pct / 100:.3f}"],
        ["String DC cable losses\n(MMS → SMB)" if _is_ci_pr
         else "String DC cable losses\n(MMS → Str. Inverter)",
         f"{energy_params.dc_cable_loss_pct:.1f} %",
         f"{1 - energy_params.dc_cable_loss_pct / 100:.3f}"],
        ["DC cable losses\n(SMB → Central Inv.)" if _is_ci_pr
         else "AC cable losses\n(Str. Inverter → ICR)",
         f"{energy_params.ac_cable_loss_pct:.1f} %",
         f"{1 - energy_params.ac_cable_loss_pct / 100:.3f}"],
        ["Soiling losses",
         f"{energy_params.soiling_loss_pct:.1f} %",
         f"{1 - energy_params.soiling_loss_pct / 100:.3f}"],
        ["Temperature losses",
         f"{energy_params.temperature_loss_pct:.1f} %",
         f"{1 - energy_params.temperature_loss_pct / 100:.3f}"],
        ["Module mismatch",
         f"{energy_params.mismatch_loss_pct:.1f} %",
         f"{1 - energy_params.mismatch_loss_pct / 100:.3f}"],
        ["Shading losses",
         f"{energy_params.shading_loss_pct:.1f} %",
         f"{1 - energy_params.shading_loss_pct / 100:.3f}"],
        ["Availability",
         f"{energy_params.availability_pct:.1f} %",
         f"{energy_params.availability_pct / 100:.3f}"],
        ["Transformer losses",
         f"{energy_params.transformer_loss_pct:.1f} %",
         f"{1 - energy_params.transformer_loss_pct / 100:.3f}"],
        ["Other losses",
         f"{energy_params.other_loss_pct:.1f} %",
         f"{1 - energy_params.other_loss_pct / 100:.3f}"],
        ["OVERALL PR", "—", f"{pr_val:.3f}"],
    ]
    pr_tbl = ax_pr.table(
        cellText=pr_data,
        colLabels=["Loss Component", "Input (%)", "Factor"],
        loc="center", cellLoc="center",
        colWidths=[0.42, 0.22, 0.18],
        bbox=_table_bbox(),
    )
    pr_tbl.auto_set_font_size(False)
    pr_tbl.set_fontsize(9)
    _style_header_row(pr_tbl, 3)
    for row in range(1, len(pr_data)):
        pr_tbl[row, 0].set_text_props(fontweight="bold")
    # Highlight OVERALL PR row
    _style_total_row(pr_tbl, len(pr_data), 3, colour=HEADER_COLOUR)


def _build_per_plant_table(ax, results, energy_params: EnergyParameters) -> None:
    """Draw the per-plant energy summary table into *ax*."""
    ax.axis("off")
    _section_title(ax, "Per-Plant Energy Summary", fontsize=11)

    _er0 = next((r.energy_result for r in results if r.energy_result), None)
    lp1 = _er0.p1_label if _er0 else "P50"
    lp2 = _er0.p2_label if _er0 else "P75"
    lp3 = _er0.p3_label if _er0 else "P90"

    es_hdrs = [
        "Plant", "Cap.\n(MWp)", "GTI\n(kWh/m²/yr)",
        "Specific Yield\n(kWh/kWp/yr)", "CUF\n(%)",
        f"{lp1} Yr1\n(MWh)", f"{lp2} Yr1\n(MWh)", f"{lp3} Yr1\n(MWh)",
        f"{lp1} {energy_params.plant_lifetime_years}yr\n(MWh)",
    ]
    es_data = []
    for r in results:
        er = r.energy_result
        if er:
            es_data.append([
                r.boundary_name,
                f"{r.total_capacity_mwp:.4f}",
                f"{er.gti_kwh_m2_yr:.1f}",
                f"{er.specific_yield_kwh_kwp_yr:.1f}",
                f"{er.cuf_pct:.2f}",
                f"{er.p1_year1_mwh:,.1f}",
                f"{er.p2_year1_mwh:,.1f}",
                f"{er.p3_year1_mwh:,.1f}",
                f"{er.p1_lifetime_mwh:,.1f}",
            ])
        else:
            es_data.append([r.boundary_name, f"{r.total_capacity_mwp:.4f}",
                             "—", "—", "—", "—", "—", "—", "—"])

    if len(results) > 1:
        total_kwp = sum(r.total_capacity_kwp for r in results)
        total_mwp = sum(r.total_capacity_mwp for r in results)
        avg_sy    = (sum(r.energy_result.specific_yield_kwh_kwp_yr
                         for r in results if r.energy_result)
                     / max(1, sum(1 for r in results if r.energy_result)))
        tp1yr1  = sum(r.energy_result.p1_year1_mwh  for r in results if r.energy_result)
        tp2yr1  = sum(r.energy_result.p2_year1_mwh  for r in results if r.energy_result)
        tp3yr1  = sum(r.energy_result.p3_year1_mwh  for r in results if r.energy_result)
        tp1life = sum(r.energy_result.p1_lifetime_mwh for r in results if r.energy_result)
        avg_cuf = tp1yr1 / (total_kwp * 8760 / 1000) * 100 if total_kwp > 0 else 0
        es_data.append([
            "TOTAL / AVG", f"{total_mwp:.4f}", "—",
            f"{avg_sy:.1f}", f"{avg_cuf:.2f}",
            f"{tp1yr1:,.1f}", f"{tp2yr1:,.1f}", f"{tp3yr1:,.1f}",
            f"{tp1life:,.1f}",
        ])

    es_tbl = ax.table(
        cellText=es_data,
        colLabels=es_hdrs,
        loc="center", cellLoc="center",
        bbox=_table_bbox(),
    )
    es_tbl.auto_set_font_size(False)
    es_tbl.set_fontsize(9)
    _style_header_row(es_tbl, len(es_hdrs))
    for row_idx, r in enumerate(results):
        col_hex = PLANT_COLOURS[row_idx % len(PLANT_COLOURS)]
        es_tbl[row_idx + 1, 0].set_facecolor(col_hex)
        es_tbl[row_idx + 1, 0].set_text_props(color="white", fontweight="bold")
    if len(results) > 1:
        _style_total_row(es_tbl, len(results) + 1, len(es_hdrs))


def _build_25yr_table(ax, results, energy_params: EnergyParameters) -> None:
    """Draw the 25-year generation forecast table into *ax*."""
    from pvlayout_core.core.energy_calculator import _z_score as _zscore

    ax.axis("off")
    _section_title(
        ax,
        f"{energy_params.plant_lifetime_years}-Year Generation Forecast  "
        f"(Total Plant — all boundaries combined)",
        fontsize=11,
    )

    _er0    = next((r.energy_result for r in results if r.energy_result), None)
    lp1     = _er0.p1_label if _er0 else "P50"
    lp2     = _er0.p2_label if _er0 else "P75"
    lp3     = _er0.p3_label if _er0 else "P90"
    sigma   = energy_params.combined_uncertainty_pct / 100.0
    z1 = _zscore(energy_params.p1_exceedance)
    z2 = _zscore(energy_params.p2_exceedance)
    z3 = _zscore(energy_params.p3_exceedance)

    max_years = energy_params.plant_lifetime_years
    yearly_p50 = [0.0] * max_years
    for r in results:
        if r.energy_result and r.energy_result.yearly_energy_mwh:
            for y, e in enumerate(r.energy_result.yearly_energy_mwh[:max_years]):
                yearly_p50[y] += e

    table_data = []
    cumul = 0.0
    for yr_idx, p50 in enumerate(yearly_p50):
        yr = yr_idx + 1
        cumul += p50
        p1 = p50 * max(0.0, 1.0 - z1 * sigma)
        p2 = p50 * max(0.0, 1.0 - z2 * sigma)
        p3 = p50 * max(0.0, 1.0 - z3 * sigma)
        yr1 = yearly_p50[0] if yearly_p50[0] > 0 else 1.0
        deg = (1 - p50 / yr1) * 100 if yr1 > 0 else 0.0
        table_data.append([
            str(yr),
            f"{p1:,.1f}", f"{p2:,.1f}", f"{p3:,.1f}",
            f"{cumul / 1000:,.2f}", f"{deg:.1f}",
        ])

    # Split into two side-by-side halves to save vertical space
    half       = math.ceil(len(table_data) / 2)
    left_data  = table_data[:half]
    right_data = table_data[half:]
    while len(right_data) < len(left_data):
        right_data.append(["", "", "", "", "", ""])

    combined      = [l + r for l, r in zip(left_data, right_data)]
    combined_hdrs = [
        "Year", f"{lp1}\n(MWh)", f"{lp2}\n(MWh)", f"{lp3}\n(MWh)",
        f"Cumul.{lp1}\n(GWh)", "Deg.\n(%)",
        "Year", f"{lp1}\n(MWh)", f"{lp2}\n(MWh)", f"{lp3}\n(MWh)",
        f"Cumul.{lp1}\n(GWh)", "Deg.\n(%)",
    ]

    t25 = ax.table(
        cellText=combined,
        colLabels=combined_hdrs,
        loc="center", cellLoc="center",
        bbox=_table_bbox(),
    )
    t25.auto_set_font_size(False)
    t25.set_fontsize(8)
    _style_header_row(t25, 12)
    for row in range(1, len(combined) + 1):
        bg = "#f0f4f8" if row % 2 == 0 else "white"
        for col in range(12):
            t25[row, col].set_facecolor(bg)

    fig = ax.get_figure()
    fig.text(
        0.05, 0.005,
        f"P-values: {lp1}=median estimate; {lp2}/{lp3}=probability of exceedance; "
        f"uncertainty σ={energy_params.combined_uncertainty_pct:.1f}%.  "
        f"P_x = P50 × (1 − z_x × σ)",
        fontsize=7, color="#555555",
    )


# ---------------------------------------------------------------------------
# Energy Page A — inputs + PR + per-plant  (used when monthly present)
# ---------------------------------------------------------------------------

def _build_energy_page_inputs(
    results: List[LayoutResult],
    params: LayoutParameters,
    energy_params: EnergyParameters,
) -> Figure:
    """
    Page 3 (when monthly data present):
      Title bar / PR inputs side-by-side / Per-plant energy summary
    """
    fig = plt.figure(figsize=(PAGE_W, PAGE_H))
    fig.patch.set_facecolor("white")

    gs = gridspec.GridSpec(
        3, 1, figure=fig,
        top=0.94, bottom=0.04,
        hspace=0.70,
        height_ratios=[0.07, 0.44, 0.49],
    )

    # Title bar
    _title_bar(
        fig.add_subplot(gs[0]),
        f"PV Plant Layout — Energy Yield Report    |    "
        f"{date.today().strftime('%d %B %Y')}",
    )

    # PR breakdown + inputs (side by side)
    gs_top = gridspec.GridSpecFromSubplotSpec(
        1, 2, subplot_spec=gs[1], wspace=0.10
    )
    _build_pr_and_inputs(gs_top, fig, energy_params, params, results)

    # Per-plant summary
    ax_es = fig.add_subplot(gs[2])
    _build_per_plant_table(ax_es, results, energy_params)

    return fig


# ---------------------------------------------------------------------------
# Energy Page B — monthly table + 25-year  (used when monthly present)
# ---------------------------------------------------------------------------

def _build_energy_page_monthly(
    results: List[LayoutResult],
    energy_params: EnergyParameters,
) -> Figure:
    """
    Page 4 (when monthly data present):
      Thin header / Monthly IEC 61724-1 table / 25-year generation forecast
    """
    fig = plt.figure(figsize=(PAGE_W, PAGE_H))
    fig.patch.set_facecolor("white")

    gs = gridspec.GridSpec(
        3, 1, figure=fig,
        top=0.96, bottom=0.04,
        hspace=0.60,
        height_ratios=[0.04, 0.53, 0.43],
    )

    # Thin title bar
    _title_bar(
        fig.add_subplot(gs[0]),
        f"Energy Yield Report (cont.)    |    "
        f"{date.today().strftime('%d %B %Y')}",
    )

    # ---- Monthly IEC 61724-1 table --------------------------------------
    ax_mo = fig.add_subplot(gs[1])
    ax_mo.axis("off")
    _section_title(
        ax_mo,
        "Monthly Energy Breakdown — IEC 61724-1 — Year 1  "
        "(all plants combined)",
        fontsize=11,
    )

    _er0 = next((r.energy_result for r in results if r.energy_result), None)

    MONTH_NAMES    = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    mo_energy    = [0.0] * 12
    mo_gti       = [0.0] * 12
    mo_ghi       = [0.0] * 12
    mo_amb_temp  = [0.0] * 12
    mo_cell_temp = [0.0] * 12
    mo_pr        = [0.0] * 12
    total_kwp    = sum(r.total_capacity_kwp for r in results)
    pr_annual    = _er0.performance_ratio * 100 if _er0 else 0.0

    ref_er = next(
        (r.energy_result for r in results
         if r.energy_result and len(r.energy_result.monthly_energy_mwh) == 12),
        None
    )
    for r in results:
        er = r.energy_result
        if er and len(er.monthly_energy_mwh) == 12:
            for m in range(12):
                mo_energy[m] += er.monthly_energy_mwh[m]
    if ref_er:
        if len(ref_er.monthly_gti_kwh_m2)  == 12: mo_gti       = list(ref_er.monthly_gti_kwh_m2)
        if len(ref_er.monthly_ghi_kwh_m2)  == 12: mo_ghi       = list(ref_er.monthly_ghi_kwh_m2)
        if len(ref_er.monthly_amb_temp_c)   == 12: mo_amb_temp  = list(ref_er.monthly_amb_temp_c)
        if len(ref_er.monthly_cell_temp_c)  == 12: mo_cell_temp = list(ref_er.monthly_cell_temp_c)
        if len(ref_er.monthly_pr)           == 12: mo_pr        = list(ref_er.monthly_pr)

    mo_hdrs = [
        "Month",
        "GHI\n(kWh/m²)", "H_i\n(kWh/m²)",
        "T_amb\n(°C)", "T_cell\n(°C)",
        "Y_r\n(h)", "Y_f\n(kWh/kWp)",
        "PR\n(%)", "Energy\n(MWh)", "CUF\n(%)",
    ]
    mo_data      = []
    total_yf_kwh = 0.0
    for m in range(12):
        hours_m = DAYS_PER_MONTH[m] * 24
        cuf_m   = (mo_energy[m] * 1000.0 / (total_kwp * hours_m) * 100.0
                   if total_kwp > 0 else 0.0)
        yr_m    = mo_gti[m]
        yf_m    = (mo_energy[m] * 1000.0 / total_kwp if total_kwp > 0 else 0.0)
        total_yf_kwh += mo_energy[m] * 1000.0
        mo_data.append([
            MONTH_NAMES[m],
            f"{mo_ghi[m]:.1f}" if mo_ghi[m] > 0 else "—",
            f"{mo_gti[m]:.1f}",
            f"{mo_amb_temp[m]:.1f}" if mo_amb_temp[m] != 0.0 else "—",
            f"{mo_cell_temp[m]:.1f}" if mo_cell_temp[m] != 0.0 else "—",
            f"{yr_m:.1f}",
            f"{yf_m:.1f}" if total_kwp > 0 else "—",
            f"{mo_pr[m]:.1f}" if mo_pr[m] > 0 else f"{pr_annual:.1f}",
            f"{mo_energy[m]:,.1f}",
            f"{cuf_m:.1f}",
        ])

    t_e      = sum(mo_energy)
    t_g      = sum(mo_gti)
    t_gh     = sum(mo_ghi)
    ann_cuf  = (t_e * 1000.0 / (total_kwp * 8760.0) * 100.0 if total_kwp > 0 else 0.0)
    yf_ann   = (total_yf_kwh / total_kwp if total_kwp > 0 else 0.0)
    mo_data.append([
        "TOTAL",
        f"{t_gh:.1f}" if t_gh > 0 else "—",
        f"{t_g:.1f}",
        "—", "—",
        f"{t_g:.1f}",
        f"{yf_ann:.1f}" if total_kwp > 0 else "—",
        f"{pr_annual:.1f}",
        f"{t_e:,.1f}",
        f"{ann_cuf:.1f}",
    ])

    mo_tbl = ax_mo.table(
        cellText=mo_data,
        colLabels=mo_hdrs,
        loc="center", cellLoc="center",
        bbox=_table_bbox(TITLE_FRAC),
    )
    mo_tbl.auto_set_font_size(False)
    mo_tbl.set_fontsize(8)
    _style_header_row(mo_tbl, len(mo_hdrs))
    for row in range(1, 13):
        bg = "#f0f4f8" if row % 2 == 0 else "white"
        for col in range(len(mo_hdrs)):
            mo_tbl[row, col].set_facecolor(bg)
    _style_total_row(mo_tbl, 13, len(mo_hdrs), colour=HEADER_COLOUR)

    # ---- 25-year table --------------------------------------------------
    ax_25 = fig.add_subplot(gs[2])
    _build_25yr_table(ax_25, results, energy_params)

    return fig


# ---------------------------------------------------------------------------
# Energy Page (single) — no monthly data
# ---------------------------------------------------------------------------

def _build_energy_page_single(
    results: List[LayoutResult],
    params: LayoutParameters,
    energy_params: EnergyParameters,
) -> Figure:
    """
    Single energy page when no monthly data is available:
      Title / PR+inputs / Per-plant summary / 25-year table
    """
    fig = plt.figure(figsize=(PAGE_W, PAGE_H))
    fig.patch.set_facecolor("white")

    gs = gridspec.GridSpec(
        4, 1, figure=fig,
        top=0.94, bottom=0.04,
        hspace=0.65,
        height_ratios=[0.07, 0.30, 0.20, 0.43],
    )

    # Title bar
    _title_bar(
        fig.add_subplot(gs[0]),
        f"PV Plant Layout — Energy Yield Report    |    "
        f"{date.today().strftime('%d %B %Y')}",
    )

    # PR breakdown + inputs (side by side)
    gs_top = gridspec.GridSpecFromSubplotSpec(
        1, 2, subplot_spec=gs[1], wspace=0.10
    )
    _build_pr_and_inputs(gs_top, fig, energy_params, params, results)

    # Per-plant summary
    ax_es = fig.add_subplot(gs[2])
    _build_per_plant_table(ax_es, results, energy_params)

    # 25-year table
    ax_25 = fig.add_subplot(gs[3])
    _build_25yr_table(ax_25, results, energy_params)

    return fig
