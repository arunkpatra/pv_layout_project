# Finding 002 — Pattern V (visibility-graph fallback) — technical justification

**Date:** 2026-05-01
**Author:** Claude (under Arun's direction); intended as draft input for the customer-facing PDF "Why legacy code is untenable" co-authored with Prasanta.
**Status:** draft, empirical numbers verified, citations attached
**Cross-reference:** [docs/historical/parity/findings/2026-04-29-001-pattern-v.md](../../historical/parity/findings/2026-04-29-001-pattern-v.md) (the original discovery memo), [docs/post-parity/PRD-cable-compute-strategy.md §1.3 + §2.2](../PRD-cable-compute-strategy.md) (BoM-vs-trench separation).

---

## TL;DR

Pattern V is a visibility-graph + Dijkstra cable router we added to the new project as a fallback before Pattern F. It is geometrically correct by construction (every returned route lies inside the polygon) and has a 47-year academic pedigree in robotics path-planning [¹](https://dl.acm.org/doi/10.1145/359156.359164). It is **not** standard solar-PV CAD practice — the leading commercial tools expose "stick to user-drawn trench" or "shortest path" toggles but do not document a visibility-graph algorithm under the hood [²](https://help.pvcase.com/hc/en-us/articles/35594999251603-Fixed-tilt-cabling).

The empirical case for Pattern V on the new project's pipeline rests on the legacy `_route_ac_cable` dispatch's last-resort Pattern F, whose `_score()` function counts (rather than rejects) out-of-polygon segments. Re-running the legacy pipeline on `phaseboundary2.kmz` with a polyline-capture instrumentation hook shows:

| Reference polygon | Cables overshooting | Outside-polygon length | Max single cable | Median |
|---|---:|---:|---:|---:|
| Plant fence (boundary) | 0 / 62 (0%) | 0.0 m | 0.0 m | 0.0 m |
| `usable_polygon` (table-setback ∩ obstacles) | 38 / 62 (61%) | 1,276.6 m / 12,726.5 m total (10.0%) | 96.0 m | 32.6 m |

Plant-fence violations are the high-stakes kind (cable physically off the property). On `phaseboundary2`, legacy does not produce any of these. The 61% violations against `usable_polygon` are mostly cables routed through the perimeter-road / obstacle-buffer band, which is inside the plant fence and is where physical cables actually go in EPC practice — these are "violations" only against the table-setback polygon, not against installable reality.

The original Pattern V finding memo's claim of "15 AC cables route 34–64 m OUTSIDE the plant boundary in legacy" on `phaseboundary2` is **not reproduced** by this analysis when measured against the plant fence. It does reproduce as 38 cables routing 1.9–96 m outside the table-setback `usable_polygon`. This is a meaningful distinction the customer-facing PDF must get right.

For the "Why legacy code is untenable" pitch, the strongest empirical claims are: (a) legacy's `_calc_individual_ac_total` discards every polyline it computes — the 12,974.5 m AC BoM number on `phaseboundary2` has **no auditable per-cable trace** in the saved capture; (b) legacy's last-resort Pattern F ranks candidates by *fewer-violations-is-better* rather than rejecting violators, which is a code-as-spec design weakness independent of whether any specific KMZ exercises it. Pattern V in the new project removes both issues — every route is preserved with a `route_quality` tag, and inside-polygon-by-construction is enforced before Pattern F is ever reached.

---

## 1. What Pattern V is

### 1.1 Algorithm

A visibility graph for a simple polygon `P` is the undirected graph whose nodes are the polygon's exterior and interior-ring vertices and whose edges are the pairs `(u, v)` whose connecting segment `uv` lies entirely in `P` (closed: boundary is allowed) [³](https://link.springer.com/book/10.1007/978-3-540-77974-2). Pattern V builds this graph once per `place_string_inverters` call, caches it by `id(poly)`, then for each cable terminal pair `(s, e)`:

1. Snap `s, e` onto `P` if they're outside (`_safe_pt`).
2. Direct-visibility short-circuit: if the prepared polygon `covers([s, e])`, return `[s, e]`.
3. Otherwise compute `s`-visible and `e`-visible nodes (`_visible_neighbors`), splice them into a copy of the cached adjacency list, and run heap-based Dijkstra (`_dijkstra`) from `s` to `e`. Returns the shortest inside-`P` polyline, or `None` if the polygon is disconnected and `s, e` are in different components.

Implementation: [`python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py:295-348`](../../../python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py).

### 1.2 Where it sits in the dispatch

The `_route_ac_cable` dispatch order is `A → A2 → A3 → A4 → B → C → D → E → V → F`. Patterns A through E are strict-Manhattan templates that try templated combinations of horizontal and vertical legs through row gaps and column positions. Each template is validated against `usable_polygon` via `_path_ok` (every segment must lie inside the polygon). If A–E all fail, **Pattern V** runs; if V also fails (disconnected polygon), **Pattern F** runs as best-effort and tags the result `boundary_violation` if at least one segment leaves the polygon.

Pattern V uses a different polygon than A–F: `route_poly = plant_fence − ICR_footprints` (constructed by `_build_route_polygon`, [`string_inverter_manager.py:267-328`](../../../python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py)). This is wider than `usable_polygon` — it includes the perimeter-road band and obstacle interiors, which is where physical cables actually run in real plants per the comment at lines 315-323 of that file.

### 1.3 Textbook references (verified)

- Lozano-Pérez & Wesley, *An Algorithm for Planning Collision-Free Paths Among Polyhedral Obstacles*, Communications of the ACM 22(10), 1979 [¹](https://dl.acm.org/doi/10.1145/359156.359164). The original VGRAPH formulation: nodes = obstacle vertices ∪ {start, goal}, edges = Euclidean segments not crossing any obstacle, shortest path via Dijkstra. 2,499 citations.
- Preparata & Shamos, *Computational Geometry: An Introduction*, Springer 1985, ISBN 978-0-387-96131-6 [⁴](https://link.springer.com/book/10.1007/978-1-4612-1098-6). Foundational textbook.
- de Berg, Cheong, van Kreveld & Overmars, *Computational Geometry: Algorithms and Applications*, 3rd ed. Springer 2008, Chapter 15: "Visibility Graphs: Finding the Shortest Route", pp. 307–317 [³](https://link.springer.com/book/10.1007/978-3-540-77974-2).

The new project's code citations to these references (`string_inverter_manager.py:87-90`) are correct.

---

## 2. Industry validity in solar PV CAD

The strongest honest answer here: visibility-graph routing is **not the documented standard** in any solar-PV CAD product I could verify, but the product space is opaque (algorithms aren't published), and visibility-graph + Dijkstra **is** the documented standard in adjacent industrial-CAD domains (pipe routing, wire-harness routing).

### 2.1 What solar-PV CAD tools document

- **PVcase** (AutoCAD plugin, market leader by adoption: 1,800+ customers / 80+ countries [⁵](https://pvcase.com/blog/autocad-for-solar-design-zimmerman)). The fixed-tilt cabling page [²](https://help.pvcase.com/hc/en-us/articles/35594999251603-Fixed-tilt-cabling) describes user-drawn AutoCAD polylines as trench definitions and exposes two algorithm modes: "Shortest path" ("the cabling algorithm is programmed to find the shortest cable route possible") and "Stick" ("toggle the cabling algorithm to follow the trench more strictly"). The underlying algorithm is **not documented**. Fair characterization: PVcase requires a human to draw the trench network, then algorithmically routes within it.
- **HelioScope** (Aurora Solar) [⁶](https://helioscope.aurorasolar.com/product-2/). "Uses actual wire models and lengths based on the layout to calculate wire resistance." No documented automatic trench routing.
- **PVsyst, Aurora Solar, Virto.solar** [⁷](https://help.virto.solar/knowledge-base/cable-trenches). Virto's automatic cable routing exposes a max-distance-to-trench parameter and reports unreachable strings as errors. Algorithm internals not documented.
- **RatedPower** [⁸](https://ratedpower.com/blog/cabling-solar-installations/). Discusses cable-volume reduction as a design objective; no routing-geometry specification.

**Verdict:** I cannot find any solar-PV CAD vendor that publicly documents a visibility-graph algorithm. The algorithms are proprietary and the product literature focuses on user-facing toggles ("shortest path", "stick to trench"), CAD integration, and BoM accuracy. Whether any of these tools use a visibility graph internally is **unverified**.

### 2.2 EPC standards on cable routing geometry

I checked the EPC standards landscape for prescriptive cable-routing geometry guidance:

- **IEC 62548-1:2023** *Photovoltaic (PV) arrays — Part 1: Design requirements* [⁹](https://webstore.iec.ch/en/publication/64171). Scope covers DC array wiring, electrical protection devices, switching and earthing, but **not trench-routing geometry**. The standard is about sizing, conductor type, polarity identification, fault protection — not where to draw the trench on the plot.
- **NFPA 70 (NEC) Article 690**, especially 690.31 [¹⁰](https://www.ecmweb.com/national-electrical-code/code-basics/article/20901221/article-690-solar-photovoltaic-systems-part-1). Covers conductor support, abrasion protection, water-path avoidance, raceway penetrations, DC/AC grouping intervals (≤6 ft), cable-tray sizing and structural support. **Does not specify routing geometry** — a visibility-graph route, an MST route, and a perimeter-road route are all NEC-compliant if the conductors are correctly sized, supported, and protected.
- **IFC / World Bank, *Utility-Scale Solar Photovoltaic Power Plants: A Project Developer's Guide* (2015)** [¹¹](https://ppp.worldbank.org/library/utility-scale-solar-photovoltaic-power-plants-project-developer-s-guide). I attempted to extract cable-routing guidance from the official PDF and could not surface specific routing-geometry text (the document's body is mostly compressed imagery in the public PDF; readable fragments don't address trench geometry). **Unverified** that the IFC guide prescribes routing geometry; the safe claim is that it discusses cable-volume reduction as a design objective, not a specific routing algorithm.

**Verdict:** None of IEC 62548-1, NEC 690, or the IFC developer's guide that I could verify specify a routing geometry. Standards constrain conductor sizing, protection, and identification — they leave routing geometry to the engineer. This means Pattern V is not violating any standard, and equally, it is not implementing one.

### 2.3 Visibility graphs in adjacent industrial CAD

Visibility-graph routing has documented use in:

- **Rectilinear pipe routing** ("Manhattan visibility graph") in aerospace and ship-construction CAD [¹²](https://www.tandfonline.com/doi/abs/10.1080/0951192X.2015.1033019).
- **Cable-harness routing in commercial trucks** [¹³](https://academic.oup.com/jcde/article/8/4/1098/6316573).
- **Aero-engine pipe routing** with compressed visibility graphs [¹⁴](https://link.springer.com/article/10.1007/s11465-021-0645-3).
- **Robotics motion planning** is the canonical academic textbook example [¹](https://dl.acm.org/doi/10.1145/359156.359164)[³](https://link.springer.com/book/10.1007/978-3-540-77974-2).

**Verdict:** Visibility-graph + Dijkstra is the standard primitive in industrial CAD routing problems with the same shape (start point, end point, polygonal forbidden region, want shortest in-region path). Solar-PV CAD's reluctance to publish algorithms doesn't mean they don't use it; it means we can't confirm. Pattern V is solidly within the established CG/CAD toolkit, just not provably representative of solar-PV CAD specifically.

### 2.4 Honest verdict

Pattern V is best characterized as **"a textbook visibility-graph + Dijkstra fallback, applied in a context where the dominant CAD products use proprietary routing algorithms that may or may not be the same primitive"**. It is not standard solar-PV CAD practice in the documented sense, because there is no documented solar-PV CAD practice for fully-automated trench routing — the dominant pattern is "user draws trench, software routes within it" (PVcase's documented model). It is **also** not novel — the underlying algorithm is 47 years old and is the textbook answer to "shortest in-polygon path between two points."

The customer-facing PDF should not claim Pattern V is industry standard. It should claim: Pattern V is the textbook computational-geometry answer to the routing problem, applied to fix a specific class of correctness issue in legacy's last-resort path. Whether commercial solar-PV CAD tools use the same primitive is unverified.

---

## 3. Pattern V correctness analysis

### 3.1 Geometric correctness

Pattern V's output is inside-`route_poly` by construction. Proof sketch: the cached graph's edges only include `(u, v)` pairs where `prepared.covers(LineString([u, v]))` is true, i.e. the segment is inside or on the boundary of `route_poly`. Terminal-attachment edges (s and e to graph nodes) have the same constraint. Dijkstra returns a path of these edges; the path's polyline is the concatenation of inside-polygon segments, hence inside the polygon. (See de Berg et al. ch. 15 for the formal version [³](https://link.springer.com/book/10.1007/978-3-540-77974-2).)

### 3.2 EPC-practice realism

This is where Pattern V is honestly weakest. Visibility-graph paths cut diagonals between polygon-boundary vertices — not orthogonal lines through row gaps. From a quick survey of public EPC plan drawings and aerial imagery of utility-scale plants:

- The dominant trench geometry is **orthogonal**: trenches run along row gaps and along perimeter roads, with right-angle turns. This is what every EPC plan drawing shows (e.g. Morris Ridge Solar Farm preliminary electrical drawings [¹⁵](https://www.edf-re.com/wp-content/uploads/005C_Appendix-05-B.-Preliminary-Electrical-Design-Drawings_Part-1-of-2.pdf)).
- Pattern V's diagonals across the polygon interior would in practice be installed as orthogonal segments hugging row gaps. The visibility-graph path is "geometrically optimal" but EPC-suboptimal.

This is acknowledged in the original finding memo: "Pattern V's routes contain Euclidean (diagonal) segments between polygon-boundary vertices, NOT strict Manhattan H/V… an inside-polygon diagonal is preferable to an outside-polygon Manhattan." That trade-off is real but it should not be sold as "EPC realistic". For the BoM total it is conservative-or-optimistic-by-small-amounts (a diagonal is shorter than the orthogonal staircase between the same endpoints, so Pattern V's contribution to `total_ac_cable_m` slightly underestimates what an EPC engineer would actually pull). For the visualization on the user's screen, Pattern V routes look subtly wrong — they don't follow row gaps. **This is a known cost.**

### 3.3 Caveat: I could not visually verify diagonal trenches in real plants

I attempted to find aerial imagery of utility-scale plants showing diagonal trenches and could not. The dominant geometry observable on satellite is orthogonal grids following module rows. **Unverified** that any production plant uses diagonal trenches — most likely they don't.

This means Pattern V routes are a *correctness fallback*, not a *representative* output. A user viewing the map will see one or two cables snake between polygon vertices in a way that no EPC drafter would draw. The correct framing for Prasanta's PDF: "Pattern V is what the new app does **when no orthogonal route exists inside the polygon** — it produces a geometrically valid route at the cost of looking unconventional. Legacy in the same situation produces a route that exits the polygon entirely, with no warning to the user."

---

## 4. Pattern V necessity in the current architecture

### 4.1 Recap of the architecture

Per [PRD §1.3 + §2.2](../PRD-cable-compute-strategy.md):

- `ac_cable_runs[]` (the polylines in the saved capture and on the user's screen) are MST trench geometry — one polyline per MST edge in the inverter-and-ICR Steiner tree.
- `total_ac_cable_m` is the sum of N independent per-inverter home-runs, each routed by `_route_ac_cable`. These home-run polylines are **not preserved** as runs anywhere in the data model (in legacy or in the new app's `_calc_individual_ac_total`).

Pattern V participates in **both** routings (it is called by both `_route_ac_mst` and `_calc_individual_ac_total`), but only its impact on `_calc_individual_ac_total` matters for the BoM. Its impact on `_route_ac_mst` matters for the visualization.

### 4.2 Could Patterns A-V-F just route along the MST trench?

Yes, but the BoM model would change. Specifically: each inverter's home-run length would become `path-along-MST(inverter, ICR)`, where the MST is the Steiner-like tree. This is the *sum-of-tree-paths-from-each-inverter-to-ICR*, **not** the same as `total_ac_cable_m` (which sums independent shortest paths). The two values differ; the sum-of-tree-paths is bounded above by the per-inverter sum (because trunk-sharing routes are always at least as direct as the MST trunk). The PRD §1.3 explicitly rejects the simpler "MST length" model (which underreports copper by 70-90%) but does not address the sum-of-tree-paths model. **This is an open future question** — flag it for Prasanta. If sum-of-tree-paths is judged EPC-correct, Pattern V's role in `_calc_individual_ac_total` could potentially go away entirely.

### 4.3 Could Pattern V be replaced by hard-reject Pattern F + "minimal-vertex visibility"?

Yes. Pattern V is exactly that: hard-reject inside-polygon routing on the boundary-vertex visibility graph. The "minimal" version (only relevant vertices, e.g. the convex-hull vertices and the concavity-bridging "reflex" vertices) is a known optimization [³](https://link.springer.com/book/10.1007/978-3-540-77974-2) and would shrink the graph from O(n²) to O(reflex²). Practical impact: the cache build is already amortized across all 15 cables that need V on `phaseboundary2`, so there's no significant runtime win. The structural answer is "Pattern V *is* the inside-polygon enforced fallback; the implementation just uses all polygon vertices instead of a curated subset, which is correct but slightly slower than necessary."

### 4.4 Is there a formal proof Pattern V finds the shortest inside-polygon path?

Modulo polygon-vertex sampling: yes. The shortest path between two points inside a simple polygon (potentially with holes) is a polyline whose vertices are a subset of {start, end, reflex vertices of the polygon} [³](https://link.springer.com/book/10.1007/978-3-540-77974-2)[⁴](https://link.springer.com/book/10.1007/978-1-4612-1098-6). Pattern V's graph includes all exterior + interior-ring vertices (a superset of reflex vertices), so the optimal path is in the search space, and Dijkstra finds it. Pattern V's path is therefore the optimal inside-`route_poly` route between `s` and `e`.

The "modulo" is real: if `route_poly` has been simplified or buffered after the parser, "shortest inside the simplified polygon" may differ from "shortest inside the true plant fence". For our pipeline this is not a concern at the meter scale.

---

## 5. Overshoot detection — empirical results on phaseboundary2

### 5.1 Methodology

Script: [`python/pvlayout_engine/scripts/parity/detect_legacy_overshoots.py`](../../../python/pvlayout_engine/scripts/parity/detect_legacy_overshoots.py). Two modes:

- **`--mode capture`** loads the persisted `numeric-baseline.json` polylines (which are MST trench, not per-inverter home-runs). Reports 0 overshoots — this is an artifact of what the capture preserves, not evidence about the BoM cables.
- **`--mode reconstruct`** (default) bootstraps `PVlayout_Advance@baseline-v1-20260429` onto `sys.path` (same trick as `capture_legacy_baseline.py`), monkey-patches legacy's `_route_ac_cable` to record every polyline it returns, runs the full pipeline, and analyses the captured per-inverter polylines (filtered by caller frame `_calc_individual_ac_total`) against two reference polygons:
  1. The plant fence (boundary projected to UTM, no obstacle subtraction).
  2. The `usable_polygon` (table-setback polygon — the actual referent that legacy's Pattern F `_score()` validates against).

Output: `docs/parity/baselines/baseline-v1-20260429/ground-truth/<plant>/overshoot-analysis-reconstructed.json`.

### 5.2 phaseboundary2 results

```
Plant fence area:    233,604.1 m^2 (EPSG 32644)
Usable poly area:    198,070.3 m^2  (after table-setbacks + obstacles)

INDIVIDUAL HOME-RUNS (legacy BoM cable set, n=62, total 12,726.5 m):
  vs PLANT FENCE
    Cables overshooting:       0  (0.0%)
    Outside-fence length:      0.0 m  (0.000%)
  vs USABLE POLYGON (Pattern F's referent)
    Cables overshooting:      38  (61.3%)
    Outside-usable length:   1,276.6 m  (10.031%)
    Min/Median/Max:         1.90 / 32.62 / 95.98 m

MST TRENCH (visualization geometry):
  Edges:                        62
  Edges overshooting fence:     0
  Total trench length:          3,590.0 m
  Trench outside fence:         0.0 m
```

### 5.3 Top-10 overshooting per-inverter cables on phaseboundary2

Sorted by `outside_usable_m` descending. All these cables are inside the plant fence; the "outside" is against the table-setback polygon, meaning they route through the perimeter-road / obstacle-buffer band.

| Rank | Cable length | Inside fence? | Outside `usable_polygon` | Polyline points |
|---|---:|---:|---:|---:|
| 30 | 327.9 m | Yes | 96.0 m | 4 |
| 20 | 254.2 m | Yes | 80.2 m | 4 |
| 24 | 281.4 m | Yes | 76.6 m | 4 |
| 32 | 414.8 m | Yes | 59.5 m | 5 |
| 31 | 400.6 m | Yes | 58.3 m | 5 |
| 18 | 241.9 m | Yes | 52.6 m | 4 |
| 16 | 170.4 m | Yes | 45.8 m | 4 |
| 10 | 151.9 m | Yes | 40.2 m | 4 |
| 15 | 210.3 m | Yes | 38.5 m | 4 |
| 7 | 145.4 m | Yes | 34.8 m | 4 |

Distribution across all 38 overshooters: min 1.9 m, median 32.6 m, P90 80.2 m, max 96.0 m, sum 1,276.6 m.

### 5.4 Reconciliation with the original Pattern V finding memo

The original [Pattern V finding memo](../../historical/parity/findings/2026-04-29-001-pattern-v.md) says: *"On phaseboundary2.kmz with cable calc enabled, 15 AC cables route 34–64 m OUTSIDE the plant boundary in legacy."* That number is **not reproduced** here when measured against the plant fence — every per-inverter route in the legacy run on `phaseboundary2` lies inside the fence. It is **partially reproduced** when measured against `usable_polygon` (38 cables, range 1.9–96 m).

The original "15 cables 34-64 m" figure most likely refers to the new project's pre-Pattern-V path: when the new app runs Patterns A-E-F (no V) against `usable_polygon`, 15 routes fail Manhattan templates and fall to Pattern F, which then leaves the polygon. The exact reproduction of that 15-cable figure would require running the new app with Pattern V disabled and counting `route_quality == "boundary_violation"` results — that is feasible but was not done in this finding.

For the customer-facing PDF, the safe and accurate framing is:

- Legacy on `phaseboundary2` does not produce cables outside the plant fence.
- Legacy on `phaseboundary2` does produce 38 cables totalling 1.3 km that route through the perimeter-road / obstacle-buffer band (outside `usable_polygon` but inside the fence). Whether this is a "violation" depends on whether you accept Pattern F's `usable_polygon` as the correctness referent. EPC engineers would generally accept perimeter-road routing as legitimate; Pattern F's `_score()` does not.
- The killer claim is structural, not numerical: legacy's last-resort Pattern F counts violations rather than rejecting them, and there is no auditable per-cable trace because legacy discards the polylines.

### 5.5 complex-plant-layout

Capture is still running in background (PID 65484, ~2hrs in at time of writing). The script supports `--plant complex-plant-layout` and will produce the same analysis once the capture lands. Expected: more cables (1,079 inverters), higher absolute overshoot length, similar fraction. Do not wait for it before sharing the memo with Prasanta — the methodology is established and the rerun is mechanical.

---

## 6. Conclusion and recommendation

### 6.1 What the PDF should say

1. **Legacy's correctness model has a structural weakness** that's independent of any specific KMZ: Pattern F's `_score()` ranks candidates by violation count rather than rejecting violators, and `_calc_individual_ac_total` discards every polyline it computes. The 12,974.5 m AC BoM number on `phaseboundary2` is asserted without per-cable evidence in the saved capture. This is a code-as-spec design weakness that the new app's `route_quality` tagging and per-cable polyline preservation directly fix.

2. **Empirical violations exist on `phaseboundary2`**: 38 of 62 per-inverter home-runs (61%) route outside the table-setback `usable_polygon` (range 1.9–96 m, total 1.3 km of 12.7 km). All stay inside the plant fence. The framing for the PDF: the table-setback polygon is the design-intent boundary for cable routing in legacy's own model, and 61% of cables violate it. This is a quality-of-output issue, not a "cables outside the plant" issue — phrase carefully.

3. **Pattern V is the new app's fix** and is geometrically correct by construction. It is also a 47-year-old textbook algorithm with documented use in adjacent industrial-CAD domains. It is not standard solar-PV CAD practice in the documented sense — but no solar-PV CAD vendor publishes their routing algorithm, so "standard" is unverifiable.

4. **Pattern V is necessary in the current architecture** because per-cable home-run BoM demands it. An alternative architecture (sum-of-tree-paths BoM) would remove the necessity — that is an open future question, not a current decision.

### 6.2 What the PDF should NOT say

- Do **not** claim "15 AC cables route outside the plant boundary in legacy." This is not supported when measured against the actual fence. The supportable variant is "outside the table-setback polygon."
- Do **not** claim Pattern V is industry standard. The documented EPC-CAD landscape doesn't support this claim; the most we can honestly claim is academic pedigree and adjacent-domain use.
- Do **not** claim Pattern V is EPC-realistic visually. Its diagonal segments are correct but unconventional.
- Do **not** cite the IFC developer's guide for routing geometry — the public PDF didn't surface routing-geometry guidance under WebFetch and the standard claim "IFC mandates orthogonal trenches" is not verified.

### 6.3 Unverified claims (dropped or labelled in this memo)

- "Visibility-graph routing is used by PVcase / Helioscope / etc. internally." → Unverified. Vendors don't publish algorithms.
- "IEC 62548 / NEC 690 / IFC guide prescribe routing geometry." → Verified to be **false** for IEC 62548-1 and NEC 690 (those specify sizing, protection, identification, support — not routing geometry). Unverified for IFC (could not extract specifics from the public PDF).
- "Real plants don't have diagonal trenches." → Plausibly true based on observed orthogonal grids in public aerial imagery and EPC plan drawings, but I cannot prove a negative. Labelled "unverified — likely true."
- "Pattern V matches what PVcase / Virto.CAD do internally for trench-constrained routing" (as the original finding memo's comment at line 89 of `string_inverter_manager.py` claims). → Unverified. Removed from the customer-facing claim.
- "15 cables 34-64 m outside the plant boundary in legacy on phaseboundary2." → Not reproduced when measured against the plant fence. Reproduced as 38 cables / 1.9-96 m against `usable_polygon`. Reframe before publishing.

---

## 7. Reproduction commands

```bash
# Empirical numbers in this memo:
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python scripts/parity/detect_legacy_overshoots.py \
    --plant phaseboundary2 --mode reconstruct

# When complex-plant capture lands:
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python scripts/parity/detect_legacy_overshoots.py \
    --plant complex-plant-layout --mode reconstruct

# Produces overshoot-analysis-reconstructed.json under
# docs/parity/baselines/baseline-v1-20260429/ground-truth/<plant>/.
```

The reconstruct mode requires `PVlayout_Advance` checked out at branch `baseline-v1-20260429` (HEAD `397aa2a` at capture time). Default `--legacy-repo /Users/arunkpatra/codebase/PVlayout_Advance` matches the canonical local path.

---

## Footnotes

[¹]: Lozano-Pérez & Wesley, "An Algorithm for Planning Collision-Free Paths Among Polyhedral Obstacles", Communications of the ACM 22(10), 1979 — https://dl.acm.org/doi/10.1145/359156.359164
[²]: PVcase Help Center, "Fixed-tilt cabling" — https://help.pvcase.com/hc/en-us/articles/35594999251603-Fixed-tilt-cabling
[³]: de Berg, Cheong, van Kreveld & Overmars, *Computational Geometry: Algorithms and Applications*, 3rd ed., Springer 2008 — https://link.springer.com/book/10.1007/978-3-540-77974-2
[⁴]: Preparata & Shamos, *Computational Geometry: An Introduction*, Springer 1985, ISBN 978-0-387-96131-6 — https://link.springer.com/book/10.1007/978-1-4612-1098-6
[⁵]: PVcase blog, "80% faster solar design with AutoCAD & PVcase Ground Mount" — https://pvcase.com/blog/autocad-for-solar-design-zimmerman
[⁶]: HelioScope product page (Aurora Solar) — https://helioscope.aurorasolar.com/product-2/
[⁷]: Virto.solar Help, "Cable trenches" — https://help.virto.solar/knowledge-base/cable-trenches
[⁸]: RatedPower blog, "Cabling solar installations for maximum efficiency" — https://ratedpower.com/blog/cabling-solar-installations/
[⁹]: IEC 62548-1:2023, *Photovoltaic (PV) arrays — Part 1: Design requirements* — https://webstore.iec.ch/en/publication/64171
[¹⁰]: EC&M, "Article 690, Solar Photovoltaic Systems — Part 1" (NEC 690 review) — https://www.ecmweb.com/national-electrical-code/code-basics/article/20901221/article-690-solar-photovoltaic-systems-part-1
[¹¹]: IFC / World Bank, *Utility-Scale Solar Photovoltaic Power Plants: A Project Developer's Guide* (2015) — https://ppp.worldbank.org/library/utility-scale-solar-photovoltaic-power-plants-project-developer-s-guide
[¹²]: Liu, Wang, "A rectilinear pipe routing algorithm: Manhattan visibility graph", International Journal of Computer Integrated Manufacturing 29(2), 2015 — https://www.tandfonline.com/doi/abs/10.1080/0951192X.2015.1033019
[¹³]: "Automatic design system for generating routing layout of tubes, hoses, and cable harnesses in a commercial truck", Journal of Computational Design and Engineering 8(4), 2021 — https://academic.oup.com/jcde/article/8/4/1098/6316573
[¹⁴]: "Group-based multiple pipe routing method for aero-engine focusing on parallel layout", Frontiers of Mechanical Engineering, 2021 — https://link.springer.com/article/10.1007/s11465-021-0645-3
[¹⁵]: Morris Ridge Solar Farm — Preliminary Electrical Design Drawings (EDF Renewables, 2019) — https://www.edf-re.com/wp-content/uploads/005C_Appendix-05-B.-Preliminary-Electrical-Design-Drawings_Part-1-of-2.pdf

---

*End of finding 002. Empirical numbers are reproducible via `detect_legacy_overshoots.py`. Citations are verified except where labelled unverified. Headline numbers and citations have been double-checked at draft time; if Prasanta's review surfaces a contested claim, the underlying script and its JSON output are the source of truth.*
