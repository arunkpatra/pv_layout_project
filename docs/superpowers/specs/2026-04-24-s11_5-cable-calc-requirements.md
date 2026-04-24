# S11.5 — Cable-calc correctness (industry requirements)

**Spec authored:** 2026-04-24
**Spike:** S11.5 (inserted between S11 and S12)
**Status:** draft for human review
**Owning repo:** `pv_layout_project`
**Framing:** industry requirements drive the algorithm. Legacy PVlayout_Advance behaviour is not the target.
**Bound by:** [`CLAUDE.md`](../../../CLAUDE.md) §2 (pvlayout_core freeze, exception requested here), §7 (external contracts), [`docs/SPIKE_PLAN.md`](../../SPIKE_PLAN.md) inserted-sub-spike convention, [`docs/gates/S11_PAUSED_FOR_CABLES.md`](../../gates/S11_PAUSED_FOR_CABLES.md).

---

## 0. TL;DR

1. The vendored cable-calc is **correct in shape but unusable in performance**: `place_string_inverters` takes **460 s** on `phaseboundary2.kmz` with defaults + `enable_cable_calc=True`. Not a hang — CPU-pegged algorithm — but indistinguishable from "broken" at the UI layer.
2. An optimisation that cuts this to ~16 s already exists and was validated on a peer plant 4 days ago (review-package at `/Users/arunkpatra/Downloads/review-package`). It lives in a now-defunct repo and was never ported here. **S11.5 ports it.**
3. Porting requires a **CLAUDE.md §2 exception** for `pvlayout_core/core/string_inverter_manager.py`. This spec is the rationale for that exception.
4. The six open questions in `S11_PAUSED_FOR_CABLES.md` §5 are answered here with industry-grounded positions (IEC 60364-7-712, IEC 62548, IEC TS 62738, CEA 2010, NREL ATB). The algorithm and adders in the current code pass industry sanity checks.
5. One correctness risk is identified: **Pattern F (best-effort) routes allow boundary crossings.** Post-optimisation, 16 more cables fall through to Pattern F on the test site in the review package. Spec proposes a specific remediation.
6. S11.5 deliberately does **not** add cable sizing (gauge, ampacity), voltage-drop computation, or BOM export. Those are flagged as candidates for S12/S13 scope (with a named owner) but not done here. S11.5 is scoped to cable **geometry, totals, and performance** only.

---

## 1. Context

### 1.1 Why S11.5 exists

S11 paused mid-gate when two findings surfaced:
1. Cable calc runs ~25 s (claimed; see §1.3 — wrong number) or **460 s** (measured today) on `phaseboundary2.kmz`.
2. Cable-calc correctness has never been physically gated. Earlier gates routed around it with `enable_cable_calc=False`.

S11 resumes after S11.5 lands. Scope of S11 (ICR drag + obstruction draw) is unchanged.

### 1.2 Explicit framing

User direction at pause: *"we will not consider legacy code, and will try to go by required functionality as per the solar industry."*

Implication: **industry standards are the normative source of truth**, not PVlayout_Advance, not the checkpoint at `/Users/arunkpatra/tmp/checkpoint/PVlayout_Advance`, not the defunct `renewable_energy/apps/layout-engine`. Where the current vendored algorithm happens to agree with industry practice, we keep it. Where it diverges, we change it.

### 1.3 Measurement ground truth (replaces the stale "25 s" claim)

Script: [`python/pvlayout_engine/scripts/debug/time_cable_calc.py`](../../../python/pvlayout_engine/scripts/debug/time_cable_calc.py).

| Stage | Wall-clock on `phaseboundary2.kmz` |
|---|---|
| `parse_kmz` | 0.00 s |
| `run_layout_multi` | 0.04 s |
| `place_lightning_arresters` | 0.01 s |
| **`place_string_inverters` + cables** | **460.18 s** |
| Total | **460.24 s** — exit 0, CPU at 99 % throughout |

Plant shape: 715 → 611 tables post-LA, 62 inverters, 22 LAs, 2 ICRs, 23.2 MWp, 39.5 km DC, 14.5 km AC. Matches the S10 gate's numbers exactly, so this is the same plant shape the project has tracked since S10.

The `S11_PAUSED_FOR_CABLES.md` §1 "~25 s" claim is corrected to **460 s** by this measurement. Doc patch is part of S11.5 deliverables.

### 1.4 The review-package artifact

A prior session (2026-04-20, four days ago) produced a search-space-pruning optimisation at `apps/layout-engine/src/core/string_inverter_manager.py` in the now-defunct `renewable_energy/apps/layout-engine` Lambda port. CLAUDE.md §7 tells us to ignore that repo, but the *optimisation* was validated and is directly portable. WHAT-CHANGED.md in the review package:

- `place_string_inverters`: **563 s → 16 s** on a 20.2 MWp / 74-inverter / 622-table peer plant (34× faster).
- AC cable length change: **+0.95 %** (181 m on 19,117 m).
- DC cable length, table count, inverter count, inverter positions, LAs, capacity: **bit-identical**.
- Pattern distribution shifts: 16 cables move from exhaustive A4/E search to best-effort Pattern F.

What the optimisation actually changes (caps on nested search loops in `_route_ac_cable`):

| Pattern | Before | After |
|---|---|---|
| A (V-H-V) | all gaps | all gaps (unchanged) |
| A2 (H-V-H-V) | all cols | **nearest 8** |
| A3 (V-H-V-H) | all cols | **nearest 8** |
| A4 (H-V-H-V-H-V) | all × all | **5 × 5 nearest** |
| B main | all × all gaps | **8 × 8 nearest** |
| B escape | 3 × 3 (already capped) | unchanged |
| C, D | unchanged | unchanged |
| E (single waypoint) | all | **first 15** |
| E (two-waypoint) | O(W²) | **only if W ≤ 10** |
| F (best-effort) | unchanged | unchanged |

No algorithm was redesigned. No pattern geometry changed. Pattern order (A → A2 → A3 → A4 → B → C → D → E → F) is identical.

---

## 2. The six open questions — industry-grounded answers

From `S11_PAUSED_FOR_CABLES.md` §5. Citations at [§10](#10-sources).

### Q1 — Which cables does this tool own?

**Answer:** DC string cables (table → string inverter) and AC LV cables (string inverter → ICR). MV (ICR → grid point of interconnection) is **out of scope** and remains out of scope; this matches utility-scale EPC convention where MV routing is designed by a separate power-systems engineer against a one-line diagram, not a layout tool. Central-inverter mode (DC cables from table → SMB → central inverter + 2× conductor factor for ± pair on the SMB-to-CI run) stays as-is; it's an additive design mode already supported in the vendored code.

**Grounding:** `[PVcase layout information & BOM]` distinguishes "DC cables — module cables, extension cables, cables leading to inverters" and "AC LV to combiner/inverter" as separate BOM sections. `[Prasun Barua — How to design DC/AC cabling]` separates the design into "DC cabling (module→inverter)" and "AC cabling (inverter→transformer→grid)" — the transformer is at the ICR; the transformer-to-grid run is outside the scope of a layout tool.

### Q2 — Correct sizing and routing rules

**Answer for voltage drop** (used as the sanity check, not as an output in S11.5):

| Section | Target | Hard cap (industry) | Hard cap (IEC) |
|---|---|---|---|
| DC string | ≤ 1 % | ≤ 2 % | **≤ 3 %** (IEC 60364-7-712) |
| AC LV (inverter → ICR) | ≤ 1.5 % | ≤ 2 % | n/a explicit |
| Overall plant | ≤ 3 % | — | — |

S11.5 **does not compute** voltage drop. It keeps cable-run length as the output. Voltage-drop computation with selected gauge/cross-section is explicitly deferred to S12 (KMZ export) or S13 (DXF + PRO_PLUS features) as a BOM enrichment — noted in [§8.2](#82-explicit-deferrals).

**Answer for routing rules:**

- **Physical installability:** every cable route must lie strictly inside the usable polygon. This is a hard constraint — a cable that crosses the boundary is not physically installable. See [§3.2](#32-pattern-f-acceptability) for Pattern F's handling of this.
- **AC/DC separation:** IEC 60364 and IEC 62548 require 150–300 mm separation between AC and DC trenches. S11.5 keeps DC and AC as separate polyline sets on the canvas; physical trench separation is implementation-detail for EPC, not a layout-tool output.
- **Manhattan routing (H/V only):** matches trench reality — cables follow row gaps and perimeter roads. No diagonal routing. Current algorithm is correct on this.
- **Bend radius:** real cables need ≥8–12× cable diameter bend radius. S11.5 does not geometrically enforce bend radius — Manhattan routes at right angles are nominal; physical install uses sweeping bends. This is consistent with every utility-scale design tool (PVcase, Virto.CAD, HelioScope, RatedPower).

### Q3 — Canvas display

**Answer:** separate visual layers for DC and AC, matching EPC software convention (PVcase, Virto.CAD). S11.5 emits the geometry and leaves the frontend to render. Proposed rendering contract (non-normative — frontend spike S11 or S12 owns polish):

- `DC_CABLES` — one polyline per DC cable run, thin weight, cool hue (e.g. cyan/blue).
- `AC_CABLES` — one polyline per AC cable run, medium weight, warm hue (e.g. orange/amber).
- Both layers toggle-able separately.
- Hover tooltip: cable id, from/to, length (metres).

S11.5's sidecar output shape (`LayoutResult.dc_cable_runs` and `ac_cable_runs`) is already sufficient for this rendering. No schema change required.

### Q4 — Engineer-facing metrics

**Answer for S11.5:**

- Total DC cable length (metres) — already present as `total_dc_cable_m`.
- Total AC cable length (metres) — already present as `total_ac_cable_m`.
- Per-inverter AC segment (new output field). Engineers need "cable from inverter N to its ICR" as a row in the BOM, not just the grand total. This is a natural derivation from `ac_cable_runs[i].length_m` and requires no new computation.
- Per-ICR AC subtotal (new output field). Sum of AC runs grouped by `assigned_icr_index`. Useful for BOM ICR-by-ICR breakdowns.

**Deferred to S12/S13:**

- Cable gauge (mm² or AWG) — requires ampacity tables (IEC 60364-5-52). Out of scope here.
- Voltage drop per run — requires gauge, conductor material, temperature. Out of scope.
- Per-string DC segments — our current DC model is per-table-aggregate (one route × strings-per-table multiplier); a per-string model requires a new data shape. Defer.
- Cable tray / conduit quantities — PVcase and Virto.CAD surface these. Out of scope.
- BOM spreadsheet export — belongs with export spikes (S12/S13), not the algorithm spike.

### Q5 — Inverter-count formula (capacity- vs tables-based vs DC:AC ratio)

**Answer: keep the current capacity-based formula. It is industry-standard.**

Current code: `num_inverters = ceil(total_capacity_kwp / inverter_capacity_kwp)` where `inverter_capacity_kwp = max_strings_per_inverter × string_kwp`.

Industry formula `[NREL ATB 2024, PVcase, HelioScope]`:
```
num_inverters = ceil(plant_DC_capacity_kWp / (inverter_AC_rating_kW × DC_AC_ratio))
```

Our form reduces to the industry form because:
- `inverter_capacity_kwp = max_strings_per_inverter × string_kwp` is the DC-side max per inverter;
- implicit `DC_AC_ratio = 1` (we treat inverter capacity as DC-equivalent, so ratio does not appear as a separate parameter).

For India utility-scale, typical DC:AC ratio is 1.2–1.35 (`[NREL ATB]` uses 1.34 for US; higher in India would over-clip in hot climate). S11.5 does **not** introduce an explicit DC:AC ratio parameter. The existing formulation, while implicit, produces the right count given the inverter-capacity input.

Checkpoint's tables-based formula `ceil(len(tables) / tables_per_inverter)` is **rejected** as non-industry. It couples inverter count to geometric packing, which is wrong when partial packing (obstructions, odd shapes) means table count doesn't track capacity linearly. No ADR, no industry basis.

### Q6 — `+4.0 m` AC adder and `+10.0 m` DC adder — industry-correct?

**Answer: both are within industry rule-of-thumb range; keep as-is for S11.5 with a parameter carve-out for later.**

Neither adder comes from a named standard. They are termination + panel-interior-routing + slack allowances, a well-known category in EPC practice but not formally standardised.

- **AC `+4.0 m` per inverter-to-ICR run.** Typical industry practice: 3–5 m combined allowance for (i) inverter cabinet interior routing, (ii) ICR switchgear interior routing, (iii) termination lugs and bend radius. `+4.0 m` sits mid-range. Defensible.
- **DC `+10.0 m × strings_per_table` per table.** `strings_per_table` is `rows_per_table` — e.g. 5 strings for a 5-row table. So per-string overhead is 10 m. This covers (i) string pigtail from row end to junction, (ii) module-to-module inter-panel jumpers aggregated along the string, (iii) termination at inverter/combiner. 10 m per string is on the generous end of industry practice (typical 6–12 m per string). Defensible as a conservative default.

In CI mode the AC adder is multiplied by `ac_cable_factor = 2.0` (positive + negative conductors on the SMB→CI DC run). This is correct for CI mode because that "AC" cable is physically a DC pair.

**Recommendation:** keep `4.0` and `10.0` as defaults, but expose them as optional `LayoutParameters` fields (`ac_termination_allowance_m`, `dc_per_string_allowance_m`) so EPCs can tune to site conventions without code changes. Default values unchanged. **This is the one additive parameter change in S11.5** — still minimal because it's purely additive with defaults matching current behaviour.

---

## 3. Two technical findings S11.5 must handle

### 3.1 DC-routing discrepancy (WHAT-CHANGED.md claim vs. vendored code)

`review-package/WHAT-CHANGED.md` line 107 claims: *"DC cable routing: Unaffected (uses same function but poly=None for DC)."*

Our vendored code disagrees. At [`string_inverter_manager.py:573`](../../../python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py:573):

```python
route = _route_ac_cable((t_cx, t_cy), (i_cx, i_cy), gap_ys, col_xs, usable)
```

`usable` is the real `result.usable_polygon`, not `None`. DC cable routing in our vendored code **does** use polygon validation. Lambda port may have differed; we don't know and won't read that code (CLAUDE.md §7).

**Implication:** pruning `_route_ac_cable` helps **both** DC (611 runs) and AC (62 runs). The ~34× speedup WHAT-CHANGED.md observed was attributed to AC pruning alone; applying the same caps in our shared-function context should deliver equal or greater speedup because the same expensive patterns apply across ~10× more cables. Ground truth will come from re-running the headless script after the port.

### 3.2 Pattern F acceptability

[`string_inverter_manager.py:413-443`](../../../python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py:413) — Pattern F is the "best-effort" last-resort fallback. It scores candidate paths by count of segments outside the polygon and picks the minimum. **It does not guarantee the winning candidate is fully inside the polygon** — only that it has the fewest boundary-crossing segments.

**Engineering consequence:** a Pattern F cable route may physically cross outside the usable polygon. Not installable. Visually broken.

**Frequency under optimisation** (from `WHAT-CHANGED.md` on the peer plant):
- Pre-optimisation: 5 / 74 cables (6.8 %) used Pattern F.
- Post-optimisation: 21 / 74 cables (28 %) used Pattern F.
- Delta: 16 cables moved from exhaustive A4 / E search to best-effort F.

On `phaseboundary2.kmz` we don't have Pattern distribution data yet. Instrumentation is a deliverable of S11.5.

**Remediation evolved mid-spike** (scope decision logged 2026-04-24, see ADR 0007 amendment):

The spec originally proposed a three-tier conditional remediation. During implementation, the instrumented baseline revealed that zero cables on `phaseboundary2` actually succeed in A4 / B / E — the 15 problem cables fall straight through all of A-E. Remediation (iii) as originally written (loosen A4's cap from `5 × 5` to `8 × 8`) would have had zero effect because A4 was never being entered. The remediation was designed for the peer plant where cables did shift A4 → F under pruning; our plant's failure mode is different.

**Scope extended mid-spike** to include a new **Pattern V** (visibility graph + Dijkstra shortest path) inserted between E and F. Details in ADR 0007 amendment.

**(i)** Always done — headless script + instrumentation + route-quality census in the gate memo.
**(ii)** Always done — `CableRun.route_quality` tagging exposes any fallback result that leaves the polygon.
**(iii)** Superseded — Pattern V replaces the conditional A4-cap remediation. Expected outcome: 0 `boundary_violation` cables on `phaseboundary2` (vs. 15 without Pattern V). AC cable total may rise ~5–10 % because inside-polygon detours are longer than outside-polygon shortcuts; correctness over length.

---

## 4. Scope

### 4.1 In scope

1. **Port the search-space pruning** from `review-package/WHAT-CHANGED.md` into `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`. All caps applied inside `_route_ac_cable` only.
2. **Per-pattern instrumentation** on `_route_ac_cable` that is enabled via env var (`PVLAYOUT_PATTERN_STATS=1`) and emits pattern-count and `_path_ok`-count summaries to stderr. Dormant by default. Used to verify §3.2 remediations.
3. **Pattern F boundary-violation detection** — `_seg_ok` score computed for the winning Pattern F route; stored on `CableRun.route_quality`. New field.
4. **Per-ICR AC subtotals and per-inverter AC segment lengths** surfaced in `LayoutResult` as additive fields. No existing field is renamed or restructured.
5. **Two optional `LayoutParameters` fields** for the `+4.0 m` and `+10.0 m` adders with defaults preserving current behaviour.
6. **Headless-timing script** stays at `scripts/debug/time_cable_calc.py`. Becomes the benchmarking artefact going forward — documented in the spec, referenced in the gate memo.
7. **Correct `docs/gates/S11_PAUSED_FOR_CABLES.md` §1** to replace the "25 s" wall-clock with the measured 460 s. Add a forward pointer to this spec.
8. **Add ADR 0007** documenting the §2 exception decision and the three-point remediation plan for Pattern F. ADRs 0001–0006 are taken (latest: 0006 drawing/editing pipeline from S10.5).
9. **Pattern V — visibility-graph shortest-path fallback** (scope-extended 2026-04-24 during implementation; ADR 0007 amendment). New pattern inserted between E and F in `_route_ac_cable`. Nodes = polygon exterior / interior-ring vertices + start + end. Edges = pairs whose straight-line segment is contained in the polygon (tested via `shapely.prepared.prep`). Shortest path via Dijkstra (`heapq` stdlib). Guarantees inside-polygon routing when Manhattan templates A-E fail on irregular boundaries. See ADR 0007 for the full scope + permitted / not-permitted changes. Industry basis: visibility-graph shortest-path is the textbook CS approach for polygon-constrained routing (Preparata & Shamos 1985; de Berg et al. *Computational Geometry* ch. 15). Same computational primitive that PVcase / RatedPower use for their trench-constrained cable routers, simplified here to "no user-drawn trenches; route along polygon interior."

### 4.2 Out of scope

- **Cable gauge / cross-section selection.** Requires ampacity tables, conductor-material handling, temperature derating. → S12 or S13.
- **Voltage-drop computation per cable.** → S12 or S13, dependent on gauge selection.
- **Per-string DC routing (instead of per-table).** Requires a new data shape (string-level geometry, not just row count). Larger change than S11.5 should carry.
- **BOM spreadsheet export.** Export spikes own export formats.
- **Cable tray / conduit quantity estimation.** PVcase surfaces this; out of scope here.
- **AC/DC cable separation geometry.** The 150–300 mm trench separation is an implementation detail for the EPC contractor, not a layout output. We surface separate layers; the rest is theirs.
- **Any change to `place_lightning_arresters`, `run_layout_multi`, or `icr_placer`.** `_route_ac_cable` is the only function we touch.
- **Any change to `_kmeans_cluster` or `_assign_to_icrs`.** Those feed `_route_ac_cable` but are not on the hot path and are not the source of the performance problem.
- **Any change to the DC:AC-ratio model.** The current implicit formulation works; making it explicit is an unrelated refactor.

### 4.3 Non-goals that deserve explicit mention

- **Legacy PVlayout_Advance parity.** Not a goal. Where the vendored code differs from the reference, we evaluate against industry practice, not against the reference.
- **The checkpoint at `/Users/arunkpatra/tmp/checkpoint/PVlayout_Advance`.** Not a reference. Not consulted for "correctness."
- **The defunct `renewable_energy/apps/layout-engine`.** Not a reference for correctness. The review package is consulted because it is a *validated artifact produced in-project* — the optimisation content is ported; the repo it lives in is irrelevant.

---

## 5. CLAUDE.md §2 exception ask

### 5.1 What §2 currently says

> "Do not rewrite or refactor `pvlayout_core/` modules (the copied PVlayout_Advance domain logic). Those are preserved verbatim."

### 5.2 What we need

A **scoped, time-bounded exception** covering exactly one file for S11.5:

**Files (two):**
1. `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py` — algorithm changes (pruning + instrumentation + reads of new params).
2. `python/pvlayout_engine/pvlayout_core/models/project.py` — **additive-only** field additions on `LayoutParameters` (two new optional fields with defaults), `LayoutResult` (two new optional per-ICR / per-inverter AC subtotal fields with empty-dict defaults), and `CableRun` (one new optional `route_quality` field with default). No rename, no type change, no deletion of existing fields.

**Permitted changes on (1) `string_inverter_manager.py`:**
1. Add search-space caps (pattern A2, A3, A4, B, E) — the review-package pruning port.
2. Add `route_quality` field computation in Pattern F.
3. Add optional instrumentation hooks behind `PVLAYOUT_PATTERN_STATS` env var.
4. Add reads of `params.ac_termination_allowance_m` and `params.dc_per_string_allowance_m` with defaults matching current constants.
5. Compute per-ICR and per-inverter AC subtotals from existing `ac_cable_runs` and store on `result.ac_cable_m_per_icr` / `ac_cable_m_per_inverter`.

**Permitted changes on (2) `models/project.py`:**
- Add fields listed above, all with defaults preserving current serialisation and behaviour.

**Not permitted under this exception:**
- No algorithm redesign.
- No pattern-order change.
- No pattern-geometry change.
- No change to `_kmeans_cluster`, `_assign_to_icrs`, `_find_inverter_position`, `_get_row_gap_ys`, `_get_col_xs`, `_route_length`, `_seg_ok`, `_path_ok`, `_safe_pt`. Only `_route_ac_cable` and `place_string_inverters` are touched.
- No change to any existing field on `LayoutParameters`, `LayoutResult`, or `CableRun`. No rename, no deletion, no type change.
- No change to any other file under `pvlayout_core/` (neither `core/` modules beyond those named, nor `utils/`, nor the rest of `models/`).
- No deletion of existing patterns.

### 5.3 Rollback

A single-file diff. Revert removes the exception's effect entirely. Golden files are re-captured only if AC cable totals shift by > 1 % (acceptable per review-package evidence: 0.95 % peer-plant delta).

### 5.4 Why an exception rather than abandoning §2

§2 exists to guarantee that the copied domain logic stays byte-equivalent to PVlayout_Advance — so that any bit-level parity test in S3 is meaningful and so that a rollback to legacy is free. S11.5 is the first scenario where §2 is a constraint rather than a guardrail:

- Industry correctness (the framing) explicitly opposes parity with PVlayout_Advance.
- Performance correctness (7.6 min is not shippable) is a product-level requirement.

The exception is narrow, documented, and reversible. The guardrail for the rest of `pvlayout_core/` stays fully intact.

### 5.5 Documentation changes that must land with the exception

- `CLAUDE.md` §2: add a paragraph noting the S11.5 exception with a link to the ADR.
- New ADR at `docs/adr/0007-pvlayout-core-s11-5-exception.md`.

---

## 6. Implementation plan

### 6.1 Phase A — instrument first, measure baseline

1. Add `PVLAYOUT_PATTERN_STATS=1` env-var-gated instrumentation to `_route_ac_cable` — counts per pattern and `_path_ok` call count per cable. Dormant when unset.
2. Re-run `scripts/debug/time_cable_calc.py` with stats enabled. Record per-pattern distribution on `phaseboundary2.kmz` (both DC and AC cables).
3. **Expected output:** a baseline table analogous to WHAT-CHANGED.md's pre-optimisation numbers, but for our plant.

### 6.2 Phase B — port the pruning

1. Apply the caps from WHAT-CHANGED.md's table (A2/A3 → 8 cols, A4 → 5 × 5, B main → 8 × 8, E single → 15, E two-waypoint → W ≤ 10).
2. Re-run the headless script. Record: total wall-clock, per-pattern distribution, pattern-F count, cable-length deltas (DC and AC), bit-level invariants (table count, inverter count, LA count, capacity).
3. **Acceptance:** wall-clock ≤ 30 s on `phaseboundary2.kmz`. Cable-length delta ≤ 1 % on both DC and AC. Table / inverter / LA / capacity bit-identical.

### 6.3 Phase C — Pattern F quality tagging

1. Inside Pattern F, compute the winning candidate's `_seg_ok` score.
2. Return it alongside the route (a 2-tuple; refactor the Pattern-F return site).
3. In `place_string_inverters`, store on `CableRun.route_quality`: `"ok"` if route ended before Pattern F (score = 0 by construction); `"best_effort"` if Pattern F and score = 0; `"boundary_violation"` if Pattern F and score > 0.
4. Re-run headless script. Count by quality tier. If `boundary_violation > 5 %` of total cables, escalate per §3.2 remediation (iii).

### 6.4 Phase D — optional parameters

1. Add `ac_termination_allowance_m: float = 4.0` and `dc_per_string_allowance_m: float = 10.0` to `LayoutParameters` (pvlayout_core).
2. Add parallel fields on the sidecar wire schema (`schemas.py`) and `adapters.params_to_core` mapping.
3. Replace the magic `4.0` and `10.0` constants in `place_string_inverters` with reads from `params`.
4. Re-run full test suite — defaults preserve existing numeric output exactly.

### 6.5 Phase E — per-ICR and per-inverter AC subtotals

1. After the `ac_cable_runs` loop completes in `place_string_inverters`, compute:
   - `ac_cable_m_per_inverter: Dict[int, float]` (keyed by inverter index).
   - `ac_cable_m_per_icr: Dict[int, float]` (keyed by ICR index).
2. Add both as fields on `LayoutResult` (domain) + wire schema + `result_from_core` adapter.
3. Existing `total_ac_cable_m` is unchanged; new fields are purely additive.

### 6.6 Phase F — docs + ADR

1. Patch `docs/gates/S11_PAUSED_FOR_CABLES.md` §1 to replace the "25 s" claim with 460 s measured + link to this spec.
2. Add new ADR documenting the §2 exception + Pattern F remediation plan.
3. Patch `CLAUDE.md` §2 to link the ADR.
4. Insert S11.5 entry into `docs/SPIKE_PLAN.md` per the format of S5.5 / S8.7 / S10.2 / S10.5.
5. Update `docs/gates/STATUS.md` to flip S11.5 from ⚪ pending to 🟡 awaiting gate once Phases A–E are green.
6. Write `docs/gates/s11_5.md` gate memo.

### 6.7 Dependency graph

A → B → C → D → E → F. Phases A and B must complete before anything else moves. C depends on B (same return-site refactor). D and E are independent of each other and of C, but both depend on B being stable. F lands last.

Unit tests land alongside each phase. Golden-file baselines are re-captured only if a phase changes a bit-level invariant.

---

## 7. Test strategy

### 7.1 Unit

- **`_route_ac_cable` unit tests** (new): minimum set exercising each pattern with synthetic polygons so we can assert each cap does not break correctness on trivial cases.
- **Pattern F score function** (new): unit-test the `_seg_ok`-sum score returns 0 on a fully-inside route, > 0 on a crossing route.
- **`LayoutParameters` defaults** (updated): assert `ac_termination_allowance_m == 4.0` and `dc_per_string_allowance_m == 10.0` so the defaults don't silently shift.

### 7.2 Integration

- **`test_layout_s10_wgs84.py`** is currently `enable_cable_calc=False` for speed. After S11.5, add a sibling test `test_layout_s11_5_cables.py` that runs with `enable_cable_calc=True` on `phaseboundary2.kmz` and asserts:
  - total wall-clock (via subprocess timing) ≤ 45 s (generous headroom over the 30 s target).
  - `total_dc_cable_m` within ±1 % of the measured pre-port value (39,536.2 m).
  - `total_ac_cable_m` within ±1 % of the measured pre-port value (14,474.8 m).
  - `num_string_inverters == 62`, `len(placed_tables) == 611`, `len(placed_las) == 22` (bit-level invariants).
  - `len(dc_cable_runs) == 611`, `len(ac_cable_runs) == 62`.
  - No Pattern-F route with `route_quality == "boundary_violation"` on this plant (stricter assertion — if this fails we know before the gate, not at it).

### 7.3 Golden file

- `tests/golden/expected/phaseboundary2.json` is currently captured with `enable_cable_calc=False`. It stays that way — S11.5 does not change golden-file policy.
- Optionally, add `tests/golden/expected/phaseboundary2-cables.json` captured with cables on, post-port. This becomes the new reference for cables-on runs. It regenerates only via the existing `capture_golden.py` mechanism; never auto-generated.

### 7.4 Frontend

- Current S11 interactivity tests (`icrDrag`, `drawRectangle`) do not touch cables. No change needed.
- If the frontend adds cable-tooltip or route-quality visual distinction, tests for those belong to the frontend spike that introduces them (not S11.5).

---

## 8. Gate criteria

### 8.1 Human gate for S11.5

1. **Static gates green.** Lint, typecheck, frontend test harness, sidecar pytest, build — all pass. `bun run test` and `uv run pytest` exit 0. (Frontend tests untouched; sidecar gets new integration test in §7.2.)
2. **Headless measurement on `phaseboundary2.kmz`.** Run `uv run python scripts/debug/time_cable_calc.py`. Expected: total wall-clock ≤ 30 s (vs. 460 s pre-port); cable totals DC and AC within ±1 % of pre-port; no Pattern-F `boundary_violation` tags.
3. **UI walkthrough.** Boot the desktop app, open `phaseboundary2.kmz`, toggle `Calculate cables` ON, click Generate. UI transitions from "Generating…" back to layout view within ≤ 30 s wall-clock. Cables render on canvas as two visibly distinct layers. No errors in sidecar stdout.
4. **Pattern-stats report.** Run the headless script with `PVLAYOUT_PATTERN_STATS=1`. Inspect the summary. Pattern F count is documented in the gate memo with route-quality breakdown.
5. **Docs patched.** `S11_PAUSED_FOR_CABLES.md` §1 has the corrected 460 s number. New ADR is committed. `CLAUDE.md` §2 links the ADR. `SPIKE_PLAN.md` has a full S11.5 entry. `STATUS.md` reflects the gate state.
6. **No changes outside the permitted surface.** `git diff` shows only files listed in §4.1 (plus tests and docs). No drift into adjacent `pvlayout_core/` modules.

### 8.2 Explicit deferrals (not blocking this gate)

- **Cable gauge and ampacity.** If an EPC reviewer asks "what size AC cable?" the answer for S11.5 is "not computed; see S12/S13."
- **Voltage-drop output per cable.** Same.
- **BOM export format.** Same — belongs with export spikes.
- **Per-string DC granularity.** Same — larger data-shape change than S11.5 should carry.
- **Pattern F remediation (iii) — further cap loosening** — only triggered if the Pattern F boundary-violation rate is > 5 %. If not triggered, stays documented but not implemented.

### 8.3 Pre-resume checklist for S11

1. S11.5 🟢 in `STATUS.md`.
2. S11 flips to ⏸ → 🟡.
3. Re-run static gates. Unchanged expected.
4. Re-run `test_s11_endpoints.py` against the post-port sidecar. Any schema drift from added `route_quality`/subtotal fields surfaces here and is benign (the S11 tests don't assert on cable fields).
5. Continue S11 physical gate from step (d).

---

## 9. Open questions / risks

### 9.1 Risks

- **Pattern F boundary-violation rate on `phaseboundary2`.** Not yet measured. If > 5 % we execute remediation (iii) in §3.2.
- **Reproducibility of the 460 s measurement across machines.** My measurement is on a single workstation. CPU single-core performance varies ~1.5–2× across modern dev machines. Not a blocker, but the 30 s post-port target should allow for variance (hence the 45 s integration-test cap).
- **DC cable length delta.** The review-package AC-only claim of "DC length unchanged" assumed `poly=None` for DC — see §3.1. Since our code routes DC with the polygon, DC lengths *may* shift slightly after pruning. Expect ≤ 1 % — the pruning changes which candidate path wins, and near-equivalent paths have near-equivalent lengths. Acceptance criterion captures this: ±1 % on DC too.
- **Existing golden file.** `enable_cable_calc=False` in the golden capture means no golden-file churn from S11.5. Low risk.

### 9.2 Intentionally open, decision owner = user

- Whether to **publish per-inverter and per-ICR AC subtotals to the frontend** in S11.5 or defer. My default is "include in the sidecar response; frontend consumes later." Alternative: sidecar only, ignored until S12. Same work either way; just a question of what the response shape looks like.
- (Resolved during spec authoring: ADR number is **0007**; 0001–0006 are taken.)
- Whether to **keep the `_route_ac_cable` function name** after this spike. It's arguably misleading since it also handles DC. Default: keep — renaming would require touching every call site and the spec commits to minimum-diff changes. Rename candidate for S13.7 or a dedicated cleanup.

### 9.3 Dependencies we rely on

- IEC 60364-7-712 — DC voltage drop limit (3 %). We don't compute; we cite.
- IEC 62548 and IEC 62548-1:2023 — PV array design requirements. We don't implement; we respect their separation and installability guidance at a geometry level.
- IEC TS 62738 — large PV power plants. Cited as context for BOM and cable schedule conventions.
- NREL ATB 2024 — DC:AC ratio benchmark.
- PVcase, HelioScope, Virto.CAD, RatedPower — commercial tool references for BOM and canvas display conventions.

---

## 10. Sources

IEC / standards:
- IEC 60364-7-712 — *Requirements for solar PV installations*. DC voltage drop guidance (3 % max module-to-inverter). Summary: [NEC/IEC Rules for Voltage Drop and Solar Conductor Sizing](https://www.anernstore.com/blogs/diy-solar-guides/nec-iec-voltage-drop-solar-conductor-sizing), [Analyzing the 2% DC Voltage Drop Rule — Mayfield Renewables](https://www.mayfield.energy/technical-articles/analyzing-the-2-percent-dc-voltage-drop-rule/).
- IEC 62548-1:2023 — *Photovoltaic (PV) arrays – Part 1: Design requirements*. DC array wiring and separation. [IEC webstore](https://webstore.iec.ch/en/publication/64171).
- IEC TS 62738 — *Large PV power plants – design guidelines*. [IEC preview PDF](https://webstore.iec.ch/preview/info_iects62738%7Bed1.0%7Den.pdf).
- IEC 60364-5-52 — *Cable selection and erection*. Ampacity reference (deferred; cited for S12/S13 scope).

Industry references:
- [PV and the cable guide – pv magazine International](https://www.pv-magazine.com/2022/12/06/pv-and-the-cable-guide/) — DC target ≤ 1 % desirable, ≤ 2 % max; AC LV ≤ 2 % target 1.5 %.
- [Analyzing the 2% DC voltage drop rule – pv magazine USA](https://pv-magazine-usa.com/2020/09/30/analyzing-the-2-dc-voltage-drop-rule/)
- [Solar PV systems - DC cable sizing with examples - ELEK Software](https://elek.com/articles/solar-pv-systems-dc-cable-sizing-calculations/)
- [Solis Seminar: How to Section AC Cable for Solar PV systems](https://www.solisinverters.com/global/documentation/c6847db69a034f859f00f8d1d79ede77.html) — 2.5 % per-side, 5 % total common; more-conservative 3 % total for utility.
- [Cabling solar installations for maximum efficiency — RatedPower](https://ratedpower.com/blog/cabling-solar-installations/) — trench layout conventions, equipment grouping.
- [Case Study: Cable Layout Plan for a 100 MW Solar Farm — Jianyuncable](https://www.jianyuncable.com/a/blog/cable-layout-plan.html) — DC/AC separation, bundle rules.
- [DC Cables and AC Cables Should Not Share Conduits or Trunking — Innovative Green Power](https://innovativegreenpower.com/dc-cables-and-ac-cables-should-not-share-conduits-or-trunking/) — 150–300 mm separation rule.

DC:AC ratio / inverter sizing:
- [NREL ATB 2024 — Utility-Scale PV](https://atb.nrel.gov/electricity/2024/utility-scale_pv) — 1.34 ILR reference for utility-scale.
- [Best 6 Key Insights into DC and AC Ratio for Solar Power — Soleos Energy](https://soleosenergy.com/6-dc-and-ac-ratio-insights-solar-power-plants/) — India 1.2–1.35 typical.
- [DC/AC Ratio Guide — GODE Energy](https://chinagode.com/blog/dc-ac-ratio-explained-what-it-means-and-the-best-range-for-solar-systems/) — regional ratio conventions.
- [Solar Inverter String Design Calculations — Greentech Renewables](https://www.greentechrenewables.com/article/solar-inverter-string-design-calculations).
- [How to Calculate PV String Size — Mayfield Renewables](https://www.mayfield.energy/technical-articles/pv-string-size/) — string max/min formulas.

Design tools (BOM + canvas conventions):
- [PVcase — Layout information & BOM](https://help.pvcase.com/hc/en-us/articles/35594251310611-Layout-information-BOM) — DC cable segment breakdown (module cables, extension cables, cables to inverters).
- [PVcase for AutoCAD — docrack.me](https://docrack.me/en/pvcase-autocad-features-solar-design/) — BOM structure including cable length and combiner locations.
- [4. Electrical Design – HelioScope](https://help-center.helioscope.com/hc/en-us/articles/4419953067411-4-Electrical-Design) — DC:AC default 1.25, automatic stringing.
- [Virto.CAD — AutoCAD & BricsCAD Solar Design Plugin](https://virto.solar/virto-cad/) — 3D cabling visualisation, BOM export.
- [Solar design software for utility-scale plants — RatedPower](https://ratedpower.com/platform/) — automated shortest-path cable routing.

India regulatory:
- [CEA Electrical Safety Regulations 2010, Amendment 2023](https://power.mizoram.gov.in/uploads/attachments/7762ac77ebe11c0a9bf9f2c9ff4ec8bd/cea-regulation-elec-safety2010a.pdf) — FRLS/FRLSZH cable requirements.
- [Grid Compliance for Solar Plants in India — Wire Consultancy](https://www.wireconsultants.com/grid-compliance-for-solar-plants-in-india-codes-regulations-requirements/) — CEA + Indian Grid Code context.
- [Central Electricity Authority — Regulations](https://cea.nic.in/old/regulations.html).

In-project artefacts:
- `/Users/arunkpatra/Downloads/review-package/WHAT-CHANGED.md` — prior optimisation writeup (pruning caps, before/after numbers, Pattern F count shift).
- `/Users/arunkpatra/Downloads/review-package/before/layout.svg`, `after/layout.svg` — visual validation of the optimisation's cable-route delta on a peer plant.
- `docs/gates/S11_PAUSED_FOR_CABLES.md` — S11 pause record with the stale 25 s claim (to be corrected in S11.5).
- `python/pvlayout_engine/scripts/debug/time_cable_calc.py` — headless timing script, 460 s measurement.

---

## 11. Next step after approval

Upon user sign-off on:
1. This spec as the S11.5 requirements document.
2. The CLAUDE.md §2 exception as scoped in §5.
3. The defer list in §4.2 and §8.2.

Implementation proceeds phase-by-phase per §6. First line of code lands in Phase A (dormant instrumentation). No `pvlayout_core/` edits happen before the first green run of the baseline measurement with instrumentation.

Sign-off format — any clear affirmative in chat is sufficient. If the user wants redlines on specific sections, I make those changes and re-present before implementation starts.
