# pv_layout_project ↔ PVlayout_Advance — Parity Sweep & Retirement Plan

**Status:** active (draft v0.2, 2026-04-29)
**Owners:** Arun Patra (software-engineering authority; full repo access); Prasanta Patra (co-founder; solar-engineering authority; VP Engineering); Claude (agentic, Anthropic Claude Code)
**Baseline:** legacy branch `baseline-v1-20260429` is the authority; current HEAD `397aa2a` (resolved 2026-04-29 capture). Re-baseline at parity-spike close. Cable functions originate in commit `9362083` within this branch's history.
**Goal:** achieve enough parity to retire `PVlayout_Advance` and ship `pv_layout_project` as the single product
**Anchor:** read this file at the start of any session that touches parity work. Linked from `CLAUDE.md` §2.

---

## §0  Header

| Field | Value |
|---|---|
| Plan version | 0.2 |
| Created | 2026-04-29 |
| Last updated | 2026-04-29 (v0.2 — bidirectional alignment reframe) |
| Status | Active — pre-P0 |
| Active spike | (none yet — first is P0 below) |
| Last sync run | (none — sync skill lands in P1) |
| Baseline branch | `baseline-v1-20260429` on `/Users/arunkpatra/codebase/PVlayout_Advance` (the authority — captures track HEAD) |
| Baseline HEAD at last capture | `397aa2a` (resolved 2026-04-29; recorded in each `numeric-baseline.json`'s `legacy_sha_at_capture`) |
| Cable-functions origin | commit `9362083` (2026-04-25) within this branch's history — when `_bundle_dc_cables` / `_route_ac_mst` etc. were introduced |
| Cumulative drift | see [`docs/parity/BACKLOG.md`](./BACKLOG.md) — drift between vendor (`pv_layout_project@8b352b7` ≈ legacy `43f27d9`) and current baseline HEAD |
| Reference plants | `phaseboundary2.kmz`, `complex-plant-layout.kmz` (both at `python/pvlayout_engine/tests/golden/kmz/`) + synthetic targeted set (built in P1) |
| Pace | aggressive (Q7 = A); ~4–6 weeks total; pause all non-parity forward work |
| Approach | B (quick-win port → sync skill + inventory → close findings → visual + `route_quality` → retirement-readiness → sunset) |

---

## §1  Why this exists

### The drift discovery

On 2026-04-29 we audited cable computation and rendering across both repos. The new project's vendored `pvlayout_core/core/string_inverter_manager.py` is missing four functions that exist in legacy:

- `_bundle_dc_cables` — bundles DC cables into per-row shared collectors + per-row trunks
- `_build_mst_edges` — Prim-style MST construction over inverter + ICR points
- `_route_ac_mst` — produces shared-trunk AC visual cable runs
- `_calc_individual_ac_total` — separately re-routes each inverter→ICR for the BOM quantity

These functions were added to legacy in commit `9362083` (2026-04-25), **two days after** the new project vendored its copy from legacy at commit `8b352b7` (2026-04-23). The vendor was a clean point-in-time copy; no port mistake. **Legacy moved forward; the vendored core stayed frozen.**

### The visual fingerprint

The user's eye caught it before the code audit confirmed it:

- **New app:** every inverter draws an independent line back to its ICR (per-cable individual routing). Visually appears as "crow's feet" / fans radiating from each ICR.
- **Legacy:** AC cables route through an MST tree (shared trunks); DC cables route through row-bundled collectors. Visually a topology with a backbone + branches; far fewer parallel lines.

The visual gap is a 100% downstream effect of the algorithm gap. **Porting the missing functions restores the visual.** No separate UI work is needed for the topology.

### Root cause framing

`CLAUDE.md` §2 + ADR-0007 enforce "don't mutate `pvlayout_core/`" under an unstated assumption that legacy is frozen. **Legacy is not frozen** — Prasanta (co-founder; solar expert; VP of Engineering; 25 years of solar-industry experience) continues active development on legacy as the product's solar-domain authority. Drift in this direction was not a contemplated failure mode.

The fix is **bidirectional alignment within a co-founder partnership**, not one-way freeze:

- **Legacy → new (port direction):** the new project tracks legacy by default via tooling (sync skill, baselines, discrepancy memos). Missing legacy work gets ported in.
- **New → legacy (discovery direction):** the new project's own discoveries (e.g., S11.5's Pattern V fix for 15 boundary-violating cables on `phaseboundary2`) flow back to Prasanta as discovery memos for joint evaluation. He decides whether legacy adopts. Arun has full authority to land critical fixes in either codebase, including legacy.

Both repos are co-owned. The two-app state is bridge state to retirement, not a long-term architecture.

### Non-goals

- **Not** chasing legacy HEAD continuously. Baselines are weekly cycles; the sync skill is on-demand.
- **Not** aiming for visual identity beyond what the algorithm produces. UI/UX above the algorithm boundary stays the new project's call.
- **Not** preserving the two-app architecture long-term. **This plan exists to retire legacy.**
- **Not** making solar-domain decisions unilaterally. Solar-domain calls are Prasanta's; Arun routes them via direct conversation (close friend / co-founder; daily phone + WhatsApp). I produce technical memos as artifacts in `docs/parity/findings/`; I do not draft messages between co-founders.

---

## §2  Locked decisions

From the 2026-04-29 brainstorming interview (8 questions + visual fingerprint addendum):

| # | Topic | Locked answer |
|---|---|---|
| 1 | **Parity scope** | Tiered, with bidirectional alignment. `pvlayout_core/` defaults to legacy (algorithms, data shapes, function inventory) **unless an explicit discovery in the new project argues otherwise** (e.g., S11.5 Pattern V fixed a real boundary-violation bug). New-project discoveries are first-class — captured as discovery memos for Prasanta's joint evaluation, not silent divergence. UI/UX and rendering presentation stay the new project's call. Numeric outputs must match unless an explicit divergence is documented. |
| 2 | **Legacy baseline** | Branch `baseline-v1-20260429` is the authority; HEAD SHA recorded at each capture (currently `397aa2a` as of 2026-04-29). Re-baseline at the close of each parity-spike. Cumulative drift between vendor era and baseline HEAD tracked in `docs/parity/BACKLOG.md`. |
| 3 | **Reference plants** | Real: `phaseboundary2.kmz` + `complex-plant-layout.kmz`. Synthetic: targeted KMZs built in P1 to force specific patterns deterministically. |
| 4 | **Verification artifacts** | Tiered. Synthetics → numeric + pattern-distribution only (run in pytest). Real plants → numeric + serialized geometry as committed JSON fixtures (automated diff) + one-time-per-baseline screenshot/KMZ/PDF/DXF capture as static evidence + visual side-by-side screenshots required at gate close. |
| — | **Tolerances** | Counts: exact. Pattern distribution: exact. `total_dc_cable_m` / `total_ac_cable_m`: ±0.1 m. Per-cable `length_m`: ±0.1 m. Per-cable `route_utm` polyline coordinates: ±0.001 m. |
| 5 | **Governance workflow** | Discrepancy → I write a technical memo (one file in `docs/parity/findings/`, format in §7) → Arun reviews / approves → I act. For solar-domain calls, Arun discusses directly with Prasanta (co-founders; daily contact); no formal message-drafting between them. I produce the technical artifact; the human conversation happens between co-founders. |
| 6 | **Sync skill** | On-demand `/parity-sync` invocation. Output: function-level structural diff + draft discrepancy memos pre-filed. State file: `docs/parity/.sync-state.json`. Scope: `pvlayout_core/` only. |
| 7 | **Pace** | Aggressive (~4–6 weeks). Pause all non-parity forward work in `pv_layout_project`. End-state: legacy retired. |
| 8 | **Plan file** | This file. `docs/parity/PLAN.md`. Layout: `findings/`, `baselines/`, `.sync-state.json` siblings. |
| + | **Visual fingerprint addendum** | Visual side-by-side parity is a required gate, not optional. `route_quality` rendering is in-scope. Pattern V's diagonals validated visually before signoff. |

---

## §3  End-state

### Retirement criteria

Legacy `PVlayout_Advance` is retired when **all** of the following hold:

1. **Algorithm parity:** sync skill reports zero open findings against current baseline. Function inventory matches.
2. **Numeric parity:** both reference plants pass automated geometry + total + count diff within locked tolerances.
3. **Visual parity:** side-by-side screenshots on both reference plants are indistinguishable to a solar-engineering reviewer.
4. **Feature parity at the new app's surface:** every legacy feature in scope (per Q1: core algorithms + features the new app has chosen to include; edition-specific gating Basic/Pro/Pro_Plus is replaced by entitlement keys per `CLAUDE.md` §5 — already done; not regression scope) is present in the new app.
5. **Solar engineer review:** the engineer runs the new app on their own KMZs and confirms it produces output they'd accept in their workflow.
6. **Customer-facing capabilities:** KMZ + PDF + DXF exports work; energy yield computes; in-scope spikes (S12, S13) closed.
7. **No P0/P1 bugs open** in whatever tracker we settle on (TBD; not parity-spike scope to define the tracker).
8. **Release docs updated** — `README.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md` reflect single-product reality.

### Shutdown checklist (post-retirement)

When (1)–(8) are met, P5 executes:

- [ ] Mark legacy repo as archived (read-only) via repo settings or branch protection.
- [ ] Move `docs/parity/` → `docs/historical/parity/` (preserve audit trail; remove from active read paths).
- [ ] Update `CLAUDE.md` §2: remove ADR-0007 / ADR-0008 references; restore "`pvlayout_core/` is a stable port; no further synchronization."
- [ ] Supersede ADR-0007 + ADR-0008 (status: superseded by post-retirement state).
- [ ] Remove `/parity-sync` slash command from skills directory.
- [ ] Remove `docs/parity/.sync-state.json`.
- [ ] Update `docs/SPIKE_PLAN.md` to mark parity track closed; restore normal spike flow.
- [ ] Update `README.md` to reflect single-product reality.
- [ ] Archive memory entries (`project_parity_baseline.md` → archived; remove from `MEMORY.md` index).

---

## §4  Reference plants + verification protocol

### Reference plant set

| Plant | Path | Tier | Purpose |
|---|---|---|---|
| `phaseboundary2.kmz` | `python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz` | Real, manual gate | Canonical reference; medium plant; multi-ICR |
| `complex-plant-layout.kmz` | `python/pvlayout_engine/tests/golden/kmz/complex-plant-layout.kmz` | Real, manual gate | Contrasting larger / more complex shape; exposes Pattern V firing |
| Synthetic set | `python/pvlayout_engine/tests/parity/synthetic/` (built in P1) | Synthetic, CI gate | Force specific patterns: V firing, F best-effort, MST trunk-share, bundling, allowance arithmetic |

### Artifact tier per plant type

**Synthetic plants** (CI):
- Numeric totals (`total_dc_cable_m`, `total_ac_cable_m`).
- Counts (tables, inverters, LAs, ICRs).
- Pattern hit distribution (via `PVLAYOUT_PATTERN_STATS=1`).
- Per-cable `length_m`.
- Asserted via pytest with strict tolerances.

**Real plants** (manual + automated):
Everything synthetic produces, plus:
- Per-cable `route_utm` polyline arrays serialized to JSON, committed to `python/pvlayout_engine/tests/golden/parity/<plant>/<baseline-id>.json`.
- Geometry diff via segment-set Hausdorff distance, ε = 0.5 m.
- One-time-per-baseline ground-truth capture in `docs/parity/baselines/<baseline-id>/ground-truth/<plant>/`:
  - Legacy app screenshot (canvas; both AC visible and AC hidden states).
  - Legacy KMZ export (note: legacy intentionally omits cables from KMZ; this is the boundary + tables only).
  - Legacy PDF export (page 1 = layout figure with cables baked in if visible at export time).
  - Legacy DXF export (with `DC_CABLES` + `AC_CABLES` layers populated).
  - `numeric-baseline.json` — totals, counts, per-pattern distribution, per-cable lengths.
- Visual side-by-side at parity-spike gate close: capture new-app screenshot under same KMZ, compare against legacy ground-truth screenshot at same zoom. Pass criterion: solar-engineering reviewer confirms indistinguishable.

### Tolerance table

| Quantity | Tolerance |
|---|---|
| Counts (tables, inverters, LAs, ICRs) | exact (`==`) |
| Pattern hit distribution (e.g. `{A=41, A2=4, ...}`) | exact |
| `total_dc_cable_m` | ±0.1 m |
| `total_ac_cable_m` | ±0.1 m |
| Per-cable `length_m` | ±0.1 m |
| Per-cable `route_utm` polyline coordinates | ±0.001 m (effectively exact; floating-point noise floor) |
| `ac_cable_m_per_inverter`, `ac_cable_m_per_icr` | ±0.1 m |
| Visual side-by-side | indistinguishable at canvas zoom; no statistical tolerance |

### Gate format

Every parity-spike (P0–P5) has a gate memo at `docs/gates/p<NN>.md` (mirrors existing spike gate convention). Required sections:

1. **What shipped** — summary of changes; commit references.
2. **Static gates** — lint, typecheck, frontend tests, build, sidecar pytest. Same convention as regular spike gates.
3. **Parity gates per plant** — `numeric_diff: pass/fail`, `geometry_diff: pass/fail`, `visual: pass/fail` (manual).
4. **Sync skill report** (P1+) — number of open findings; expectation is `0`.
5. **Acceptance checklist** with `[x]` / `[ ]`.

---

## §5  Parity-spike sequence (Approach B)

Estimates are elapsed calendar days, mostly user verification + decision time given agentic-coding pace (per `user_working_style.md` Rule 6).

### P0 — Quick-win port (3–4 days)

**Goal:** restore the visual fingerprint. Get the four known missing functions ported and visually validated against legacy on `phaseboundary2`.

**Authoritative source:** legacy at `baseline-v1-20260429`:
- `core/string_inverter_manager.py:460` (`_bundle_dc_cables`)
- `core/string_inverter_manager.py:588` (`_build_mst_edges`)
- `core/string_inverter_manager.py:620` (`_calc_individual_ac_total`)
- `core/string_inverter_manager.py:649` (`_route_ac_mst`)
- The `place_string_inverters` body's calls into these (legacy lines 844–903) — adapt to new project's `place_string_inverters` shape, **preserving all S11.5 additions** (Pattern V, search-space caps, `route_quality` tagging, allowance reads, per-ICR/inverter subtotals).

**In scope:**
- Port the four functions verbatim from legacy: `_bundle_dc_cables`, `_build_mst_edges`, `_route_ac_mst`, `_calc_individual_ac_total`.
- Adapt `place_string_inverters` to call the bundled-DC + MST-AC paths instead of the per-cable individual routing.
- **All S11.5 additions are preserved** (per the bidirectional-alignment scope reframe in §2 row 1). Search-space caps in `_route_ac_cable`, Pattern V machinery (`_build_boundary_vis_graph`, `_dijkstra`, `_visible_neighbors`, `_build_route_polygon`, `_route_visibility`), `route_quality` tagging, parameterised allowances on `LayoutParameters`, per-ICR/inverter subtotals on `LayoutResult`, and the `PVLAYOUT_PATTERN_STATS` instrumentation **all stay**. The port is **additive**: legacy's bundling + MST + individual quantity functions land on top of the existing S11.5 surface, not in place of it.
- **Pre-file three discovery memos** in `docs/parity/findings/` for Prasanta's review (he hasn't seen these S11.5 additions yet — they originated in the new project):
  - **Pattern V** — describes the 15 boundary-violating cables we found on `phaseboundary2`, the visibility-graph + Dijkstra solution, the trivial wall-clock cost (~4 s instrumented vs 460 s pre-port), the `route_quality` tagging that surfaces the issue.
  - **Search-space caps in `_route_ac_cable` patterns A2–E** — describes the 460 s → 4 s benchmark, the cap values (A2/A3 ≤ 8 cols, A4 5×5, B 8×8 gaps, E single ≤ 15, E two-waypoint only when |W| ≤ 10), and the rationale: was needed for the per-cable non-bundled topology; may be unnecessary or wrong-sized post-MST port — flag for joint evaluation with Prasanta.
  - **`CableRun.route_quality` field** — describes the `ok | best_effort | boundary_violation` tagging, the EPC-reviewer use case, the additive nature (default `"ok"` preserves legacy semantics).
- Capture legacy ground truth on `phaseboundary2` and `complex-plant-layout`: run legacy app at `baseline-v1-20260429`, screenshot canvas (cables visible + cables hidden), export KMZ + PDF + DXF, dump numeric outputs to `numeric-baseline.json`. Save to `docs/parity/baselines/baseline-v1-20260429/ground-truth/<plant>/`.
- Manual side-by-side visual gate: open same KMZ in legacy + new app, screenshot both, compare.
- Update `CLAUDE.md` §2 to reference `docs/parity/PLAN.md` as a session-start read.

**Out of scope:**
- Sync skill (P1).
- Inventory of other potential gaps (P1).
- `route_quality` frontend rendering (P3).
- Pattern V visual validation as a gate (P3 — Pattern V continues to exist and fire; just no visual gate for it yet).
- Synthetic plant fixtures (built in P1).
- ADR-0008 draft (post-PLAN.md approval, before P1).

**Deliverables:**
- Ported functions in `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py`.
- Updated `place_string_inverters` body (additive on top of S11.5).
- Three discovery memos in `docs/parity/findings/` (Pattern V, search-space caps, `route_quality`).
- Captured ground truth in `docs/parity/baselines/baseline-v1-20260429/ground-truth/{phaseboundary2,complex-plant-layout}/`.
- `CLAUDE.md` §2 updated to link this plan.
- Gate memo `docs/gates/p00.md`.

**Gate:**
- Static gates green.
- Visual side-by-side on `phaseboundary2`: new app's cable topology indistinguishable from legacy on the bundled DC + MST AC topology (modulo Pattern V's 15 cables, which are explicit divergence — see Pattern V discovery memo).
- Numeric diff: `total_dc_cable_m` and `total_ac_cable_m` match legacy within ±0.1 m **after accounting for the Pattern V divergence** (the 15 cables route inside the polygon in the new app vs outside in legacy; expected non-trivial delta on `total_ac_cable_m` for `phaseboundary2`; new app value is the physically-installable one).
- Arun signoff. Prasanta acknowledges the three discovery memos (async, via Arun's daily comms; no formal review gate before P1).

### P1 — Sync skill + inventory (4–6 days)

**Goal:** build `/parity-sync` slash command + run it against current baseline + triage all findings + lay down the test infrastructure.

**In scope:**
- Build `/parity-sync` skill (location TBD per project skill convention; tracked in §9). Behavior per §6 spec.
- Run the skill once — surfaces anything we missed beyond the four functions.
- Triage every finding via the §7 workflow: I classify, you confirm, we plan action (action lands in P2).
- Build synthetic plant fixtures (starter set per §9 parking lot; final composition decided in P1 scoping) under `python/pvlayout_engine/tests/parity/synthetic/`.
- Build automated geometry diff harness (segment-set Hausdorff distance) as a pytest helper.
- Commit `phaseboundary2` + `complex-plant-layout` JSON fixtures to `python/pvlayout_engine/tests/golden/parity/`.
- Draft ADR-0008 (synchronized-port model; supersedes ADR-0007 scoping).

**Out of scope:**
- Acting on findings beyond their classification (any actual ports go in P2).
- `route_quality` frontend (P3).

**Deliverables:**
- `/parity-sync` skill, working.
- Set of finding memos under `docs/parity/findings/`, all triaged.
- Synthetic plant fixtures.
- Geometry diff harness.
- JSON parity fixtures for both real plants.
- ADR-0008 in `docs/adr/`.
- Gate memo `docs/gates/p01.md`.

**Gate:**
- Static gates green.
- `/parity-sync` runs cleanly; produces structured output and finding memos.
- All findings triaged with locked classification.
- Synthetic + real plant numeric tests pass on the post-P0 code (regression check — confirms P0 didn't break anything we have a test for).

### P2 — Close remaining findings (3–5 days)

**Goal:** port whatever P1's inventory surfaced. Probably small.

**In scope:**
- Each finding memo becomes a port task; address in priority order (port-bug class first, then unknown class, then any legacy-bug class with engineer in loop).
- Re-run sync skill after; expect zero open findings.
- Update JSON fixtures if any geometric output changed (re-baseline by capturing fresh).

**Out of scope:**
- `route_quality` frontend (P3).
- Anything beyond what P1's inventory surfaced.

**Deliverables:**
- All P1 findings closed (status `acted` or `superseded`).
- Updated JSON fixtures if needed.
- Gate memo `docs/gates/p02.md`.

**Gate:**
- Static gates green.
- Sync skill: zero open findings against `baseline-v1-20260429`.
- Numeric + geometric parity tests pass on both real plants.
- Updated visual side-by-side: still indistinguishable from legacy ground truth.

### P3 — `route_quality` rendering + Pattern V visual (2–3 days)

**Goal:** surface `route_quality` in the frontend; validate Pattern V visual output.

**In scope:**
- `apps/desktop/src/project/layoutToGeoJson.ts`: copy `route_quality` from `dc_cable_runs[i].route_quality` / `ac_cable_runs[i].route_quality` into GeoJSON feature properties.
- `apps/desktop/public/map-styles/pv-light.json` + `pv-dark.json`: add property-driven paint expression for `route_quality == "boundary_violation"` (proposal: dashed stroke + warning colour); `"best_effort"` (proposal: thinner / less opaque); `"ok"` keeps current paint.
- Visual validation on `complex-plant-layout` (Pattern V should fire there): does Pattern V's output look acceptable? If not, decide between (a) post-process to nearest Manhattan path, (b) accept and document. Decision lands in §9 closeout.

**Out of scope:**
- New cable interaction (hover/click) — out.
- Editing tools — out.
- "Show only OK cables" filter (proposal in §9; reject if it adds complexity not justified).

**Deliverables:**
- `route_quality` rendered visually (boundary-violation cables visually distinct).
- Pattern V visual decision documented.
- Gate memo `docs/gates/p03.md`.

**Gate:**
- Static gates green.
- Visual side-by-side on both plants: pass.
- `route_quality` field flows from sidecar through GeoJSON into a paint property.
- Pattern V output validated on `complex-plant-layout`.

### P4 — Retirement-readiness (5–10 days)

**Goal:** ship the remaining capabilities legacy has that the new app doesn't yet expose. Closes the last gap to retirement.

**Scope:** the current `docs/SPIKE_PLAN.md` identifies this work as S12 (KMZ/PDF/DXF exports), S13 (DXF/CSV/yield), and possibly S13.5 (dark theme polish). P4 is the parity-flavored re-scoping of those — only the parts that gate retirement.

**In scope:**
- Wire `pvlayout_core/core/{kmz,pdf,dxf}_exporter.py` (currently dead code in sidecar) to FastAPI routes.
- KMZ exporter: maintains legacy's intentional cable omission (cables in summary text only).
- PDF exporter: needs a decision — page 1 was the live matplotlib figure in legacy; new app has no equivalent. Options: (a) re-render via headless matplotlib using `dc_cable_runs` / `ac_cable_runs`, (b) capture browser-canvas screenshot and embed, (c) abandon page 1 and ship pages 2+ only. Pick during P4 scoping.
- DXF exporter: vendor-verbatim port should work; wire to a FastAPI route.
- Energy yield calculator: confirm it works in the new app stack.
- Dark theme polish if a customer demo / release demand surfaces (otherwise defer).
- Anything else that gates the retirement criteria in §3.

**Out of scope:**
- ICR drag, drawing tools beyond what S11 already shipped — those are not retirement-critical.
- Any new feature legacy doesn't have.

**Deliverables:**
- Exports wired up and tested.
- PDF page-1 strategy decided and documented.
- All retirement criteria (§3) verified passing.
- Gate memo `docs/gates/p04.md`.

**Gate:**
- Static gates green.
- All retirement criteria checked off (§3).
- Solar engineer signoff on running new app on their KMZs.
- User signoff on overall retirement-readiness.

### P5 — Sunset (1 day)

**Goal:** retire legacy.

**Actions** (per §3 shutdown checklist):
- Archive legacy repo.
- Move `docs/parity/` → `docs/historical/parity/`.
- Update `CLAUDE.md` §2.
- Supersede ADRs 0007 + 0008.
- Remove `/parity-sync` skill.
- Update `docs/SPIKE_PLAN.md` and `README.md`.
- Archive memory entries.

**Deliverable:** sunset PR.
**Gate:** user signoff.

---

## §6  Sync skill spec

### Invocation

`/parity-sync` (slash command in Claude Code). Optional flag: `--baseline <commit-or-branch>` to override the default (current legacy HEAD on the baseline branch).

### Inputs

- `docs/parity/.sync-state.json` — last-baselined legacy commit hash.
- Path to legacy repo (configurable; defaults to `/Users/arunkpatra/codebase/PVlayout_Advance`).
- Path to vendored core (`python/pvlayout_engine/pvlayout_core/`).

### Process

1. Read `.sync-state.json`. If absent, treat last-baselined as the new project's vendor commit (`8b352b7`).
2. Resolve target legacy commit (default: branch `baseline-v1-20260429` HEAD; override via flag).
3. Compute file-level diff for all files under `pvlayout_core/{core,models,utils}/` between last-baselined and target legacy commit.
4. For each file: AST-parse both versions; enumerate top-level functions and class methods; compute per-function presence + signature + body diffs.
5. For each net-new function in legacy: produce a draft discrepancy memo (template §7).
6. For each modified function: produce a draft discrepancy memo with the body diff inlined.
7. For each function deleted in legacy but present in new: produce a draft discrepancy memo classified as "legacy removed; verify if new app should remove too."
8. Cross-reference each finding against open memos in `docs/parity/findings/` to avoid duplicates (match by function name + file path).
9. Write draft memos to `docs/parity/findings/YYYY-MM-DD-NNN-<short-slug>.md` (NNN auto-numbered against existing memos).
10. Update `.sync-state.json` to target legacy commit.
11. Print summary to stdout: N findings drafted, list of memo paths.

### State file format

```json
{
  "last_baselined_legacy_branch": "baseline-v1-20260429",
  "last_baselined_legacy_sha": "397aa2ab460d8f773376f51b393407e5be67dca0",
  "last_run_at": "2026-04-29T11:56:00+05:30",
  "vendored_into_commit": "8b352b7def..."
}
```

### Implementation notes

- Built as a Claude Code skill; lives where the project's plugin convention dictates (decided in P1).
- Uses Python's `ast` module for parsing — no external deps.
- Output goes to disk (memos) + stdout (summary); no daemon, no scheduled trigger.
- **Idempotent:** running twice on the same baselines produces no new memos.
- **Scope:** `pvlayout_core/{core,models,utils}/` only. Legacy `gui/`, `auth/`, `dist/`, `build/` are ignored — no equivalent in the new project.

---

## §7  Discrepancy memo template + workflow

### File location

`docs/parity/findings/YYYY-MM-DD-NNN-<short-slug>.md`

### Template

```markdown
# Finding NNN — <one-line title>

**Date:** YYYY-MM-DD
**Sync run:** legacy `<commit>` vs new project `<commit>`
**Status:** open | triaged | acted | superseded

## Classification

One of:
- **port-bug** — function or behaviour present in legacy, missing or different in new project. Default action: port from legacy to new.
- **legacy-bug** — discrepancy that looks like a bug in legacy. Default action: I draft a technical memo; Arun discusses directly with Prasanta (no formal message-drafting; daily friend-comms). Resolution lands in this memo's Resolution section.
- **new-project-discovery** — feature/fix originating in the new project, not present in legacy (e.g., S11.5 Pattern V). Default action: I draft a technical memo describing the discovery + rationale + evidence; Arun routes the conversation with Prasanta; if Prasanta wants legacy to adopt, Arun (or Prasanta) ports it.
- **intentional-divergence** — both repos deliberately differ (UI/UX call, joint co-founder decision documented after evaluation). Default action: document; close as expected.
- **unknown** — needs joint solar-domain + SWE judgment. Default action: Arun + Prasanta discuss; resolution lands in this memo's Resolution section.

## Evidence

- Legacy: file:line citations, code snippet
- New project: file:line citations, code snippet
- Reproduction: which plant, which command, which output diverges

## Proposed action

Concrete next step. May be "port function X from legacy line Y to new line Z" or "draft message to engineer asking about Q" or "no action — close as intentional."

## Alternative interpretations

If classification could be different, list the alternative + the evidence we'd need to disambiguate.

## Resolution (filled when closed)

What was actually done. Cross-reference to commit / spike / engineer reply.
```

### Workflow

1. Sync skill or manual review surfaces a finding → memo drafted to `docs/parity/findings/`.
2. I complete classification + evidence + proposed action sections.
3. Arun reviews; approves / modifies / escalates / routes to Prasanta.
4. On approval (technical / SWE-domain): I act (port, edit, refactor) without further gating.
5. On solar-domain calls: Arun discusses with Prasanta directly. Outcome lands in this memo's Resolution section. I do not draft messages between co-founders.
6. On close: status flips to `acted` or `superseded`; resolution section filled with what was actually done + cross-reference to commit / spike / Prasanta's call (if any).

---

## §8  Cross-references

### Required updates at PLAN.md landing time

- **`CLAUDE.md` §2** — add a paragraph naming `docs/parity/PLAN.md` as a non-negotiable session-start read, alongside `ARCHITECTURE.md` and `SPIKE_PLAN.md`. Modify ADR-0007 reference to note ADR-0008 supersedes its scoping intent.
- **`docs/SPIKE_PLAN.md`** — top-of-file note: "**parity sprint active 2026-04-29 → ETA ~2026-05-29; see `docs/parity/PLAN.md`. Spike sequence on hold; parity-spike track P0–P5 takes precedence per Q7. Existing spikes (S11 polish, S12, S13, S13.5, S13.8) resume only if/when they fold into P4 retirement-readiness or post-retirement.**"
- **`docs/adr/0007-pvlayout-core-s11-5-exception.md`** — keep status "accepted" but add a footer: "Scoping evolved by ADR-0008 (synchronized-port + bidirectional-alignment model); the S11.5 additions ADR-0007 covered (search-space caps, Pattern V, `route_quality`, parameterised allowances, per-ICR/inverter subtotals, instrumentation) **remain valid and are preserved**. They flow to Prasanta as discovery memos in P0 for joint evaluation; they are not reverted."
- **ADR-0008** — drafted in P1 (after PLAN.md approval). Establishes:
  - The **synchronized-port + bidirectional-alignment model**: `pvlayout_core/` defaults to legacy via baselines + sync skill; new-project discoveries flow back to Prasanta as discovery memos.
  - Evolves ADR-0007's "scoped exception" framing into a continuous coordination model between co-founder repos.
  - Names the sunset condition (when legacy retires, ADR-0008 + ADR-0007 become superseded).

### Memory entries (already in place)

- `project_parity_baseline.md` — the baseline pointer (legacy branch + HEAD SHA + reasoning).
- `user_working_style.md` — Rule 6 (agentic-coding pace; user time is the bottleneck).
- `project_cofounder_partnership.md` — Arun + Prasanta partnership context; Prasanta's free-hand authorization on prioritization.
- `reference_backend_repo.md` — pointer to the renewable_energy mvp_* backend (relevant only at P4 retirement-readiness).

### Drift backlog

[`docs/parity/BACKLOG.md`](./BACKLOG.md) — living document enumerating cumulative drift (`vendor..baseline`) beyond P0's narrow cable-functions scope. Populated by hand during P0; will be refined / expanded by P1 sync skill output.

### Spike-plan restructure (post-PLAN.md approval)

Explicit edits to `docs/SPIKE_PLAN.md` and `docs/gates/STATUS.md`:
- Insert a "Parity Track" section.
- Mark current spikes (S12, S13, S13.5, S13.8) as paused with reason and pointer to PLAN.md.
- Add P0–P5 entries with the structure above.

These edits are NOT part of this document; they're a downstream task tracked in `§9` parking lot until you approve PLAN.md.

---

## §9  Open questions / parking lot

- **Synthetic plant set composition** — what specific patterns to force in P1's synthetic fixtures? Proposed starter set: (a) rectangular plant, single ICR, exercises Pattern A only; (b) L-shape plant exercising Pattern A4; (c) concave plant exercising Pattern V; (d) tiny plant (< 5 tables) exercising allowance arithmetic edge case. Final set decided in P1 scoping.
- **Pattern V visual treatment if it looks ugly** — TBD in P3. Proposed default: accept diagonals as a documented design call; revisit only if customer / EPC reviewer flags.
- **PDF page-1 strategy** — TBD in P4. Three options listed in P4 in-scope.
- **Cross-architecture float behaviour** — Intel vs ARM macOS may produce sub-millimetre divergence at extreme tie boundaries in K-means seeding. Add a sentinel test if it surfaces; otherwise non-issue.
- **Granularity of parity-spike gate memos** — every parity-spike gets its own gate memo at `docs/gates/p<NN>.md` (matches existing convention). Could collapse if memos become too thin.
- **`/parity-sync` skill plugin location** — `.claude/skills/parity-sync/`? Or under an existing plugin namespace? Decide in P1 based on project skill-plugin conventions.
- **Legacy commits arriving mid-spike** — proposed: ignore until current parity-spike closes; capture in next sync run. Alternative: pause current spike if the legacy commit invalidates in-progress work. Default to "ignore unless catastrophic."
- ~~**Engineer messaging cadence**~~ — **resolved (v0.2):** no formal cadence. Arun discusses findings with Prasanta directly via their daily phone + WhatsApp comms. I produce technical memos as artifacts in `docs/parity/findings/`; Arun routes content as appropriate. No I-draft-you-send formality between co-founders.
- ~~**Wider drift than expected**~~ — **resolved (v0.3, P0 Task 2):** legacy commit `9362083` (cable functions) is much wider than just cable code, AND additional legacy commits (water-body autodetection in `9c751b7`, DXF improvements in `fc1a5c5`, etc.) sit between vendor era and baseline HEAD `397aa2a`. Cumulative drift is tracked in [`docs/parity/BACKLOG.md`](./BACKLOG.md). P0 stays narrow per Q7 + Prasanta's "systematic, eventual" framing. P1 sync skill enumerates everything mechanically.
- ~~**Baseline reference notation**~~ — **resolved (v0.3):** branch `baseline-v1-20260429` is the authority; resolved SHA-at-capture (currently `397aa2a`) is recorded in each `numeric-baseline.json`'s `legacy_sha_at_capture` field for audit trail. Documentation uses "branch X (HEAD `<sha>` at capture)" notation.
- **CI integration of parity tests** — once geometry diff harness exists, should it run on every PR? Proposed yes from P1 onward; protects against regression. Cost: CI time. Decide if cost is real.
- **Real-plant numeric baselines re-capture** — when we re-baseline at end of each parity-spike, do we re-capture full ground truth or only re-run the JSON fixture diff? Proposed: re-capture screenshots on every baseline; re-capture exports only when a parity-spike's changes touch export code paths.

---

## §10  Changelog

- **0.1 (2026-04-29):** initial draft. Output of brainstorming interview (8 Qs + visual fingerprint addendum). Approach B selected.
- **0.2 (2026-04-29):** reframe to **bidirectional alignment within the Arun + Prasanta co-founder partnership**. Triggered by user clarification that Prasanta is co-founder (30-year close friend, daily contact), not external vendor. All S11.5 additions (search-space caps, Pattern V, `route_quality`, parameterised allowances, per-ICR/inverter subtotals, instrumentation) **confirmed preserved** — no reverts. Three discovery memos added to P0 deliverables. Memo template gains `new-project-discovery` classification. Governance simplified: I produce technical memos; Arun discusses solar-domain content directly with Prasanta — no message-drafting between co-founders. ADR-0007 footer wording softened from "scope superseded" to "scope evolved into ADR-0008's bidirectional model." §9 engineer-messaging-cadence item resolved.
