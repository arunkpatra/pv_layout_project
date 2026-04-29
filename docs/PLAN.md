# pv_layout_project — Plan

**Mission:** catch the new app up to legacy `baseline-v1-20260429`.
**Last updated:** 2026-04-29
**Status:** 7 / 12 done.

This file is the single source of truth for what gets built. Replaces the prior `SPIKE_PLAN.md` + `parity/PLAN.md` + `parity/BACKLOG.md` (now in [`historical/`](./historical/)).

---

## Tier policy

Each row carries a tier that defines how much process applies.

- **T1 — port + test.** Implement the change → run sidecar pytest → commit. No reviewer subagents, no memos, no per-row gate. The diff and the green tests are the audit trail.
- **T2 — port + parity test.** T1 plus a numeric parity test against the legacy baseline at [`docs/parity/baselines/baseline-v1-20260429/`](./parity/baselines/baseline-v1-20260429/). Spec-reviewer subagent only if the change is non-trivial.
- **T3 — port + deferred solar-domain review.** T2 plus a short discovery memo at `docs/parity/findings/YYYY-MM-DD-NNN-<slug>.md` capturing solar-domain decisions made during the port. The memo is the audit trail and the prep material for Prasanta's end-of-port review (see "Out of scope" below). No per-row Prasanta gate; row close is the same as T2 plus the memo committed.

Most rows are T1 or T2. T3 is reserved for genuine solar-domain calls (energy model, new product modes); its only structural difference from T2 is the discovery memo.

---

## Backlog

Rows are domain-grouped; within a group, listed in dependency order. Pick top `todo` row, do it, flip Status. Atomic commit per row.

| # | Feature | Tier | Source (legacy `baseline-v1-20260429`) | Acceptance | Status |
|---|---|---|---|---|---|
| **Models & Inputs** | | | | | |
| 1 | Project model field additions | T1 | `models/project.py` @ `9362083` | Sidecar pytest green. | **done** |
| 2 | LA placement algorithm | T2 | `core/la_manager.py` @ `9362083` | Sidecar pytest green; parity LA count + position match on phaseboundary2. | **done** |
| **Cable** | | | | | |
| 3 | Bundled DC + MST AC | T2 | `core/string_inverter_manager.py` @ `9362083` | Parity test 3/3 on phaseboundary2 (counts exact, DC ±0.1m, AC modulo Pattern V −613.5m ± 200m). | **done** (P0) |
| **Layout & KMZ** | | | | | |
| 4 | KMZ parser + water/canal/TL autodetection | T3 | `core/kmz_parser.py` @ `9362083` + `9c751b7` | Parity boundary geometry match; new app loads legacy KMZs identically; discovery memo committed. | **done** |
| 5 | Satellite water-body detection | T3 | `core/satellite_water_detector.py` (new) @ `9362083` | Feature reachable from new-app UI; parity-driven test on a known plant; discovery memo committed. | **done** |
| 6 | Layout engine + water-body integration | T2 | `core/layout_engine.py` @ `9362083` + `9c751b7` | Parity table count + position match on both reference plants; row-#4 water_obstacles bridge in `layout_engine.py:run_layout_multi` removed (water_obstacles routed through their own exclusion path with legacy's setback semantics). | **done** |
| **Energy** | | | | | |
| 7 | Solar transposition rewrite (HSAT GHI→GTI) | T3 | `core/solar_transposition.py` @ `9362083` | Parity transposition output match; discovery memo committed. | **done** |
| 8 | Energy calculator + SAT GTI fix | T3 | `core/energy_calculator.py` @ `9362083` | Parity 25-year yield match within solar tolerance; discovery memo committed. | todo |
| **New product mode** | | | | | |
| 9 | Single-axis-tracker layout mode | T3 | `core/tracker_layout_engine.py` (new) @ `9362083` | New mode produces output; parity check on a SAT plant; discovery memo committed. | todo |
| **Exports** | | | | | |
| 10 | DXF exporter — LA + cable layers | T1 | `core/dxf_exporter.py` @ `9362083` + `fc1a5c5` | Exporter wired to FastAPI route; parity DXF structure match. | todo |
| 11 | PDF exporter — tweaks | T1 | `core/pdf_exporter.py` @ `9362083` | Exporter wired; manual visual parity. | todo |
| 12 | KMZ exporter — wiring | T1 | `core/kmz_exporter.py` (no legacy drift; integration gap) | Exporter wired; new app produces legacy-equivalent KMZ. | todo |

---

## Process per row

1. Pick the top `todo` row.
2. Read its `Source` end-to-end. Read `docs/ARCHITECTURE.md` §1–3 + §6.5 + §12 if not already in head.
3. Apply the tier's ceremony.
4. Flip `Status` to `done` in this file when `Acceptance` is met. Bump the count in the Status line at the top.
5. Atomic commit per row: `parity: <feature name>` (intra-row checkpoints use `wip:`).

No per-row gate memo. No per-row sub-plan file. No discovery memo for T1/T2 unless the diff itself surfaces a solar-domain question.

---

## Out of scope (deferred)

These were considered and explicitly deferred during the 2026-04-29 plan reset:

- **End-of-port solar-domain review (Prasanta).** Per agreement on 2026-04-29, Prasanta does not gate any individual row. Once all 12 rows are `done`, the accumulated T3 discovery memos in [`docs/parity/findings/`](./parity/findings/) are routed to Prasanta in a single pass for review. Refinements (if any) become follow-up rows.
- **Retirement-trigger criteria.** When all 12 rows are `done`, we'll know if we're ready to retire legacy. No formal trigger document.
- **`/parity-sync` skill.** With 12 hand-maintained rows, mechanical sync is overkill.
- **New app UI/UX work** beyond what each row's `Acceptance` requires (drawing tools, dark theme polish, design-system extensions, subscription gating, telemetry events). Resumes after the table is fully `done`.
- **Single-app-paradigm enforcement work** (entitlement-gated feature exposure). Resumes post-parity.
- **External contract refactors** (feature-key registry expansions, sidecar API versioning). Resumes post-parity unless an in-PLAN row needs it.

---

## See also

- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture (unchanged by this plan).
- [`docs/historical/`](./historical/) — superseded planning artifacts (`SPIKE_PLAN.md`, the prior `parity/PLAN.md` and `parity/BACKLOG.md`, all spike-era gate memos and handoffs).
- [`docs/adr/`](./adr/) — architecture decision records. ADRs 0001–0006 stand. ADR 0007 is superseded by this plan.
- [`docs/parity/baselines/`](./parity/baselines/) — legacy numeric capture data (test fixture for the parity tests). Kept in place; the parity test reads from here.

---

## Changelog

- **2026-04-29 v1.0** — Initial. Collapses three prior planning artifacts into one. Tiered process; feature-level domain-grouped backlog. Row 3 (cable) shipped as P0 prior to this reset.
