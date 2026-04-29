# Finding 002 — Search-space caps in `_route_ac_cable` patterns A2–E

**Date:** 2026-04-29
**Sync run:** new project commit `9447788` vs legacy branch `baseline-v1-20260429` (HEAD `397aa2a` at capture)
**Status:** triaged
**For:** Prasanta (solar-domain authority); discussion via Arun's daily comms.

## Classification

**new-project-discovery** — performance optimisation originating in S11.5 (commit `6a7bf32`, ADR-0007), not in legacy. Default action: discovery memo + post-port re-evaluation.

## Summary

The new project's `_route_ac_cable` has search-space caps in patterns A2, A3, A4, B, and E that limit the number of candidate paths considered. Caps don't exist in legacy. They were added when the new project's `place_string_inverters` was using per-cable individual routing (no MST, no DC bundling) — a topology that on `phaseboundary2` produced 13.9 million `_path_ok` calls and a 460-second wall-clock for cable calc.

**Now that P0 has ported the legacy bundled DC + MST AC topology, the caps may be unnecessary or wrong-sized.** This memo flags it for joint evaluation.

## The caps (new project `string_inverter_manager.py:684-688`)

```python
A2_A3_NEAREST_COLS = 8       # Pattern A2/A3: limit col-X sweep to nearest 8
A4_NEAREST_COLS    = 5       # Pattern A4: limit each end's col sweep to nearest 5 (5×5 grid)
B_NEAREST_GAPS     = 8       # Pattern B: limit gap×gap sweep to nearest 8 each (8×8 = 64)
E_SINGLE_WAYPOINTS = 15      # Pattern E: limit single-waypoint sweep to 15
E_TWO_WAYPOINT_MAX = 10      # Pattern E: skip O(N²) two-waypoint sweep when |W| > 10
```

Without caps (legacy default): A4 considers 49² candidates per cable; B considers 113² candidates; E iterates O(N²) over the full waypoint list.

## Why they were added

S11.5 spec § "Pre-port baseline" measured the un-capped baseline at 460 s on `phaseboundary2` with the per-cable topology (62 AC cables, 15 falling through to Pattern F). The 15 Pattern F cables each ran A4 and B searches that succeed on zero candidates, burning 49² + 113² ≈ 15,000 path checks per cable.

With caps applied: same plant runs in 4.4 s (104× faster) — see `docs/gates/s11_5.md` § "Post-port run."

## Why they may now be unnecessary

P0 has now ported the bundled DC + MST AC topology. The cable-count drops from per-cable individual routing to:
- DC: ~70 bundled cables (vs 611 per-table) on `phaseboundary2`
- AC: MST tree edges only (≤ N inverters = 62; typically far fewer with shared trunks)

With ~10× fewer cables hitting `_route_ac_cable`, even the un-capped legacy patterns may complete in well under the user-perceptible threshold. A cap that helps the per-cable topology may be over-restrictive for the bundled / MST one.

## Concretely

When Pattern A4 / B searches succeed (the common case), the cap clips off candidates that legacy would have considered. On bundled-DC trunk routes and MST-AC edges, this could mean missing a slightly-better-quality path. The numerical impact is small — the cap-permitted candidates include the most-likely-best ones — but it's a difference from legacy behaviour.

## Reproduction

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
PVLAYOUT_PATTERN_STATS=1 uv run python scripts/debug/time_cable_calc.py
```

Output shows `_path_ok` call counts. Compare with cap values to measure cap engagement.

## Proposed action

Discovery memo for Prasanta's evaluation. Possible outcomes:

1. **Prasanta wants caps removed** → un-cap A2/A3/A4/B/E in new project; verify performance is still acceptable on `phaseboundary2` and `complex-plant-layout` post-bundling/MST. If performance regresses, retain caps.
2. **Prasanta wants caps in legacy** → port the cap constants + early-exit logic from new project to legacy. ~30 LOC change.
3. **Prasanta accepts caps in new project as-is** → status quo. Document as expected divergence.

**Recommended evaluation**: instrumented runs on `phaseboundary2` and `complex-plant-layout` post-P0 with caps removed (or temporarily set to ∞). If wall-clock stays under 30 s and AC totals don't shift more than ±0.1m, caps can be removed; the perf justification is gone.

## Resolution

(To be filled by Arun after Prasanta's input + post-P0 instrumented re-measurement.)
