# End-of-port T3 review — for Prasanta

**Date:** 2026-04-29
**Author:** Arun (consolidation) — synthesizing 5 T3 memos from the parity sweep
**Status:** awaiting Prasanta's review

## Background

Parity sweep just closed. All 12 rows in `docs/PLAN.md` are `done` —
the new app is caught up to legacy `PVlayout_Advance`
baseline-v1-20260429 across models, cable bundling, KMZ parsing +
water/canal/TL autodetection, layout engine, solar transposition (with
HSAT), energy calculator (with SAT GTI fix), single-axis-tracker layout
mode, and the three exporters.

Per the 2026-04-29 agreement you don't gate individual rows. The five
T3 rows (#4, #5, #7, #8, #9) ported verbatim and parked their
solar-domain decision points in discovery memos; this document
consolidates every such question into one pass.

Nothing here proposes a change. Each item is a hardcoded constant we
ported as-is, a workaround whose empirical basis was unclear from the
code, or a code-organization smell.

## How to review this document

Each section groups related decisions and cites the source memo +
section letter (e.g., "see #003 §1") for full context. Please answer
inline in the quick-answer table at the end — I'll turn answers into
follow-up rows in `docs/PLAN.md` where they need code changes, or
close them out as "keep verbatim" notes otherwise.

## Decision groups

### 1. Solar-domain hardcoded constants

Physical / engineering constants ported as-is from legacy. Each is
plausible as a default but worth your call on whether it should be
configurable.

- **Albedo = 0.20.** Hardcoded across the three new HSAT functions
  (`ghi_to_gti_hsat`, `annual_gti_from_ghi_hsat`,
  `generate_synthetic_hourly_gti`). It's a kwarg but no caller passes a
  non-default. `LayoutParameters.ground_albedo` already exists; wiring
  it through `energy_calculator.py` is a small follow-up. Indian sites
  with bright soil / sand can warrant 0.25–0.30. (See #003 §1.)
- **Synthetic-generator diffuse fraction `fd = 0.35`.** Used inside
  `generate_synthetic_hourly_gti` for the raw hourly profile. Per-month
  scaling cancels absolute values, but the beam-vs-diffuse split
  influences the SAT AOI calculation (Rb operates on the beam
  component). Could matter for overcast-region SAT plants. (See #003 §2,
  #004 §3.)
- **HSAT max rotation = 55°.** Default for `max_angle_deg`. Common
  spec; some manufacturers offer 60° or 70°. Already a parameter on
  the function and on `EnergyParameters`; flagging only. (See #003 §3.)
- **Rb clamp = 5.0.** `cos_aoi / cos_theta_z` capped at 5× to prevent
  sunrise/sunset blow-up. Standard practice; not configurable. (See
  #003 §5.)
- **PVGIS GHI correction `_GHI_FACTOR = 1.2`.** Hardcoded in
  `_fetch_pvgis` and `_fetch_pvgis_sat`. Legacy comment claims "PVGIS
  underestimates GHI by 20%". Empirical basis unclear from the code;
  likely calibrated on Indian sites. (See #004 §1.)
- **HSAT E-W pitch floor `+ 0.5 m`.** In `run_layout_tracker`,
  `pitch_ew = max(trk_w + 0.5, params.tracker_pitch_ew_m)`. Magnitude
  unjustified in code. (See #005 §b.)

### 2. PVGIS / data-source workarounds

Row #8 inherited workarounds from legacy that may deserve a fresh look
— PVGIS may have moved on since legacy was written.

- **`_fetch_pvgis_sat` workaround.** PVGIS PVcalc with `trackingtype=1`
  returns `H(i)_y` identical to fixed-horizontal GHI (apparent v5.2
  bug — tracking gain is zero in the API response). Legacy works
  around this by fetching monthly horizontal GHI, synthesizing an
  8760-hour clear-sky cosine-zenith profile scaled to monthly totals,
  then running `ghi_to_gti_hsat` hour-by-hour. Worth re-checking
  whether PVGIS v5.3 fixed this or whether NASA POWER offers a
  tracker-aware response. (See #004 §2.)
- **Empirical basis of `_GHI_FACTOR = 1.2`.** Flagging this separately
  from the configurability question in §1. The 1.2× is the single
  highest-impact constant in the entire energy yield — applied to GHI
  and GTI alike, it's effectively a 20% scaling factor on every kWh
  number in the output. Where did the calibration come from? On-site
  measurements vs PVGIS for a specific Indian site? An average across
  multiple sites? A rounding of a different empirical value? You may
  have prior-art knowledge from the original `PVlayout_Advance` work
  that didn't make it into the legacy code's comments. (See #004 §1.)
- **Synthetic 8760-hour profile fidelity for SAT.** The synthesizer
  uses pure cosine-zenith (no diffuse modeling). Per-month scaling
  preserves monthly GHI totals, but `ghi_to_gti_hsat`'s AOI math
  depends on the beam-vs-diffuse split. Could diverge from real PVGIS
  hourly data in overcast regions. Same root concern as `fd = 0.35`
  above. (See #004 §3, #003 §2.)
- **Reference year `YEAR = 2023` (non-leap) hardcoded** inside the
  synthesizer. Sites whose actual hourly data is leap-year-indexed
  will be off by one day. (See #004 §4.)

### 3. SAT-mode layout & cabling

Specific to the new SAT layout engine ported in row #9.

- **Portrait/landscape docstring contradiction.** Two comment blocks
  inside legacy `run_layout_tracker` contradict each other (lines
  193–197 vs 203–205). The code matches the second comment
  (`mod_ew = module.length if portrait else module.width`); the first
  is stale. Trivial doc-only fix. (See #005 §a.)
- **`+ 0.5 m` E-W pitch floor magnitude.** See §1; flagged again here
  because the call is a SAT-layout call, not pure physics.
- **`LayoutResult.tilt_angle_deg` field overload.** Documented as
  "static panel tilt from horizontal (degrees)" — fine for FT. The SAT
  engine writes `params.tracker_max_angle_deg` here. Resolutions: (i)
  add a dedicated `LayoutResult.tracker_max_angle_deg` field + update
  wire schema, or (ii) document the overload. Affects exporters and UI
  inspectors. (See #005 §c.)
- **`params.table = TableConfig(...)` side-effect.** End-of-function
  mutation repurposes the FT `LayoutParameters.table` field so the
  existing FT-shaped `place_string_inverters` can compute
  strings-per-tracker-unit. Input-mutated-as-output anti-pattern,
  ported verbatim. Cleanup options: return alongside `LayoutResult`,
  or expose as `LayoutResult.effective_table_config`. (See #005 §d.)
- **No real-customer SAT plant validation.** Cross-cutting concern not
  raised in the individual memos. All five SAT-related parity tests
  used synthetic inputs (synthetic 8760-hour GHI for the transposition
  + energy tests; FT KMZ fixtures `phaseboundary2.kmz` /
  `complex-plant-layout.kmz` run through the SAT engine). Bit-exact
  vs. legacy ≠ validated against a real customer SAT plant. If any
  real SAT plants exist in the legacy customer set or pilot projects,
  adding one as a regression fixture post-parity would lock in a
  real-world reference for the SAT pathway. (Touches rows #7, #8, #9.)

### 4. Satellite water detection heuristics (row #5)

`_water_mask` was tuned for Deccan-plateau / India semi-arid imagery.
Four pixel-classification rules fire in OR (absolute-dark,
locally-dark, blue-dominant, turbid grey-brown) with hand-picked
thresholds, followed by NDVI-proxy and brightness ceilings, then
morphological clean-up.

- **Tile-source fallback.** Two Esri endpoints. If both fail, the
  composite falls back to grey (still classified, rarely useful).
  Add a third source (Mapbox / Google)? (See #002 §1.)
- **Classifier tuning beyond India.** Behaviour on Northern European
  bog / Saharan oasis / coastal mangrove plants is unverified. (See
  #002 §2.)
- **`_MIN_AREA_M2 = 150` threshold.** Discards polygons smaller than
  ~12.2 m × 12.2 m. May miss small drinking-water tanks. (See #002 §3.)
- **Two-zoom union (Z + Z−1).** Z catches small ponds, Z−1 catches
  large reservoirs that smear at higher zoom. Worth verifying the
  tradeoff on a varied-area test set. (See #002 §4.)
- **No tile caching.** Every detection re-fetches. Worth a local LRU
  cache (~10–50 MB) in a follow-up? (See #002 §5.)
- **SSL bypass on Esri tile fetch.** Disabled per legacy comment about
  silent Windows cert failures. Read-only, low-risk. Flagging only.

### 5. KMZ-parser autodetection heuristics (row #4)

Verbatim port. Four keyword sets drive classification: water (10),
canal/stream (11), transmission line (17), hard obstacle (22).

- **Indian-canal terminology coverage.** `nala`, `nallah`, `nullah` are
  ported verbatim; should the set expand to include "naala", "nalah",
  etc.? (See #001 §3.)
- **Sub-EHV voltages missing from `_TL_KEYWORDS`.** Set covers 132 kV,
  220 kV, 400 kV. Indian substation-feed lines also use 33 kV / 66 kV.
  Add? (See #001 §4.)
- **Short tokens `tl` and `line`.** 2- and 4-character substrings
  match across longer words. False-positive risk. Tightening to
  word-boundary regex would break legacy parity. (See #001 §5.)
- **`tower` in two sets** (`_TL_KEYWORDS` and `_OBSTACLE_KEYWORDS`).
  Eval order classifies "Tower" as TL, not hard obstacle. Intentional?
  (See #001 §2.)
- **Dead `_TL_KEYWORDS` at this baseline.** Defined but unused by the
  parser at row #4's source commit; likely consumed downstream.
  Preserves bit-exact parity but worth confirming intent. (See #001 §1.)

### 6. Code-organization / refactor candidates (post-parity)

Lower-stakes housekeeping. None need solar judgment — looking for one
yes/no on whether to spawn a cleanup row.

- **`_make_valid_poly` duplicated** in `layout_engine.py` and
  `tracker_layout_engine.py`. Consolidate to
  `pvlayout_core.utils.geo_utils`. (See #005 §e.)
- **`TL_SETBACK_M = 15.0` duplicated** module-level constant in both
  layout engines. Currently consistent. (See #005 §f.)
- **HTTP client choice unification.** Row #5 uses stdlib
  `urllib.request`; row #8 uses `requests` (added as sidecar dep
  mid-row). Unify one direction. (See #004 §6.)
- **Defensive `getattr(b, "is_water", False)`** wrapping in the
  satellite water detector defends against a dormant legacy bug.
  Flagging only. (See #002.)
- **`DesignType` import in `layout_engine.py`** — in-row scope
  adjustment for row #9, one-line additive change. Documenting only.
  (See #005 §g.)

## Decision points — quick-answer format

For each item where a call is needed, please mark a choice. Lower-stakes
refactors collapsed into a single row at the bottom.

| # | Question | Options |
|---|---|---|
| 1.a | Should albedo (default 0.20) be wired through `LayoutParameters.ground_albedo`? | yes (wire through) / no (keep hardcoded) / regional default (per-market) |
| 1.b | Synthetic-generator `fd = 0.35` — acceptable, or replace with per-month diffuse model? | acceptable / replace with per-month / replace globally |
| 1.c | HSAT `max_angle_deg = 55°` default — keep, or change? | keep / change to ___ |
| 1.d | PVGIS `_GHI_FACTOR = 1.2` — universal, regional, or per-project configurable? | universal / regional default / configurable on `EnergyParameters` |
| 1.e | HSAT E-W pitch floor `+ 0.5 m` — keep, change magnitude, or make configurable? | keep / change to ___ / configurable on `LayoutParameters` |
| 2.a | Re-test PVGIS PVcalc `trackingtype=1` against current API — replace `_fetch_pvgis_sat` workaround if fixed? | yes — spawn investigation row / no — keep workaround |
| 2.b | Synthesizer `YEAR = 2023` hardcoded — keep, or use the project's actual year? | keep / use actual year |
| 2.c | `_GHI_FACTOR = 1.2` empirical basis — do you have prior art on where the calibration came from? | yes (note source inline) / no (treat as black-box default) |
| 3.a | `LayoutResult.tilt_angle_deg` overload — split into FT/SAT fields, or document the overload? | split (new field + wire schema) / document only |
| 3.b | `params.table` mutation in `run_layout_tracker` — keep, or restructure to pull-from-result? | keep / restructure |
| 3.c | Real-customer SAT plant validation — do any SAT customer plants / pilots exist that should be added as parity-test fixtures? | yes (note plant name(s)) / no — synthetic SAT coverage is enough |
| 4.a | Add a third satellite tile source (Mapbox / Google) as fallback? | yes / no — Esri × 2 is enough |
| 4.b | `_MIN_AREA_M2 = 150` water threshold — keep, lower, or configurable? | keep / lower to ___ / configurable |
| 4.c | Add a local LRU tile cache for the water detector? | yes — spawn row / no |
| 5.a | Expand `_CANAL_KEYWORDS` (naala, nalah, etc.) and add 33 kV / 66 kV to `_TL_KEYWORDS`? | yes — spawn row / no |
| 5.b | Tighten short tokens (`tl`, `line`) to word-boundary regex despite parity break? | yes / no |
| 6 | Approve a single post-parity cleanup row covering: dedup `_make_valid_poly` and `TL_SETBACK_M`, unify HTTP client, fix portrait/landscape stale comment? | yes — single cleanup row / no — leave / split into items |

## Source memos

| Memo | Row | Topic |
|---|---|---|
| `2026-04-29-001-kmz-autodetect-heuristics.md` | #4 | KMZ parser + water/canal/TL autodetection |
| `2026-04-29-002-satellite-water-detector-port.md` | #5 | Satellite water-body detector |
| `2026-04-29-003-solar-transposition-port.md` | #7 | HSAT GHI→GTI transposition |
| `2026-04-29-004-energy-calculator-port.md` | #8 | Energy calculator + SAT GTI fix |
| `2026-04-29-005-tracker-layout-engine-port.md` | #9 | Single-axis-tracker layout engine |

All five memos live at `docs/parity/findings/`. Refinements you sign
off on become follow-up rows in `docs/PLAN.md` raised after this
review.
