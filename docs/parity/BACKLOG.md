# Parity Backlog — drift beyond P0 scope

**Status:** living document, updated as drift is discovered or resolved
**Anchor:** [`docs/parity/PLAN.md`](./PLAN.md)
**Authority:** legacy branch `baseline-v1-20260429` (HEAD `397aa2a` as of 2026-04-29)
**Vendor base:** new project commit `pv_layout_project@8b352b7` ≈ legacy commit `43f27d9` (2026-04-23)

This file enumerates known drift between the new project's vendored `pvlayout_core/` and the legacy baseline branch HEAD that is **out of P0 scope**. It's the human-readable interim view for prioritization and brainstorming. Entries get migrated to discovery memos / spike scope as we work through them.

P1 sync skill (`/parity-sync`) will eventually enumerate this systematically; until then, BACKLOG.md is hand-maintained.

---

## §1 — Drift inventory: vendor (`43f27d9`) → baseline HEAD (`397aa2a`)

Source: `git diff --stat 43f27d9..397aa2a -- 'core/*.py' 'models/*.py' 'utils/*.py'` on legacy. Total: ~+2,098 / -467 across 12 files in pvlayout_core scope.

### §1.1 — Modified pvlayout_core files (existed in vendor; changed in baseline)

| Module | Lines (+) | Originating commits | Purpose / what likely needs porting | Bucket | Target spike |
|---|---|---|---|---|---|
| `core/string_inverter_manager.py` | +389 | `9362083` | Cable bundling + MST + per-individual quantity. **P0 ports the four cable functions; remaining content (instrumentation, edge cases, helper tweaks) tracked here.** | Must port | P0 (partial) → P2 (rest) |
| `core/la_manager.py` | +248 | `9362083` | Lightning arrester placement algorithm. New project's vendored copy produces different LA placements than legacy. **Affects parity-test count match — likely cause of any post-P0 LA-count diff.** | Must port | P2 |
| `core/layout_engine.py` | +170 | `9362083`, `9c751b7` | Table placement + integration with water-body / TL exclusion (water-body work in `9c751b7`). Affects table count / position. | Must port | P2 |
| `core/kmz_parser.py` | +266 | `9362083`, `9c751b7` | KMZ parsing; water-body / canal / TL auto-detection (`9c751b7`'s headline feature) + multi-boundary handling. | Must port | P2-P3 |
| `core/energy_calculator.py` | +167 | `9362083` | SAT GTI fix, PVGIS GHI factor 1.2, max-angle UI changes. Significant energy-model upgrade. | Must port | P3 (energy track) |
| `core/solar_transposition.py` | +271 | `9362083` | HSAT GHI→GTI transposition model (replaces broken PVGIS trackingtype=1). Required for SAT energy correctness. **Already exists in vendor as smaller version; this is a heavy rewrite.** | Must port | P3 (energy track) |
| `models/project.py` | +35 | `9362083` (and possibly later) | Data model fields added to support other features in the commit. Need to enumerate what's added once P1 sync skill produces a function-level diff. | Must port | P2 |
| `core/dxf_exporter.py` | +151 | `9362083`, `fc1a5c5` | DXF export. `fc1a5c5` adds conditional LA + cable layers + DC/AC cable output. | Port at export time | P4 (retirement-readiness) |
| `core/pdf_exporter.py` | +122 | `9362083` | PDF export tweaks. | Port at export time | P4 |
| `core/edition.py` | +4 | `9362083` | Edition gating tweaks. **OBSOLETE for new project** — entitlement keys per `CLAUDE.md` §5 replace editions. | Skip / N/A | — |

### §1.2 — Net-new files in baseline (don't exist in vendor)

| Module | Lines | Purpose | Bucket | Target spike |
|---|---|---|---|---|
| `core/satellite_water_detector.py` | +441 | Satellite-imagery water-body detection for boundary refinement. Pairs with the `9c751b7` water-body autodetection feature. | Must port | P2-P3 |
| `core/tracker_layout_engine.py` | +301 | Single-axis-tracker (SAT) layout engine. **New product mode** — distinct from fixed-tilt `layout_engine.py`. | Must port | P3 (tracker track) |

### §1.3 — Modified GUI / non-core files (irrelevant for new app)

The legacy diff also includes `+856` in `gui/main_window.py`, `+387` in `gui/input_panel.py`, `+200` in `gui/startup_dialog.py`, and 8 new GUI modules (`boundary_validation_dialog`, `energy_timeseries_window`, `kmz_help_dialog`, `satellite_detection_dialog`, `water_body_mode_dialog`, etc.). These are PyQt5 work that has no analogue in the new project's Tauri+React UI. **Not in scope for parity** — the new project's UI is being built independently.

Plus:
- `make_git_guide.py` (562 LOC) — Word doc generator for git guide. **Skip.**
- CI workflows / packaging / release scripts (`9bcf2e4`, `16776c6`, `0f1797a`, `99cff9c`, `44d6d06`, etc.). **Skip.**
- `main.py` (+5 lines) — legacy entry point. New project uses Tauri shell. **Skip.**

---

## §2 — Origin commit annotations

Quick reference for which legacy commits introduced which drift:

| Legacy commit | Title | Pvlayout_core impact | Tracked in BACKLOG |
|---|---|---|---|
| `9362083` | feat: SAT energy fix, GHI file format hint, cable/DXF/edition improvements | **Big.** ~+4668/-493 across 21 files. Cable functions, LA, layout, energy, models, two new modules (satellite, transposition), DXF, PDF, edition. | §1.1 (most rows), §1.2 (satellite_water_detector + tracker if at this commit) |
| `9c751b7` | feat: auto-detect water bodies, canals and TL from KMZ and exclude from layout | **Significant.** Modifies kmz_parser + layout_engine; depends on satellite_water_detector. | §1.1 (kmz_parser, layout_engine) |
| `0d9fa6c` | bug fixes | TBD — needs file-level inspection. | §1.1 (likely additional small changes) |
| `fc1a5c5` | feat: conditional LA and cable layers in DXF export | DXF only. | §1.1 (dxf_exporter) |

---

## §3 — Categorization

**Must port for retirement (Prasanta's solar-domain work):**
- `core/string_inverter_manager.py` — P0 (partial), P2 (rest)
- `core/la_manager.py` — P2
- `core/layout_engine.py` — P2
- `core/kmz_parser.py` — P2-P3
- `core/energy_calculator.py` — P3 (energy track)
- `core/solar_transposition.py` — P3 (energy track)
- `core/satellite_water_detector.py` — P2-P3
- `core/tracker_layout_engine.py` — P3 (tracker track)
- `models/project.py` — P2 (data model additions)

**Port at retirement-readiness time (P4):**
- `core/dxf_exporter.py`
- `core/pdf_exporter.py`

**Skip (legacy-only, no new-app analogue):**
- `core/edition.py` — entitlement keys replace editions
- `main.py` — Tauri shell instead
- All `gui/*` files — Tauri+React UI built independently
- `make_git_guide.py` — irrelevant
- CI / release / packaging scripts — irrelevant

---

## §4 — Workflow

1. **P0 (current):** ports the four cable functions only. BACKLOG entries for the rest stay open. After P0 close, parity tests still RED on counts (la_manager etc. drift) — that's expected, documented.
2. **P1 (next):** sync skill `/parity-sync` runs against current baseline HEAD. For each net-new or changed function, generates a draft discovery memo. Cross-references this BACKLOG; entries get marked `memo-drafted` as memos appear.
3. **P2 (close remaining findings):** ports the high-priority "Must port" items. Likely sequence: la_manager → layout_engine + kmz_parser (water-body work) → models/project.py additions. Each item moves out of BACKLOG into spike scope.
4. **P3 (energy / tracker tracks):** energy_calculator + solar_transposition rewrite; tracker_layout_engine. May warrant being its own multi-week sub-sprint.
5. **P4 (retirement-readiness):** export modules wired to FastAPI routes + PDF/DXF/KMZ exports completed.

---

## §5 — Updates

- **2026-04-29 v0.1:** initial draft from P0 Task 2 wider-drift discovery. Drift inventory grounded in `git diff 43f27d9..397aa2a` on legacy. Will be refined / corrected by P1 sync skill output. Two known imprecisions: (a) the "vendor commit" on legacy is approximated as `43f27d9` based on date filter — exact match commit may differ slightly; (b) commit-by-commit attribution in §2 is best-effort and doesn't count merge-commit reshuffling.
