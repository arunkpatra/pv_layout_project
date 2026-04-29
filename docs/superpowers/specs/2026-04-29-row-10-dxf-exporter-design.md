# Row #10 Spec — DXF exporter (LA + cable layers)

**PLAN.md row:** [docs/PLAN.md](../../PLAN.md) row #10 (T1).
**Source:** legacy `core/dxf_exporter.py` @ `baseline-v1-20260429` commits `9362083` + `fc1a5c5`.
**Acceptance (PLAN.md):** Exporter wired to FastAPI route; parity DXF structure match.

---

## 1. Goal

Port the legacy DXF exporter's `include_la` / `include_cables` toggle support into the new app's `dxf_exporter.py`, add a new sidecar `POST /export-dxf` route to wire the exporter into the HTTP API, and verify that legacy and new produce structurally-equivalent DXF files (same layers, same per-layer entity counts, per-entity geometry within 1e-6 m).

This is the first **exporter** row in the parity sweep. It is T1 (port + sidecar pytest + commit). No discovery memo unless the diff itself surfaces a solar-domain question — and it doesn't (the legacy diff is a UX-toggle wiring change, not an algorithm decision).

---

## 2. Port surface

### 2.1 EDIT `pvlayout_core/core/dxf_exporter.py` (~+30 lines)

Apply the legacy diff verbatim, **keeping the new app's `pvlayout_core.X` import prefix** (legacy uses bare `models.X`/`utils.X`; the new app's existing imports are correct, do not regress).

Three changes:

**(a) Signature.** Add two kwargs to `write_layout_dxf`:

```python
def write_layout_dxf(
    results: List[LayoutResult],
    params: LayoutParameters,
    output_path: str,
    include_la: bool = True,
    include_cables: bool = True,
) -> None:
```

Update docstring to describe both flags (verbatim from legacy lines 50–66).

Also update the file header comment block (lines 2–13) to reflect the new layer comments:

```
  DC_CABLES   – DC string cable routes (orange)  [only when include_cables=True]
  AC_CABLES   – AC feeder cable routes (magenta) [only when include_cables=True]
  LA          – lightning arrester symbols        [only when include_la=True]
```

**(b) Layer creation.** Drop `DC_CABLES`/`AC_CABLES`/`LA` from the unconditional `layer_defs` tuple list. Move `ANNOTATIONS` to land before the conditional layers. Append conditionals after the loop:

```python
layer_defs = [
    ("BOUNDARY",     COL_YELLOW),
    ("OBSTACLES",    COL_RED),
    ("TABLES",       COL_BLUE),
    ("ICR",          COL_CYAN),
    ("OBSTRUCTIONS", COL_GREEN),
    ("INVERTERS",    COL_LIME),
    ("ANNOTATIONS",  COL_WHITE),
]
if include_cables:
    layer_defs.append(("DC_CABLES", COL_ORANGE))
    layer_defs.append(("AC_CABLES", COL_MAGENTA))
if include_la:
    layer_defs.append(("LA", COL_MAROON))
```

**(c) Drawing block.** Replace the current DC/AC cable + LA drawing code with the legacy structure. DC + AC cables become simple per-cable `add_lwpolyline` calls (current new app's AC edge-deduplication is removed); LA gated by `include_la`:

```python
# ---- Cable routes (only when cable display toggle is ON) -------------
if include_cables:
    for cable in result.dc_cable_runs:
        pts = cable.route_utm if cable.route_utm else [cable.start_utm, cable.end_utm]
        pts2d = _pts2d(pts)
        if len(pts2d) >= 2:
            msp.add_lwpolyline(
                pts2d, close=False,
                dxfattribs={"layer": "DC_CABLES", "lineweight": 13},
            )
    for cable in result.ac_cable_runs:
        pts = cable.route_utm if cable.route_utm else [cable.start_utm, cable.end_utm]
        pts2d = _pts2d(pts)
        if len(pts2d) >= 2:
            msp.add_lwpolyline(
                pts2d, close=False,
                dxfattribs={"layer": "AC_CABLES", "lineweight": 25},
            )

# ---- Lightning Arresters (only when LA toggle is ON) ------------------
if include_la:
    import math
    for la in result.placed_las:
        la_pts = [
            (la.x,             la.y),
            (la.x + la.width,  la.y),
            (la.x + la.width,  la.y + la.height),
            (la.x,             la.y + la.height),
        ]
        msp.add_lwpolyline(la_pts, close=True,
                           dxfattribs={"layer": "LA", "lineweight": 35})
        la_cx = la.x + la.width / 2
        la_cy = la.y + la.height / 2
        msp.add_circle(
            (la_cx, la_cy), la.radius,
            dxfattribs={"layer": "LA"},
        )
        msp.add_text(
            f"LA-{la.index}",
            dxfattribs={"layer": "ANNOTATIONS", "height": 5},
        ).set_placement(
            (la_cx, la_cy),
            align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
        )
```

**Behavior delta worth noting (verbatim port).** The new app's current `dxf_exporter.py` does AC-cable edge-deduplication (per-segment `add_line` with a `seen` set). Legacy replaces it with simple per-cable polylines — shared AC corridors will overdraw as overlapping polylines. This is the intended legacy behavior. If a future row wants dedup back, it's a Prasanta-driven refinement.

### 2.2 CREATE `pvlayout_engine/pvlayout_engine/routes/dxf.py`

```python
"""POST /export-dxf — export multi-result layout to AutoCAD DXF.

Row #10 of docs/PLAN.md. Wraps pvlayout_core.core.dxf_exporter.write_layout_dxf
in a FastAPI route. Per ADR-0005 + session.py:105, exports are ungated.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response

from pvlayout_engine.adapters import params_to_core, result_to_core
from pvlayout_engine.schemas import ExportDxfRequest


router = APIRouter(tags=["export"])


@router.post(
    "/export-dxf",
    summary="Export multi-result layout to a DXF file",
    response_class=Response,
    responses={200: {"content": {"application/dxf": {}}}},
)
def export_dxf(request: ExportDxfRequest) -> Response:
    from pvlayout_core.core.dxf_exporter import write_layout_dxf

    if not request.results:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="results must be non-empty",
        )

    core_results = [result_to_core(r) for r in request.results]
    core_params = params_to_core(request.params)

    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        write_layout_dxf(
            core_results,
            core_params,
            str(tmp_path),
            include_la=request.include_la,
            include_cables=request.include_cables,
        )
        data = tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)

    return Response(
        content=data,
        media_type="application/dxf",
        headers={"Content-Disposition": 'attachment; filename="layout.dxf"'},
    )
```

### 2.3 EDIT `pvlayout_engine/pvlayout_engine/schemas.py`

Add the request schema (placement: near the other request schemas, after `LayoutResponse` / similar):

```python
class ExportDxfRequest(_Model):
    """POST /export-dxf request body."""
    results: list[LayoutResult]
    params: LayoutParameters
    include_la: bool = True
    include_cables: bool = True
```

### 2.4 EDIT `pvlayout_engine/pvlayout_engine/server.py`

Register `dxf_router` under the `authed` router (mirrors `water_router`'s registration on line ~111):

```python
from pvlayout_engine.routes.dxf import router as dxf_router
...
authed.include_router(dxf_router)
```

### 2.5 No other touch-points

- `LayoutResult` Pydantic schema (`schemas.py:250`): unchanged. `placed_las`, `dc_cable_runs`, `ac_cable_runs` already serialize correctly through wire.
- `result_to_core` adapter (`adapters.py:324`): already round-trips wire → core for `/refresh-inverters`/`/add-road` — reusable.
- `params_to_core` adapter (`adapters.py:98`): already round-trips request `LayoutParameters`.
- No data-model changes. No wire-schema passthrough work this row.
- No new dependencies (`ezdxf>=1.0` already in `pyproject.toml:23`).

---

## 3. Tests

**File:** `python/pvlayout_engine/tests/integration/test_export_dxf.py` (new, ~250 lines).

Pattern: FastAPI `TestClient` for endpoint tests + per-file `TEST_TOKEN` + `auth()` helper. Sys.path bootstrap fixture for the structure-parity test (mirrors row #5/#9).

### 3.1 Module-level fixtures

**`_build_layout_request()`** — produce a known `ExportDxfRequest` JSON body:
- Run `parse_kmz(tests/golden/kmz/phaseboundary2.kmz)` once → `BoundaryInfo[]`.
- Call `run_layout_multi(boundaries, default LayoutParameters(), centroid_lat, centroid_lon)` → `List[core.LayoutResult]`.
- Convert via `result_from_core` → wire `LayoutResult[]`.
- Wrap in `ExportDxfRequest(results=..., params=LayoutParameters(), include_la=True, include_cables=True)` and dump to JSON-compatible dict.

This gives us a real-world layout output (placed tables, ICRs, no cables/LA by default since `include_cables` in `LayoutParameters` defaults to `False` — verify; if cables don't get computed by `run_layout_multi` by default, manually build a cable run + LA into the result for the toggle tests).

**Session bootstrap.** Module-scoped `TestClient` fixture that calls `/session/init` with a stub entitlements payload (mirrors `test_export_dxf`'s sibling `test_water` integration-test fixture pattern). `auth()` helper returns `{"X-Session-Token": TEST_TOKEN}`.

### 3.2 Test cases

**`test_export_dxf_smoke`** — `POST /export-dxf` with the full fixture returns 200, content-type `application/dxf`, and content-disposition includes `filename="layout.dxf"`. Parse response bytes via `ezdxf.read(io.BytesIO(content))`. Assert:
- `doc.modelspace()` is accessible.
- Layer set ≥ `{BOUNDARY, OBSTACLES, TABLES, ICR, OBSTRUCTIONS, INVERTERS, ANNOTATIONS, DC_CABLES, AC_CABLES, LA}`.
- `len(list(doc.modelspace())) > 0` (modelspace non-empty).

**`test_export_dxf_excludes_la_when_toggled_off`** — `POST /export-dxf` with `include_la=False`. Parse DXF: assert `"LA"` not in layer names; assert no entity has `dxfattribs["layer"] == "LA"`.

**`test_export_dxf_excludes_cables_when_toggled_off`** — `POST /export-dxf` with `include_cables=False`. Parse DXF: assert `"DC_CABLES"` and `"AC_CABLES"` not in layer names; assert no entity references those layers.

**`test_export_dxf_empty_results_returns_422`** — `POST /export-dxf` with `results=[]` returns 422 with `"results must be non-empty"` in `detail`.

**`test_export_dxf_structure_parity_with_legacy(legacy_dxf)`** — sys.path bootstrap fixture. Build the same core `LayoutResult` (constructed via `result_to_core` from the test fixture). Call legacy `core.dxf_exporter.write_layout_dxf` and new `pvlayout_core.core.dxf_exporter.write_layout_dxf` to two `tempfile`s. Parse both via `ezdxf.readfile`. Assert:

- **Layer set:** `set(layers_legacy) == set(layers_new)`.
- **Per-layer entity-type counts.** Group entities by `(layer_name, entity.dxftype())` — typical types: `LWPOLYLINE`, `CIRCLE`, `TEXT`, `MTEXT`. Assert the count map matches per `(layer, type)` key.
- **Per-entity geometry within 1e-6 m:**
  - For each `(layer, type)` group, sort entities by a stable key — `LWPOLYLINE`: first vertex `(x, y)`; `CIRCLE`: center `(x, y)`; `TEXT`: insert `(x, y)`. This makes the comparison order-stable across `ezdxf` iteration order quirks.
  - `LWPOLYLINE`: equal point count; per-vertex `math.isclose(x, abs_tol=1e-6)` and same for `y`; same `closed` flag; same `lineweight` if both define it.
  - `CIRCLE`: `math.isclose` on `center.x`, `center.y`, `radius`.
  - `TEXT`: equal `text` string; `math.isclose` on `insert.x`, `insert.y`; same `height`.

The structure-parity test runs with `include_la=True, include_cables=True` (full layer set). Toggle behavior is covered by the unit tests above; the parity test verifies the full default set matches.

### 3.3 Skip-if-legacy-missing

If `/Users/arunkpatra/codebase/PVlayout_Advance` doesn't exist, `pytest.skip(...)` — same pattern as rows #4–#9.

### 3.4 Module purge

Sys.path bootstrap fixture purges `core.*`, `models.*`, `utils.*` from `sys.modules` before legacy import and again on teardown — same pattern as rows #6/#7/#8/#9.

---

## 4. Acceptance criteria

Mapped to PLAN.md row #10's "Acceptance" + tier ceremony:

1. `uv run pytest tests/ -q` from `python/pvlayout_engine` is **green**. Target: prior `101 passed → ~106 passed`, **6 skipped**, **0 failed** (5 new integration tests).
2. `POST /export-dxf` is registered (visible in `/openapi.json`) and reachable; smoke test confirms valid DXF response with `application/dxf` content-type.
3. `test_export_dxf_structure_parity_with_legacy` asserts layer set + per-layer entity-type counts + per-entity geometry within 1e-6 m via sys.path bootstrap.
4. PLAN.md row #10 `Status` flipped to `done`; status header bumped `9 / 12 done` → `10 / 12 done`.
5. Atomic commit per row: `parity: row #10 — DXF exporter (LA + cable layers)`. Intra-row `wip:` checkpoints; squash before close.

---

## 5. Out of scope (deferred)

- **Frontend export-DXF button wiring.** Post-parity per CLAUDE.md §2.
- **Edition / feature gating.** Per `session.py:105` and ADR-0005, exports are ungated. No `require_feature` dependency on the route.
- **Discovery memo.** T1 doesn't require one. The legacy diff is a UX-toggle wiring change, no solar-domain decisions worth recording.
- **PDF exporter (row #11), KMZ exporter (row #12).** Sibling rows, not blocked by this one.
- **Stale `session.py:7` comment** that lists `/export/dxf` as feature-gated. The actual policy at line 105 says exports are ungated. Trivial doc-only fix; not scoped here unless it turns out to be a one-character edit during impl.
- **Reverting to AC-edge-dedup.** Verbatim port intentionally drops the deduplication. Future Prasanta-driven refinement if visual overdraw becomes an issue.

---

## 6. Pre-implementation operational notes

- Verify `params_to_core` and `result_to_core` are still the adapter names at impl time. Spec section 2.2 uses these — confirmed against `adapters.py` lines 98 and 324.
- No `pyproject.toml` change → no `uv sync --extra dev` needed.
- Legacy reference repo at `baseline-v1-20260429` must be checked out for the structure-parity test; otherwise self-skip.
- The `_build_layout_request` fixture should run `parse_kmz` + `run_layout_multi` once at module scope (not per-test) to keep test runtime fast (~5-10 s overhead per layout build).
- If `run_layout_multi` with default `LayoutParameters` produces no cables (likely — `include_cables` defaults to `False` on the params), the toggle tests need to manually inject a cable-run + a placed-LA into the wire fixture so the layer-presence assertions are non-trivial. Confirm during impl.
