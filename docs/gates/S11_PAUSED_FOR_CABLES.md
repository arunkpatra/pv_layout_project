# S11 Paused — cable-calc correctness work pulled forward as S11.5

**Written:** 2026-04-24
**Author:** pause logged mid-gate by user during S11 physical walkthrough.
**Decision:** S11 is paused mid-gate (step (c) passed). A new spike **S11.5 — Cable calculation correctness (solar-industry requirements)** is inserted before S11 resumes. S11.5 does **not** defer to legacy PVlayout_Advance; requirements are derived from solar-plant engineering practice.

---

## 1. Why this pause happened

The S11 physical gate began with step (a): boot → license → open `phaseboundary2.kmz` → Generate layout with `Calculate cables` enabled. This surfaced two unrelated findings that got tangled in the same session:

1. **Cable-calc runtime on `phaseboundary2` is ~25 s** ← **this claim was wrong.** Corrected 2026-04-24 during S11.5: the headless measurement ([`scripts/debug/time_cable_calc.py`](../../python/pvlayout_engine/scripts/debug/time_cable_calc.py)) shows **460 s** wall-clock for `place_string_inverters` with `enable_cable_calc=True`, CPU pegged at 99 % throughout. Not a hang, not a regression — just the actual algorithm cost. Consistent with `docs/gates/s10.md` §32 ("O(minutes), too slow for CI") and the integration-test comment at [`tests/integration/test_layout_s10_wgs84.py:5`](../../python/pvlayout_engine/tests/integration/test_layout_s10_wgs84.py) ("O(minutes) on the phaseboundary2"). The "25 s" figure may have come from a different KMZ, a mistyped timing, or a misread log — we don't know. S11.5 corrects the baseline and addresses the performance problem itself (see [`docs/superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md`](../superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md) and [ADR 0007](../adr/0007-pvlayout-core-s11-5-exception.md)).
2. **Cable-calc correctness has never been physically gated end-to-end.** S10's gate routed around it (`cable_calc OFF for speed` per `s10.md` §32). S10.2 likewise. What the cables actually *look* like on the map, and whether the totals are industry-correct, has not been verified by a human since the module was vendored at S1.

The user elected to address (2) before finishing S11. The rationale: S11's interactive mutations (`/refresh-inverters`, `/add-road`, `/remove-road`) all call `place_string_inverters`, which is where cable calc lives. If cable calc is wrong, S11 drags and draws will compound the wrongness. Getting cable calc right first means the S11 interaction loop is exercising a correct base.

The user's framing for S11.5: **"we will not consider legacy code, and will try to go by required functionality as per the solar industry."** This is a scope signal — parity with PVlayout_Advance is not the goal of S11.5. Industry correctness is.

---

## 2. S11 state at pause

### What passed during the physical gate

- **Step (a)** — Boot + license + KMZ: passed with cables off. Cables-on also completed (POST /layout → 200 in 25s; not treated as a failure).
- **Step (b)** — DevTools probes enabled (`window.__S11_DEBUG__ = true`). Clean.
- **Step (c)** — ICR drag happy path: **passed after an in-tree fix** (see §3 below). Probe log shows the full chain: `setMode drag-icr` → `attach` → `mousedown hit` → `commit` → `awaiting-ack` → `POST /refresh-inverters start / end 164ms` → `setMode idle`. Canvas swapped. Two consecutive drags verified.
- **Known-UX observation (not a bug):** Clicking Generate layout after a drag wipes the drag. Matches PVlayout_Advance exactly — `_on_generate` → `LayoutWorker.run()` calls fresh `parse_kmz` + `run_layout_multi` + wholesale `self._results = results` replace. Both the current reference (`/Users/arunkpatra/codebase/PVlayout_Advance/gui/main_window.py:229-238`) and the checkpoint at `/Users/arunkpatra/tmp/checkpoint/PVlayout_Advance/gui/main_window.py:82-91` behave identically. Logged for later UX polish if product direction changes; not an S11 parity break.

### What did NOT run

Steps (d) through (k):
- (d) ICR drag abort via Escape
- (e) Rectangle draw happy path
- (f) Undo last obstruction
- (g) Draw 3 rects, undo 3 times
- (h) Theme swap during drag
- (i) Sidecar error simulation
- (j) New KMZ resets state
- (k) DevTools console clean

All code paths exist and have unit tests. Resumption from step (d) is a clean re-entry once S11.5 closes.

### Static gates at pause

All green:
- **Lint:** 0 errors, 31 warnings (unchanged baseline).
- **Typecheck:** 7/7 workspaces.
- **Frontend tests:** 108 pass (78 desktop + 14 ui + 16 entitlements). +1 from the in-tree fix below.
- **Sidecar pytest:** 58 pass, 6 skipped (unchanged).
- **Build:** 4/4.

### Git state at pause

```
5d18468 docs(s11): session handoff — implementation done, gate deferred         (pushed)
ba14a40 docs(s11): gate memo — ICR drag + rectangle draw (awaiting verification) (pushed)
5e16e39 s11 phase 2: frontend interactivity — ICR drag + rectangle draw          (pushed)
cd81da5 s11 phase 1: sidecar endpoints /add-road, /remove-road, icr_override     (pushed)
```

`v0.0.14-s11` tag **not yet applied**. Tag lands on `5e16e39` only after S11 resumes and completes steps (d)–(k).

---

## 3. In-tree uncommitted fix (S11 bug surfaced during step c)

An off-by-one / contract-mismatch bug was found and fixed mid-walkthrough. **The fix is in-tree but uncommitted** per the gate rule "don't commit until the full a–k gate passes."

### Bug summary

`pvlayout_core/core/icr_placer.py:172` sets `icr.index = idx + 1` — a 1-based display label for user-facing text (`"ICR-1"`, `"ICR-2"`). The frontend's `layoutToGeoJson.ts:73` was emitting this `index` as the feature property and `icrDrag.ts:76` was reading it as the value to send to the sidecar. But sidecar's `/refresh-inverters` schema (`IcrOverrideWgs84.icr_index` at `schemas.py:357`) expects a **0-based array position** into `result.placed_icrs`.

Consequences:
- Clicking ICR-2 (array position 1) sent `icr_index=2` → sidecar 422 ("icr_override.icr_index 2 out of range; boundary has 2 ICRs").
- Clicking ICR-1 (array position 0) would have silently moved ICR-2 (array position 1). Worse failure mode — no error, wrong ICR physically moved on next recompute.

### Fix applied (uncommitted)

Three files modified:

- `apps/desktop/src/project/layoutToGeoJson.ts` — ICR feature properties now include both `index` (display label, 1-based, unchanged) and `array_index: i` (0-based, new).
- `apps/desktop/src/canvas/modes/icrDrag.ts` — reads `Number(props.array_index ?? -1)` for the value sent to sidecar. Comment explains why `index` must not be used.
- `apps/desktop/src/project/layoutToGeoJson.test.ts` — new test asserts both `index` and `array_index` are emitted distinctly on a 2-ICR case.

Verified green: 78 desktop tests, typecheck 7/7, lint clean.

### Commit disposition

Decision deferred to S11 resume. Two paths:
- **If S11.5 ends up touching geojson properties** (e.g., adding cable-endpoint metadata for UX hover): fold this fix into that commit as part of a coherent layoutToGeoJson.ts delta.
- **If S11.5 doesn't touch layoutToGeoJson.ts**: commit the fix on S11 resume as a separate commit before stepping through (d)–(k). Either amend `5e16e39` (small fix) or new commit. Likely small enough for amend if no other S11 churn.

Until then: leave the working tree dirty. `git status` will show three modifications; that's expected and documented.

---

## 4. Findings from the cable-calc investigation during this session

Half-done. Dropped here so S11.5 doesn't re-discover them.

### Diff: checkpoint vs vendored core (`string_inverter_manager.py`)

Our vendored `pvlayout_core/core/string_inverter_manager.py` is **newer** than the checkpoint at `/Users/arunkpatra/tmp/checkpoint/PVlayout_Advance`. The routing algorithms themselves (`_kmeans_cluster`, `_route_dc_cable`, `_route_ac_cable`, `_route_length`, `_get_row_gap_ys`, `_get_col_xs`, `_assign_to_icrs`) are **bit-identical**. The additive changes in our version:

| Change | Checkpoint | Vendored |
|---|---|---|
| `enable_cable_calc` toggle | absent — always routes | fast-path skip when False (our optimisation for first-pass layouts) |
| `DesignMode` enum + Central Inverter branch | string-inverter only | adds `CENTRAL_INVERTER` with SMB counts + 2× AC cable factor for DC trench (positive + negative conductors) |
| Inverter-count formula | `ceil(len(tables) / tables_per_inverter)` — **tables-based** | `ceil(total_capacity_kwp / inverter_capacity_kwp)` — **capacity-based** |
| New result fields | — | `num_central_inverters`, `central_inverter_capacity_kwp` |
| Import path | `from models.project` | `from pvlayout_core.models.project` |

### What this tells us

- The 25s wall-clock cost of cable calc on phaseboundary2 is the **algorithm's actual cost**, not sidecar overhead. A PyQt app running the same algorithm on the same KMZ will be comparable (minus Qt's own rendering).
- The inverter-count formula change (tables-based → capacity-based) was introduced between checkpoint and reference. No ADR exists for it. For partial-packing layouts this can produce different inverter counts → different k-means clusters → different cable runs → different `total_dc_cable_m` / `total_ac_cable_m`. Our golden-files encode the **new** formula (since S1 vendored the current reference), so internal tests are self-consistent but bit-parity with the checkpoint is not guaranteed. S11.5 should decide which formula is correct from an industry-requirements standpoint.

### What was NOT inspected

- Visual correctness of cable renders on the canvas (DC cable paths under tables, AC cable paths from inverter to ICR, color/weight, layer ordering).
- Whether totals (`total_dc_cable_m`, `total_ac_cable_m`) are industry-reasonable for a plant of this size.
- Whether the k-means clustering produces inverter positions an engineer would actually choose (vs e.g., grid-based positioning).
- Behaviour of `_route_dc_cable` and `_route_ac_cable` — Manhattan routing via gap-y's and col-x's, but no validation against an EPC's cable-routing rules (max bend radius, trench sharing, separation between AC and DC, etc.).
- Whether AC-to-ICR cable length adder of `+ 4.0` m (line 619 in vendored) is an industry constant or a magic number.

S11.5 owns this.

---

## 5. What S11.5 needs to define

These are open questions, not decisions. S11.5's first output should be a requirements doc that answers them from industry sources, not from legacy code.

1. **What is "cable calculation" in a solar-plant layout?** DC string cables (module-to-inverter), AC LV (inverter-to-ICR), AC MV (ICR-to-substation, likely out of scope), DC combiner-box cables in CI mode. Which are we responsible for?
2. **What are the correct sizing and routing rules?** Max bend radius, min trench depth, separation rules, voltage-drop constraints, IEC/IEEE/local standards we should honour.
3. **How should the output appear on the canvas?** Polyline color by cable type, weight by ampacity, hover tooltips (length, gauge), layer priority against tables/roads.
4. **What totals / metrics does an engineer need?** Total cable by gauge, estimated voltage drop, BOM-ready per-ICR totals, per-string lengths for DC.
5. **Is the current formula for inverter count (capacity-based) the right one?** Or the checkpoint's tables-based? Or something else entirely (e.g., derived from target DC:AC ratio).
6. **Is placeholder `+ 4.0` AC-cable-length adder industry-correct?** Suspect it's a rule-of-thumb for termination-and-rack allowance; needs verification or parameterisation.
7. **Should `pvlayout_core` remain frozen for this work?** CLAUDE.md §2 currently says "Do not rewrite or refactor pvlayout_core/ modules." If S11.5 needs to change the cable algorithm, that rule has an exception carved for S11.5 — and the CLAUDE.md text should be updated to name the exception. New algorithms go alongside the frozen ones, not in place of, so that rollback is trivial.
8. **Performance target.** 25s on phaseboundary2 is a wall-clock hit we should either accept (and show progress UI), optimise (parallelise k-means + routing), or move to a "compute on demand per ICR" model.

---

## 6. Resuming S11

Order of operations once S11.5 signs off:

1. Pull latest; confirm STATUS.md shows S11.5 🟢 and S11 ⏸ → ⚪.
2. Flip STATUS.md S11 to 🟡 (awaiting gate) and active.
3. Re-run the static gates (lint + typecheck + tests + build, sidecar pytest). Expect unchanged from §2 unless S11.5 touched shared code.
4. `cd apps/desktop && bun run dev`. License + KMZ + Generate (cables off for walkthrough speed; S11.5 should have validated cables-on correctness already).
5. Enable probes; walk step (c) once more to confirm the in-tree fix still applies cleanly.
6. Walk steps (d) through (k) per `docs/gates/s11.md` §4.
7. On pass: commit the uncommitted icr-index fix (amend `5e16e39` if small, new commit otherwise), tag `v0.0.14-s11` on the Phase 2 head, flip STATUS.md S11 → 🟢, activate S12.

Known risks on resume:
- If S11.5 changes anything about `/refresh-inverters` / `/add-road` / `/remove-road` payloads or shared helpers, the S11 mutation hooks may need small updates. Re-running the integration tests in `tests/integration/test_s11_endpoints.py` against any S11.5 changes is the guard.
- If S11.5 changes the shape of `LayoutResult` (new cable fields, etc.), the client-side `sidecar-client` types will flow; existing S11 consumers don't read cable fields, so low risk.
- The cursor-on-hover issue noted during step (c) ("hovered on icr. cursor remain the same") — cosmetic, not blocking. The `grab` cursor wire is correct in `icrDrag.ts:197-202`; likely a CSS override from the map container. Diagnose on resume.

---

## 7. Non-S11 / non-S11.5 follow-ups logged this session

Don't lose these across the pivot:

- **Cables-on gate instruction** (amendment to `docs/gates/s11.md` §4a): flag the O(minutes) tax or explicitly route the walkthrough with `Calculate cables` OFF. Cables-on parity is S13.8's job.
- **Client-side bounds check on ICR drag** against `usable_polygon`. Checkpoint has it (`ICRDragger._on_release` line 188-196); vendored core and our S11 don't. ~20 LOC in `icrDrag.ts` using `@turf/boolean-point-in-polygon`. Deferred to S13.8 parity sweep.
- **Original ICR stays visible during drag.** Not dimmed. Polish, ~40 LOC, deferred (already on `s11.md` §5).
- **Generate-wipes-edits UX surprise.** Matches legacy exactly, but user flagged it as surprising. Product decision for S13.7 (subscription / UX redesign brainstorm): whether Generate should preserve manual edits, warn before replacing, or disable when edits exist.
- **Inverter-count formula provenance.** No ADR exists for the checkpoint → reference change (tables-based → capacity-based). S11.5 should decide whether to ratify, revert, or replace.

---

**End of handoff. S11 resumes after S11.5 signs off.**
