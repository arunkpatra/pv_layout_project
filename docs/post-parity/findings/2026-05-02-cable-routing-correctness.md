# Cable-Routing Correctness Decision Memo

**Date:** 2026-05-02
**Plan row:** [CR1](../../PLAN.md) (Phase 6 smoke-derived polish)
**Owner:** Arun (engineering) + Prasanta (solar-domain ratification)
**Tier:** T3 (build + decision memo per Prasanta's free-hand directive on solar-domain calls supported by industry standards)

---

## Decision

**The new app's cable router is architecturally correct against
verified industry sources. CR2 (Pattern V correction spike) closes
as not-needed.** Three artifacts ship to record the decision:

- [PRD-cable-routing-correctness.md](../PRD-cable-routing-correctness.md)
  — full audit, code analysis, empirical pattern dispatch.
- [cable-routing-compliance-report.pdf](cable-routing-compliance-report.pdf)
  — single unified report that supersedes the per-plant compliance
  PDFs of 2026-05-01 / 2026-05-02 with corrected framing.
- [test_cable_routing_constraints.py](../../../python/pvlayout_engine/tests/integration/test_cable_routing_constraints.py)
  — sidecar pytest regression gate.

## Why this memo exists

CLAUDE.md §2 *"Verify with citations before proceeding"* applies to
deep-tech / customer-impact claims. The post-parity overshoot
compliance PDFs shipped on 2026-05-01 / 2026-05-02 made deep-tech
claims about cable-routing correctness against an unverified
referent (legacy's `usable_polygon`). An honesty-audit pass on
2026-05-02 against publicly-available cabling literature found the
referent was wrong — not the legacy code's behaviour but the *frame
of judgment* applied to it. This memo records the decision to
correct the framing while preserving the genuine defect findings
and to leave the new app code unchanged.

## Position summary

### What the publicly-available cabling standards actually govern

NEC 690 (US, National Electrical Code Article 690 — Solar PV
Systems), IEC 62548-1:2023 (Photovoltaic arrays — design
requirements), and IEC 60364-7-712:2017 (electrical installations
— PV) specify cable physics-and-safety: sizing, conductor type,
burial depth, mechanical protection, AC/DC separation, identification
markers. **None reference a `usable_polygon`-style boundary for
cables.** The geographic boundary the standards govern is the
project's electrical boundary (IEC 62548-1:2023's
*"the boundary of a PV array is the output side of the PV array"*)
plus the property fence + jurisdictional setbacks (varies heavily
by Authority Having Jurisdiction).

The underlying primary standards are paywalled and have not been
read verbatim by the authors of this memo. The position above is
synthesised from publicly-available secondary sources cited below.

### What industry practice does

- **Inter-row aisle space is the standard cable corridor.** From the
  HellermannTyton *Wire Management Guide for Single-Axis Tracker
  Systems* and Solar Power World's tracker O&M articles: cable
  bundles "jump from one tracker to the next" between rows; in
  single-axis-tracker plants, cable management runs parallel to the
  driveline (which sits in the inter-row gap). Inter-row spacing
  literature explicitly treats cabling cost as one driver of the
  spacing decision — confirming inter-row space is for cables.
- **Cable routing is a separate optimization from PV array
  placement.** PVcase, RatedPower, Virto.solar — the leading
  commercial PV CAD tools — all expose user-drawn or auto-routed
  trench paths; the only spatial guidance is "avoid passing below
  structures." None enforce a usable-polygon-style containment.
- **Setback zones serve multiple functions.** PVfarm.io:
  *"O&M access paths (typically 20-30 ft) and required perimeter
  setbacks (commonly 20-50 ft)... serv[ing] multiple functions
  beyond just array exclusion."* Cables and access roads share these
  strips.
- **Academic optimization formulation.** The Solar Farm Cable
  Layout Problem (SoFaCLaP) — see Energy Informatics 2022 — is a
  graph-theoretic shortest-path with obstacle avoidance, no
  usable-polygon constraint.

### What this means for the legacy / new-app comparison

| | Legacy referent | What that referent measures | Real-world correctness? |
|---|---|---|---|
| **Class A (fence overshoot)** | Plant fence (property line) | Cables physically off the property — unbuildable without easements | **Yes.** Real defect. Legacy on complex-plant: 85/1079 (7.9%) cables, 20.7 km off-property. |
| **Class B (audit-trail issue)** | Per-cable polyline preservation | Whether a customer can audit the BoM | **Yes.** Real defect. Legacy on both fixtures: BoM is a single scalar. |
| **Class C (`usable_polygon` overshoot — retired)** | Legacy's table-placement polygon | Cables routing through legacy's own internal exclusion zones | **No.** The referent was wrong. Cables routing through inter-row aisles + perimeter-road bands are doing what cables are *supposed* to do per industry practice. |

The prior compliance PDFs framed Class C (here labeled "Class B" in
those PDFs as code self-inconsistency) as a defensible defect. The
honesty-audit found that framing is wrong: Pattern F's
`usable_polygon` referent was the wrong choice; legacy's
behaviour of routing through aisles in spite of that referent is
roughly correct, just by accident. The new app's two-polygon
architecture (`usable_polygon` for tables, `route_poly = fence -
ICRs` for Pattern V cable routing) is the principled fix.

## What the new app does and why it's correct

The new app already encodes the right architectural distinction
(observed in code review during CR1, 2026-05-02):

- `usable_polygon = fence - perimeter_road_buffer - obstacles -
  water - line_obstruction_buffers` — used **only** for table
  placement.
- `route_poly = fence - placed_ICRs` — used by Pattern V's
  visibility graph for cable routing. Constructed at
  [`string_inverter_manager.py:267-328`](../../../python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py#L267-L328);
  obstacles intentionally NOT subtracted because cables route
  around / through them at trench level (industry practice).
- Patterns A-E (preferred Manhattan templates that route through
  inter-row gaps via `gap_ys`) validate against `usable_polygon`
  — appropriate because A-E paths terminate at ICR centres which
  must be inside `usable_polygon`.
- Pattern V (visibility graph + Dijkstra) validates against
  `route_poly` — geometrically correct by construction; the
  fallback for concave-region cases where A-E can't find a path.
- Pattern F (least-violation) is the residual fallback; tagged
  `route_quality = "boundary_violation"` if any segment is outside
  `usable_polygon`.

CR1 measured the empirical pattern dispatch on both fixtures (see
the PRD §3.3 for the full table). Headline: Pattern A family
handles 75-100% of cables — the new app *is* using inter-row
aisles as the primary cable corridor. Pattern V intercepts 8-16%
in concave plants. **Zero AC cables exit the fence on either
fixture; only 1 of 1079 cables on complex-plant tagged
`boundary_violation`.**

## What CR1 attempted and reverted

Hypothesis: passing `route_poly` through to Patterns A-E (so they
validate against the wider polygon too) would let A-E succeed in
concave-region cases that currently fall through to V/F, reducing
total AC length by avoiding longer fallback routes.

Empirical measurement: the change *regressed* total AC cable length
by 30-60% on both fixtures. Root cause: A-E's path templates
terminate at the ICR centre. `route_poly` subtracts ICRs (creating
polygon-with-hole), so the final segment of every template fails
validation, A-E reject all paths, V is invoked but cannot fix the
ICR-endpoint issue either, and F's least-violation fallback returns
much longer paths.

The current architecture (A-E on `usable_polygon` which
*contains* ICRs; V on `route_poly` which excludes ICRs but accepts
endpoint nudging via `_safe_pt`) is correct as-is. Net code
change from CR1 was **one comment block** in `_route_ac_cable`
documenting the failed attempt for future engineers.

## What is explicitly deferred

1. **Should `route_poly` subtract `obstacle_polygons_wgs84`?**
   Currently does not. Defensible for canals and treelines (cables
   can route at trench level). Less defensible if customers
   commonly mark buildings as obstacles. **Brainstorm scheduled
   separately as CR3** — happens before D-row drawing tools work
   begins so the design lands coherently across the touched
   subsystems (drawing tools, per-run persistence, KMZ overlays,
   cable router).
2. **Should `route_poly` subtract line-obstruction safety buffers
   (TL/canal/road clearances)?** Currently does not. Cables can
   therefore route within 15 m of a transmission line per the new
   app. EPC safety codes typically require greater clearances.
   Same brainstorm as (1).
3. **Could a more sophisticated A-E validation (allowing the last
   segment to enter ICR cutouts; or a separate "cable-corridor
   polygon" wider than `usable_polygon` but smaller than
   `route_poly`) reduce V/F fall-through?** Out of scope for CR1.
   Revisit only if measurement on specific plants shows the
   current split produces sub-optimal routes.

## Reproducibility

All numerical claims in this memo are reproducible via:

```
cd python/pvlayout_engine

# Empirical pattern dispatch on both fixtures.
PVLAYOUT_PATTERN_STATS=1 \
    uv run python scripts/parity/probe_pattern_stats.py

# Constraint-adherence regression test.
uv run pytest tests/integration/test_cable_routing_constraints.py -v

# Legacy capture + reconstructed overshoot analysis (per plant).
uv run python scripts/parity/capture_legacy_baseline.py \
    --plant <phaseboundary2|complex-plant-layout> \
    --legacy-repo /path/to/PVlayout_Advance \
    --baseline baseline-v1-20260429
uv run python scripts/parity/detect_legacy_overshoots.py \
    --plant <phaseboundary2|complex-plant-layout> \
    --legacy-repo /path/to/PVlayout_Advance \
    --baseline baseline-v1-20260429

# Unified compliance PDF.
uv run python scripts/parity/generate_unified_compliance_pdf.py \
    --output ../../docs/post-parity/findings/cable-routing-compliance-report.pdf
```

## Sources (verified secondary)

The references below are the publicly accessible secondary sources
verified during CR1 (2026-05-02). Underlying primary standards are
paywalled and have not been read verbatim.

- NEC 690.31 cable installation guide:
  https://www.solarpermitsolutions.com/blog/nec-690-31-solar-wiring-requirements
- IEC 62548-1:2023 publication page:
  https://webstore.iec.ch/en/publication/64171
- IEC 60364-7-712:2017 (mirror PDF):
  https://lsp.global/wp-content/uploads/2025/10/IEC-60364-7-712-2017-Part-7-712-Requirements-for-special-installations-or-locations-Solar-photovoltaic-PV-power-supply-systems.pdf
- HellermannTyton Wire Management Guide for Single-Axis Tracker Systems:
  https://www.hellermanntyton.us/docs/default-source/default-document-library/white-papers/solar/wire-management-guide_april2020_v4.pdf
- PVcase Cabling docs:
  https://help.pvcase.com/hc/en-us/articles/44231655047443-Cabling
- Virto.solar cable trench routing:
  https://help.virto.solar/knowledge-base/cable-trenches
- RatedPower cabling efficiency:
  https://ratedpower.com/blog/cabling-solar-installations/
- Energy Informatics — Solar Farm Cable Layout Problem (graph optimization):
  https://energyinformatics.springeropen.com/articles/10.1186/s42162-022-00200-z
- PVfarm.io — Solar PV Layout Design Guide for Utility-Scale Projects:
  https://www.pvfarm.io/blog/solar-pv-layout-design-guide-for-utility-scale-projects
- Solar Power World — tracker O&M:
  https://www.solarpowerworldonline.com/2019/10/keep-trackers-following-the-sun-with-proper-om/

## Decision authority

Per Prasanta's directive on free hand for solar-domain calls
supported by industry standards (CLAUDE.md §2):

- The decision to retire the "Class B = code self-inconsistency"
  framing of `usable_polygon` overshoot is exercised under that
  free hand, supported by the verified secondary sources above.
- The decision to leave the new app code unchanged is mechanical
  — the empirical optimization attempt regressed (PRD §3.4).
- The decision to defer obstacle / line-buffer subtraction to a
  separate brainstorm is to avoid scope creep on CR1 and to give
  the multi-subsystem design (drawing tools, per-run persistence,
  KMZ overlays, cable router) the coherent treatment it deserves.

This memo + the PRD + the unified compliance PDF supersede prior
per-plant findings. Prior artifacts — the per-plant compliance
PDFs at `phaseboundary2-overshoot-compliance-report.pdf` and
`complex-plant-layout-overshoot-compliance-report.pdf`, and the
Pattern V justification memo at `2026-05-01-002-pattern-v-justification.md`
— are *not deleted* but should be read with the corrected framing
in this memo as the authoritative reference.
