# Finding 003 — `CableRun.route_quality` field

**Date:** 2026-04-29
**Sync run:** new project commit `6fd3c6e` vs legacy `baseline-v1-20260429` (`9362083`)
**Status:** triaged
**For:** Prasanta (solar-domain authority); discussion via Arun's daily comms.

## Classification

**new-project-discovery** — additive data field originating in S11.5 (commit `6a7bf32`, ADR-0007), not in legacy. Default action: discovery memo for Prasanta's evaluation; tied to Pattern V follow-up (Finding 001).

## Summary

The new project's `CableRun` dataclass has an extra field `route_quality: str` (default `"ok"`, range `{"ok", "best_effort", "boundary_violation"}`) that tags each cable with the quality of its routed path. Legacy `CableRun` doesn't have this field.

The tagging is populated by `_route_ac_cable` based on which pattern resolved the route:
- `"ok"` — patterns A, A2, A3, A4, B, C, D, E, V succeeded with all-inside-polygon path
- `"best_effort"` — Pattern F succeeded but with all segments inside polygon (rare; typically Pattern V handles these now)
- `"boundary_violation"` — Pattern F returned a path with at least one segment outside the polygon

## Why it was added

To surface the 15 boundary-violation cables on `phaseboundary2` (which Pattern V resolves now — see Finding 001) so EPC reviewers can see at a glance whether any cable routes outside the plant fence. Even with Pattern V, the tag remains useful as a regression guard: if Pattern V ever fails to find an inside path, those cables fall through to Pattern F and get tagged `boundary_violation`.

## Field plumbing

- `pvlayout_core/models/project.py:164` — field on `CableRun` dataclass.
- `pvlayout_core/core/string_inverter_manager.py` — `_last_route_quality` module-level transport variable (line 68); reset to `"ok"` at function entry (line 668); set by Pattern F at lines 856 (best-path branch: `"boundary_violation"` if any segment outside, else `"best_effort"`) and 865 (fallthrough: `"boundary_violation"`); read by `place_string_inverters` after each `_route_ac_cable` call at lines 1026 and 1089 to populate the `CableRun` it constructs.
- `pvlayout_engine/schemas.py:148` — Pydantic mirror of the field (default `"ok"`).
- `pvlayout_engine/adapters.py:273` — `getattr` with default `"ok"` for backwards-compatible deserialization (function `_cable_from_core` starts at line 265).

## Cost / impact

- **Storage:** ~5 bytes per CableRun (a short string).
- **Wire:** included in JSON responses; not used by frontend yet (`apps/desktop/src/project/layoutToGeoJson.ts:104-133` doesn't copy it into GeoJSON properties — that's a P3 deliverable).
- **Tests:** existing tests pass with default `"ok"`; no breakage. Future P3 visual rendering will paint `boundary_violation` cables distinctly.

## Reproduction

After running cable calc, inspect any boundary-violation route's tag:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.string_inverter_manager import place_string_inverters
from pvlayout_core.models.project import LayoutParameters, ModuleSpec, TableConfig, DesignMode

p = LayoutParameters(module=ModuleSpec(545, 2.279, 1.134), table=TableConfig(2, 28))
p.enable_cable_calc = True
p.design_mode = DesignMode.STRING_INVERTER
p.max_strings_per_inverter = 30

parsed = parse_kmz('tests/golden/kmz/phaseboundary2.kmz')
results = run_layout_multi(boundaries=parsed.boundaries, params=p, centroid_lat=parsed.centroid_lat, centroid_lon=parsed.centroid_lon)
for r in results:
    if r.usable_polygon is None: continue
    place_lightning_arresters(r, p)
    place_string_inverters(r, p)

from collections import Counter
c = Counter(c.route_quality for c in r.ac_cable_runs)
print('AC route_quality:', dict(c))
"
```

Expected output: `AC route_quality: {'ok': N}` (with Pattern V handling all the boundary cases). If you see `boundary_violation` in the count, that's Pattern V failing — flag immediately.

## Proposed action

Discovery memo for Prasanta's evaluation.

Outcomes track Finding 001 (Pattern V) outcomes:

1. **If Pattern V is adopted in legacy** → also port `route_quality` field. Pure addition; backwards-compatible.
2. **If Pattern V is reverted in new project** → keep `route_quality` field as the documentation of the 15-cable issue. Frontend still surfaces them in P3 (rendered as warning-coloured dashed lines).
3. **If Pattern V is accepted in new project only** → keep `route_quality` field; legacy doesn't need it (its boundary cases just stay as best-effort routes without explicit tagging).

## Resolution

(To be filled by Arun after Prasanta's input on Finding 001.)
