# ADR 0007: Scoped §2 exception — pvlayout_core cable-calc correctness (S11.5)
Date: 2026-04-24
Spike: S11.5
Status: accepted

## Context

[`CLAUDE.md`](../../CLAUDE.md) §2 states:

> Do not rewrite or refactor `pvlayout_core/` modules (the copied PVlayout_Advance domain logic). Those are preserved verbatim.

The rule exists to keep the vendored domain logic byte-equivalent to `PVlayout_Advance/{core,models,utils}`, so that golden-file tests remain meaningful, rollback to legacy behaviour is free, and any divergence is a deliberate, auditable event rather than a gradual drift.

S11.5's scope is **cable-calc correctness against solar-industry requirements**, explicitly *not* parity with `PVlayout_Advance`. Two facts force a conflict with §2:

1. **Measured wall-clock of `place_string_inverters` with `enable_cable_calc=True` on `phaseboundary2.kmz` is 460 s** (headless script, Sonnet-author workstation, 2026-04-24). CPU pegged at 99 %, not a deadlock; terminates with correct output. UX consequence: indistinguishable from a hang. Unshippable.
2. **A search-space-pruning optimisation that cuts the equivalent run from 563 s to 16 s already exists** in the now-defunct `renewable_energy/apps/layout-engine` port (review bundle at `/Users/arunkpatra/Downloads/review-package`, dated 2026-04-20). WHAT-CHANGED.md in that bundle validates bit-level invariance of table / inverter / LA / capacity counts and a 0.95 % AC cable length delta on a peer 20.2 MWp plant. DC cable length, pattern order, pattern geometry — all unchanged. The optimisation is a set of caps inside `_route_ac_cable`'s nested-loop fallback patterns; not an algorithm rewrite.

Porting that optimisation into our vendored `pvlayout_core/core/string_inverter_manager.py` requires editing pvlayout_core — §2's prohibition.

Three subsidiary needs surfaced during S11.5 brainstorming (see `docs/superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md` §2) that also need small, additive edits to pvlayout_core:

- Tag each cable with a route-quality value (`"ok" | "best_effort" | "boundary_violation"`) so the frontend can distinguish Pattern F best-effort routes from clean routes. Requires one optional field on `CableRun`.
- Expose the `+4.0 m` AC-termination and `+10.0 m` DC-per-string allowances as optional `LayoutParameters` fields with defaults preserving current numeric behaviour. Matches utility-scale EPC practice (allowances are site-tunable; both values are within industry rule-of-thumb range).
- Compute per-ICR and per-inverter AC cable subtotals. EPC BOMs expect ICR-by-ICR cable quantities (PVcase, Virto.CAD convention). The data is already implicit in `ac_cable_runs`; we only need two new result fields.

All four edits are geometrically additive. None rename, retype, or delete any existing field. None change the pattern order of `_route_ac_cable`. None change the shapes of candidate paths. None touch `_kmeans_cluster`, `_assign_to_icrs`, `_find_inverter_position`, `_get_row_gap_ys`, `_get_col_xs`, `_route_length`, `_seg_ok`, `_path_ok`, `_safe_pt`, or any file under `pvlayout_core/utils/`.

## Options considered

1. **Ignore §2 globally** — refactor pvlayout_core freely going forward. Rejected: removes the guardrail for every subsequent spike with no audit trail.
2. **Refuse to change pvlayout_core** — keep the 460 s runtime. Rejected: product is not shippable, and "industry correctness" was the user's framing for S11.5 explicitly *above* parity with legacy.
3. **Apply the optimisation in a sidecar wrapper** — monkey-patch `_route_ac_cable` at import. Rejected: introduces a second source of truth, makes the fast path the "patched" one and the slow path the "vendored" one, and violates the principle that the sidecar is a thin HTTP shell not an algorithm owner.
4. **Scoped, documented, reversible exception for S11.5 only** — this ADR.

## Decision

A **scoped exception to §2** covering exactly two files and a fixed list of additive changes, for S11.5 only.

### Files

1. `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`
2. `python/pvlayout_engine/pvlayout_core/models/project.py`

### Permitted changes on `string_inverter_manager.py`

1. Add search-space caps inside `_route_ac_cable` for patterns A2, A3, A4, B, and E per the review-package pruning table.
2. Add Pattern F score computation and attach the resulting `route_quality` to the returned `CableRun` in `place_string_inverters`.
3. Add instrumentation hooks gated on `PVLAYOUT_PATTERN_STATS=1`; dormant by default.
4. Add reads of `params.ac_termination_allowance_m` and `params.dc_per_string_allowance_m` with fallback to the existing constants.
5. Compute per-ICR and per-inverter AC subtotals from `ac_cable_runs` and store on new `LayoutResult` fields.
6. **Add Pattern V — visibility-graph shortest-path fallback** inserted between Pattern E and Pattern F. Guarantees cable routes stay inside the usable polygon even when Manhattan templates A–E fail on irregular / concave boundaries. Uses textbook computational geometry (visibility graph on polygon exterior + interior ring vertices, shortest path via Dijkstra on the resulting graph). No new Python dependencies — uses `shapely.prepared.prep` for the per-polygon contains-cache and Python stdlib `heapq` for the priority queue. Pattern F stays in place as the final absolute fallback; V replaces the majority of what currently falls through to F on concave plants.

### Permitted changes on `models/project.py`

Additive-only field additions:

- `LayoutParameters.ac_termination_allowance_m: float = 4.0`
- `LayoutParameters.dc_per_string_allowance_m: float = 10.0`
- `LayoutResult.ac_cable_m_per_inverter: Dict[int, float]` (empty-dict default)
- `LayoutResult.ac_cable_m_per_icr: Dict[int, float]` (empty-dict default)
- `CableRun.route_quality: str = "ok"` (values: `"ok" | "best_effort" | "boundary_violation"`)

### Not permitted

- No change to any other file under `pvlayout_core/` (other `core/` modules, `utils/`, other `models/*` files).
- No change to any existing field on any dataclass. No rename. No type change. No default change. No deletion.
- No change to any function inside `string_inverter_manager.py` besides `_route_ac_cable`, `_path_ok` (instrumentation counter), `place_string_inverters`, and the new private helpers (`_build_boundary_vis_graph`, `_dijkstra`, `_route_visibility`) that support Pattern V.
- No change to pattern order in `_route_ac_cable` other than **inserting Pattern V between E and F** (E falls through to V; V falls through to F). Patterns A / A2 / A3 / A4 / B / C / D / E / F themselves are unchanged in position and behaviour.
- No change to pattern candidate-path geometry on A–E (the coordinate math of each Manhattan candidate is preserved; only the number of candidates considered changes).
- No deletion of any existing pattern.
- Pattern V produces **straight-line** (Euclidean) segments between visibility-graph nodes, deviating from strict Manhattan (H/V only) on the fallback path. This trade-off is accepted intentionally: the plant-interior / polygon-exterior correctness invariant outranks visual-Manhattan purity on a fallback that exists specifically to catch cases where Manhattan templates fail. For the 47 / 62 AC cables and 611 / 611 DC cables on `phaseboundary2` that resolve via A / A2 / A3 today, routes remain strictly Manhattan and unchanged.

### Rollback

The exception lives in one commit (or one contiguous commit series) with the ADR + spec cross-references in the message. `git revert <commit>` restores pre-S11.5 behaviour. Golden-file baselines stay with `enable_cable_calc=False` (the current convention) and do not need regeneration.

### Pattern F remediation — superseded by Pattern V

The spec's original three-tier Pattern F remediation plan (census, tag, optional A4 cap loosening) was written before the instrumented baseline run showed that zero cables on `phaseboundary2` actually succeed in A4 / B / E. Loosening A4's cap would have done nothing because A4 is never hit on this plant — the 15 problem cables fall straight through A → A2 → A3 → [A4 fail] → [B fail] → [C fail] → [D fail] → [E fail] → F. Remediation (iii) was designed for peer plants where A4 was succeeding on the boundary.

**Pattern V supersedes that remediation.** Instead of loosening the pruning caps (which wouldn't help), we add a new pattern that actually routes around concavities. Expected result on `phaseboundary2`:

- **Pre-Pattern-V:** 15 cables fall to Pattern F → 15 `boundary_violation` routes (34–64 m outside polygon).
- **Post-Pattern-V:** 15 cables resolve via Pattern V → 0 `boundary_violation` routes (all routes inside polygon).
- **AC cable total may rise ~5–10 %** on `phaseboundary2` because inside-polygon detours around concavities are longer than the previous outside-polygon shortcuts. This is correct — the old totals were counting unbuildable cable.
- Pattern F remains as the absolute fallback (e.g., degenerate polygons where the visibility graph itself fails to find any path). In practice it should never be hit on well-formed plant boundaries post-V.

Remediation (i) "route-quality census" and (ii) "tag boundary violations on the frontend" still apply — Pattern V is not expected to produce any, but the machinery stays in place as a regression guard.

## Consequences

### What we accept

- **§2 is no longer a literal freeze.** It is a named-exception regime. Future spikes that need to touch `pvlayout_core/` must author an ADR of this shape. The existence of ADR 0007 sets the precedent without setting the floodgates — the next candidate is cable gauge / voltage drop (S12 or S13), which is a separate discussion and a separate exception.
- **Golden-file parity with the `PVlayout_Advance` checkpoint at `/Users/arunkpatra/tmp/checkpoint/PVlayout_Advance` is deliberately broken for cables-on runs.** It stays preserved for cables-off runs (the S3 golden convention). Legacy parity was never an end in itself; the S11.5 framing rejects it explicitly.
- **AC cable length may shift by up to 1 %** on a given plant after the port, because the 16 cables that the peer-plant review showed moving from A4/E to F may route slightly differently. Within construction tolerance; no impact on yield, PR, CUF, or any energy metric. Explicitly acknowledged in the spec.
- **CLAUDE.md §2 text must be updated** to name this exception and link this ADR. That patch lands in the same commit series as the code change.

### What this unlocks

- Cable-calc becomes shippable in < 30 s on `phaseboundary2`, down from 460 s.
- Pattern F best-effort routes get a visible quality tag that the frontend can surface to engineers (warning icon, dashed line, or similar — UX is S12/S13's call, not S11.5's).
- EPC-customary per-ICR AC cable subtotals become available in the API response without any further sidecar work.
- The `+4.0 m` and `+10.0 m` allowances become parameterised. Customer-site tuning no longer needs a code change.

### What remains frozen

Everything else under `pvlayout_core/`. No refactors of `kmz_parser`, `layout_engine`, `road_manager`, `la_manager`, `icr_placer`, `spacing_calc`, `energy_calculator`, `solar_transposition`, `pvgis`, `pan_parser`, `ond_parser`, exporters, or `edition`. No changes to utility modules. No changes to any non-listed field in any listed dataclass. No changes to the other `models/` files.

---

See [`docs/superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md`](../superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md) for the full S11.5 scoping.
