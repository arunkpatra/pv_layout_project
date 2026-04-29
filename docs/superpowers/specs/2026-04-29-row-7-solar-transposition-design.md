# Row #7 — Solar transposition rewrite (HSAT GHI→GTI) (design)

**PLAN row:** [`docs/PLAN.md`](../../PLAN.md) row #7
**Tier:** T3 (port + bit-exact parity test + deferred-review discovery memo)
**Source:** legacy `core/solar_transposition.py` @ branch `baseline-v1-20260429`, originating commit `9362083`
**Target:** `python/pvlayout_engine/pvlayout_core/core/solar_transposition.py`
**Acceptance:** sidecar pytest green; bit-exact parity for `ghi_to_gti_hsat`, `annual_gti_from_ghi_hsat`, and `generate_synthetic_hourly_gti` against legacy on synthetic inputs; discovery memo committed.
**Date:** 2026-04-29

---

## 1. Goal

Append three new public functions to `pvlayout_core/core/solar_transposition.py`, ported verbatim from legacy:

1. **`ghi_to_gti_hsat(ghi_wm2, timestamps, lat_deg, max_angle_deg=55.0, albedo=0.20) -> np.ndarray`** — hour-by-hour transposition for a Horizontal Single-Axis Tracker (N-S rotation axis). Solar position → ideal tracking angle (clamped to ±max_angle) → AOI on tracker surface → Erbs diffuse decomposition → Hay-Davies isotropic tilt model with instantaneous β = |θ_T|.

2. **`annual_gti_from_ghi_hsat(ghi_wm2, timestamps, lat_deg, max_angle_deg=55.0, albedo=0.20) -> float`** — wrapper: calls `ghi_to_gti_hsat`, sums, returns kWh/m²/yr.

3. **`generate_synthetic_hourly_gti(lat_deg, monthly_gti_kwh_m2, year=2024, is_sat=False, max_angle_deg=55.0, tilt_deg=20.0, azimuth_pvgis=0.0, albedo=0.20) -> tuple[List[str], List[float]]`** — synthesises a 8760-hour (or 8784 in leap years) GTI time series calibrated to monthly totals. Branches on `is_sat`: HSAT geometry vs fixed-tilt geometry. Uses fixed `fd = 0.35` for the raw profile then scales each month to match `monthly_gti_kwh_m2[m]`.

**Direction one-way:** legacy → new project. Legacy is read-only reference per [CLAUDE.md §7](../../../CLAUDE.md). Nothing in this row modifies any file under `/Users/arunkpatra/codebase/PVlayout_Advance`.

**Purely additive port.** The existing fixed-tilt `ghi_to_gti` and `annual_gti_from_ghi` (lines 41–164 of the new app's file) stay unchanged. Three new functions are appended after `annual_gti_from_ghi`.

**T3 ceremony.** Per the 2026-04-29 policy update, no per-row Prasanta gate. Discovery memo at `docs/parity/findings/2026-04-29-003-solar-transposition-port.md` lands in the row commit; deferred review at end-of-port. The memo captures the energy-domain algorithmic choices (Erbs constants, Hay-Davies model, ideal-tracking-angle clamp, default albedo, default diffuse fraction) for Prasanta's batch review.

## 2. Changes

### 2.1 `python/pvlayout_engine/pvlayout_core/core/solar_transposition.py`

Append legacy lines 167–437 to the end of the file. The 271 lines added include:

- Section comment: `# HSAT (Horizontal Single-Axis Tracker, N-S axis) transposition`
- Function `ghi_to_gti_hsat(...)` with full docstring (physics references — Duffie & Beckman; Braun & Mitchell 1983)
- Function `annual_gti_from_ghi_hsat(...)`
- Function `generate_synthetic_hourly_gti(...)` with full docstring (algorithm: clear-sky cos-AOI proportional → monthly scaling)

Verbatim copy. The only allowed deviation: defensive lint cleanups (e.g., flake8 line-length on the dense math) only if the existing 166-line file already enforces a tighter line length than legacy ships. Visually inspect after the dump.

**Imports** at the top of the file are unchanged: `math`, `datetime`, `typing.List/Optional`, `numpy as np` already in place.

**No callers in this row.** The three new functions are exposed to `core/energy_calculator.py` (row #8's port) and to a future sidecar route (post-parity); row #7 only ships the transposition library, not consumers.

### 2.2 `python/pvlayout_engine/tests/parity/test_solar_transposition_parity.py` — new

Live cross-compare via `sys.path` bootstrap, same fixture pattern as row #5/#6.

```python
"""
Parity test for solar transposition (Row #7 of docs/PLAN.md).

Bit-exact comparison against legacy on synthetic GHI / monthly inputs.
Pure functions, no I/O — deterministic across runs.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pytest


LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")


def _purge_legacy_modules():
    for m in list(sys.modules):
        if m == "core" or m.startswith("core."):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_solar():
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core.solar_transposition import (
            ghi_to_gti_hsat as legacy_hsat,
            annual_gti_from_ghi_hsat as legacy_annual,
            generate_synthetic_hourly_gti as legacy_synth,
        )
        yield (legacy_hsat, legacy_annual, legacy_synth)
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


def _synthetic_ghi_year(year=2024, lat_deg=12.0):
    """Deterministic 8760- or 8784-hour GHI array. Noon-peaked diurnal,
    seasonally modulated. Returns (timestamps, ghi_wm2)."""
    from datetime import datetime, timedelta
    is_leap = (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))
    n = 8784 if is_leap else 8760
    timestamps = []
    ghi = []
    cur = datetime(year, 1, 1, 0, 30)
    for _ in range(n):
        doy = cur.timetuple().tm_yday
        hour = cur.hour + 0.5
        season = 0.7 + 0.3 * math.sin(2 * math.pi * (doy - 80) / 365.0)
        diurnal = max(0.0, math.cos((hour - 12.0) * math.pi / 12.0))
        ghi.append(900.0 * season * diurnal)
        timestamps.append(cur.strftime("%Y-%m-%d %H:%M"))
        cur += timedelta(hours=1)
    return timestamps, ghi


def test_solar_transposition_module_importable():
    """All three new functions resolve from the new app."""
    from pvlayout_core.core.solar_transposition import (
        ghi_to_gti_hsat,
        annual_gti_from_ghi_hsat,
        generate_synthetic_hourly_gti,
    )
    assert callable(ghi_to_gti_hsat)
    assert callable(annual_gti_from_ghi_hsat)
    assert callable(generate_synthetic_hourly_gti)


def test_ghi_to_gti_hsat_bit_exact_parity(legacy_solar):
    """Hour-by-hour HSAT GTI bit-exact match on a year of synthetic GHI."""
    legacy_hsat, _, _ = legacy_solar
    from pvlayout_core.core.solar_transposition import ghi_to_gti_hsat as new_hsat

    timestamps, ghi = _synthetic_ghi_year(year=2024, lat_deg=12.0)
    legacy_gti = legacy_hsat(ghi, timestamps, lat_deg=12.0)
    new_gti = new_hsat(ghi, timestamps, lat_deg=12.0)

    assert legacy_gti.shape == new_gti.shape, "shape drift"
    assert np.array_equal(legacy_gti, new_gti), (
        f"GTI diff: {(legacy_gti != new_gti).sum()} of {legacy_gti.size} hours differ"
    )


def test_annual_gti_from_ghi_hsat_parity(legacy_solar):
    """Annual-total wrapper bit-exact match."""
    _, legacy_annual, _ = legacy_solar
    from pvlayout_core.core.solar_transposition import annual_gti_from_ghi_hsat as new_annual

    timestamps, ghi = _synthetic_ghi_year(year=2024, lat_deg=12.0)
    legacy_total = legacy_annual(ghi, timestamps, lat_deg=12.0)
    new_total = new_annual(ghi, timestamps, lat_deg=12.0)

    assert math.isclose(legacy_total, new_total, abs_tol=1e-9), (
        f"annual GTI drift: legacy {legacy_total} vs new {new_total}"
    )


@pytest.mark.parametrize("is_sat", [False, True])
@pytest.mark.parametrize("year", [2024, 2023])   # leap + non-leap
def test_generate_synthetic_hourly_gti_parity(legacy_solar, is_sat, year):
    """Synthetic-GTI generator bit-exact match on both FT and SAT branches,
    leap and non-leap years."""
    _, _, legacy_synth = legacy_solar
    from pvlayout_core.core.solar_transposition import generate_synthetic_hourly_gti as new_synth

    monthly = [120.0, 130.0, 145.0, 150.0, 160.0, 155.0,
               150.0, 150.0, 145.0, 140.0, 130.0, 125.0]
    legacy_ts, legacy_gti = legacy_synth(
        lat_deg=12.0, monthly_gti_kwh_m2=monthly, year=year, is_sat=is_sat,
    )
    new_ts, new_gti = new_synth(
        lat_deg=12.0, monthly_gti_kwh_m2=monthly, year=year, is_sat=is_sat,
    )

    assert legacy_ts == new_ts, f"timestamps drift (year={year}, is_sat={is_sat})"
    assert len(legacy_gti) == len(new_gti), (
        f"GTI len drift: legacy {len(legacy_gti)} vs new {len(new_gti)}"
    )
    legacy_arr = np.asarray(legacy_gti)
    new_arr = np.asarray(new_gti)
    assert np.allclose(legacy_arr, new_arr, atol=1e-9, rtol=0.0), (
        f"GTI value drift (year={year}, is_sat={is_sat}): "
        f"max abs diff {np.abs(legacy_arr - new_arr).max()}"
    )
```

**Test count:** 1 smoke + 1 hsat parity + 1 annual parity + 4 synthetic-generator parametrized (2 is_sat × 2 year) = **7 tests** → 86 → **93 passed** expected.

**Tolerances:**
- `np.array_equal` for `ghi_to_gti_hsat` (pure math, no FP-order tricks expected → bit-exact)
- `1e-9` abs tol for the synthetic generator and annual wrapper (defensive against any numpy summation order differences across builds)

### 2.3 `docs/parity/findings/2026-04-29-003-solar-transposition-port.md` — new

Discovery memo. Sections: (i) what landed, (ii) algorithm summary (HSAT physics: ideal-angle eq. 1, AOI eq. 2, Erbs decomposition, Hay-Davies isotropic with β=|θ_T|, synthetic generator's clear-sky AOI + monthly scaling), (iii) Open Questions for end-of-port review.

### 2.4 `docs/PLAN.md`

Row #7 → **done**, status bump `6 / 12 done.` → `7 / 12 done.`

## 3. Acceptance

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q
```

- All existing tests still pass (86 passed remains the floor).
- 7 new tests pass.
- Expected total: **93 passed**, 6 skipped, 0 failed.
- Discovery memo committed.

## 4. Risks

- **FP nondeterminism across libm versions.** Pure Python `math.sin/cos` and Erbs polynomial evaluation could in principle produce ULP-level differences across CPU architectures. The test runs both sides in the same process so libm is shared — this risk is theoretical.
- **`np.array_equal` strictness.** If the legacy implementation uses `numpy` for any vectorised op while the new app uses scalar `math.*` (or vice versa), order of float ops changes → bit-different. Reading the diff: both sides use scalar `math.*` inside the for-loop, then return `np.asarray(...)` at the end — should be bit-equal. Mitigation: if `np.array_equal` fails, switch to `np.allclose(rtol=0, atol=1e-12)`.
- **Synthetic GHI exercising edge cases.** Test inputs hit night hours (GHI=0 → loop continues), winter solstice (low cos_theta_z), summer solstice (high cos_theta_z). Edge case coverage: implicit; the year-long synthetic input visits every solar geometry case at the test latitude.
- **Test runtime.** ~7 tests × 8760-8784 hours × pure-math loop ≈ 1–3 seconds total. Acceptable.

## 5. Out of scope

- **`energy_calculator.py` consumers** — row #8 (T3) ports the energy calculator that calls these functions.
- **Frontend / sidecar route** — transposition is an internal pipeline computation; no UI or HTTP surface in this row.
- **Real PVGIS hourly fixture** — synthetic input is hermetic and sufficient for parity.
- **Refinements to algorithm constants** (albedo=0.20, fd=0.35, max_angle_deg=55, Rb clamp=5.0) — gated on Prasanta's end-of-port review.
- **Pydantic / TS types** — no wire-schema impact (transposition is internal).
- **PyQt `gui/energy_timeseries_window.py`** — frontend is React; not a parity row.

## 6. Implementation order (for the implementation plan)

1. Pre-flight: confirm legacy at `baseline-v1-20260429`; pytest baseline 86 passed.
2. Append legacy lines 167–437 to `pvlayout_core/core/solar_transposition.py`.
3. Sanity-test the new functions: import, call with synthetic inputs.
4. Add `tests/parity/test_solar_transposition_parity.py`.
5. Run isolated parity test; investigate any FP drift via tolerance loosening if needed.
6. Run `uv run pytest tests/ -q` from `python/pvlayout_engine/`. Expect 93 passed, 6 skipped, 0 failed.
7. Draft discovery memo at `docs/parity/findings/2026-04-29-003-solar-transposition-port.md`.
8. Flip `docs/PLAN.md` row #7 + status count.
9. Commit: `parity: row #7 — solar transposition (HSAT GHI→GTI)`.

One atomic commit on `main`.

## 7. Cross-references

- [`docs/PLAN.md`](../../PLAN.md) row #7.
- [`docs/superpowers/specs/2026-04-29-row-1-project-model-fields-design.md`](2026-04-29-row-1-project-model-fields-design.md) — added `EnergyParameters.is_sat` and `sat_max_angle_deg` (consumed by row #7's HSAT functions when called by row #8's energy calculator).
- [`docs/superpowers/specs/2026-04-29-row-5-satellite-water-detector-design.md`](2026-04-29-row-5-satellite-water-detector-design.md) — `sys.path` bootstrap fixture pattern reused.
- [`python/pvlayout_engine/tests/parity/test_satellite_water_detector_parity.py`](../../../python/pvlayout_engine/tests/parity/test_satellite_water_detector_parity.py) — bit-exact parity test pattern reused.
- Legacy source at `/Users/arunkpatra/codebase/PVlayout_Advance/core/solar_transposition.py` on branch `baseline-v1-20260429`.
- New project target at `/Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/solar_transposition.py`.
