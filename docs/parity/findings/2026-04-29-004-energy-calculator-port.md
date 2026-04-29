# Finding #004 — Energy calculator + SAT GTI fix

**Row:** [docs/PLAN.md](../../PLAN.md) row #8 (T3)
**Date:** 2026-04-29
**Author:** Arun (port) — solar-domain decisions captured for Prasanta's end-of-port review
**Status:** committed; deferred review

## Background

Legacy added SAT energy-yield support to `core/energy_calculator.py` on
`baseline-v1-20260429` commit `9362083`. Row #8 ports the four edits
verbatim into the new project:

1. `fetch_solar_irradiance` adds `is_sat=False`, `sat_max_angle_deg=55.0`
   keyword params + SAT dispatch chain
   (`_fetch_pvgis_sat` → `_fetch_nasa_power` → unavailable).
2. `_fetch_pvgis` (FT path) applies a 1.2× GHI correction factor to all
   four return values (annual GHI/GTI + monthly GHI/GTI).
3. NEW `_fetch_pvgis_sat` (~80 lines): fetches PVGIS PVcalc with
   `trackingtype=0&angle=0` (horizontal panel = GHI), synthesizes an
   8760-hour cosine-zenith profile scaled to monthly totals, runs
   `ghi_to_gti_hsat` (row #7), sums to monthly/annual, applies 1.2×.
4. `_ensure_gti` branches on `params.is_sat`: HSAT path calls
   `ghi_to_gti_hsat`, FT path calls existing `ghi_to_gti`.

`EnergyParameters` already had `is_sat`, `sat_max_angle_deg`, hourly
fields — no model change. `EnergyResult` schema and adapter are
unchanged. No wire-schema passthrough work this row.

## What landed

Surgical port of legacy lines 79–268 + 767–800 into
`python/pvlayout_engine/pvlayout_core/core/energy_calculator.py`. Net
+~140 lines, file 746 → 885.

In-row scope expansion: added `requests>=2.32` to
`python/pvlayout_engine/pyproject.toml` `dependencies`. Pre-existing
latent gap — `_fetch_pvgis` and `_fetch_nasa_power` already imported
`requests` lazily but it wasn't a sidecar dep. Row #8 surfaces it
because `_fetch_pvgis_sat` is the new SAT path's central function and
the parity test mocks `requests.get`. Added per
`feedback_scope_expansion.md` (small/bounded/textbook in-row fix).

Bit-exact parity verified on synthetic 8760-hour GHI + temperature
inputs (20°N, 50 MWp, 25-year lifetime) in
`tests/parity/test_energy_calculator_parity.py`:
- `calculate_pr` — strict `==` on returned PR
- `calculate_energy` (FT branch) — strict `==` on `performance_ratio`,
  `year1_energy_mwh`, `lifetime_energy_mwh`,
  `p1/p2/p3_year1_mwh`, `p1/p2/p3_lifetime_mwh`,
  `monthly_*` arrays (9 fields), `yearly_energy_mwh` (25 elements)
- `calculate_energy` (SAT branch) — same fields, drives `_ensure_gti`
  HSAT path (`ghi_to_gti_hsat`)
- `_fetch_pvgis_sat` — strict `==` on
  `(ghi, gti, source, monthly_ghi, monthly_gti)` with mocked PVGIS JSON

Full sidecar pytest: 98 passed, 6 skipped, 0 failed (was 93 → +5).

## Algorithm summary

### `_fetch_pvgis_sat`

PVGIS PVcalc with `trackingtype=1` (horizontal SAT) was found to return
`H(i)_y` identical to fixed-horizontal GHI — the tracking gain is zero
in the API response. Apparent v5.2 bug.

Workaround: fetch monthly GHI from PVGIS with horizontal panel
(`trackingtype=0&angle=0`), synthesize an 8760-hour clear-sky cosine-
zenith profile, scale per month so each month's hourly sum equals the
PVGIS monthly GHI (W·h/m² → kWh/m² conversion), apply
`ghi_to_gti_hsat` (row #7) hour-by-hour, and sum monthly. Annual GTI is
the sum of monthly. Final 1.2× GHI correction factor applied to all
four outputs.

Reference year for the synthesizer is hardcoded `YEAR = 2023` (non-
leap), 8760 hours, mid-hour timestamps (`HH:30`).

### `_ensure_gti` SAT branch

When `params.is_sat=True` and `hourly_gti_wm2` is empty but
`hourly_ghi_wm2` is populated, `ghi_to_gti_hsat(ghi, timestamps,
lat_deg, max_angle_deg)` is called instead of the FT
`ghi_to_gti(...)`. No tilt or azimuth used (the tracker's angle is
computed per-hour by `ghi_to_gti_hsat`).

### `_fetch_pvgis` 1.2× factor

Hardcoded `_GHI_FACTOR = 1.2` applied to `ghi`, `gti`, `monthly_ghi`,
`monthly_gti` immediately before the return. Same factor applied at the
end of `_fetch_pvgis_sat`. Not applied in `_fetch_nasa_power`.

## Open questions / refinement candidates (for end-of-port review)

These are observations from the port. Prasanta reviews them with the
other accumulated memos at end-of-port.

1. **PVGIS 1.2× GHI correction factor.** Hardcoded in `_fetch_pvgis`
   and `_fetch_pvgis_sat`. Legacy comment claims "PVGIS underestimates
   GHI by 20%" — empirical basis unclear from the code; likely
   calibrated on Indian sites. Possibly site-dependent. Worth
   confirming whether 1.2 is universal or whether it should be exposed
   on `EnergyParameters` for non-Indian markets.

2. **`_fetch_pvgis_sat` workaround basis.** PVGIS PVcalc
   `trackingtype=1` apparently returns `H(i)_y = GHI`. Worth checking
   whether this is still broken in PVGIS at end-of-port (maybe v5.3 or
   a successor endpoint fixes it), and whether NASA POWER offers a
   tracker-aware response we could use instead of the synthesize-and-
   re-transpose dance.

3. **Synthetic 8760-hour profile fidelity for SAT.** The synthesizer
   uses pure cosine-zenith shape (no diffuse modeling). Per-month
   scaling preserves monthly GHI totals, but `ghi_to_gti_hsat`'s SAT
   AOI calculation depends on the beam-vs-diffuse split (Rb operates
   on the beam component). For overcast regions this could diverge
   from a real PVGIS hourly file. Same concern flagged in row #7
   finding #003 §2 about `generate_synthetic_hourly_gti`.

4. **Reference year `YEAR = 2023` (non-leap) hardcoded.** Bypass for
   leap-year sites; the synthesized 8760-hour series will be off by
   one day for sites whose actual hourly data is leap-year-indexed.
   Flagging.

5. **Hardcoded `_GHI_FACTOR` and `YEAR` not exposed via
   `EnergyParameters`.** If (1) and (4) ever need per-project
   overrides, these become refinement rows.

6. **`requests` as a sidecar dep (in-row scope expansion).** Added
   `requests>=2.32` to `pyproject.toml` dependencies because
   `_fetch_pvgis_sat`/`_fetch_pvgis`/`_fetch_nasa_power` all import it
   lazily and the test mock requires the module to be importable. Row
   #5 used stdlib `urllib.request` to avoid this dep; the energy
   calculator path could be refactored to follow the same pattern,
   but doing so would diverge from legacy and break the verbatim-port
   premise. Flagging in case Prasanta or future cleanup wants to
   consolidate the HTTP client choice.

## For end-of-port review

When Prasanta reviews the accumulated memos at end-of-port, the
decision points for this finding are:

1. Is the 1.2× PVGIS GHI correction factor empirically correct for
   our target markets, or should it be regional / configurable?
2. Should `_fetch_pvgis_sat`'s workaround (synthesize 8760 + re-
   transpose) be replaced if PVGIS or another endpoint now offers
   real SAT hourly data?
3. Is the synthesizer's cos-zenith shape acceptable for SAT plants,
   or should it incorporate a diffuse model?
4. Should the energy calculator's HTTP client be unified with row
   #5's stdlib `urllib.request` approach to drop the `requests`
   dep, or is the legacy `requests` API ergonomic enough to keep?

Refinements, if any, become follow-up rows in PLAN.md raised after
the parity sweep is complete.
