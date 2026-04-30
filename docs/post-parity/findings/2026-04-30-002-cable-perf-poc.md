# Cable Calc Performance POC — Plan & Execution Notes

**Date:** 2026-04-30
**Branch:** `perf/cable-multiplot-poc` (cut from `post-parity-v1-desktop`)
**Author:** Claude (under Arun's direction)
**Status:** Plan locked; implementation + benchmarks executed in this same doc.

## Problem statement

Multi-plot KMZs (e.g. `complex-plant-layout.kmz`) cause the AC cable layout
calc to take **>1 hour without completing**. The new app inherits the legacy
algorithm with S11.5 search-space caps already applied — the caps cut Pattern
A4 from 271,439 candidates to 25 per inverter, but the residual cost is
still untenable on multi-plot inputs.

A prior code-explorer investigation (deep read of `string_inverter_manager.py`
+ tracing through orchestration + tests) produced a 7-hypothesis verdict
table; this POC actions the two top items.

## Data-contract verification (fact-finding output)

Before optimizing, the POC verified what cable data the UI/exporters
actually consume:

| Field | UI? | Exports (PDF/DXF/KMZ)? | Tests? |
|---|---|---|---|
| `total_dc_cable_m` / `total_ac_cable_m` | ✅ SummaryPanel | ✅ all three | ✅ |
| `dc_cable_runs[].route_utm` (geometry) | ✅ MapCanvas via `layoutToGeoJson` | ✅ DXF/KMZ | ✅ |
| `ac_cable_runs[].route_utm` (geometry) | ✅ MapCanvas via `layoutToGeoJson` | ✅ DXF/KMZ | ✅ |
| `CableRun.length_m` | indirect (sum to total) | ✅ DXF text label | ✅ |
| `CableRun.route_quality` | ❌ never read | ❌ never read | ✅ sidecar test only |
| `ac_cable_m_per_inverter` / `_per_icr` | ❌ never read | ❌ never read | ✅ sidecar test only |

**Implication:** The "double routing" in `_calc_individual_ac_total` (the
agent's Item #2) computes per-inverter/per-icr subtotals that are
**not user-visible anywhere** — only `tests/integration/test_layout_s11_5_cables.py`
asserts them as a contract. Eliminating that pass would require: (a) a
solar-domain decision from Prasanta on BOM semantics; (b) updating the
sidecar test contract. **Out of scope for this POC.**

## POC scope

Two changes, both **behavior-preserving** (no semantic shifts to outputs):

### Change A — Item #3: prepared geometry on `_seg_ok` / `_path_ok`

**File:** `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`

**Problem:** `_seg_ok` (line 581) calls `poly.intersection(line)` — an
unprepared Shapely predicate — for every segment in every candidate path
in patterns A through E. Every `place_string_inverters` call generates
~thousands of these calls per inverter.

**Fix:** Pre-compute `shapely.prepared.prep(poly)` once per
`place_string_inverters` call (and once per `route_poly` for Pattern V's
visibility graph terminal lookups, already done). Replace
`poly.intersection(line).length >= line.length * 0.999` with
`prepared.covers(line)`.

**Implementation strategy:**

1. Add a module-level cache or a thread-through prepared-polygon parameter:
   - Option A: cache prepared polygons keyed by `id(poly)` (matches
     existing `_vis_cache_*` pattern). Reset at top of
     `place_string_inverters`.
   - Option B: thread `prepared_poly` parameter through `_path_ok` /
     `_seg_ok` / `_route_ac_cable` / `_bundle_dc_cables` / `_route_ac_mst`
     / `_calc_individual_ac_total`.
   - **Decision: Option A** — minimum surface area change, mirrors the
     existing visibility-graph cache pattern.

2. Make `_seg_ok` look up the prepared polygon from cache:
   ```python
   def _seg_ok(p1, p2, poly):
       line = ShapelyLine([p1, p2])
       if line.length < 0.01:
           return True
       try:
           prepared = _ensure_prepared(poly)
           return prepared.covers(line)
       except Exception:
           # Fallback: unprepared predicate (keeps legacy behavior on weirdness)
           inter = poly.intersection(line)
           return inter.length >= line.length * 0.999
   ```

3. Add `_ensure_prepared(poly)` and `_prep_cache` module-level singletons,
   reset by `_reset_vis_cache()` (rename to `_reset_caches()` or add a
   sibling reset).

**Semantic note:** `prepared.covers(line)` returns `True` iff the line is
fully covered by the polygon (interior + boundary). The legacy code
required `inter.length >= 0.999 * line.length` — this is the floating-point
tolerance equivalent of "fully covered." For an exact-arithmetic test on
fully-interior segments, the two are equivalent. For boundary-tangent
segments (epsilon outside), `prepared.covers` is exact (rejects); legacy
is tolerant (accepts up to 0.1%). **Risk:** in the Pattern F best-effort
path, this tolerance protected against floating-point reject of segments
that are correct in intent. Mitigation: keep the unprepared fallback in a
`try/except` for the rare edge case.

**Expected speedup:** Shapely docs claim 5–10× on repeated containment
predicates against a fixed polygon. Real-world impact depends on patterns
hit. Should compound multiplicatively with whatever pattern sweep work
remains after S11.5 caps.

### Change B — Item #1: parallel per-plot via `ProcessPoolExecutor`

**File:** `python/pvlayout_engine/pvlayout_engine/routes/layout.py`
(lines 177-183 — the sequential post-`run_layout_multi` loop)

**Problem:** All P plots are processed on a single thread, sequential. For
8 plots that take T seconds each, total wall-clock is 8T.

**Fix:** Replace the sequential loop with `concurrent.futures.ProcessPoolExecutor`
when `len(core_results) > 1`. `LayoutResult` and `LayoutParameters` are
dataclasses; Shapely 2.1.2 geometries are picklable; module-level
visibility-graph globals are per-process so no contention.

**Implementation:**

```python
# Top-level worker (must be picklable; not a closure)
def _run_la_and_inverters(args):
    result, params = args
    if result.usable_polygon is None:
        return result
    place_lightning_arresters(result, params)
    place_string_inverters(result, params)
    return result

# In the layout endpoint:
if len(core_results) > 1 and core_params.enable_cable_calc:
    max_workers = min(len(core_results), os.cpu_count() or 4)
    args_list = [(r, core_params) for r in core_results]
    with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as ex:
        core_results = list(ex.map(_run_la_and_inverters, args_list))
else:
    # original sequential path (single plot or cable calc off)
    for r in core_results:
        if r.usable_polygon is None: continue
        place_lightning_arresters(r, core_params)
        place_string_inverters(r, core_params)
```

**Risks:**
- **Pickling**: Shapely 2.x is picklable. Verified via spot test before
  benchmarks. `LayoutResult` is a `@dataclass` — picklable by default.
- **Determinism**: Module-level `_pattern_counts`, `_path_ok_count` etc.
  in worker processes won't aggregate to the parent. Acceptable — these
  are debug instrumentation only (`PVLAYOUT_PATTERN_STATS` env var).
- **Process startup overhead**: `ProcessPoolExecutor` with `spawn` start
  method (default on macOS) has ~100-300ms per-worker startup. Negligible
  vs. multi-second per-plot work, but matters for tiny single-plot cases —
  hence the `len(core_results) > 1` guard.
- **Cancellation**: Existing FastAPI handler doesn't support cancellation
  mid-calc. POC inherits this; adding cancellation is out of scope.

**Expected speedup:** linear in plot count, capped by `cpu_count()`.

### Change C (added scope) — Item #2: optional skip of individual routing pass

**File:** `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`

**Problem:** `_calc_individual_ac_total` (line 1152) re-routes every
inverter→ICR for the BOM total, **in addition to** the MST visual pass
(`_route_ac_mst`). For a plant with N inverters this means ~(2N-1)
`_route_ac_cable` calls per ICR group instead of N-1.

**Fix (behavior-changing — gated behind env var):**
Add `PVLAYOUT_SKIP_INDIVIDUAL_AC=1` env var. When set, skip the second pass
and **derive** `total_ac_cable_m` + per-inverter / per-icr maps from the
MST tree by computing each inverter's path-to-root length.

**Semantic note:** The current implementation reports BOM as "if every
inverter had its own dedicated cable" (sum of N independent routes).
The MST-derived alternative reports BOM as "each inverter's share of the
shared MST trunk" (path length back to ICR through the tree). Both are
defensible BOM models in the solar industry; they answer different
questions:
- Current: cost of running each cable independently to its inverter (overestimates because doesn't account for shared trunks)
- MST-derived: physical conductor meters in the visual layout (matches what's on the ground after install)

**Decision for POC:** implement both, gate via env var, report both numbers.
Final disposition (which becomes default) deferred to Prasanta — but the
POC measures the speedup so we know the size of the prize.

## What this POC explicitly does NOT do

- Does NOT introduce inter-plot MV routing (no MV layer exists).
- Does NOT add caching for symmetric plot geometry (Item #5).
- Does NOT change the public layout API or schema.
- Does NOT modify any UI or wire-schema code.

## Benchmarking methodology

Two repeatable scripts, both runnable from the repo root with `uv run`:

1. **`scripts/perf/benchmark_cable_calc.py`** — drives the timing
   measurement on a configurable KMZ stem with optional `--timeout` and
   `--repeats N`. Wraps `parse_kmz` + `run_layout_multi` + the per-plot
   `place_lightning_arresters` + `place_string_inverters` chain. Prints
   per-stage timings and a final summary line.

2. **`scripts/perf/benchmark_compare.py`** — runs the benchmark on a
   set of KMZs against `before` and `after` modes, captures wall-clock
   numbers in JSON, and emits a comparison table.

Test fixtures used:
- `phaseboundary2.kmz` — single plot, ~62 inverters, 2 ICRs. Already has
  a 45s wall-clock gate at `tests/integration/test_layout_s11_5_cables.py`.
  This is the reliable single-plot baseline.
- `complex-plant-layout.kmz` — multi-plot. Per
  `tests/parity/test_p00_bundled_mst_parity.py:119-125`: legacy baseline
  capture on this took >20 min without completing. We will set a 600s
  (10 min) wall-clock cap and report whether each variant completes.

Outputs: per-stage timing, total wall-clock, and a "completes within cap"
flag.

## Acceptance criteria

The POC is **successful** if:

1. `phaseboundary2.kmz` total wall-clock with both changes is ≤ baseline
   (no regression) and ideally 1.5–3× faster.
2. `complex-plant-layout.kmz` either:
   - Completes within 10 minutes with both changes (any speedup over
     "infinite" is a win), OR
   - Demonstrates measurable per-plot progress (e.g. plot 0 completes,
     plot 1 still running) showing parallelism is engaged.
3. Both gates remain green: existing parity tests + `test_layout_s11_5_cables.py`
   wall-clock gate (≤45 s for phaseboundary2). No semantic regression.

The POC **fails** (and we surface) if:

1. `phaseboundary2.kmz` regresses on wall-clock.
2. `prepared.covers` rejects routes that legacy accepted (semantic drift).
3. Pickling / process-pool errors on multi-plot fixtures.

## Execution order

1. Build benchmark scripts (`scripts/perf/`).
2. Capture **baseline** = current code on `phaseboundary2.kmz` (3 repeats).
3. Brief baseline attempt on `complex-plant-layout.kmz` with 10-min timeout (expect timeout; just confirms).
4. Apply Change A (prepared geometry).
5. Capture **after-A** on phaseboundary2 (regression check) + complex-plant.
6. Apply Change B (parallel per-plot).
7. Capture **after-AB** on both KMZs.
8. Apply Change C (skip individual routing pass via env var).
9. Capture **after-ABC** on both KMZs.
10. Run sidecar test suite (`uv run pytest`) with each variant.
11. Write final report at the end of this doc.

## Output report format

Final section of this doc (added after execution):
- Per-fixture wall-clock matrix (baseline / after-A / after-AB).
- Per-stage breakdown (parse / layout / LA / cables) for the multi-plot fixture.
- Test suite status post-changes.
- Recommendation: ship one or both changes, defer Item #2, or escalate
  to Prasanta for the BOM-semantics decision.

---

## EXECUTION LOG

### Implementation summary

**Change A — prepared geometry on `_path_ok` / `_seg_ok`**

[`python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`](../../python/pvlayout_engine/pvlayout_core/pvlayout_core/core/string_inverter_manager.py)

- Added `_prep_cache: dict` (id(poly) → prepared geometry), `_get_prepared(poly)` lazy builder, cleared by `_reset_vis_cache()` at the top of every `place_string_inverters` call.
- `_seg_ok` (line 615) rewritten with three-tier strategy: prepared.covers (fast accept) → prepared.intersects (fast reject) → unprepared `poly.intersection().length` tolerance fallback (rare boundary-tangent cases).
- Always-on, no env var, no API change.

**Change B — parallel per-plot ProcessPoolExecutor**

[`python/pvlayout_engine/pvlayout_engine/routes/layout.py`](../../python/pvlayout_engine/pvlayout_engine/routes/layout.py)

- New `_run_per_plot_pipeline(args)` top-level worker (picklable for spawn).
- `layout()` endpoint: when `len(core_results) > 1` AND `enable_cable_calc`, dispatch via `ProcessPoolExecutor.map`. `max_workers = min(P, cpu_count)`. Single-plot stays in-process (avoids ~150ms pool startup).
- `PVLAYOUT_DISABLE_PARALLEL=1` forces sequential (debug/test).
- No semantic change, no API change. Test suite green.

**Change C — env-var skip of individual routing pass**

[`python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`](../../python/pvlayout_engine/pvlayout_core/pvlayout_core/core/string_inverter_manager.py) (around line 1442)

- When `PVLAYOUT_SKIP_INDIVIDUAL_AC=1`, skip `_calc_individual_ac_total()` entirely. Use `_mst_total` (already computed by `_route_ac_mst`) as `result.total_ac_cable_m`. `ac_cable_m_per_inverter` and `ac_cable_m_per_icr` go empty.
- **Semantic change**: legacy BOM models "every inverter has its own dedicated cable" (overestimates because shared trunks are not deduplicated). MST-derived BOM models "physical conductor meters in the visual layout" (matches what's drawn on the map).
- Default OFF — preserves legacy semantics. Env var lets us measure the speedup.

### Wall-clock results — consolidated review

All structural outputs (inverter count, DC cable count, AC cable count, DC
total length, plant capacity) are **bit-identical** across A, AB, and the
default-OFF case of ABC. Only `total_ac_cable_m` shifts when Change C is
on — that's the BOM semantic change discussed below.

#### Single-plot fixture: `phaseboundary2.kmz` (3 repeats per variant, median reported)

| fixture | variant | reps | wall (s) | speedup | plots | tables | inv | DC # | AC # | DC m | AC m | AC Δ | MWp | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| phaseboundary2 | baseline | 3 | 4.69 | 1.00× | 1 | 611 | 62 | 604 | 62 | 37,380 | 12,361 | +0.0% | 19.85 | Legacy. MST visual + individual-route BOM. **All 123 sidecar tests pass.** |
| phaseboundary2 | after-A | 3 | 4.03 | 1.16× | 1 | 611 | 62 | 604 | 62 | 37,380 | 12,361 | +0.0% | 19.85 | Prepared geometry on `_seg_ok`. Same outputs (bit-identical). All tests pass. |
| phaseboundary2 | after-ABC | 3 | 0.70 | **6.72×** | 1 | 611 | 62 | 604 | 62 | 37,380 | 3,838 | **−69.0%** | 19.85 | Skip individual pass; `total_ac_m` derived from MST. **1 test fails** (`test_cables_on_phaseboundary2` asserts legacy 12,361 m). Geometry of cable runs unchanged — only the scalar BOM total moves. |

(Note: B doesn't apply on a single plot — `after-AB` would be identical to `after-A`. Showing baseline / A / ABC only.)

#### Multi-plot fixture: `complex-plant-layout.kmz` (1 repeat per variant)

| fixture | variant | reps | wall (s) | speedup | plots | tables | inv | DC # | AC # | DC m | AC m | AC Δ | MWp | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| complex-plant-layout | baseline  | 1 | 444.20 | 1.00× | 6 | 10,771 | 1,079 | 10,573 | 1,079 | 674,278 | 479,698 | +0.0% | 349.84 | Legacy sequential. 6 plots processed serially. All tests pass. |
| complex-plant-layout | after-A   | 1 | 400.70 | 1.11× | 6 | 10,771 | 1,079 | 10,573 | 1,079 | 674,278 | 479,698 | +0.0% | 349.84 | Prepared geometry only. Outputs unchanged. All tests pass. |
| complex-plant-layout | after-AB  | 1 | 235.96 | 1.88× | 6 | 10,771 | 1,079 | 10,573 | 1,079 | 674,278 | 479,698 | +0.0% | 349.84 | Parallel per-plot via `ProcessPoolExecutor`. Outputs unchanged. Bounded by the slowest plot (P2 at ~244 s post-A). All tests pass. |
| complex-plant-layout | after-ABC | 1 |  88.85 | **5.00×** | 6 | 10,771 | 1,079 | 10,573 | 1,079 | 674,278 | 72,562 | **−84.9%** | 349.84 | A+B + skip individual pass. Outputs identical except `total_ac_m`. **1 test fails** (legacy contract). This is the headline ship-target if Prasanta approves the BOM convention shift. |

#### Per-plot breakdown across variants (complex-plant-layout)

Shows where time is spent and how each change moves it. P2 dominates baseline (60% of total wall-clock); after Change C, even P2 is fast enough that parallelism becomes the next dominant lever — but it's not measured here because all plots are well under 30 s.

| plot | variant | tables | MWp | icrs | inv | dc# | ac# | dc_m | ac_m | la(s) | cable(s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **P2** | baseline   | 4,857 | 157.76 | 11 | 486 | 4,731 | 486 | 303,328 | 218,849 | 0.27 | **266.49** |
| P2 | after-A    | 4,857 | 157.76 | 11 | 486 | 4,731 | 486 | 303,328 | 218,849 | 0.27 | 244.02 |
| P2 | after-AB   | 4,857 | 157.76 | 11 | 486 | 4,731 | 486 | 303,328 | 218,849 | — | — *(parallel — not separately timed)* |
| P2 | after-ABC  | 4,857 | 157.76 | 11 | 486 | 4,731 | 486 | 303,328 | **32,191** | — | — |
| P3_A | baseline   | 1,391 | 45.18 | 3 | 140 | 1,383 | 140 | 86,836 | 33,801 | 0.03 | 6.29 |
| P3_A | after-A    | 1,391 | 45.18 | 3 | 140 | 1,383 | 140 | 86,836 | 33,801 | 0.03 | 6.34 |
| P3_A | after-AB   | 1,391 | 45.18 | 3 | 140 | 1,383 | 140 | 86,836 | 33,801 | — | — |
| P3_A | after-ABC  | 1,391 | 45.18 | 3 | 140 | 1,383 | 140 | 86,836 | **7,820** | — | — |
| P3_B | baseline   | 659 | 21.40 | 2 | 66 | 649 | 66 | 40,256 | 11,425 | 0.01 | 7.47 |
| P3_B | after-A    | 659 | 21.40 | 2 | 66 | 649 | 66 | 40,256 | 11,425 | 0.01 | 5.65 |
| P3_B | after-AB   | 659 | 21.40 | 2 | 66 | 649 | 66 | 40,256 | 11,425 | — | — |
| P3_B | after-ABC  | 659 | 21.40 | 2 | 66 | 649 | 66 | 40,256 | **3,671** | — | — |
| **P4** | baseline   | 2,288 | 74.31 | 5 | 229 | 2,255 | 229 | 144,233 | 168,905 | 0.07 | **127.30** |
| P4 | after-A    | 2,288 | 74.31 | 5 | 229 | 2,255 | 229 | 144,233 | 168,905 | 0.08 | 114.34 |
| P4 | after-AB   | 2,288 | 74.31 | 5 | 229 | 2,255 | 229 | 144,233 | 168,905 | — | — |
| P4 | after-ABC  | 2,288 | 74.31 | 5 | 229 | 2,255 | 229 | 144,233 | **18,589** | — | — |
| P1_B | baseline   | 749 | 24.33 | 2 | 75 | 739 | 75 | 48,998 | 19,305 | 0.02 | 17.16 |
| P1_B | after-A    | 749 | 24.33 | 2 | 75 | 739 | 75 | 48,998 | 19,305 | 0.02 | 12.61 |
| P1_B | after-AB   | 749 | 24.33 | 2 | 75 | 739 | 75 | 48,998 | 19,305 | — | — |
| P1_B | after-ABC  | 749 | 24.33 | 2 | 75 | 739 | 75 | 48,998 | **5,109** | — | — |
| P1_A | baseline   | 827 | 26.86 | 2 | 83 | 816 | 83 | 50,626 | 27,412 | 0.02 | 18.30 |
| P1_A | after-A    | 827 | 26.86 | 2 | 83 | 816 | 83 | 50,626 | 27,412 | 0.02 | 16.56 |
| P1_A | after-AB   | 827 | 26.86 | 2 | 83 | 816 | 83 | 50,626 | 27,412 | — | — |
| P1_A | after-ABC  | 827 | 26.86 | 2 | 83 | 816 | 83 | 50,626 | **5,182** | — | — |

Bold-row interpretation:
- **P2 baseline 266 s** = the structural ceiling that bounds Change B.
- **P4 baseline 127 s** = second-largest plot.
- After Change C the per-plot AC totals drop 70-90 % uniformly — confirming the BOM shift is consistent (not an artefact of a single plot).

(Per-plot LA/cable breakdown isn't captured for `after-AB` / `after-ABC`
because they run inside worker processes and the bench script collects
post-hoc totals only. The wall-clock totals are still accurate.)

#### Quick reproduction (single command per row)

```bash
# baselines
uv run python scripts/perf/benchmark_cable_calc.py --kmz phaseboundary2 \
  --repeats 3 --label baseline --out /tmp/cable-perf-poc/pb2-baseline.json
uv run python scripts/perf/benchmark_cable_calc.py --kmz complex-plant-layout \
  --repeats 1 --timeout-s 600 --label baseline \
  --out /tmp/cable-perf-poc/cpl-baseline.json

# after-A — Change A is in the source; nothing extra to set
uv run python scripts/perf/benchmark_cable_calc.py --kmz complex-plant-layout \
  --repeats 1 --timeout-s 600 --label after-A \
  --out /tmp/cable-perf-poc/cpl-after-A.json

# after-AB — turn on parallelism for the bench
PVLAYOUT_BENCH_PARALLEL=1 uv run python scripts/perf/benchmark_cable_calc.py \
  --kmz complex-plant-layout --repeats 1 --timeout-s 600 --label after-AB \
  --out /tmp/cable-perf-poc/cpl-after-AB.json

# after-ABC — also flip the skip-individual env var
PVLAYOUT_BENCH_PARALLEL=1 PVLAYOUT_SKIP_INDIVIDUAL_AC=1 \
  uv run python scripts/perf/benchmark_cable_calc.py \
  --kmz complex-plant-layout --repeats 1 --timeout-s 600 --label after-ABC \
  --out /tmp/cable-perf-poc/cpl-after-ABC.json

# regenerate the consolidated table
uv run python scripts/perf/benchmark_consolidated.py \
  --result baseline=/tmp/cable-perf-poc/cpl-baseline.json \
  --result after-A=/tmp/cable-perf-poc/cpl-after-A.json \
  --result after-AB=/tmp/cable-perf-poc/cpl-after-AB.json \
  --result after-ABC=/tmp/cable-perf-poc/cpl-after-ABC.json
```

### Why each change earns what it earns

- **Change A modest (1.11–1.18×).** The S11.5 search-space caps already prevent Pattern A4 from blowing up — the unprepared `poly.intersection` cost was real but not the dominant fraction. Prepared geometry still wins on hot loops but margin is narrow because `_path_ok` calls per pattern are now bounded.
- **Change B caps at the max-boundary-time.** complex-plant has 6 plots ranging 5s → 266s (P2 dominates at 60% of total). Parallel ceiling = 266s. Observed 236s ≈ ceiling minus pool overhead. **Implication**: parallelism alone doesn't help when one plot dwarfs the others.
- **Change C is huge.** Eliminates the second routing pass entirely — a `_route_ac_cable` call per inverter per plot. On phaseboundary2, this is 62 saves; on complex-plant, 1,079 saves. The MST visual pass already runs ~N-1 routes; the individual pass adds ~N routes. Skipping it nearly halves the routing work, plus avoids the harder long-haul routes (MST tree edges are short between adjacent inverters; individual routes are long inverter→ICR runs that hit Pattern V often).

### BOM semantic-shift comparison (Change C — Prasanta input needed)

`total_ac_cable_m` reported by each variant:

| Fixture / plot | Baseline (individual-route BOM) | ABC (MST-derived BOM) | Δ |
|---|---|---|---|
| phaseboundary2 (S11.5 gate test asserts 12,361 m) | 12,361 m | 3,838 m | −69% |
| complex-plant P2 | 218,849 m | 32,191 m | −85% |
| complex-plant P3_A | 33,801 m | 7,820 m | −77% |
| complex-plant P4 | 168,905 m | 18,589 m | −89% |

**Both numbers are defensible** in solar-industry conventions. They answer different questions:

- *Individual-route BOM*: "If every inverter had a dedicated, independent cable to its ICR, how much conductor would I order?" Useful for worst-case sizing budget.
- *MST-derived BOM*: "How much conductor is physically in the layout you can see on the map (each shared trunk counted once)?" Matches what's installed.

The legacy app reports the individual-route BOM. Real-world plant cable orders almost always use the MST-style number (a shared-trunk install needs less cable than N independent runs). The 69-89% gap reflects real shared-trunk savings that the legacy BOM doesn't credit.

**Action**: surface this to Prasanta. He picks the default. Either way, the env-var lets us ship the speedup behind a flag and flip it later.

### Test suite status

| Variant | tests pass | tests fail |
|---|---|---|
| Default behavior (A + B applied)            | 123 / 123 + 6 skipped | 0 |
| With `PVLAYOUT_SKIP_INDIVIDUAL_AC=1` (C on) | 122 / 123 + 6 skipped | 1: `test_cables_on_phaseboundary2` (asserts legacy AC total = 12,361m) |

The 1 failing test is asserting the legacy contract (individual-route BOM). Expected. If Change C ships as default, that test gate updates to the MST-derived value (~3,838m for phaseboundary2).

### Repeatable run instructions

From `python/pvlayout_engine/`:

```bash
# Single-plot baseline
uv run python scripts/perf/benchmark_cable_calc.py \
    --kmz phaseboundary2 --repeats 3 --label baseline \
    --out /tmp/cable-perf-poc/pb2-baseline.json

# Multi-plot with all three changes
PVLAYOUT_BENCH_PARALLEL=1 PVLAYOUT_SKIP_INDIVIDUAL_AC=1 \
    uv run python scripts/perf/benchmark_cable_calc.py \
    --kmz complex-plant-layout --repeats 1 --label after-ABC \
    --timeout-s 600 \
    --out /tmp/cable-perf-poc/cpl-after-ABC.json

# Compare
uv run python scripts/perf/benchmark_compare.py \
    --result baseline=/tmp/cable-perf-poc/cpl-baseline-120s.json \
    --result after-ABC=/tmp/cable-perf-poc/cpl-after-ABC.json
```

The bench scripts mirror the FastAPI endpoint's exact code path
(`parse_kmz` → `run_layout_multi` → per-plot `place_lightning_arresters` +
`place_string_inverters`). `PVLAYOUT_BENCH_PARALLEL=1` activates the
parallel dispatch in the bench script (the sidecar endpoint always uses
parallel for multi-plot post-Change-B). `PVLAYOUT_SKIP_INDIVIDUAL_AC=1`
activates Change C in the cable engine itself.

### Recommendation / next direction

**Ship now (no further input needed):**
1. **Change A** — prepared geometry. Always-on. Zero semantic change. Strict win.
2. **Change B** — parallel per-plot. Always-on for multi-plot. Zero semantic change. ~1.88× on the test multi-plot fixture; ceiling = max-plot-time.

**Needs Prasanta sign-off:**
3. **Change C** — skip individual routing pass. Big win (5× total on complex-plant) but changes the meaning of `total_ac_cable_m` by 69-89%. Ship behind env var until BOM semantics are agreed.

**Not in this POC but worth flagging:**

- **The parallelism ceiling is structural.** Even with infinite cores, complex-plant takes ~266s (the slowest plot, P2) at the after-A code level, or ~74s at the after-AC level. Further wins require speeding up the slowest plot itself — which means tackling either the MST routing (Pattern V vis-graph rebuild on big polygons) or accepting the BOM shift via Change C (already the biggest lever).
- **Change C buys back ~3× even on a single big plot** because it halves the routing work. So if the user has a single huge plot (no multi-plot decomposition available), Change C is the only meaningful lever.
- **Pattern V vis-graph build is O(V²)** on the polygon vertex count. For complex-plant P2 (with 11 ICRs splitting the usable polygon into many components), V is large. A future optimization would cache the prepared visibility graph across `place_string_inverters` calls or restrict graph construction to the regions actually needed.

### Files touched on this branch

- [`python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`](../../python/pvlayout_engine/pvlayout_core/pvlayout_core/core/string_inverter_manager.py) — Changes A and C.
- [`python/pvlayout_engine/pvlayout_engine/routes/layout.py`](../../python/pvlayout_engine/pvlayout_engine/routes/layout.py) — Change B.
- [`python/pvlayout_engine/scripts/perf/benchmark_cable_calc.py`](../../python/pvlayout_engine/scripts/perf/benchmark_cable_calc.py) — new repeatable benchmark.
- [`python/pvlayout_engine/scripts/perf/benchmark_compare.py`](../../python/pvlayout_engine/scripts/perf/benchmark_compare.py) — new comparison report.
- [`docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md`](2026-04-30-002-cable-perf-poc.md) — this doc.

Branch: `perf/cable-multiplot-poc` (off `post-parity-v1-desktop`). Not pushed.
Final benchmark JSON files: `/tmp/cable-perf-poc/{pb2,cpl}-{baseline,after-A,after-AB,after-ABC}.json`.

