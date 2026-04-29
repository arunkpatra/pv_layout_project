# Row #8 Spec — Energy calculator + SAT GTI fix

**PLAN.md row:** [docs/PLAN.md](../../PLAN.md) row #8 (T3).
**Source:** legacy `core/energy_calculator.py` @ `baseline-v1-20260429` commit `9362083`.
**Acceptance (PLAN.md):** parity 25-year yield match within solar tolerance; discovery memo committed.

---

## 1. Goal

Port the SAT energy-yield additions from legacy `core/energy_calculator.py` into the new app's `python/pvlayout_engine/pvlayout_core/core/energy_calculator.py`, and verify bit-exact parity on full-pipeline yield via a sys.path-bootstrap parity test. Capture the solar-domain decisions in a T3 discovery memo for end-of-port review.

The new app's `EnergyParameters` model already has `is_sat`, `sat_max_angle_deg`, `site_lat/tilt/azimuth_pvgis`, and the hourly fields. Row #7 already shipped `ghi_to_gti_hsat`, `annual_gti_from_ghi_hsat`, `generate_synthetic_hourly_gti` in `core/solar_transposition.py`. Row #8 wires those into the energy calculator.

---

## 2. Port surface — four edits

All four edits are surgical and contained to `pvlayout_core/core/energy_calculator.py`. Net diff: ~+140 lines (new app 746 → ~885 lines, matching legacy).

### 2.1 `fetch_solar_irradiance` — add SAT dispatch (line 79)

Add two keyword params:

```python
def fetch_solar_irradiance(
    lat: float,
    lon: float,
    tilt_deg: float,
    azimuth_deg: float = 0.0,
    is_sat: bool = False,
    sat_max_angle_deg: float = 55.0,
) -> Tuple[float, float, str, List[float], List[float]]:
```

When `is_sat=True`, dispatch:

```python
if is_sat:
    try:
        return _fetch_pvgis_sat(lat, lon, sat_max_angle_deg)
    except Exception:
        pass
    try:
        return _fetch_nasa_power(lat, lon, tilt_deg)
    except Exception:
        pass
    return 0.0, 0.0, "unavailable", [], []
```

FT path is unchanged. Update the docstring per legacy lines 84–101.

### 2.2 `_fetch_pvgis` — apply 1.2× GHI correction factor (line 126)

After computing `monthly_ghi` and `monthly_gti`, scale all four return values:

```python
_GHI_FACTOR = 1.2
ghi         = ghi * _GHI_FACTOR
gti         = gti * _GHI_FACTOR
monthly_ghi = [v * _GHI_FACTOR for v in monthly_ghi]
monthly_gti = [v * _GHI_FACTOR for v in monthly_gti]
```

Verbatim from legacy lines 157–161. Place immediately before the `return` statement.

### 2.3 NEW `_fetch_pvgis_sat` (~80 lines, after `_fetch_pvgis`)

Verbatim port of legacy lines 166–268. Three logical steps:

1. Fetch monthly GHI from PVGIS PVcalc with `trackingtype=0&angle=0&aspect=0` (horizontal panel, so `H(i)_m = GHI_m`).
2. Synthesize an 8760-hour GHI profile: cosine-zenith clear-sky shape per hour, scaled per month so the monthly sum equals the PVGIS monthly GHI in kWh/m².
3. Apply `ghi_to_gti_hsat(ghi_wm2, timestamps, lat, max_angle_deg)` (row #7) to get hourly tracked GTI; sum to monthly/annual; round.
4. Apply 1.2× factor to `ghi`, `gti`, `monthly_ghi`, `monthly_gti`.

**Import-prefix substitution.** Legacy uses `from core.solar_transposition import ghi_to_gti_hsat`; new app uses `from pvlayout_core.core.solar_transposition import ghi_to_gti_hsat`. Apply this substitution everywhere the new file imports from `pvlayout_core/core/*` or `pvlayout_core/models/*`.

**Reference year.** `YEAR = 2023` (non-leap) is hardcoded in legacy. Port verbatim; flag in T3 memo.

### 2.4 `_ensure_gti` — SAT branch (line 639)

Branch on `params.is_sat`:

```python
if params.is_sat:
    from pvlayout_core.core.solar_transposition import ghi_to_gti_hsat
    gti_arr = ghi_to_gti_hsat(
        params.hourly_ghi_wm2,
        params.hourly_timestamps,
        lat_deg=params.site_lat,
        max_angle_deg=params.sat_max_angle_deg,
    )
else:
    from pvlayout_core.core.solar_transposition import ghi_to_gti
    gti_arr = ghi_to_gti(
        params.hourly_ghi_wm2,
        params.hourly_timestamps,
        lat_deg=params.site_lat,
        tilt_deg=params.site_tilt_deg,
        azimuth_pvgis=params.site_azimuth_pvgis,
    )
return gti_arr.tolist()
```

The FT branch is the existing call — unchanged. Update the docstring per legacy lines 770–774.

### 2.5 No other touch-points

- `EnergyParameters` model: already has `is_sat`, `sat_max_angle_deg`, `site_lat/tilt/azimuth_pvgis`, hourly fields. No change.
- `EnergyResult` Pydantic schema (`schemas.py`) and `_energy_result_from_core` adapter: unchanged in legacy diff. No change.
- `calculate_energy`, `calculate_pr`, `calculate_temperature_loss[_sandia]`, `_bifacial_gain`, `_seasonal_temperatures`, `_pr_without_temp`, `_z_score`, `_p_label`, `_fetch_nasa_power`, `export_15min_csv`: unchanged in legacy diff. No change.
- **No wire-schema passthrough work** — the data model was pre-populated for SAT in the new app, so the `feedback_wire_schema_passthrough.md` recurring trap doesn't apply this row.

---

## 3. Parity test

**File:** `python/pvlayout_engine/tests/parity/test_energy_calculator_parity.py` (new).

**Pattern:** sys.path bootstrap, same-process cross-compare against legacy `baseline-v1-20260429`. Identical structure to row #7's `test_solar_transposition_parity.py`.

### 3.1 Bootstrap helper

Two helpers `_swap_to_legacy()` and `_swap_to_new()` that:

- Purge `sys.modules` entries with prefixes `core.`, `models.`, `utils.`, `pvlayout_core.`.
- Adjust `sys.path[0]` to point to legacy root (`/Users/arunkpatra/codebase/PVlayout_Advance`) or new root (`<repo>/python/pvlayout_engine`).
- Return the freshly-imported module.

Per-test setup so module identities are clean. If `LEGACY_PATH` doesn't exist or isn't on `baseline-v1-20260429`, mark `pytest.skip(...)`.

### 3.2 Test cases

**`test_calculate_energy_ft_bit_exact`** — fixed-tilt full-pipeline.

Build `EnergyParameters` with:
- `is_sat=False`
- `hourly_timestamps` — 8760 strings, format `"%Y-%m-%d %H:%M"`, mid-hour, non-leap year 2023
- `hourly_ghi_wm2` — synthetic cosine-zenith profile scaled to ≈1900 kWh/m²/yr (Indian site)
- `hourly_temp_c` — sinusoidal seasonal profile (mean 28°C, amplitude 8°C, peak around DOY 150)
- `site_lat=20.0`, `site_tilt_deg=20.0`, `site_azimuth_pvgis=0.0`
- Default PR-loss values
- `plant_lifetime_years=25`, `is_bifacial=False`

Call legacy `calculate_energy(params)` (after `_swap_to_legacy()`), then new `calculate_energy(params)` (after `_swap_to_new()`). Build a fresh `params` via the legacy/new dataclass each time so dataclass identity matches.

Assert bit-exact:
- `result.year_1_yield_kwh` (`==`)
- `result.lifetime_yield_kwh` (`==`)
- `result.p50_kwh`, `result.p75_kwh`, `result.p90_kwh` (`==`)
- `result.pr_pct` (`==`)
- `result.monthly_gti_kwh_m2` (list-equality)
- `result.monthly_ghi_kwh_m2` (list-equality)

**`test_calculate_energy_sat_bit_exact`** — SAT full-pipeline.

Same fixture as FT test, but `is_sat=True`, `sat_max_angle_deg=55.0`. Drives `_ensure_gti`'s SAT branch (calls `ghi_to_gti_hsat`). Assert same fields bit-exact.

**`test_calculate_pr_bit_exact`** — pure PR formula.

Identical `EnergyParameters` (no hourly data). Call `calculate_pr(params)` on each side. Assert bit-exact `==`. Quick smoke that the loss-stack arithmetic didn't drift.

**`test_fetch_pvgis_sat_synthetic_pipeline_bit_exact`** — `_fetch_pvgis_sat` deterministic core.

Monkeypatch `requests.get` in **both** the legacy and new modules to return a fixed PVGIS-shaped JSON:
- 12 monthly `H(i)_m` values (e.g., `[120, 130, 160, 180, 200, 190, 170, 170, 160, 150, 130, 110]` kWh/m²)
- annual `H(i)_y = sum(monthly)`
- `outputs.totals.fixed` and `outputs.monthly.fixed` shapes per legacy code expectations

Call `_fetch_pvgis_sat(lat=20.0, lon=78.0, max_angle_deg=55.0)` on each side. Assert bit-exact `(ghi, gti, source, monthly_ghi, monthly_gti)`.

### 3.3 No live-network test

The 1.2× factor + cosine-zenith synthesis pipeline is fully deterministic given the PVGIS JSON; mocking `requests.get` is sufficient. Live PVGIS would add CI flake without strengthening the row's acceptance.

### 3.4 Tolerance posture (per `feedback_bit_exact_parity_assertions.md`)

Default to strict equality. The pure-Python `math.sin/cos` + numpy arithmetic in `ghi_to_gti_hsat` and `calculate_energy` is deterministic across same-process bootstrap. If a strict assertion fails during implementation, capture the actual max-abs-diff first and only loosen if it's FP-floor (< ULP × magnitude); otherwise treat the diff as a port bug.

---

## 4. T3 discovery memo

**File:** `docs/parity/findings/2026-04-29-004-energy-calculator-port.md`.

Same shape as memos 001/002/003. Required sections:

1. **Background** — row #8, baseline commit `9362083`, four edits enumerated.
2. **What landed** — same enumeration with file/line citations.
3. **Algorithm summary** — short overview of `_fetch_pvgis_sat`'s synthesize-and-transpose pipeline, the SAT branch in `_ensure_gti`, and the FT 1.2× factor.
4. **Open questions / refinement candidates for end-of-port review:**

   a. **PVGIS 1.2× GHI correction factor.** Hardcoded in `_fetch_pvgis` and `_fetch_pvgis_sat`. Legacy comment claims "PVGIS underestimates GHI by 20%". Empirical basis unclear from code; likely calibrated to Indian sites. Should it be configurable via `EnergyParameters` for non-Indian markets?

   b. **`_fetch_pvgis_sat` workaround.** PVGIS PVcalc `trackingtype=1` apparently returns `H(i)_y = GHI` (zero tracking gain — v5.2 bug). Legacy bypasses by fetching horizontal GHI and re-transposing with `ghi_to_gti_hsat`. Worth checking whether this is still broken in PVGIS at end-of-port, and whether NASA POWER offers a tracker-aware endpoint.

   c. **Synthetic 8760-hour profile fidelity for SAT.** Uses pure cosine-zenith shape (no diffuse modeling). Monthly scaling preserves totals, but the SAT AOI calculation depends on beam-vs-diffuse split (since `Rb` operates on the beam component). For overcast regions this could diverge from a real PVGIS hourly file. Same concern flagged in row #7 finding #003 §2.

   d. **Reference year `YEAR = 2023` (non-leap).** Hardcoded in `_fetch_pvgis_sat`. Bypass for leap-year sites; flagging.

   e. **Hardcoded `_GHI_FACTOR` and `YEAR` not exposed via `EnergyParameters`.** If the constants in (a) and (d) ever need per-project overrides, these become refinement rows.

5. **For end-of-port review** — closing pattern from 003. Decision points: are constants right; should 1.2× be configurable; SAT diffuse model.

---

## 5. Acceptance criteria

Mapped to PLAN.md row #8's "Acceptance" + tier ceremony:

1. `uv run pytest tests/ -q` from `python/pvlayout_engine` is **green**. Target: prior **93 passed → 97 passed**, **6 skipped**, **0 failed** (4 new parity tests added).
2. `test_energy_calculator_parity.py::test_calculate_energy_sat_bit_exact` and `::test_calculate_energy_ft_bit_exact` assert bit-exact 25-year yield, P50/P75/P90, and monthly arrays via sys.path bootstrap.
3. Discovery memo `docs/parity/findings/2026-04-29-004-energy-calculator-port.md` committed.
4. PLAN.md row #8 `Status` flipped to `done`; status header bumped `7 / 12 done` → `8 / 12 done`.
5. Atomic commit per row: `parity: row #8 — energy calculator + SAT GTI fix`. Intra-row checkpoints use `wip:`; squash before close if more than ~3 wip commits accumulate.

---

## 6. Out of scope (deferred)

- **SAT-mode dispatch in the `/calculate-energy` sidecar route.** The wire schema's `EnergyParameters` already carries `is_sat`. If implementation surfaces a route signature gap, treat as in-row scope expansion per `feedback_scope_expansion.md` (small/bounded/textbook). Otherwise this row touches only `pvlayout_core/`.
- **Frontend SAT toggle UI.** UI work resumes post-parity per CLAUDE.md §2.
- **Live PVGIS contract test.** Adds CI flake, not in row's acceptance.
- **Refinement of solar-domain constants** (1.2× factor, fd, max_angle) — accumulates in T3 memos; routed to Prasanta in a single end-of-port pass per the 2026-04-29 policy.

---

## 7. Pre-implementation operational notes

- After any `pyproject.toml` change in `python/pvlayout_engine/`, run `uv sync --extra dev` (never bare `uv sync`) — see `feedback_uv_sync_dev_extras.md`. Row #8 is not expected to add deps.
- The legacy reference repo at `/Users/arunkpatra/codebase/PVlayout_Advance` must be checked out at `baseline-v1-20260429` for the parity test to run; otherwise the test self-skips.
- Verify before commit: parity tests pass with `LEGACY_PATH` actually pointing at the legacy checkout; `uv run pytest tests/ -q` from `python/pvlayout_engine`.
