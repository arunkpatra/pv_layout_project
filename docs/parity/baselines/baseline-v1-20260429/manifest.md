# Baseline: baseline-v1-20260429

**Legacy commit:** `9362083` (`feat: SAT energy fix, GHI file format hint, cable/DXF/edition improvements`)
**Legacy branch:** `baseline-v1-20260429` on `/Users/arunkpatra/codebase/PVlayout_Advance`
**Captured:** 2026-04-29 (see `captured_at` in each `numeric-baseline.json`)
**Captured by:** `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py` (run in P0 Task 2)

## Plants captured

| Plant | KMZ | Numeric baseline | Status |
|---|---|---|---|
| `phaseboundary2` | `python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz` | [`ground-truth/phaseboundary2/numeric-baseline.json`](ground-truth/phaseboundary2/numeric-baseline.json) | ✅ captured |
| `complex-plant-layout` | `python/pvlayout_engine/tests/golden/kmz/complex-plant-layout.kmz` | (deferred) | ⏸ deferred — see notes below |

## Captured numbers — `phaseboundary2`

| Quantity | Legacy value (this baseline) |
|---|---|
| `placed_tables` | 611 |
| `placed_string_inverters` | 62 |
| `placed_las` | 22 |
| `placed_icrs` | 2 |
| `dc_cable_runs` count | 604 (mix of bundled collectors + trunks + per-table fallbacks per the row geometry of phaseboundary2) |
| `ac_cable_runs` count | 62 (one MST edge per inverter+ICR tree edge; equal to inverter count here because legacy MST produces N edges for ICR + N inverters) |
| `total_dc_cable_m` | 37,380.3 |
| `total_ac_cable_m` | 12,974.5 |

DC cable structure breakdown (from JSON inspection):
- 135 horizontal collectors (rows where bundling succeeded, the collector cable spans the row)
- 210 vertical-only cables (likely trunks from collector to inverter)
- 259 mixed (per-table fallback when horizontal collector path was blocked, plus other paths)

The `_bundle_dc_cables` function IS firing as designed — the 135 horizontal collectors prove it. The remaining cables are per-table fallbacks where the horizontal-collector path failed `_path_ok` (probably blocked by polygon geometry).

## Params used

`LayoutParameters()` defaults plus `enable_cable_calc=True`. Specifically (verified against `models/project.py` defaults at this baseline):

- `module.wattage = 580.0` Wp
- `module.length = 2.279` m
- `module.width = 1.134` m
- `table.modules_in_row = 28`
- `table.rows_per_table = 2`
- `max_strings_per_inverter = 20`
- `design_mode = DesignMode.STRING_INVERTER`
- `enable_cable_calc = True`

These are the same defaults the GUI input panel ships with — what a customer running legacy would get out of the box.

**Note on earlier confusion:** the P0 plan template originally specified `wattage=545, max_strings=30`. This was wrong and was caught when the first capture produced 642 tables / 43 inverters (instead of S11.5's reference 611 / 62). Both `capture_legacy_baseline.py` and `test_p00_bundled_mst_parity.py` were corrected to use defaults; this manifest reflects the corrected capture.

## `complex-plant-layout` deferral

Capture on `complex-plant-layout.kmz` was attempted on 2026-04-29 and killed after >20 min wall-clock without completing. Likely cause: the plant is much larger and has multiple distinct plots, and legacy at this baseline lacks the S11.5 search-space caps — so the per-cable AC quantity routing in `_calc_individual_ac_total` runs N inverter routes through uncapped Pattern A4 (49² candidates) and Pattern B (113² candidates) per cable, which compounds badly on large plants.

Workaround options for future:
1. Patch legacy temporarily with the S11.5 caps before capturing — measurable change but requires a one-off legacy commit.
2. Add a runtime timeout to the capture script and ship partial results.
3. Use a smaller third reference plant.
4. Wait for Tasks 5/6 to port bundling/MST into the new project, then capture from the new project's pipeline (legacy's bundling is what makes new app's path fast); but this defeats the purpose of capturing LEGACY ground truth.

P0 proceeds with `phaseboundary2` only as the parity gate. `complex-plant-layout` is tracked as a separate issue outside P0 scope.

## Visual + export ground truth

P0 Task 3 captures legacy GUI screenshots + KMZ/PDF/DXF exports. **Not yet captured.** When complete, artifacts will land at:

- `ground-truth/phaseboundary2/screenshots/legacy-cables-on.png`
- `ground-truth/phaseboundary2/screenshots/legacy-cables-off.png`
- `ground-truth/phaseboundary2/exports/legacy.kmz`
- `ground-truth/phaseboundary2/exports/legacy.pdf`
- `ground-truth/phaseboundary2/exports/legacy.dxf`

## Tolerance for parity verification

See `docs/parity/PLAN.md` §4. Summary:

- Counts: exact match
- `total_dc_cable_m` / `total_ac_cable_m`: ±0.1 m
- Per-cable polylines: ±0.001 m

These will fail until Tasks 5/6 of P0 land (the bundled DC + MST AC port). They may STILL fail after Tasks 5/6 because commit `9362083` changed many other files (`la_manager.py` 248 lines, `layout_engine.py` 38 lines, `models/project.py` 31 lines, plus 11 new files) — see "Wider drift than expected" below.

## Wider drift than expected

Discovered during P0 Task 2 capture: commit `9362083` is much wider than just cable functions. Total: **+4,668 / -493** lines across 21 files. This means the new project's vendored `pvlayout_core/` (commit `8b352b7`) is missing far more than the four cable functions — including LA placement changes, layout engine tweaks, model additions, and 11 entirely new modules.

Implication: P0's planned Tasks 5/6 (port cable functions) close the cable-routing parity gap but **may not close the broader drift**. The parity test may stay RED on counts (la count, table count) even after Tasks 5/6 land. This is a re-scoping concern for the team — flagged for Arun + Prasanta discussion before P0 close.

## Re-capture procedure

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
git -C /Users/arunkpatra/codebase/PVlayout_Advance checkout baseline-v1-20260429
uv run python scripts/parity/capture_legacy_baseline.py \
    --kmz tests/golden/kmz/phaseboundary2.kmz \
    --plant phaseboundary2 \
    --legacy-repo /Users/arunkpatra/codebase/PVlayout_Advance \
    --baseline baseline-v1-20260429 \
    --out-root /Users/arunkpatra/codebase/pv_layout_project/docs/parity/baselines
```
