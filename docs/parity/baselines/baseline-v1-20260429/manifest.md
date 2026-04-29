# Baseline: baseline-v1-20260429

**Authority:** legacy branch `baseline-v1-20260429` on `/Users/arunkpatra/codebase/PVlayout_Advance`. The branch is the source of truth; SHA snapshots are taken at each capture for audit trail.

**HEAD SHA at last capture:** `397aa2ab460d8f773376f51b393407e5be67dca0` (resolved 2026-04-29; recorded in each `numeric-baseline.json` under `legacy_sha_at_capture`).

**Cable-functions origin:** commit `9362083` (`feat: SAT energy fix, GHI file format hint, cable/DXF/edition improvements`, 2026-04-25) within this branch's history. This is when `_bundle_dc_cables`, `_route_ac_mst`, `_build_mst_edges`, `_calc_individual_ac_total` were introduced into legacy.

**Captured by:** `python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py` (P0 Task 2).

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
- 135 horizontal collectors (rows where bundling succeeded; the collector cable spans the row)
- 210 vertical-only cables (likely trunks from collector to inverter)
- 259 mixed (per-table fallback when horizontal-collector path was blocked, plus other paths)

The `_bundle_dc_cables` function IS firing as designed — the 135 horizontal collectors prove it. The remaining cables are per-table fallbacks where the horizontal-collector path failed `_path_ok` (probably blocked by polygon geometry).

**LA positions:** `placed_las[]` (22 records: `x`, `y`, `width`, `height`, `radius`, `index`) added 2026-04-29 for row #2 parity test.

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

P0 proceeds with `phaseboundary2` only. `complex-plant-layout` is tracked as a separate issue outside P0 scope — to be revisited once Tasks 5/6 land bundling/MST in the new project (which dramatically reduces cable count and may make legacy capture tractable too if the legacy MST path runs faster than its per-cable individual quantity calculation).

## Visual + export ground truth

P0 Task 3 captures legacy GUI screenshots + KMZ/PDF/DXF exports. **Not yet captured (Arun's manual task).** When complete, artifacts will land at:

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

These will fail until Tasks 5/6 of P0 land (the bundled DC + MST AC port). They may STILL fail after Tasks 5/6 because of broader drift between the vendored core and current baseline — see `docs/parity/BACKLOG.md`.

## Wider drift beyond P0

P0 ports four cable functions. The cumulative drift between the new project's vendored core and this baseline is **much wider** — it includes LA placement changes, layout-engine adjustments, KMZ-parser water-body autodetection, energy-model upgrades, two new modules (`satellite_water_detector.py`, `tracker_layout_engine.py`), and more. See [`docs/parity/BACKLOG.md`](../../BACKLOG.md) for the full enumeration.

P0 stays narrow (per Q7 + Prasanta's "systematic, eventual" framing). Subsequent parity-spikes (P2 onward) work through BACKLOG entries; P1 sync skill produces draft discovery memos for each.

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

The script resolves the legacy HEAD SHA automatically and records it in `numeric-baseline.json`. If the SHA differs from `397aa2a`, that's a re-baseline event — note the new SHA in this manifest, regenerate any dependent test fixtures, and re-run parity tests.
