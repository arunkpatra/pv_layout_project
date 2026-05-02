# PRD — Cable Routing Correctness Audit

**Status:** Ready for review
**Date:** 2026-05-02
**Owner:** Arun (engineering) + Prasanta (solar-domain ratification)
**Plan row:** [CR1](../PLAN.md) — Phase 6 smoke-derived polish
**Companion row:** [CR2](../PLAN.md) — recommended close as `not-needed` (rationale below)

---

## 1. Problem

The post-parity overshoot compliance PDFs shipped on 2026-05-01
(`docs/post-parity/findings/phaseboundary2-overshoot-compliance-report.pdf`,
`docs/post-parity/findings/complex-plant-layout-overshoot-compliance-report.pdf`)
framed two defect classes against legacy:

- **Class A — fence overshoot:** cables physically off the property
  (real defect; legitimate when present).
- **Class B — `usable_polygon` overshoot:** cables routed through the
  table-setback / obstacle-exclusion polygon legacy itself defines as
  its routing constraint (originally framed as "code self-inconsistency").

Mid-week, a domain-research pass flagged Class B's framing as suspect.
The publicly-available real-world cabling standards (NEC 690 / IEC
62548-1:2023 / IEC 60364-7-712:2017) **do not** define a
`usable_polygon`-style boundary for cables. Industry practice — verified
against PVcase, RatedPower, Virto.solar's tool documentation, the
HellermannTyton single-axis tracker wire-management guide, the Energy
Informatics SoFaCLaP graph-optimization paper, and Solar Power World's
tracker O&M articles — routes cables through the inter-row aisle
space (the table-setback strip) **as the standard cable corridor**,
especially in tracker plants where cable management runs parallel to
the driveline in the inter-row gap.

If true, two consequences follow:

1. The compliance PDFs overstate legacy's Class B defect; cables
   "violating" `usable_polygon` may simply be running in their natural
   industry-standard corridor.
2. The new app's Pattern V claim of "100% inside `usable_polygon` by
   construction" might mean Pattern V is **over-constrained** — forcing
   cables to avoid corridors they should be using.

CR1 audits the new app against this finding. Goal: confirm or refute,
and produce a single unified compliance report grounded in the verified
sources.

## 2. Research summary (verified secondary sources)

The full source list lives in
`docs/post-parity/findings/2026-05-02-NNN-cable-routing-correctness.md`
(decision memo). Key positions:

- **Real-world cabling standards govern cable physics, not parcel
  geometry.** NEC 690.31 / IEC 62548 / IEC 60364-7-712 specify cable
  sizing, conductor type, burial depth, mechanical protection, AC/DC
  separation. None reference a `usable_polygon`-style boundary; the
  geographic boundary they govern is the property fence + jurisdictional
  setbacks (varies by AHJ).

- **Inter-row aisles are the standard cable corridor.** Per the
  HellermannTyton wire-management guide and Solar Power World's
  tracker articles, cable bundles "jump from one tracker to the next"
  between rows; in single-axis trackers the cable management system is
  routed parallel and within feet of the driveline (which sits in the
  inter-row gap). Inter-row spacing literature explicitly treats
  cabling cost as one driver of the spacing decision.

- **Commercial CAD tools route cables manually or by length-minimization
  shortest-path, not by `usable_polygon` containment.** PVcase, RatedPower,
  and Virto.solar all expose user-drawn or auto-routed trench paths;
  the only spatial guidance is "avoid passing below structures."

- **Academic optimization formulation treats it as graph-shortest-path.**
  The Solar Farm Cable Layout Problem (SoFaCLaP) is the optimization
  literature's framing — graph-theoretic shortest path with obstacle
  avoidance, no usable-polygon constraint.

**Conclusion from research:** the correct cable-routing constraint
polygon is roughly `fence − hard_obstacles` (where "hard" = buildings
you can't trench under, per Prasanta's domain call). Inter-row aisles
are inside it. Table-setback subtraction is wrong for cables.

Full source list: see decision memo + the existing Pattern V
justification memo at
`docs/post-parity/findings/2026-05-01-002-pattern-v-justification.md`.

## 3. New-app code analysis findings

### 3.1 Two distinct polygons exist

The new app already encodes the right architectural distinction:

| Polygon | Constructed in | Formula | Used for |
|---|---|---|---|
| `usable_polygon` | [`layout_engine.py:80-169`](../../python/pvlayout_engine/pvlayout_core/core/layout_engine.py#L80-L169) | `fence − perimeter_road_buffer − KMZ_obstacles − water_obstacles − line_obstruction_buffers(15m each side)` | Table placement only. Tables placed via grid sweep; kept only if `usable_polygon.contains(table_box)`. |
| `route_poly` | [`string_inverter_manager.py:267-328`](../../python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py#L267-L328) (`_build_route_polygon`) | `fence − placed_ICR_footprints` (intentionally NOT minus KMZ obstacles) | Pattern V cable routing. |

The docstring at [`string_inverter_manager.py:315-323`](../../python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py#L315-L323)
documents the design choice: KMZ-marked obstacles (canals, treelines)
are *not* subtracted from `route_poly` because cables can route around
or through them at trench level — routing around an obstacle is
standard EPC practice.

### 3.2 Pattern dispatch hierarchy

`A → A2 → A3 → A4 → B → C → D → E1 → E2 → V → F`. Each pattern's role:

- **Patterns A–E:** Manhattan-style templates (V→H→V via row gaps,
  H→V→H→V escapes, polygon-centroid waypoint sweeps) validated against
  `usable_polygon`. They are the *preferred* router because their paths
  follow the row-gap + column corridors — predictable, EPC-friendly,
  and easy to install in trench-along-row geometry.
- **Pattern V:** visibility graph + Dijkstra over `route_poly`. The
  geometric correctness fallback for concave / awkward sub-regions
  where Manhattan templates can't find a path inside `usable_polygon`.
  By construction the result is inside `route_poly` (= fence − ICRs).
- **Pattern F:** least-violation scoring fallback against `usable_polygon`.
  Tagged `boundary_violation` when the chosen path has segments outside
  the polygon. The frontend surfaces this with a warning affordance.

### 3.3 Empirical pattern dispatch (verified 2026-05-02)

Probe ran the new app on both fixtures with `PVLAYOUT_PATTERN_STATS=1`.
Pattern dispatch counts (note: AC dispatch counts are ~2× cable count
because both `_route_ac_mst` and `_calc_individual_ac_total` invoke the
router):

| Plant / boundary | AC cables | A family | V | F | bv | Total AC m |
|---|---:|---:|---:|---:|---:|---:|
| **phaseboundary2** | 62 | 108 (87%) | 16 (13%) | 0 | **0** | 12,361 |
| complex-plant b0 | 486 | 853 (75%) | 97 (8.5%) | 22 (1.9%) | 0 | 218,849 |
| complex-plant b1 | 140 | 280 (100%) | 0 | 0 | 0 | 33,801 |
| complex-plant b2 | 66 | 115 (87%) | 1 (0.8%) | 16 (12%) | **1** | 11,425 |
| complex-plant b3 | 229 | 326 (72%) | 71 (16%) | 61 (13%) | 0 | 168,905 |
| complex-plant b4 | 75 | 125 (83%) | 15 (10%) | 10 (6.6%) | 0 | 19,305 |
| complex-plant b5 | 83 | 130 (78%) | 2 (1.2%) | 31 (19%) | 0 | 27,412 |
| **complex-plant total** | **1079** | **1829 (78%)** | **186 (8%)** | **140 (6%)** | **1 (0.09%)** | **479,697** |

**Findings:**

- **Pattern A family dominates** — 75-100% of AC dispatches across all
  boundaries. The new app *is* using inter-row gaps as the primary cable
  corridor, exactly per industry practice.
- **Pattern V intercepts 8-16%** in concave plants (phaseboundary2,
  complex-plant b0/b3/b4). Confirms its role as the geometric-correctness
  fallback.
- **Pattern F fires 6-19% on the more difficult complex-plant
  boundaries.** Of those, only **1 cable out of 1079** (0.09%) ends up
  with `route_quality = "boundary_violation"` (segment outside
  `usable_polygon`). Compare to legacy on the same fixture: 532/1079
  (49.3%) outside `usable_polygon`, of which 85 (7.9%) outside the
  property fence.
- **Zero `boundary_violation` cables on phaseboundary2.** Matches the
  existing acceptance test at
  [`test_layout_s11_5_cables.py:180-203`](../../python/pvlayout_engine/tests/integration/test_layout_s11_5_cables.py#L180-L203).

### 3.4 Failed optimization attempt

CR1 attempted to pass `route_poly` (the wider polygon) through to
Patterns A-E and F's `_score()` so that more cables would resolve
through the A-family without falling through to V or F. The hypothesis
was that A-E paths that briefly dip into the perimeter-road band (which
is inside `route_poly` but outside `usable_polygon`) would succeed
where they currently fail.

**Empirical result: 30-60% increase in total AC cable length** across
both fixtures, plus 17 new `boundary_violation` cables. Root cause:
A-E's path templates terminate at the ICR centre, and `route_poly`
subtracts ICRs — so the final segment of every template fails
validation, A-E reject all paths, V is invoked but cannot fix the
ICR-endpoint issue either, and F's least-violation fallback returns
much longer paths.

**Reverted.** The current architectural split (A-E validate against
`usable_polygon` which *contains* ICRs; V validates against `route_poly`
which excludes ICRs but accepts that endpoints get nudged via
`_safe_pt` because V's polyline is dominated by interior segments
where the nudge doesn't matter) is correct as-is.

Net code change from CR1: **one comment block in `_route_ac_cable`**
documenting this finding for future engineers. No logic change.

## 4. What legacy gets right and wrong

Empirically grounded in the overshoot analyses already shipped.

### What legacy gets right

- **Cables route through inter-row aisles.** Pattern A in legacy is
  identical to the new app's Pattern A — same V→H-via-row-gap→V
  template, same use of `gap_ys`. Most of legacy's cables are routed
  this way, which is correct EPC practice.
- **Cables stay inside the fence on small/regular plants.** On
  phaseboundary2 (small fixture), 0/62 cables exit the property
  boundary. Legacy's behavior on regular geometry is fine.

### What legacy gets wrong

1. **Off-property cables on irregular/large plants (Class A defect, real).**
   On complex-plant-layout (large fixture), **85/1079 cables (7.9%)
   physically off the property fence; 20.7 km of cable that cannot be
   installed without separately negotiated easements.** The worst single
   cable is routed 656.83 m beyond the fence. This is the genuine,
   undeniable defect — legacy's Pattern F least-violation scoring
   doesn't have a "stay inside the fence" guarantee, only a "minimize
   violations of `usable_polygon`" objective. On concave / multi-component
   `usable_polygon` geometries the chosen least-violation path can leave
   the fence entirely.

2. **No audit trail.** Per-cable polylines computed inside
   `_calc_individual_ac_total` are summed into `total_ac_cable_m` and
   discarded. The customer's BoM arrives as a scalar with no per-cable
   trace; a compliance reviewer cannot identify which cables exit the
   fence without re-running the legacy pipeline with instrumentation
   (which is what `detect_legacy_overshoots.py` does).

3. **No explicit cable-routing polygon.** Legacy uses one polygon
   (`usable_polygon`) for both table placement and cable routing.
   Pattern F validates against this single polygon and tags violations
   accordingly. The architectural split between table-placement and
   cable-routing constraints — which the new app's Pattern V introduced
   — is absent in legacy.

### What was framed as a defect in legacy but is not

- **`usable_polygon` overshoot framed as "Class B defect — code
  self-inconsistency"** in the just-shipped compliance PDFs. Per the
  research above, this framing is wrong. Legacy's cables routing
  through the perimeter-road band and the inter-row aisles are doing
  what cables are supposed to do per industry practice. Legacy's
  defect is not "ignoring its own constraint"; it is "using the wrong
  constraint as its routing referent (table-placement polygon instead
  of cable-routing polygon)." The behavioural outcome (cables in
  aisles) is roughly correct; the *explanation* legacy provides for
  that behaviour (least-violation fallback that admits violations) is
  the defect — it just happens to converge on the right routing
  topology in most cases by accident.

## 5. Recommended deliverables

### 5.1 Reframe both compliance PDFs into one

Replace the two existing PDFs at
`docs/post-parity/findings/{phaseboundary2,complex-plant-layout}-overshoot-compliance-report.pdf`
with a single unified report at
`docs/post-parity/findings/cable-routing-compliance-report.pdf`. The
reframe drops the "Class B = self-inconsistency" framing and replaces
it with:

- **Class A (fence overshoot)** — kept as the headline defect. Real,
  measurable, undeniable. complex-plant-layout has 85/1079 cables
  off-property; phaseboundary2 has 0.
- **Class B (audit-trail issue)** — promoted from a footnote. Legacy
  discards per-cable polylines; the BoM cannot be reconciled to the
  drawing. The new app preserves polylines + `route_quality` tags by
  design.
- **Class C (`usable_polygon` overshoot, retired as a defect)** —
  documented as "what legacy was tagged for via `_score()` but is
  actually correct EPC practice" rather than a defect against either
  industry standards or installable reality. Numbers reported for
  reproducibility but not framed as a failure.

The unified PDF will explicitly cite the verified industry sources
(verified URLs, no primary-standard claims).

### 5.2 Add an in-codebase test for constraint adherence

New sidecar pytest at
`python/pvlayout_engine/tests/integration/test_cable_routing_constraints.py`
runs both fixtures (phaseboundary2 + complex-plant-layout) and asserts:

1. **Zero AC cables exit the plant fence** (the only real-world
   correctness boundary). Computed from `result.ac_cable_runs[*].route_utm`
   geometry vs the projected fence polygon.
2. **At most a small fraction of AC cables tagged `boundary_violation`.**
   Threshold proposed: 0.5% per boundary. The 0.09% measurement on
   complex-plant b2 is well within this.
3. **Pattern V usage is non-zero on phaseboundary2** — preserves the
   existing assertion at `test_layout_s11_5_cables.py:200-203`.

This test becomes the regression gate for any future change that might
re-introduce off-fence cables.

### 5.3 Decision memo

`docs/post-parity/findings/2026-05-02-NNN-cable-routing-correctness.md`
captures:

- The honesty-audit prompt + research findings + verified citations.
- The new-app code analysis (this PRD's §3 in compressed form).
- The decision: new-app architecture is correct; CR2 closes as
  not-needed; obstacle-handling is deferred to a separate brainstorm.
- Per Prasanta's directive: free hand on solar-domain calls supported
  by industry standards — exercised here.

### 5.4 Close CR2 as `not-needed`

CR2's likely shape (described in PLAN.md) was a Pattern V correction
to introduce `cable_routable_polygon = fence − obstacle_buffers`. CR1's
analysis shows:

- Pattern V already uses `route_poly = fence − ICRs`, which is a
  superset of "fence − obstacle_buffers" minus the ICR distinction.
  Subtracting obstacles from `route_poly` is a separate design
  question (deferred to brainstorm — see §6 below).
- The empirical optimization attempt (passing `route_poly` to A-E)
  regressed by 30-60%. The current architecture is correct.

CR2 closes with a one-line entry pointing at this PRD + the decision memo.

### 5.5 Add a placeholder PLAN row for the obstacle-handling brainstorm

The strategic question raised during CR1 — "customers will draw
exclusions; should those exclusions exclude *cables* in addition to
tables, and how should the data flow work end-to-end (drawing tools
→ per-run persistence → KMZ overlays → cable router)" — touches
multiple subsystems (D-rows, P4 edits, run data model, KMZ schema,
cable router). It needs a dedicated brainstorm session.

Proposed PLAN row: `CR3` (or similar prefix) — Phase 6 smoke-derived
polish. T3 (decision memo + spec). To be brainstormed right after CR1
lands, before D-row work begins, so the design lands coherently across
the touched subsystems.

## 6. Open questions explicitly deferred

These are not addressed by CR1; flagged here for the next session.

1. **Should `route_poly` subtract `obstacle_polygons_wgs84`?**
   Currently it does not (per the design rationale at
   `string_inverter_manager.py:315-323`: cables can route around or
   through obstacles at trench level). Customers drawing exclusions
   may expect cables to physically avoid them. The tradeoff: subtracting
   obstacles can split `route_poly` into disjoint components on
   irregular plants (observed on phaseboundary2: obstacle[2] splits
   the fence into 3 pieces), which kills Pattern V → forces Pattern F
   → cables potentially exit the fence. **Brainstorm needed.**

2. **Should `route_poly` subtract line-obstruction buffers (TL/canal/road
   safety zones)?** Currently it does not. Cables can therefore route
   within 15m of a transmission line per the new app. EPC safety codes
   typically require greater clearances. **Brainstorm needed**, same
   session as (1).

3. **Should Patterns A-E ever validate against a wider polygon than
   `usable_polygon`?** CR1 measured the cost of doing so naively (30-60%
   regression). A more sophisticated change — e.g., a "soft" validation
   that allows the *last segment* to enter ICR cutouts, or constructing
   a separate "cable-corridor polygon" that's wider than `usable_polygon`
   but smaller than `route_poly` — could in principle reduce V/F
   fall-through. Out of scope for CR1; revisit only if measurement
   shows specific plants where the current split produces sub-optimal
   routes.

## 7. Acceptance for CR1 close

- This PRD merged.
- User (Arun) approves before unified PDF is built.
- Unified PDF replaces the two existing files.
- User (Arun) approves unified PDF.
- New constraint-adherence pytest green on both fixtures.
- Decision memo committed.
- CR2 row in PLAN.md flipped to `not-needed` with one-line reference
  to this PRD + decision memo.
- New CR3-style PLAN row added for the obstacle-handling brainstorm.

---

*All numerical claims in §3.3 are reproducible via:*

```
cd python/pvlayout_engine
PVLAYOUT_PATTERN_STATS=1 uv run python /tmp/pattern_stats_probe.py
```

*All overshoot numbers in §4 are reproducible via:*

```
cd python/pvlayout_engine
uv run python scripts/parity/detect_legacy_overshoots.py \
    --plant <phaseboundary2 | complex-plant-layout> \
    --legacy-repo /Users/arunkpatra/codebase/PVlayout_Advance \
    --baseline baseline-v1-20260429
```

*The pattern stats probe will be promoted from `/tmp` to a checked-in
script at `python/pvlayout_engine/scripts/parity/probe_pattern_stats.py`
as part of §5.2's test infrastructure deliverable.*
