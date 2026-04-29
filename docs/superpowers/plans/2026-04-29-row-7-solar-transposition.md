# Row #7 — Solar transposition (HSAT GHI→GTI) (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Append three new public functions (`ghi_to_gti_hsat`, `annual_gti_from_ghi_hsat`, `generate_synthetic_hourly_gti`) to `pvlayout_core/core/solar_transposition.py`, ported verbatim from legacy. Add a bit-exact parity test on synthetic GHI inputs and a deferred-review discovery memo.

**Architecture:** Single atomic commit on `main`. Purely additive port — existing `ghi_to_gti` (fixed-tilt) + `annual_gti_from_ghi` stay unchanged; three new functions appended after them. Parity test follows the row #5 `_water_mask` bit-exact pattern.

**Tech Stack:** Python 3.12, `numpy`, stdlib `math` + `datetime`. Pure functions, no I/O. Legacy reference at `/Users/arunkpatra/codebase/PVlayout_Advance` branch `baseline-v1-20260429`.

**Spec:** [`docs/superpowers/specs/2026-04-29-row-7-solar-transposition-design.md`](../specs/2026-04-29-row-7-solar-transposition-design.md) (committed `7830e7a`).

**Tier:** T3 (per [`docs/PLAN.md`](../../PLAN.md)) — port + bit-exact parity test + deferred-review memo. **No per-row Prasanta gate** per the 2026-04-29 policy.

---

## File structure

**Modify:**
- `python/pvlayout_engine/pvlayout_core/core/solar_transposition.py` — append legacy lines 167–437 (3 new functions, ~270 lines) after the existing `annual_gti_from_ghi`

**Create:**
- `python/pvlayout_engine/tests/parity/test_solar_transposition_parity.py` — bit-exact parity via `sys.path` bootstrap (7 tests)
- `docs/parity/findings/2026-04-29-003-solar-transposition-port.md` — discovery memo

**Modify:**
- `docs/PLAN.md` — flip row #7 to **done**, bump 6 → 7 / 12

---

## Pre-flight

- [ ] **Step 0: Confirm legacy at baseline branch**

Run:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
```

Expected:

```
baseline-v1-20260429
397aa2ab460d8f773376f51b393407e5be67dca0
```

If wrong, run `git -C /Users/arunkpatra/codebase/PVlayout_Advance checkout baseline-v1-20260429`. If SHA has advanced, surface — re-baseline conversation needed.

- [ ] **Step 1: Confirm pytest baseline is 86 passed**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: a line ending with `86 passed, 6 skipped`.

If venv lost dev extras (e.g., `uv sync` without `--extra dev`), restore:

```bash
uv sync --extra dev
```

- [ ] **Step 2: Confirm legacy has the three target functions**

Run:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git show baseline-v1-20260429:core/solar_transposition.py | grep -E "^def " | grep -E "ghi_to_gti_hsat|annual_gti_from_ghi_hsat|generate_synthetic_hourly_gti"
```

Expected (3 lines):

```
def ghi_to_gti_hsat(
def annual_gti_from_ghi_hsat(
def generate_synthetic_hourly_gti(
```

If any is missing, the legacy SHA is wrong — surface.

---

## Task 1: Append three functions verbatim from legacy

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/solar_transposition.py`

The current new-app file ends at line 166 with `annual_gti_from_ghi`. We append legacy lines 167–437 (everything after `annual_gti_from_ghi` in legacy) verbatim.

- [ ] **Step 1: Extract legacy's appended block to a temp file**

Run from repo root:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git show baseline-v1-20260429:core/solar_transposition.py | sed -n '167,437p' > /tmp/row7_legacy_append.py
wc -l /tmp/row7_legacy_append.py
```

Expected: a line count of `271` (lines 167 through 437 inclusive).

- [ ] **Step 2: Confirm the new app's file currently ends at line 166**

Run:

```bash
wc -l /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/solar_transposition.py
tail -5 /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/solar_transposition.py
```

Expected:

```
166 .../pvlayout_core/core/solar_transposition.py
```

with the last 5 lines showing the tail of `annual_gti_from_ghi` (currently the `return float(gti.sum()) / 1000.0` line and the closing of that function).

If line count is something other than 166, surface — the file may have been touched between row #6 and now.

- [ ] **Step 3: Append the legacy block**

Run:

```bash
cat /tmp/row7_legacy_append.py >> /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/solar_transposition.py
wc -l /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/solar_transposition.py
```

Expected: line count is now `437` (166 + 271).

- [ ] **Step 4: Verify the diff is purely additive**

Run from repo root:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git show baseline-v1-20260429:core/solar_transposition.py | diff - /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/solar_transposition.py | head -30
```

Expected: the diff shows ONLY the existing fixed-tilt section header / imports differing between the two files (e.g., the new app may already have slightly different docstring opening or import ordering from row #5/#6 work). The bottom 271 lines (the appended block) should match legacy verbatim.

If the diff shows unexpected changes in the LEGACY-MATCHING SECTION (i.e., lines after the existing `annual_gti_from_ghi`), the append picked up garbage — investigate.

Acceptable diff sources (all in the FIRST half, lines 1–166):
- New-app docstring may differ from legacy's
- Import order may differ
- Existing `ghi_to_gti` body may differ from legacy's pre-baseline version (the new app has its own implementation predating the baseline)

- [ ] **Step 5: Verify the module imports cleanly with all 5 functions**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.core.solar_transposition import (
    ghi_to_gti, annual_gti_from_ghi,
    ghi_to_gti_hsat, annual_gti_from_ghi_hsat, generate_synthetic_hourly_gti,
)
print('all 5 callable:', all(callable(f) for f in [
    ghi_to_gti, annual_gti_from_ghi,
    ghi_to_gti_hsat, annual_gti_from_ghi_hsat, generate_synthetic_hourly_gti,
]))
"
```

Expected:

```
all 5 callable: True
```

If `ImportError`, the appended block has a syntax error or missing import. Re-read the file's tail vs `/tmp/row7_legacy_append.py`.

- [ ] **Step 6: Sanity-call each new function**

Run:

```bash
uv run python -c "
import math
from datetime import datetime, timedelta
from pvlayout_core.core.solar_transposition import (
    ghi_to_gti_hsat, annual_gti_from_ghi_hsat, generate_synthetic_hourly_gti,
)

# 24-hour synthetic GHI for a single day
ts, ghi = [], []
cur = datetime(2024, 6, 21, 0, 30)
for _ in range(24):
    hour = cur.hour + 0.5
    diurnal = max(0.0, math.cos((hour - 12.0) * math.pi / 12.0))
    ghi.append(900.0 * diurnal)
    ts.append(cur.strftime('%Y-%m-%d %H:%M'))
    cur += timedelta(hours=1)

gti = ghi_to_gti_hsat(ghi, ts, lat_deg=12.0)
print('hsat shape:', gti.shape)
print('hsat noon GTI:', round(float(gti[12]), 1), 'W/m2')

annual = annual_gti_from_ghi_hsat(ghi, ts, lat_deg=12.0)
print('annual_total kWh/m2 (1 day):', round(annual, 3))

ts_year, gti_year = generate_synthetic_hourly_gti(
    lat_deg=12.0,
    monthly_gti_kwh_m2=[120.0]*12,
    year=2024,
)
print('synth len:', len(gti_year), 'first ts:', ts_year[0])
"
```

Expected (numbers approximate; goal is no exception + sane shapes):

```
hsat shape: (24,)
hsat noon GTI: <float around 700-900>
annual_total kWh/m2 (1 day): <float around 5-7>
synth len: 8784 first ts: 2024-01-01 00:30
```

Note: 2024 is a leap year → 8784 hours. If `synth len` is 8760, the leap-year branch in `generate_synthetic_hourly_gti` is wrong — investigate.

---

## Task 2: Add the parity test

**Files:**
- Create: `python/pvlayout_engine/tests/parity/test_solar_transposition_parity.py`

- [ ] **Step 1: Create the test file**

Write the entire file:

```python
"""
Parity test for solar transposition (Row #7 of docs/PLAN.md).

Bit-exact comparison against legacy on synthetic GHI / monthly inputs.
Pure functions, no I/O — deterministic across runs.
"""

from __future__ import annotations

import math
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest


LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")


def _purge_legacy_modules():
    """Remove cached bare-namespace modules so legacy and new-app
    namespaces don't collide."""
    for m in list(sys.modules):
        if m == "core" or m.startswith("core."):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_solar():
    """Module-scoped: bound the sys.path mutation to this test module's lifetime."""
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

- [ ] **Step 2: Run the parity test in isolation**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/parity/test_solar_transposition_parity.py -v 2>&1 | tail -15
```

Expected: 7 passed:

```
tests/parity/test_solar_transposition_parity.py::test_solar_transposition_module_importable PASSED
tests/parity/test_solar_transposition_parity.py::test_ghi_to_gti_hsat_bit_exact_parity PASSED
tests/parity/test_solar_transposition_parity.py::test_annual_gti_from_ghi_hsat_parity PASSED
tests/parity/test_solar_transposition_parity.py::test_generate_synthetic_hourly_gti_parity[2024-False] PASSED
tests/parity/test_solar_transposition_parity.py::test_generate_synthetic_hourly_gti_parity[2024-True] PASSED
tests/parity/test_solar_transposition_parity.py::test_generate_synthetic_hourly_gti_parity[2023-False] PASSED
tests/parity/test_solar_transposition_parity.py::test_generate_synthetic_hourly_gti_parity[2023-True] PASSED
```

If `test_ghi_to_gti_hsat_bit_exact_parity` fails with `np.array_equal` returning False, capture the max abs diff via:

```bash
uv run python -c "
import sys, math
from datetime import datetime, timedelta
import numpy as np
sys.path.insert(0, '/Users/arunkpatra/codebase/PVlayout_Advance')
for m in list(sys.modules):
    if m == 'core' or m.startswith('core.'):
        del sys.modules[m]
from core.solar_transposition import ghi_to_gti_hsat as legacy_hsat

ts, ghi = [], []
cur = datetime(2024, 1, 1, 0, 30)
for _ in range(24):
    ts.append(cur.strftime('%Y-%m-%d %H:%M'))
    ghi.append(500.0)
    cur += timedelta(hours=1)
print('legacy:', legacy_hsat(ghi, ts, lat_deg=12.0)[10:14])
del sys.modules['core.solar_transposition']
sys.path.remove('/Users/arunkpatra/codebase/PVlayout_Advance')
from pvlayout_core.core.solar_transposition import ghi_to_gti_hsat as new_hsat
print('new:   ', new_hsat(ghi, ts, lat_deg=12.0)[10:14])
"
```

If max abs diff is < 1e-12, change the test from `np.array_equal` to `np.allclose(..., atol=1e-12, rtol=0)` — bit-exactness was wishful thinking; ULP-level difference is acceptable. If max abs diff > 1e-9, the port has a bug — re-read Task 1.

---

## Task 3: Run the full pytest suite

**Files:**
- No edit. Acceptance check.

- [ ] **Step 1: Run the full suite**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: a line ending with `93 passed, 6 skipped`. (86 baseline + 7 new tests.)

If a different count, identify failures via `uv run pytest tests/ -q 2>&1 | grep -E "FAIL|ERROR"`. The new functions are pure additions with no consumers — there should be no regressions. If any pre-existing test fails, the appended code is shadowing or breaking something — investigate immediately.

---

## Task 4: Draft the discovery memo

**Files:**
- Create: `docs/parity/findings/2026-04-29-003-solar-transposition-port.md`

- [ ] **Step 1: Verify findings directory exists**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
ls docs/parity/findings/
```

Expected: shows `2026-04-29-001-kmz-autodetect-heuristics.md` and `2026-04-29-002-satellite-water-detector-port.md` from prior rows.

- [ ] **Step 2: Write the memo**

Create `docs/parity/findings/2026-04-29-003-solar-transposition-port.md`:

```markdown
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

Bit-exact `_water_mask`-style parity verified on 8760- and 8784-hour
synthetic GHI inputs in
`tests/parity/test_solar_transposition_parity.py` — all four
classifier rules + Erbs decomposition + Hay-Davies model produce
identical outputs to legacy.

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
```

- [ ] **Step 3: Spot-check the memo file**

Run:

```bash
ls -l docs/parity/findings/2026-04-29-003-solar-transposition-port.md
head -10 docs/parity/findings/2026-04-29-003-solar-transposition-port.md
```

Expected: file exists; the title line `# Finding #003 — Solar transposition (HSAT GHI→GTI) port` shows in the head output.

---

## Task 5: Flip PLAN.md status

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Update Row #7 status to `done`**

Find:

```markdown
| 7 | Solar transposition rewrite (HSAT GHI→GTI) | T3 | `core/solar_transposition.py` @ `9362083` | Parity transposition output match; discovery memo committed. | todo |
```

Replace with:

```markdown
| 7 | Solar transposition rewrite (HSAT GHI→GTI) | T3 | `core/solar_transposition.py` @ `9362083` | Parity transposition output match; discovery memo committed. | **done** |
```

- [ ] **Step 2: Bump the count in the header status line**

Change:

```markdown
**Status:** 6 / 12 done.
```

to:

```markdown
**Status:** 7 / 12 done.
```

---

## Task 6: Commit the row

**Files:**
- Stage and commit:
  - `python/pvlayout_engine/pvlayout_core/core/solar_transposition.py`
  - `python/pvlayout_engine/tests/parity/test_solar_transposition_parity.py`
  - `docs/parity/findings/2026-04-29-003-solar-transposition-port.md`
  - `docs/PLAN.md`

- [ ] **Step 1: Confirm only the expected files changed**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git status
```

Expected:

```
modified:   docs/PLAN.md
modified:   python/pvlayout_engine/pvlayout_core/core/solar_transposition.py

Untracked files:
        docs/parity/findings/2026-04-29-003-solar-transposition-port.md
        python/pvlayout_engine/tests/parity/test_solar_transposition_parity.py
```

If anything else is dirty, roll back the stray changes.

- [ ] **Step 2: Stage and commit**

Run:

```bash
git add python/pvlayout_engine/pvlayout_core/core/solar_transposition.py \
        python/pvlayout_engine/tests/parity/test_solar_transposition_parity.py \
        docs/parity/findings/2026-04-29-003-solar-transposition-port.md \
        docs/PLAN.md

git commit -m "$(cat <<'EOF'
parity: row #7 — solar transposition (HSAT GHI→GTI)

Append three new public functions to
pvlayout_core/core/solar_transposition.py, ported verbatim from
legacy @ baseline-v1-20260429 commit 9362083 (lines 167-437):

- ghi_to_gti_hsat: hour-by-hour transposition for a Horizontal
  Single-Axis Tracker (N-S rotation axis). Solar position → ideal
  tracking angle (eq. 1) clamped to ±max_angle → AOI on tracker
  surface (eq. 2) → Erbs diffuse decomposition → Hay-Davies
  isotropic tilt with instantaneous β = |θ_T|.

- annual_gti_from_ghi_hsat: wrapper for the annual total in
  kWh/m²/yr.

- generate_synthetic_hourly_gti: synthesises 8760/8784-hour GTI
  calibrated to monthly totals. Branches on is_sat (HSAT vs
  fixed-tilt geometry). Uses fixed fd=0.35 raw profile then
  per-month scaling.

Purely additive port — existing fixed-tilt ghi_to_gti and
annual_gti_from_ghi (lines 1-166) are unchanged.

New parity test tests/parity/test_solar_transposition_parity.py
asserts bit-exact match against legacy on 8760-/8784-hour synthetic
GHI arrays via sys.path bootstrap. 7 tests: smoke + ghi_to_gti_hsat
+ annual + 4 synthetic-generator parametrized (2 is_sat × 2 year
for leap + non-leap). All pure functions, no I/O, hermetic.

Sidecar pytest: 93 passed, 6 skipped, 0 failed (was 86).

T3 discovery memo at
docs/parity/findings/2026-04-29-003-solar-transposition-port.md
captures Erbs/Hay-Davies algorithm summary and 5 open questions
(albedo default, synthetic fd, max_angle default, hour-midpoint
convention, Rb clamp) for Prasanta's end-of-port review (no
per-row Prasanta gate per the 2026-04-29 policy).

No SAT consumers wired up yet — row #8 (energy_calculator.py port)
will call these functions when EnergyParameters.is_sat is True.

Spec: docs/superpowers/specs/2026-04-29-row-7-solar-transposition-design.md
Plan: docs/superpowers/plans/2026-04-29-row-7-solar-transposition.md
PLAN row: docs/PLAN.md row #7 (T3).
EOF
)" && git log -1 --stat
```

- [ ] **Step 3: Verify the commit landed**

Run:

```bash
git log --oneline -3
```

Expected:

```
<row7-sha>  parity: row #7 — solar transposition (HSAT GHI→GTI)
<plan-sha>  docs: implementation plan for PLAN row #7
<spec-sha>  docs: spec for PLAN row #7 — solar transposition (HSAT GHI→GTI)
```

---

## Acceptance recap (from `docs/PLAN.md` row #7)

`cd python/pvlayout_engine && uv run pytest tests/ -q` → 93 passed, 6 skipped, 0 failed.
Bit-exact `_water_mask`-style parity for all three new functions against legacy on synthetic GHI inputs.
Discovery memo committed.

Met by Task 3 (full suite) + Task 2 Step 2 (parity isolated); memo by Task 4.

---

## Out of scope (deferred to later rows / post-parity)

- **`energy_calculator.py` consumers** — row #8 ports.
- **Frontend / sidecar route** — transposition is internal pipeline; no UI surface.
- **Real PVGIS hourly fixture** — synthetic input is hermetic and sufficient.
- **Refinements to algorithm constants** — gated on Prasanta's end-of-port review.
- **Pydantic / TS types** — no wire-schema impact.
- **PyQt `gui/energy_timeseries_window.py`** — frontend is React; not a parity row.
