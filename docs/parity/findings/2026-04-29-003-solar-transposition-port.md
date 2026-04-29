# Finding #003 — Solar transposition (HSAT GHI→GTI) port

**Row:** [docs/PLAN.md](../../PLAN.md) row #7 (T3)
**Date:** 2026-04-29
**Author:** Arun (port) — solar-domain decisions captured for Prasanta's end-of-port review
**Status:** committed; deferred review

## Background

Legacy added three HSAT-related functions to
`core/solar_transposition.py` on `baseline-v1-20260429` commit
`9362083`. Row #7 ports them verbatim into the new project as a
purely additive change to the existing fixed-tilt transposition
module. The existing `ghi_to_gti` and `annual_gti_from_ghi`
(fixed-tilt) functions are unchanged.

## What landed

Verbatim port (271 lines appended) from legacy
`core/solar_transposition.py` lines 167–437. Three new public
functions:

1. **`ghi_to_gti_hsat(ghi_wm2, timestamps, lat_deg, max_angle_deg=55.0, albedo=0.20) -> np.ndarray`**
   — hour-by-hour transposition for a Horizontal Single-Axis
   Tracker with a North–South rotation axis. Returns hourly GTI in
   W/m².

2. **`annual_gti_from_ghi_hsat(...)`** — wrapper: calls function 1,
   sums, divides by 1000 → kWh/m²/yr.

3. **`generate_synthetic_hourly_gti(lat_deg, monthly_gti_kwh_m2, year=2024, is_sat=False, max_angle_deg=55.0, tilt_deg=20.0, azimuth_pvgis=0.0, albedo=0.20)`**
   — synthesises an 8760- or 8784-hour GTI series calibrated to
   monthly totals. Branches on `is_sat`: HSAT geometry vs fixed-tilt
   geometry.

Bit-exact parity verified on 8760- and 8784-hour synthetic GHI
inputs in `tests/parity/test_solar_transposition_parity.py` —
`np.array_equal` succeeds for `ghi_to_gti_hsat`; `np.allclose(atol=1e-9)`
succeeds for `generate_synthetic_hourly_gti` on both FT and SAT
branches across leap and non-leap years.

## Algorithm summary

### HSAT physics (`ghi_to_gti_hsat`)

For each hour:

1. **Solar position.** Declination δ from day-of-year; hour angle ω
   from local hour; cos(zenith) = sin φ · sin δ + cos φ · cos δ ·
   cos ω. Skip if cos(zenith) ≤ 0.01 (sun below horizon).

2. **Ideal tracking angle (eq. 1).**
   `θ_T* = arctan2(cos δ · sin ω, cos θ_z)`
   Clamped to ±max_angle_deg (hardware limit). Convention: θ_T > 0
   → panel faces West (afternoon); θ_T < 0 → panel faces East
   (morning).

3. **AOI on tracker surface (eq. 2).**
   `cos(AOI) = cos(θ_T) · cos(θ_z) + cos δ · sin(θ_T) · sin ω`
   Clamped to [0, ∞) to handle limit-angle cases.

4. **Geometric factor.** `Rb = min(cos(AOI) / cos θ_z, 5.0)`. The
   clamp at 5.0 prevents Rb from blowing up at sunrise/sunset where
   cos(zenith) approaches zero.

5. **Erbs diffuse decomposition** (Erbs et al. 1982). Compute
   clearness index `kt = GHI / (I₀ · cos θ_z)` where
   `I₀ = 1367 · (1 + 0.033 · cos(360 · doy / 365))` is the
   extraterrestrial irradiance. Diffuse fraction `fd` is a piecewise
   polynomial in `kt`:
   - `kt ≤ 0.22`: `fd = 1.0 − 0.09 kt`
   - `0.22 < kt ≤ 0.80`: `fd = 0.9511 − 0.1604 kt + 4.388 kt² − 16.638 kt³ + 12.336 kt⁴`
   - `kt > 0.80`: `fd = 0.165`

6. **Hay-Davies isotropic tilt.**
   `GTI = Gb · Rb + Gd · (1+cos β)/2 + ρ · GHI · (1−cos β)/2`
   where β = |θ_T| (instantaneous tilt = absolute tracking angle).

References: Duffie & Beckman, "Solar Engineering of Thermal
Processes", 4th ed.; Braun & Mitchell (1983), "Solar geometry for
fixed and tracking surfaces".

### Synthetic generator (`generate_synthetic_hourly_gti`)

Algorithm: clear-sky GTI proportional to cos(AOI) → sum per month →
scale each month's hourly values to match `monthly_gti_kwh_m2[m]`.
The shape (diurnal bell + seasonal modulation) is correct; the
scaling makes monthly totals match an external reference (e.g.,
PVGIS API monthly response).

Branches on `is_sat`: the `cos(AOI)` calculation differs (tracker
clamp vs fixed-tilt panel-normal dot product), but the monthly
scaling step is identical. Uses fixed `fd = 0.35` for the raw
profile — exact cloud cover doesn't matter since the per-month
scaling cancels out absolute values.

Leap-year detection: `year % 4 == 0 and (year % 100 != 0 or year %
400 == 0)` → 8784 hours (leap) or 8760 hours (non-leap).

## Open questions / refinement candidates (for end-of-port review)

These are observations from the port. Prasanta reviews them with
the other accumulated memos at end-of-port.

1. **Albedo default = 0.20.** Hardcoded in all three functions
   (configurable per-call, but no caller currently passes a
   non-default). Indian sites with bright soil / sand can warrant
   0.25–0.30. `LayoutParameters.ground_albedo` already exists in
   the data model; consumers (row #8 `energy_calculator.py`) could
   wire it through.

2. **Synthetic generator's `fd = 0.35` (diffuse fraction).** Hardcoded
   for the raw profile. Per-monthly scaling cancels absolute values,
   but the proportion of beam-vs-diffuse affects the SAT AOI
   calculation (since beam contribution is `Gb · Rb` and Rb depends
   on tracker angle). For SAT plants in heavily-overcast regions
   (rare in India), the synthetic generator may diverge from real
   PVGIS hourly data in the SAT branch. Worth verifying on a known
   SAT site.

3. **`max_angle_deg = 55°` default.** Common HSAT spec; some
   manufacturers offer 60° or 70°. Already a parameter; flagging
   for awareness.

4. **Hour-midpoint convention** (`hour + 0.5`). Both `ghi_to_gti_hsat`
   and `generate_synthetic_hourly_gti` evaluate hourly GHI at the
   midpoint of the hour (HH:30 for the [HH:00, HH+1:00] interval).
   Standard convention; PVGIS hourly files use the same. Worth
   noting for non-PVGIS data sources.

5. **`Rb` clamp at 5.0.** Caps the geometric factor `cos_aoi /
   cos_theta_z` at 5×. Standard practice to prevent sunrise/sunset
   blow-up where `cos_theta_z → 0`. Not configurable; flagging.

## For end-of-port review

When Prasanta reviews the accumulated memos at end-of-port, the
decision points for this finding are:

1. Are the algorithm constants (albedo=0.20, fd=0.35,
   max_angle=55°, Rb clamp=5.0) correct for our target markets?
2. Should `albedo` be wired through `LayoutParameters.ground_albedo`
   in row #8's `energy_calculator.py` port?
3. Is the synthetic generator's fixed-fd assumption acceptable for
   SAT plants, or should it use a more sophisticated diffuse model
   (e.g., per-month diffuse fractions)?

Refinements, if any, become follow-up rows in PLAN.md raised after
the parity sweep is complete.
