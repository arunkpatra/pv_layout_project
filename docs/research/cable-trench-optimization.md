# Research note — Cable-Trench cost optimisation (MST + SP)

**Written:** 2026-04-24
**Status:** research note for future scoping. **Not on SPIKE_PLAN.** Do not implement without a dedicated spike.
**Owner:** Arun Patra (user-scoped).
**Author:** Claude (research), triggered by S11.5 cable-calc correctness conversation.
**Related:** [S11.5 spec](../superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md), [ADR 0007](../adr/0007-pvlayout-core-s11-5-exception.md), [S11.5 gate memo](../gates/s11_5.md).

---

## 0. TL;DR

1. The current cable-calc (post-S11.5) routes each cable independently — shortest path per inverter → ICR. Every cable gets its own imaginary trench; there's no sharing, no trench BOM, no trench-cost model.
2. Real EPC design wants **shared trenches**: many cables ride in the same dig. Trench length is a first-class design quantity. Total trench length ≪ total cable length. Trench cost (excavation + backfill + pulling labour) is a significant fraction of balance-of-system cost.
3. The formal problem is the **Cable-Trench Problem (CTP)** — combine MST (for shared trench topology) with shortest-path-tree (for each cable's routing). NP-complete (Vasko et al. 2002). Practical plants use approximation algorithms (LP rounding, Lagrangian, greedy MST-then-route, dynamic programming for specialised structure).
4. **Cost to implement here:** ~1500–2500 LOC, 1–2 weeks focused work. New dependency on `networkx`; optional commercial MILP solver (gurobipy) for benchmark-quality exact solutions. Substantial UI work (new canvas layer, trench hover, BOM panel extension). Algorithm tuning depends on real τ (trench-cost-per-metre) and γ (cable-cost-per-metre) calibration.
5. **When to build it:** **not** during the current feature-parity run (S11.5 → S13.8). Candidate for post-v1 if (a) customer EPCs specifically request construction-grade BOM with trench plans, (b) the product position shifts from preliminary-design toward construction engineering, or (c) a large enough deal justifies it. PVcase occupies this territory; catching up is a substantial undertaking.
6. **Do not under-commit.** The implementation surface is large and the optimisation has real correctness / calibration risks. A half-done CTP is worse than no CTP — it produces confident-looking BOM numbers that are wrong.

---

## 1. Problem definition

### 1.1 Informal

Given:
- A set of **sources** (string inverters on the PV plant canvas).
- A set of **sinks** (ICR buildings; typically 1–4 per plant).
- An **inverter-to-ICR assignment** (fixed from upstream — our `_assign_to_icrs` produces it).
- A **routing domain** (the plant-boundary polygon, minus hard obstacles — the same `route_poly` Pattern V uses in S11.5).
- A **trench-cost parameter** τ (price per metre of excavated trench, irrespective of how many cables it carries).
- A **cable-cost parameter** γ (price per metre of cable, per cable).

Find:
- A set of **trench polylines** forming a network in the routing domain.
- For each cable, a **path** through the trench network from its inverter to its assigned ICR.

Minimising:
```
total_cost = τ · total_trench_length
           + γ · Σ (path_length_of_cable_i)
```

Subject to:
- Every cable's path is contained in the trench network.
- Every trench segment that carries at least one cable is in the solution.
- Routing stays inside the routing domain (hard constraint from S11.5).

Two extremes worth understanding:
- **γ = 0, τ > 0** → pure Minimum Spanning Tree. Minimises trench length; cables take long detours. Example: a "spine" trench running the length of the plant, every inverter tapping it via a short stub.
- **γ > 0, τ = 0** → pure Shortest-Path Tree (what S11.5 gives you). Minimises cable length; every cable gets its own trench. Total trench = total cable.
- **γ ≈ τ** (the real case) — the optimal topology sits between these. Some cables share long trench runs; some pay for their own dig to shorten their path.

### 1.2 Formal

This is the Cable-Trench Problem (Vasko, Newhart, Strauss — *Computers & Operations Research* 2002, [DOI 10.1016/S0305-0548(00)00083-6](https://doi.org/10.1016/S0305-0548(00)00083-6)):

> Given a connected graph G = (V, E) with edge weights w, a root v₀ ∈ V, and parameters τ, γ ≥ 0, find a spanning tree T ⊆ E minimising
>
> τ · Σ_{e ∈ T} w(e) + γ · Σ_{v ∈ V\{v₀}} d_T(v₀, v)
>
> where d_T is the shortest-path distance along T.

**Complexity:** NP-complete in general. Reduces from both MST and Single-Source-Shortest-Path simultaneously — neither alone is hard, but combining them is.

**Variants relevant to solar plants:**
- **Multi-root CTP** — our case has multiple ICRs (v₀ is not unique). Harder. Usually approached by partitioning inverters to ICRs first (we already do this in `_assign_to_icrs`), then solving per-ICR CTP instances independently.
- **Capacitated CTP** — each trench has a maximum cable-count capacity (real trenches can only hold so many cables at once). Harder. In practice solved by parallel-trench duplication rather than true capacity constraints.
- **Generalised CTP** (recent work, 2023+) — ancillary constraints like minimum separation between cable types (AC/DC per IEC 60364), fixed "must-use" corridors (existing roads).
- **Solar Farm Cable Layout Problem (SoFaCLaP)** — explicit PV-plant formalisation with combiner boxes as intermediate nodes. [*Energy Informatics* 2022](https://energyinformatics.springeropen.com/articles/10.1186/s42162-022-00200-z).

---

## 2. What the current cable-calc does (post-S11.5)

After S11.5 Pattern V lands:

| Stage | What happens | Cost model |
|---|---|---|
| K-means cluster tables into inverter groups | `_kmeans_cluster` (unchanged from pre-S11.5) | — |
| Place inverter at each cluster centroid | `_find_inverter_position` | — |
| Route DC cable: table → inverter, per table | `_route_ac_cable` pattern A (trivial on grid layouts) | — |
| Assign inverters to ICRs (capacity-based) | `_assign_to_icrs` | — |
| Route AC cable: inverter → ICR, per inverter | `_route_ac_cable` patterns A/A2/A3/A4/B/C/D/E/V/F | — |
| Report totals | `total_dc_cable_m`, `total_ac_cable_m` | Σ of independent path lengths |

**What this does NOT give you:**
- A **trench plan.** The polylines we emit are cable polylines; there's no notion of "these five cables share a trench here."
- **Trench cost.** We compute cable-length cost only, implicitly assuming τ = 0. If you asked "what's the excavation cost?" we can't answer.
- **Shared segments.** If five cables all route through the same row-gap corridor, we draw five overlapping polylines and count five times the length. Real engineering would dig one trench and pull all five through it.
- **MV trench.** ICR-to-grid runs are out of our scope anyway (`S11.5 §4.2`).
- **Any notion of trenching order, staging, or construction scheduling.**

These gaps matter when:
- The audience is a **construction EPC**, not a feasibility engineer.
- The deliverable is a **bid-grade BOM**, not a yield estimate.
- The customer compares our output to **PVcase or Virto.CAD** outputs directly.

---

## 3. What adding CTP changes

### 3.1 The algorithm

Two-stage (decoupled, easy):
1. Build a **candidate trench graph** — the set of all physically reasonable trench segments in the routing domain.
2. Solve a (multi-commodity, multi-root) CTP on that graph for given τ / γ.

The candidate trench graph is where most of the engineering happens. Real EPC practice constrains it:
- Trenches follow row gaps (already computed — `_get_row_gap_ys`).
- Trenches run along the perimeter road (inside the plant boundary setback).
- Cross-corridors connect row gaps to the perimeter at intersections with internal roads / paths.
- Trenches don't cross each other at acute angles (manufacturing constraint — trenches intersect at right angles).
- Trench width depends on cable count + type (AC/DC separation per IEC 60364 = 150–300 mm); can be modelled as a capacity on each edge or ignored for simplicity.

### 3.2 The data model

**New domain types** (`pvlayout_core/models/project.py`, additive):

```python
@dataclass
class TrenchRun:
    """A physical trench — one dig, potentially multiple cables."""
    id: int
    polyline_utm: List[Tuple[float, float]]  # ordered points
    length_m: float
    cables: List[int]                  # indices into flat cable list
    cable_types: Set[str]              # {"dc", "ac"} or singleton
    width_m: float = 0.6               # default 600 mm (IEC-reasonable)
    depth_m: float = 0.8               # default 800 mm
    cost: float = 0.0                  # τ × length_m, calibrated at run time

@dataclass
class CableTrenchSegment:
    """One segment of one cable, referring to which trench it rides in."""
    cable_index: int                   # into dc_cable_runs + ac_cable_runs
    trench_id: int                     # into placed_trenches
    t_start: float                     # parametric position along trench polyline [0, 1]
    t_end: float
```

**Extensions to `LayoutResult`:**

```python
placed_trenches: List[TrenchRun] = []
cable_trench_segments: List[CableTrenchSegment] = []
total_trench_m: float = 0.0
trench_cost_total: float = 0.0
cable_cost_total: float = 0.0
combined_bos_cost: float = 0.0
```

**Wire schema + adapter mirrors** follow existing patterns.

### 3.3 The optimisation kernel

Three implementation options, in order of increasing sophistication:

**Option A — Greedy MST + routing (simplest, ~80 % of optimal)**

1. Build candidate trench graph G.
2. Compute MST of G rooted at each ICR.
3. For each inverter, find shortest path on the MST to its assigned ICR — this is a single tree-walk.
4. The union of these paths *is* the trench set (every edge used by ≥1 cable).
5. Prune MST edges with zero cables.

Runtime: O(E log V + N · V) for V graph vertices, E edges, N inverters. For a MWp plant this is seconds, not minutes.

Quality: reliably within 10–20 % of optimal for typical τ/γ ratios. Acceptable for preliminary design.

**Library:** `networkx` (already a well-known dependency in Python-scientific ecosystem; stable and maintained).

**Option B — Greedy + improvement (moderate, ~90–95 % of optimal)**

Take option A's output as initial solution, then iteratively improve:
- **2-opt-style swaps** — try replacing one trench edge with another; accept if the combined objective improves.
- **Ejection chain** — local search with multi-edge moves.
- **Simulated annealing** with temperature decay.

Runtime: ~1–5 minutes for a MWp plant. Scales poorly with edge count; may need time budget with early cut-off.

**Option C — Exact ILP (benchmark quality, perfect for small instances)**

Full MILP formulation. Variables:
- Binary x_e = 1 if trench edge e is used.
- Continuous f_{i,e} = flow of cable i on edge e.
- Continuous path lengths d_i per cable i.

Objective: minimise τ · Σ x_e w_e + γ · Σ d_i.

Constraints: flow conservation, path consistency, MST-like connectivity.

Library: `PuLP` (open-source, uses CBC by default) or `gurobipy` (commercial, faster — 10–100× on NP-hard instances; usually needed for anything beyond a few hundred edges).

Runtime: minutes on small plants (< 20 MWp), hours or DNF on large plants. Only useful for benchmarking / comparing approximation quality.

### 3.4 Recommendation for a future spike

**Build option A first.** Validate on a few real plants. Compare trench-cost output to PVcase / Virto.CAD output for the same plant if customer data is available. If option A is "close enough" (within 10–15 % of commercial-tool numbers), **stop there** and don't build option B or C. Diminishing returns.

---

## 4. Implementation plan — proposed phases

Each phase has a clear deliverable and testable outcome. Numbers are estimates; re-scope when the spike is authored.

### Phase A — Data model + wire mirrors (~200 LOC, 1–2 days)

- Add `TrenchRun`, `CableTrenchSegment` to `pvlayout_core/models/project.py`.
- Add `LayoutResult` fields listed in §3.2.
- Mirror on sidecar schemas + adapters.
- Wire-format round-trip tests.

### Phase B — Candidate trench graph (~300 LOC, 2–3 days)

- Extract graph from `route_poly` + `_get_row_gap_ys` + `_get_col_xs` + perimeter road polyline.
- Nodes at: corridor intersections, inverter positions, ICR centres.
- Edges between adjacent nodes in corridors, weighted by Euclidean length.
- **Validation:** unit tests with synthetic plants (rectangular, L-shape, disjoint MultiPolygon) — assert graph connectivity and node count.
- Visualisation debug helper: emit trench graph as WGS84 GeoJSON so a reviewer can see the graph on Google Earth before the solver runs.

### Phase C — Optimisation kernel (option A) (~200 LOC, 2–3 days)

- `networkx.minimum_spanning_tree` on the graph rooted at ICR.
- Per-inverter shortest-path on the MST to its assigned ICR.
- Produce `TrenchRun`s from the union of used edges.
- Produce `CableTrenchSegment`s by tracing each cable's path.
- Compute costs with configurable τ / γ.
- **Validation:** integration test on `phaseboundary2.kmz`. Assert total trench length < Σ cable paths, assert every cable's trench mapping covers its full length, assert no trench lies outside `route_poly`.

### Phase D — Canvas rendering (~400 LOC, 3–4 days)

- New map layer: `trenches`, visible by default, toggle-able.
- Trench polylines thicker than cable polylines; distinct colour (earth tone per the solar-plant design language).
- Hover tooltip: trench ID, length, cables carried, estimated cost.
- Click-to-highlight: click a trench → highlight all cables riding it.
- Update canvas visual language docs (S5.5 lineage).

### Phase E — Summary panel extension (~200 LOC, 1–2 days)

- New "Trench & Cable BOM" subsection in summary panel.
- Per-trench row: length, cables, excavation cost.
- Per-cable-type row (DC / AC): total length, cable cost.
- Combined BOS cost: `trench_cost_total + cable_cost_total`.
- Input fields for τ and γ (with sane defaults — placeholder until real calibration).

### Phase F — τ / γ calibration + unit-economics (~100 LOC, 1 day)

- Add `ExcavationCosts` domain type: `trench_cost_per_m`, `cable_cost_per_m_by_gauge` (future-linked to ampacity — out of this scope).
- Expose as `LayoutParameters` fields or separate `EconomicsParameters`.
- Reasonable defaults based on published 2024–2026 India/global utility-scale EPC contracts; flag as *illustrative* in the UI.
- Document the source of defaults in the spike's gate memo.

### Phase G — Docs + tests (~300 LOC, 1–2 days)

- Spec in `docs/superpowers/specs/`.
- ADR for the CTP algorithm choice (option A vs B vs C), the data-model additions, and any new dependencies.
- Unit tests: ~30 covering graph construction, MST correctness, path tracing, cost math.
- Integration tests: one per reference KMZ with expected trench count + total length.
- Gate memo: measured runtimes, quality comparison if commercial-tool reference is available.

### Phase H (optional, not part of the core spike) — exact-solution benchmarking (~300 LOC, 2–3 days)

- Add PuLP-based MILP formulation behind a `PVLAYOUT_CTP_EXACT=1` flag.
- Run on phaseboundary2 as a one-time benchmark.
- Report the approximation ratio of option A.
- Do NOT ship this path in the release artefact (optional dependency, or pulp as a dev-only dep).

---

## 5. Total cost

| Category | Estimate |
|---|---|
| Production code (Python) | ~1200 LOC |
| Tests | ~500 LOC |
| Frontend code (TypeScript + React) | ~400 LOC |
| Docs | ~300 LOC |
| **Total LOC** | **~2400 LOC** |
| Calendar time (focused, one engineer) | 1.5–2 weeks |
| New Python deps | `networkx` (required) |
| Optional Python deps | `pulp` (open-source MILP), `gurobipy` (commercial MILP) |
| New TypeScript deps | none (canvas layer uses existing MapLibre + deck.gl) |
| CLAUDE.md §2 exception | Yes — algorithm lives in `pvlayout_core/` (new module, e.g., `trench_optimizer.py`). Follow ADR-0007 pattern: scoped exception, named files, additive-only on shared models. |

---

## 6. Risks

### 6.1 Calibration risk

Optimisation output is only as good as τ and γ. If we ship with placeholder values ("0.8 USD/m trench, 4 USD/m cable, dummy"), EPC reviewers will see confident-looking costs that are completely wrong. Two mitigations:

- **Always flag numeric output as illustrative until τ/γ are calibrated from the user's project-specific rate table.** Show a warning banner; require user confirmation.
- **Build the τ/γ calibration UI as part of the spike** (Phase F above). Don't retrofit later.

### 6.2 Combinatorial explosion

The CTP is NP-hard. Option A (greedy MST) is polynomial and scales, but option B (iterative improvement) and option C (exact MILP) don't. On a 100 MWp plant with ~500 inverters, option B may exceed a minute; option C may exceed an hour. **Budget runtime from the start.** Time-capped solvers with graceful early-exit; fall back to option A's output.

### 6.3 Graph construction edge cases

Plants with disjoint usable polygons (like `phaseboundary2` post-setback) need special handling in the trench graph. Pattern V already resolved routing across the whole plant by using `route_poly` — the trench graph should use the same strategy. But then we also need to decide: does the trench cross the "gap" (inside `boundary_poly` but outside `usable_polygon`)? Yes in principle — the gap is typically the perimeter road. The trench graph node/edge construction must account for this.

### 6.4 Visual complexity

Rendering trenches + cables + tables + inverters + LAs + ICRs + obstacles + boundary + ambient grid on one canvas without visual noise is hard. Trenches are thick (1–2 px weight), earth-coloured. Cables ride on top, thinner, cool-hued. Clicking a trench should highlight all cables on it. This is real design work — the S13.5 dark-theme parity spike is the precedent for how much UI polish can consume a spike.

### 6.5 Contract churn with downstream consumers

Adding `TrenchRun` to `LayoutResult` changes the wire schema. S11 endpoints (`/refresh-inverters`, `/add-road`, `/remove-road`) all return `LayoutResult` and need to either carry trenches through (if they re-run CTP) or clear them (if not). Big decision: does every mutation re-solve the CTP, or does the user explicitly re-solve? Performance-wise, the CTP solve on a MWp plant is seconds; doing it on every mutation is tolerable. Product-wise, it's the cleanest UX. Worth prototyping both.

### 6.6 PVcase / Virto / RatedPower feature parity

These tools have been at this for years. Matching their output exactly on the same KMZ is effectively impossible without access to their algorithm internals. Expect 5–20 % trench-length delta vs commercial tools on the same plant. Document this openly; don't chase exact parity.

---

## 7. Open questions to resolve during spike scoping

1. **Does this spike include MV (ICR → grid) trench routing?** Currently out of scope. Adding MV multiplies the data model + UI work but adds real EPC-grade value. Lean "no" unless a customer specifically asks.
2. **Per-cable gauge / ampacity selection** — is it done in this spike or deferred to S12/S13? If deferred, γ is a single scalar per cable type (DC/AC), not per-gauge. Simpler; probably the right call.
3. **Capacitated trenches** — do we model "max N cables per trench" explicitly, or allow unbounded? Allowing unbounded is simpler and matches most real installations; capacity becomes a post-hoc verification step.
4. **Does CTP run on every mutation, or on-demand?** See risk §6.5.
5. **`networkx` as a required dependency** — it adds ~5 MB to the PyInstaller bundle. S15.5 ("sidecar bundle slimming") is deliberately parked until real-user feedback; adding networkx is against that grain. Acceptable if the CTP feature is worth the bundle cost; flag it in the spike's gate.
6. **Dark theme** — the new trench layer needs a dark-theme companion. Coordinate with S13.5 (dark theme parity) so they're designed together if S13.5 hasn't shipped yet.
7. **Export formats** — KMZ, PDF, DXF exporters (S12, S13) all need updates to carry trench polylines. Each export format's layer taxonomy changes. Non-trivial.
8. **Backward compatibility of golden-file tests** — adding trench data to `LayoutResult` means existing `test_golden_*` fixtures get new fields. Acceptable as a one-time golden-file bump; flag in the spike.
9. **Does the algorithm respect AC/DC separation?** Per IEC 60364, DC and AC should be in separate trenches or separated by 150–300 mm in the same trench. Option: model this as two parallel trenches (separate instances sharing a route). Option: model as one trench with a `layer` property. Open design question.
10. **Is trench orientation relevant?** Real construction cares about which direction a trench is dug (soil type, water-table gradient). This is civil engineering, not layout engineering — almost certainly out of scope, but worth explicitly parking.

---

## 8. When NOT to build this

- **Current feature-parity run (S11.5 → S13.8).** CTP is not parity with `PVlayout_Advance`. It's a new feature entirely. Parity-first.
- **Pre-revenue.** Revenue drives what features matter. No customer has asked for trench BOM; ship the current product, listen, react.
- **As a response to a single customer request** unless the customer is paying multiples of the spike's cost. This is 2 weeks of engineering; the customer contract should reflect that.
- **As "just a small extension of S11.5."** It isn't. The data model changes, the UI changes, the export formats change. A clean ADR-scoped addition like Pattern V fit in S11.5 because it was 100 LOC. CTP is 2000+.
- **Without τ / γ calibration from the customer's own cost tables.** Shipping CTP with placeholder costs is worse than not shipping CTP. See §6.1.

---

## 9. Alternatives that are cheaper

### 9.1 "Trench = union of cable paths with threshold"

A visualisation-only feature. No optimisation. Render shared segments (where N cables run the same polyline within ε metres) as a thick trench; disjoint segments stay as thin cable lines. Output: a rendered "trench layer" that suggests where digs will go without computing any BOM.

Cost: ~300 LOC, 2–3 days. No algorithm work. No new deps. Produces a construction-like visualisation without pretending to optimise.

Good compromise for a customer who wants "show me the trenches" but doesn't need cost optimisation.

### 9.2 "MST without cable routing"

Run MST-based trench planning, but don't rewrite cable routing. Cables still route independently via current S11.5 logic; the MST is a recommended trench layout the customer's EPC can conform to manually.

Cost: ~500 LOC, 3–5 days.

Less useful than 9.1 because the MST doesn't guarantee cable paths lie on the trench network — mostly a "suggested" artefact.

### 9.3 "Cable-length-only BOM" (current state + export extension)

Keep S11.5's output as-is, but add cable-schedule export formats (CSV per ICR, DXF per cable type, KMZ overlay). This is what customers primarily want for preliminary-design stage; trench design happens later in detailed engineering.

Cost: ~400 LOC, 2–3 days. Folds into S12 / S13 export work.

Recommended as the first cost-economics feature the product ships, regardless of whether CTP lands later.

---

## 10. Sources

Academic:
- Vasko, F. J.; Newhart, D. D.; Strauss, A. D. (2002). *The cable trench problem: combining the shortest path and minimum spanning tree problems.* Computers & Operations Research 29(5): 441–458. [DOI 10.1016/S0305-0548(00)00083-6](https://doi.org/10.1016/S0305-0548(00)00083-6).
- Kutztown University mathematics — [The Cable-Trench Problem](https://www.kutztown.edu/academics/colleges-and-departments/liberal-arts-and-sciences/departments/mathematics/research/cable-trench-problem.html). Reference page with history, variants, and solver pointers.
- *Solar farm cable layout optimization as a graph problem* — *Energy Informatics* 2022. [Full text](https://energyinformatics.springeropen.com/articles/10.1186/s42162-022-00200-z). Defines SoFaCLaP.
- *The Constrained Layer Tree Problem and Applications to Solar Farm Cabling* — arXiv 2410.15031 (2024). [HTML](https://arxiv.org/html/2410.15031v1). Dynamic-programming approach; multiple orders of magnitude faster than MILP for the layer-tree structure.
- *Optimizing solar farm interconnection networks using graph theory and metaheuristic algorithms* — *Scientific Reports* 2025. [Full text](https://www.nature.com/articles/s41598-025-18108-5). Uses Prim's algorithm + PSO comparison on real farm data.
- Mitchell, J. S. B. — *Shortest Paths and Networks.* Handbook of Discrete and Computational Geometry, ch. 31. [PDF](https://www.csun.edu/~ctoth/Handbook/chap31.pdf). Reference for polygon-constrained shortest paths.

Commercial tools that solve some form of CTP:
- **PVcase Ground Mount** (AutoCAD-based, utility-scale). Explicit trench-route output. [Layout information & BOM docs](https://help.pvcase.com/hc/en-us/articles/35594251310611-Layout-information-BOM).
- **Virto.CAD** (AutoCAD / BricsCAD plugin). 3D cabling visualisation, tray width + quantity outputs. [Product page](https://virto.solar/virto-cad/).
- **RatedPower** (web-based, feasibility-grade). Automated shortest-path cable routing on a pre-built corridor graph. [Cabling blog post](https://ratedpower.com/blog/cabling-solar-installations/).
- **HelioScope** (web). Electrical design with BOM export; less trench-oriented. [Electrical Design guide](https://help-center.helioscope.com/hc/en-us/articles/4419953067411-4-Electrical-Design).

Industry standards (relevant if we build Phase F cost calibration):
- IEC 60364-7-712 — PV installations; voltage drop + cable selection reference.
- IEC 62548-1:2023 — PV array design; cable routing + separation.
- IEC TS 62738 — Large PV power plants; design guidelines.
- IEC 60364-5-52 — Cable selection and erection; ampacity tables.
- CEA 2010/2023 (India) — construction + safety standards for electrical plants.

In-project references:
- [S11.5 spec](../superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md) — current cable-calc correctness requirements.
- [ADR 0007](../adr/0007-pvlayout-core-s11-5-exception.md) — the `pvlayout_core` §2-exception pattern; template for a future CTP ADR.
- [S11.5 gate memo](../gates/s11_5.md) — measurements and boundary-violation findings that would extend to trench-quality validation.
- [`string_inverter_manager.py`](../../python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py) — `_build_route_polygon`, `_build_boundary_vis_graph`, `_route_visibility` are directly reusable by a CTP implementation. `_get_row_gap_ys`, `_get_col_xs` give the natural trench-corridor axes.

---

## 11. Relationship to existing spikes

| Spike | How CTP interacts |
|---|---|
| S11.5 | S11.5 must have closed first. CTP reuses Pattern V's `route_poly` + visibility graph primitives. Don't build CTP before S11.5. |
| S11's deferred rigorous-testing spike | Independent. Can proceed in parallel or in sequence. |
| S12 (KMZ / PDF export) | **Affects** — KMZ exporter needs to carry trench polylines. If CTP ships before S12, S12's scope grows; if after, S12 is clean and a post-CTP "export extension sub-spike" (S12.5?) folds in trench export. |
| S13 (DXF / CSV / energy yield) | **Affects** — DXF exporter gains a `TRENCHES` layer. Same sub-spike pattern as above. |
| S13.5 (Dark theme parity) | Must be aware. Trench colour palette needs both themes designed. |
| S13.7 (Subscription model redesign) | CTP is a natural premium-tier feature candidate; factor into product positioning. |
| S13.8 (Parity + gates end-to-end) | If CTP is post-v1, S13.8 doesn't touch it. If pre-v1, S13.8 includes CTP in its verification matrix. |
| S14 / S15 (release infra) | Bundle-size impact from `networkx` needs verification against S14's auto-updater bandwidth assumptions. |
| S15.5 (bundle slimming) | Directly conflicts — S15.5 is about *shrinking* the sidecar, and CTP adds ~5 MB. If both land, S15.5 scope needs to account for CTP. |

---

## 12. Summary — decision framework

Build CTP when **all three** of the following hold:

1. The feature-parity run (S11.5 → S13.8) has shipped.
2. A paying customer / clear product lead is asking for shared-trench cost BOM (not just cable length).
3. τ / γ calibration is available from real project data, not assumed.

Otherwise, either:
- Defer indefinitely (most likely).
- Implement alternative §9.1 ("trench = visualised union of cable overlaps") as a lightweight substitute — ~3 days, no new deps, visual construction-feel without the optimisation pretence.

If the decision is to build, the spike's first deliverable is a spec following the S11.5 template. The second deliverable is an ADR following ADR 0007's structure. Both must be authored before any code change to `pvlayout_core/`.

End of note.
