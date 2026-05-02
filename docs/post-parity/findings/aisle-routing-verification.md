# Aisle-Routing Verification — How-To + Findings

**Status:** Verification flow ready; awaiting DXFs from manual UI export.
**Date drafted:** 2026-05-02
**Plan row:** [CR1 follow-up](../../PLAN.md) — out-of-band end-to-end check
**Related:** [PRD-cable-routing-correctness.md](../PRD-cable-routing-correctness.md), [2026-05-02-cable-routing-correctness.md](2026-05-02-cable-routing-correctness.md)

---

## Why this exists

CR1's audit established that the new app's cable router uses
`route_poly = fence − ICRs` (industry-correct) and that 75-100% of
cables route via the Pattern A family (inter-row aisles). That was an
**in-process** verification — the probe ran the pipeline directly via
`pvlayout_core` imports.

This document closes the loop **end-to-end through the actual UI**: the
same Tauri app the customer uses → the sidecar → DXF exporter → real
DXF file → geometric verification. If a regression sneaks in at any
layer between "the math is right" and "the artifact a customer
receives is right," this catches it.

## Pass criteria (locked 2026-05-02 with Arun)

Three assertions on the DXF's `AC_CABLE_TRENCH` layer:

| # | Criterion | Threshold | Rationale |
|---|---|---|---|
| 1 | Length outside the plant fence | **0%** | Property-line correctness; matches the in-process pytest |
| 2 | Horizontal-segment length inside row-gap Y-bands | **≥95%** | The actual "uses inter-row aisles" claim |
| 3 | Horizontal-segment length crossing table footprints | **≤5%** | Smoking gun — H-segment on a table-row Y means a cable runs **through** a panel along its long axis |

## Why measure HORIZONTAL segments separately

A Pattern A cable polyline is `[s → (s[0], gy) → (e[0], gy) → e]`:

```
   (s[0], s[1]) = inverter
        |
        |  (vertical leg — at constant X across multiple table rows)
        |
   (s[0], gy)
        ─────────────────────  (horizontal leg — in row-gap aisle at y=gy)
                            (e[0], gy)
                                |  (vertical leg — at constant X)
                                |
                            (e[0], e[1]) = ICR
```

The HORIZONTAL leg lies in the row-gap aisle between table rows — that
*is* the inter-row aisle routing. The two VERTICAL legs run at constant
X across multiple table rows; in 2D projection they cross every table
polygon in that column.

In real-world installation the vertical legs are **trench-depth cables
running alongside or below the table frames**. The 2D DXF rectangle
representing each table doesn't carry that depth distinction — Shapely
sees a line crossing a polygon and counts it as "inside the table."
This is a 2D-projection artefact, not a routing defect.

So the verification splits segments by orientation:

- **Horizontal segments**: ask "are you in a gap band?" (criterion 2)
  and "do you cross a table?" (criterion 3). Yes-and-no respectively
  is the pass.
- **Vertical segments**: report length-crossing-tables diagnostically
  but don't pass/fail on it. It's expected to be high.

## How-to (the manual user flow)

These steps run against the new app's existing fixtures. Once you've
done them once, they become the standard regression ritual; the
analyzer is the same regardless of which DXF you feed it.

1. **Start Tauri dev mode:**

   ```
   cd apps/desktop
   bun run tauri dev
   ```

2. **Generate the small fixture (`phaseboundary2`):**
   - Open the app → load `python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz`.
   - In the inspector → "Calculate AC cable trench" toggle: **ON**.
   - Click **Generate Layout**.
   - In the EXPORT band → click **DXF** → save as e.g.
     `~/Desktop/phaseboundary2-output.dxf`.

3. **Generate the large fixture (`complex-plant-layout`):**
   - Same flow with `python/pvlayout_engine/tests/golden/kmz/complex-plant-layout.kmz`.
   - Save the DXF as e.g. `~/Desktop/complex-plant-layout-output.dxf`.

4. **Run the analyzer:**

   ```
   cd python/pvlayout_engine
   uv run python scripts/parity/analyze_aisle_routing.py \
       --dxf ~/Desktop/phaseboundary2-output.dxf \
             ~/Desktop/complex-plant-layout-output.dxf \
       --output-dir ../../docs/post-parity/findings/aisle-verification
   ```

5. **Read the per-DXF summaries:**
   - `docs/post-parity/findings/aisle-verification/phaseboundary2-output-aisle-summary.txt`
   - `docs/post-parity/findings/aisle-verification/complex-plant-layout-output-aisle-summary.txt`

   Each file ends with `Overall: PASS` or `FAIL`. The script's exit
   code matches (0 = all PASS, 1 = any FAIL).

6. **For forensic drill-in (only needed if FAIL):**

   The per-cable JSON at
   `docs/post-parity/findings/aisle-verification/<plant>-aisle-analysis.json`
   has every cable's individual segment-orientation breakdown. If a
   FAIL is unexpected, that file points at the offending cables.

## Reference: clean run output (in-process DXF, dry-run)

The analyzer was dry-run on `phaseboundary2` via an in-process DXF
generation during construction (2026-05-02). Reference numbers (the
manual Tauri run should match within float-noise tolerance):

```
=== phaseboundary2-test ===
Plant context:
  Fence area:                         233,604.1 m²
  Tables (DXF TABLES layer):                611
  AC cables (AC_CABLE_TRENCH):               62
  Estimated row pitch (Y):                6.090 m
  Row-gap bands detected:                   106

Aggregate cable lengths (total = 3,590.0 m):
  Inside fence:                         3,590.0 m  (100.00%)
  Outside fence (Class A):                  0.0 m  ( 0.00%)
  Horizontal segments:                  1,677.8 m  (46.74%)
  Vertical segments:                    1,912.2 m  (53.26%)

Aisle-routing claim — measured on HORIZONTAL segments only:
  H-length inside row-gap bands:        1,677.8 m  (100.00% of H)
  H-length crossing tables:                 0.0 m  ( 0.00% of H)

Diagnostic — VERTICAL segments crossing tables (expected 2D-projection):
  V-length crossing tables:             1,199.5 m  (62.73% of V)

Pass criteria:
  100% length inside fence:                      PASS
  >=95% horizontal length in row-gap bands:      PASS
  <=5% horizontal length crossing tables:        PASS

Overall: PASS
```

The Tauri-exported DXF should match these numbers exactly — same
sidecar pipeline, same exporter, same KMZ input.

## When this should be re-run

- After any change to `_route_ac_cable`, `_build_route_polygon`, or
  `_route_ac_mst` in `pvlayout_core/core/string_inverter_manager.py`.
- After any change to `pvlayout_core/core/dxf_exporter.py` that touches
  the AC_CABLE_TRENCH or TABLES or BOUNDARY layer logic.
- Before every release that ships engine changes.

## Relationship to the in-process test

`tests/integration/test_cable_routing_constraints.py` runs the same
verification but **in-process** — it imports `pvlayout_core` directly
and calls the routing functions. That test catches engine-internal
regressions and runs in CI.

This DXF analyzer catches regressions in the **export pipeline**
(sidecar + DXF exporter + Tauri client) that wouldn't be visible to an
in-process test. The two together close the loop end-to-end.

If only the in-process test passes but this analyzer fails, the bug
is in the sidecar route or the DXF exporter — engine math is fine but
the artifact the customer receives is broken. If only this fails, see
the per-cable JSON.

## What's NOT covered by this analyzer

- **Per-inverter home runs.** The `AC_CABLE_TRENCH` layer in DXF is the
  MST trench (the physical cable corridor). The per-inverter home runs
  that feed the BoM total are computed by `_calc_individual_ac_total`
  and discarded after summing. Adding an audit trail for the home-run
  polylines is a separate row (mentioned in CR1's PRD as a future
  improvement). The MST trench routing uses the same `_route_ac_cable`
  function with different start/end points, so trench-uses-aisles ⇒
  home-run-uses-aisles by construction (same code path).
- **DC cables.** This script only measures AC. DC strings are bundled
  per-row by `_bundle_dc_cables` with a different topology (collector
  + trunk per row, not MST), so the verification questions are
  different. Out of scope here.
- **Customer-drawn obstacles affecting cable routing.** Currently
  `route_poly` does not subtract `obstacle_polygons_wgs84` (per
  `_build_route_polygon`'s design rationale). This is a known open
  question deferred to CR3's brainstorm.

## Sources

- [PRD-cable-routing-correctness.md](../PRD-cable-routing-correctness.md) §3.3 — empirical pattern dispatch numbers
- [2026-05-02-cable-routing-correctness.md](2026-05-02-cable-routing-correctness.md) — decision memo + verified industry sources
- `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py:267-328` — `_build_route_polygon`
- `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py:693-925` — `_route_ac_cable` Pattern dispatch
- `python/pvlayout_engine/pvlayout_core/core/dxf_exporter.py` — DXF layer schema
- `python/pvlayout_engine/scripts/parity/analyze_aisle_routing.py` — the analyzer itself
