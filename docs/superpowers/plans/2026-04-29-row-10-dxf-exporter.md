# Row #10 Implementation Plan — DXF exporter (LA + cable layers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port legacy `dxf_exporter.py`'s `include_la` / `include_cables` toggle support into the new app, add a `POST /export-dxf` sidecar route, and verify legacy ↔ new produce structurally-equivalent DXF files (same layers, same per-layer entity-type counts, per-entity geometry within 1e-6 m).

**Architecture:** Surgical edit to `pvlayout_core/core/dxf_exporter.py` (apply legacy diff verbatim, keep new-app's `pvlayout_core.X` import prefix) + new FastAPI route at `pvlayout_engine/routes/dxf.py` that takes wire `LayoutResult[]`, runs them through `result_to_core`, calls `write_layout_dxf` to a tempfile, and returns `application/dxf` binary. T1 ceremony — no discovery memo. Five integration tests cover: smoke, two toggle behaviors, empty-input 422, and structure parity against legacy via sys.path bootstrap.

**Tech Stack:** Python 3.13, FastAPI, ezdxf 1.x, pytest, sys.path bootstrap fixture pattern. uv-managed venv.

**Spec:** [docs/superpowers/specs/2026-04-29-row-10-dxf-exporter-design.md](../specs/2026-04-29-row-10-dxf-exporter-design.md)

---

## File map

- **Modify:** `python/pvlayout_engine/pvlayout_core/core/dxf_exporter.py` — kwargs + conditional layer creation + restructured DC/AC/LA drawing.
- **Modify:** `python/pvlayout_engine/pvlayout_engine/schemas.py` — add `ExportDxfRequest` after `RemoveRoadRequest` (line 482).
- **Create:** `python/pvlayout_engine/pvlayout_engine/routes/dxf.py` — `POST /export-dxf` endpoint.
- **Modify:** `python/pvlayout_engine/pvlayout_engine/server.py` — import `dxf_router`, register under `authed`.
- **Create:** `python/pvlayout_engine/tests/integration/test_export_dxf.py` — 5 tests.
- **Modify:** `docs/PLAN.md` — row #10 status `todo` → `done`; header `9 / 12 done` → `10 / 12 done`.

---

## Pre-flight (one-time)

- [ ] **Step 0.1: Verify legacy repo state**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git rev-parse baseline-v1-20260429
```

Expected: `397aa2ab460d8f773376f51b393407e5be67dca0` — must resolve, not error.

- [ ] **Step 0.2: Verify clean working tree on main**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git status -s && git rev-parse --abbrev-ref HEAD
```

Expected: empty status output, `main` branch.

- [ ] **Step 0.3: Verify baseline pytest is green**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `101 passed, 6 skipped, 0 failed` (post-row-#9 baseline).

- [ ] **Step 0.4: Verify required KMZ fixture exists**

```bash
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz
```

Expected: file listed (no "No such file" error).

---

## Task 1: Edit `dxf_exporter.py` — apply legacy diff

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/dxf_exporter.py`

Three logical edits in one file. Keep new-app's `pvlayout_core.X` import prefix; do not regress to legacy's bare `models.X`/`utils.X`.

- [ ] **Step 1.1: Update file header docstring (lines 2–13)**

Open `python/pvlayout_engine/pvlayout_core/core/dxf_exporter.py`. Replace the existing header docstring with:

```python
"""
DXF exporter: writes all layout results to a single DXF file.

Layers:
  BOUNDARY     – plant boundary polygons (yellow)
  OBSTACLES    – exclusion zones (red)
  TABLES       – panel tables (blue)
  ICR          – inverter control rooms (cyan)
  OBSTRUCTIONS – user-drawn obstructions (green)
  INVERTERS    – string inverters (lime)
  DC_CABLES    – DC string cable routes (orange)  [only when include_cables=True]
  AC_CABLES    – AC feeder cable routes (magenta) [only when include_cables=True]
  LA           – lightning arrester symbols        [only when include_la=True]
  ANNOTATIONS  – labels and text

All coordinates are in UTM metres (same projection used by the layout engine).
The boundary polygon is converted from WGS84 to UTM before drawing.
"""
```

- [ ] **Step 1.2: Update `write_layout_dxf` signature + docstring**

Locate the current `def write_layout_dxf(...)` definition (around line 45). Replace the signature and docstring (everything from `def write_layout_dxf` through the closing `"""` of the docstring) with:

```python
def write_layout_dxf(
    results: List[LayoutResult],
    params: LayoutParameters,
    output_path: str,
    include_la: bool = True,
    include_cables: bool = True,
) -> None:
    """
    Write a DXF file containing all layout elements.

    Parameters
    ----------
    results         : list of LayoutResult (one per boundary)
    params          : LayoutParameters
    output_path     : file path for the output .dxf file
    include_la      : if True, Lightning Arrester symbols and protection
                      circles are written to the LA layer.  If False (LA
                      toggle is OFF in the UI), the LA layer is not created
                      and no LA elements are exported.
    include_cables  : if True, DC and AC cable routes are written to
                      DC_CABLES / AC_CABLES layers.  If False (cable display
                      toggle is OFF in the UI), those layers are not created
                      and no cable polylines are exported.
    """
```

The body immediately after the docstring (the `if isinstance(results, LayoutResult): results = [results]` line and the `doc = ezdxf.new(...)` block) is unchanged.

- [ ] **Step 1.3: Replace the layer creation block**

Locate the `# ---- Create layers` comment block (around line 65). The current block creates all layers unconditionally including `DC_CABLES`, `AC_CABLES`, `LA`. Replace the entire `layer_defs = [...]` list and the immediately-following `for lname, lcol in layer_defs:` loop with:

```python
    # ---- Create layers -------------------------------------------------------
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
    for lname, lcol in layer_defs:
        doc.layers.new(lname, dxfattribs={"color": lcol})
```

- [ ] **Step 1.4: Replace the DC + AC cable + LA drawing block**

Locate the section starting with `# ---- DC cables` (around line 157). The current code has three separate blocks: DC cables (simple polyline), AC cables (per-segment with edge dedup using a `seen` set), and LA (always-on). Delete all three blocks (DC, AC, LA — everything from `# ---- DC cables` through the end of the LA block ending with `align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,\n            )`) and replace with:

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
                # Rectangle footprint
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
                # Protection circle
                msp.add_circle(
                    (la_cx, la_cy), la.radius,
                    dxfattribs={"layer": "LA"},
                )
                # Label
                msp.add_text(
                    f"LA-{la.index}",
                    dxfattribs={"layer": "ANNOTATIONS", "height": 5},
                ).set_placement(
                    (la_cx, la_cy),
                    align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
                )
```

The trailing `doc.saveas(output_path)` line at the end of the function is unchanged.

- [ ] **Step 1.5: Verify the module imports cleanly**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_core.core.dxf_exporter import write_layout_dxf
import inspect
sig = inspect.signature(write_layout_dxf)
print('signature:', list(sig.parameters))
assert 'include_la' in sig.parameters
assert 'include_cables' in sig.parameters
print('ok')
"
```

Expected: `signature: ['results', 'params', 'output_path', 'include_la', 'include_cables']` then `ok`.

- [ ] **Step 1.6: Run existing pytest to confirm no regression**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `101 passed, 6 skipped, 0 failed` — no existing test exercises the DXF exporter, so this is a sanity check that the file still parses.

- [ ] **Step 1.7: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_core/core/dxf_exporter.py && git commit -m "wip: row #10 — port dxf_exporter include_la/include_cables toggles"
```

---

## Task 2: Add `ExportDxfRequest` schema

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_engine/schemas.py:482`

Insert the new schema after `RemoveRoadRequest` (which ends at line 482) and before the `# Health + error payloads` comment block at line 484.

- [ ] **Step 2.1: Add `ExportDxfRequest` class**

Open `python/pvlayout_engine/pvlayout_engine/schemas.py`. After the closing of `RemoveRoadRequest` (the line `    params: LayoutParameters` at line ~481, immediately before the `# ---` comment block at line ~484), insert:

```python


class ExportDxfRequest(_Model):
    """POST /export-dxf body — multi-result layout to AutoCAD DXF.

    Per ADR-0005 + session.py:105, exports are ungated (no require_feature
    dependency on the route). The two flags mirror legacy's UI toggles:
    LA symbols visibility and cable-route display.
    """

    results: list[LayoutResult]
    params: LayoutParameters
    include_la: bool = True
    include_cables: bool = True
```

- [ ] **Step 2.2: Verify the schema imports cleanly**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_engine.schemas import ExportDxfRequest
import inspect
print('fields:', list(ExportDxfRequest.model_fields))
assert ExportDxfRequest.model_fields['include_la'].default is True
assert ExportDxfRequest.model_fields['include_cables'].default is True
print('ok')
"
```

Expected: `fields: ['results', 'params', 'include_la', 'include_cables']` then `ok`.

- [ ] **Step 2.3: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_engine/schemas.py && git commit -m "wip: row #10 — add ExportDxfRequest schema"
```

---

## Task 3: Create `routes/dxf.py`

**Files:**
- Create: `python/pvlayout_engine/pvlayout_engine/routes/dxf.py`

- [ ] **Step 3.1: Write the route module**

Create `python/pvlayout_engine/pvlayout_engine/routes/dxf.py` with this exact content:

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
    """Convert wire LayoutResult[] back to core, write DXF to tempfile,
    return as application/dxf binary.

    Streams the file via Response(content=bytes, media_type=...) — small
    enough (typical layout DXF is < 5 MB) that an in-memory buffer is
    fine; switching to StreamingResponse is a future optimization.
    """
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

- [ ] **Step 3.2: Verify the route module imports cleanly**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_engine.routes.dxf import router as dxf_router
print('router prefix:', dxf_router.prefix or '(none)')
print('routes:', [r.path for r in dxf_router.routes])
"
```

Expected: `router prefix: (none)` and `routes: ['/export-dxf']`.

- [ ] **Step 3.3: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_engine/routes/dxf.py && git commit -m "wip: row #10 — add POST /export-dxf route"
```

---

## Task 4: Wire `dxf_router` into `server.py`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_engine/server.py:26` (import) + `:111` (registration block)

- [ ] **Step 4.1: Add the import**

Open `python/pvlayout_engine/pvlayout_engine/server.py`. Locate the route imports at lines 24–26:

```python
from pvlayout_engine.routes.layout import router as layout_router
from pvlayout_engine.routes.session import router as session_router
from pvlayout_engine.routes.water import router as water_router
```

Add a line for `dxf_router` immediately after `water_router`:

```python
from pvlayout_engine.routes.layout import router as layout_router
from pvlayout_engine.routes.session import router as session_router
from pvlayout_engine.routes.water import router as water_router
from pvlayout_engine.routes.dxf import router as dxf_router
```

- [ ] **Step 4.2: Register the router under `authed`**

Locate the registration block at lines 109–111:

```python
    # --- Water-detection route (Row #5) -------------------------------------
    # /detect-water — sync; satellite tile fetch + classifier; token-gated.
    authed.include_router(water_router)

    app.include_router(authed)
```

Insert the DXF block immediately after the water-detection block, before `app.include_router(authed)`:

```python
    # --- Water-detection route (Row #5) -------------------------------------
    # /detect-water — sync; satellite tile fetch + classifier; token-gated.
    authed.include_router(water_router)

    # --- Export route (Row #10) ---------------------------------------------
    # /export-dxf — multi-result layout to DXF; token-gated. Per ADR-0005,
    # exports are ungated at the entitlements layer (no require_feature).
    authed.include_router(dxf_router)

    app.include_router(authed)
```

- [ ] **Step 4.3: Verify the app builds and exposes /export-dxf**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app

cfg = SidecarConfig(host='127.0.0.1', port=0, token='probe', version='0.0.0+probe')
app = build_app(cfg)
paths = sorted(r.path for r in app.routes if hasattr(r, 'path'))
print([p for p in paths if 'export' in p or p == '/health'])
"
```

Expected: `['/export-dxf', '/health']` (or similar — the key check is `/export-dxf` is present).

- [ ] **Step 4.4: Run existing pytest to confirm no regression**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `101 passed, 6 skipped, 0 failed`. No existing test exercises `/export-dxf`, but adding a new route should not break anything.

- [ ] **Step 4.5: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_engine/server.py && git commit -m "wip: row #10 — register dxf_router in server.py"
```

---

## Task 5: Integration tests

**Files:**
- Create: `python/pvlayout_engine/tests/integration/test_export_dxf.py`

Five tests: 1 smoke, 2 toggle behaviors, 1 empty-input 422, 1 structure-parity via sys.path bootstrap.

- [ ] **Step 5.1: Build the test module**

Create `python/pvlayout_engine/tests/integration/test_export_dxf.py` with this exact content:

```python
"""Sidecar /export-dxf route + structure parity (Row #10 of docs/PLAN.md).

Endpoint tests: smoke, two toggle behaviors, empty-input 422.
Structure parity: legacy ↔ new write_layout_dxf produce DXFs with
identical layer sets, identical per-layer entity-type counts, and
per-entity geometry within 1e-6 m. Sys.path bootstrap fixture mirrors
rows #6/#7/#8/#9 patterns.

A LayoutResult fixture is built once at module scope by running
parse_kmz + run_layout_multi on phaseboundary2.kmz. Cable runs and
LA placements are then synthetically injected so the LA / cables
toggle assertions can verify their layers are populated by default
and absent when disabled.
"""

from __future__ import annotations

import io
import math
import sys
from pathlib import Path
from typing import Any

import ezdxf
import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.adapters import result_from_core
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "row10-export-dxf-test-token-abcdefghij"
LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")
KMZ_FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "tests/golden/kmz/phaseboundary2.kmz"
)
POS_TOL = 1e-6


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> TestClient:
    """A TestClient for the sidecar app."""
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+row10-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    """Bearer token header (matches existing detect-water test pattern)."""
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture(scope="module")
def core_layout_results() -> list:
    """Build a list of core LayoutResult once — used by both endpoint
    tests (round-tripped to wire) and the structure-parity test.

    Cable runs + LA placements are injected synthetically so the layer
    contents are non-trivial regardless of LayoutParameters defaults.
    """
    from pvlayout_core.core.kmz_parser import parse_kmz
    from pvlayout_core.core.layout_engine import run_layout_multi
    from pvlayout_core.models.project import (
        CableRun,
        LayoutParameters,
        PlacedLA,
    )

    parsed = parse_kmz(str(KMZ_FIXTURE))
    params = LayoutParameters()
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    valid = [r for r in results if r.usable_polygon is not None]
    assert valid, "expected at least one valid LayoutResult from phaseboundary2.kmz"

    # Inject one DC + one AC cable run + one LA per result so layer
    # contents are non-empty under default LayoutParameters.
    for r in valid:
        if r.placed_tables:
            t0 = r.placed_tables[0]
            t1 = r.placed_tables[-1]
            r.dc_cable_runs.append(
                CableRun(
                    start_utm=(t0.x, t0.y),
                    end_utm=(t1.x, t1.y),
                    route_utm=[(t0.x, t0.y), (t1.x, t1.y)],
                )
            )
            r.ac_cable_runs.append(
                CableRun(
                    start_utm=(t0.x, t0.y + 5),
                    end_utm=(t1.x, t1.y + 5),
                    route_utm=[(t0.x, t0.y + 5), (t1.x, t1.y + 5)],
                )
            )
        # Place an LA at the boundary centroid-ish (within usable bounds)
        minx, miny, maxx, maxy = r.usable_polygon.bounds
        cx = (minx + maxx) / 2
        cy = (miny + maxy) / 2
        r.placed_las.append(
            PlacedLA(
                x=cx - 1.0,
                y=cy - 1.0,
                width=2.0,
                height=2.0,
                radius=15.0,
                index=1,
            )
        )

    return valid


@pytest.fixture(scope="module")
def export_request_body(core_layout_results) -> dict[str, Any]:
    """Wire-shape request body for POST /export-dxf."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    wire_results = [result_from_core(r) for r in core_layout_results]
    return {
        "results": [r.model_dump(mode="json") for r in wire_results],
        "params": WireParams().model_dump(mode="json"),
        "include_la": True,
        "include_cables": True,
    }


def _purge_legacy_modules() -> None:
    """Remove cached bare-namespace modules so legacy and new-app
    namespaces don't collide. Legacy's dxf_exporter imports from
    models.* and utils.*; layout_engine imports from core.*."""
    for m in list(sys.modules):
        if (
            m == "core" or m.startswith("core.")
            or m == "models" or m.startswith("models.")
            or m == "utils" or m.startswith("utils.")
        ):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_dxf():
    """Module-scoped sys.path bootstrap → yields legacy write_layout_dxf
    plus a builder that converts the new-app's core LayoutResult into a
    legacy LayoutResult of equivalent shape."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core.dxf_exporter import write_layout_dxf as legacy_write
        from core import kmz_parser as legacy_parser
        from core import layout_engine as legacy_engine
        from models import project as legacy_project
        yield (legacy_write, legacy_parser, legacy_engine, legacy_project)
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


def test_export_dxf_smoke(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """POST /export-dxf returns a valid DXF with all expected layers."""
    resp = client.post("/export-dxf", headers=auth(), json=export_request_body)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/dxf"
    assert "layout.dxf" in resp.headers.get("content-disposition", "")

    # ezdxf 1.x reads DXF from a text stream; the .dxf bytes are ASCII.
    doc = ezdxf.read(io.StringIO(resp.content.decode("ascii", errors="replace")))
    layer_names = {layer.dxf.name for layer in doc.layers}
    expected = {
        "BOUNDARY", "OBSTACLES", "TABLES", "ICR", "OBSTRUCTIONS",
        "INVERTERS", "ANNOTATIONS", "DC_CABLES", "AC_CABLES", "LA",
    }
    assert expected.issubset(layer_names), (
        f"missing layers: {expected - layer_names}"
    )

    # Modelspace should have at least the boundary polylines + tables + LA + cables.
    msp_entities = list(doc.modelspace())
    assert len(msp_entities) > 0, "modelspace is empty"


def test_export_dxf_excludes_la_when_toggled_off(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """include_la=False → LA layer absent and no entity references it."""
    body = dict(export_request_body)
    body["include_la"] = False
    resp = client.post("/export-dxf", headers=auth(), json=body)
    assert resp.status_code == 200, resp.text

    doc = ezdxf.read(io.StringIO(resp.content.decode("ascii", errors="replace")))
    layer_names = {layer.dxf.name for layer in doc.layers}
    assert "LA" not in layer_names

    for entity in doc.modelspace():
        assert entity.dxf.layer != "LA", (
            f"unexpected LA-layer entity {entity.dxftype()}"
        )


def test_export_dxf_excludes_cables_when_toggled_off(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """include_cables=False → DC_CABLES + AC_CABLES layers absent."""
    body = dict(export_request_body)
    body["include_cables"] = False
    resp = client.post("/export-dxf", headers=auth(), json=body)
    assert resp.status_code == 200, resp.text

    doc = ezdxf.read(io.StringIO(resp.content.decode("ascii", errors="replace")))
    layer_names = {layer.dxf.name for layer in doc.layers}
    assert "DC_CABLES" not in layer_names
    assert "AC_CABLES" not in layer_names

    for entity in doc.modelspace():
        assert entity.dxf.layer not in ("DC_CABLES", "AC_CABLES"), (
            f"unexpected cable-layer entity {entity.dxftype()} on {entity.dxf.layer}"
        )


def test_export_dxf_empty_results_returns_422(client: TestClient) -> None:
    """results=[] returns 422 with explicit message."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    body = {
        "results": [],
        "params": WireParams().model_dump(mode="json"),
        "include_la": True,
        "include_cables": True,
    }
    resp = client.post("/export-dxf", headers=auth(), json=body)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "results must be non-empty"


# ---------------------------------------------------------------------------
# Structure parity (legacy ↔ new) — the row's "parity DXF structure match"
# acceptance.
# ---------------------------------------------------------------------------


def _entity_sort_key(entity) -> tuple:
    """Stable sort key per (layer, type) group — primary coord(s)."""
    t = entity.dxftype()
    if t == "LWPOLYLINE":
        pts = list(entity.get_points("xy"))
        return (pts[0][0], pts[0][1]) if pts else (0.0, 0.0)
    if t == "CIRCLE":
        return (entity.dxf.center.x, entity.dxf.center.y)
    if t in ("TEXT", "MTEXT"):
        ins = entity.dxf.insert
        return (ins.x, ins.y)
    return (0.0, 0.0)


def _group_by_layer_type(doc) -> dict:
    """Group modelspace entities by (layer, dxftype()) and sort each group
    by a stable spatial key."""
    groups: dict[tuple[str, str], list] = {}
    for entity in doc.modelspace():
        key = (entity.dxf.layer, entity.dxftype())
        groups.setdefault(key, []).append(entity)
    for key, lst in groups.items():
        lst.sort(key=_entity_sort_key)
    return groups


def _assert_lwpolyline_eq(a, b, label: str) -> None:
    a_pts = list(a.get_points("xy"))
    b_pts = list(b.get_points("xy"))
    assert len(a_pts) == len(b_pts), (
        f"{label} LWPOLYLINE point-count drift: {len(a_pts)} vs {len(b_pts)}"
    )
    for i, ((ax, ay), (bx, by)) in enumerate(zip(a_pts, b_pts)):
        assert math.isclose(ax, bx, abs_tol=POS_TOL), f"{label}[{i}].x"
        assert math.isclose(ay, by, abs_tol=POS_TOL), f"{label}[{i}].y"
    assert bool(a.closed) == bool(b.closed), f"{label} closed flag drift"


def _assert_circle_eq(a, b, label: str) -> None:
    assert math.isclose(a.dxf.center.x, b.dxf.center.x, abs_tol=POS_TOL), f"{label}.cx"
    assert math.isclose(a.dxf.center.y, b.dxf.center.y, abs_tol=POS_TOL), f"{label}.cy"
    assert math.isclose(a.dxf.radius, b.dxf.radius, abs_tol=POS_TOL), f"{label}.radius"


def _assert_text_eq(a, b, label: str) -> None:
    assert a.dxf.text == b.dxf.text, f"{label} text drift"
    assert math.isclose(a.dxf.insert.x, b.dxf.insert.x, abs_tol=POS_TOL), f"{label}.x"
    assert math.isclose(a.dxf.insert.y, b.dxf.insert.y, abs_tol=POS_TOL), f"{label}.y"
    assert math.isclose(a.dxf.height, b.dxf.height, abs_tol=POS_TOL), f"{label}.height"


def test_export_dxf_structure_parity_with_legacy(
    legacy_dxf, core_layout_results, tmp_path: Path
) -> None:
    """Legacy ↔ new write_layout_dxf produce structurally-equivalent DXFs.

    Builds a legacy LayoutResult for the same boundary fixture (re-running
    parse_kmz + run_layout_multi on the legacy side), injects matching
    cable / LA content, then writes both DXFs and compares layer sets,
    per-(layer, type) entity counts, and per-entity geometry.
    """
    legacy_write, legacy_parser, legacy_engine, legacy_project = legacy_dxf

    # --- Build legacy core LayoutResult with the same injected fixture ---
    legacy_parsed = legacy_parser.parse_kmz(str(KMZ_FIXTURE))
    legacy_params = legacy_project.LayoutParameters()
    legacy_results = legacy_engine.run_layout_multi(
        boundaries=legacy_parsed.boundaries,
        params=legacy_params,
        centroid_lat=legacy_parsed.centroid_lat,
        centroid_lon=legacy_parsed.centroid_lon,
    )
    legacy_valid = [r for r in legacy_results if r.usable_polygon is not None]
    assert len(legacy_valid) == len(core_layout_results), (
        "legacy/new valid-result count drift — fixture build mismatch"
    )

    # Mirror the cable + LA injections (same coords, same fields). This
    # works because legacy CableRun and PlacedLA have identical field
    # names to the new app's dataclasses (verified at row #4 / row #2).
    for legacy_r, new_r in zip(legacy_valid, core_layout_results):
        for c in new_r.dc_cable_runs:
            legacy_r.dc_cable_runs.append(
                legacy_project.CableRun(
                    start_utm=c.start_utm,
                    end_utm=c.end_utm,
                    route_utm=list(c.route_utm),
                )
            )
        for c in new_r.ac_cable_runs:
            legacy_r.ac_cable_runs.append(
                legacy_project.CableRun(
                    start_utm=c.start_utm,
                    end_utm=c.end_utm,
                    route_utm=list(c.route_utm),
                )
            )
        for la in new_r.placed_las:
            legacy_r.placed_las.append(
                legacy_project.PlacedLA(
                    x=la.x, y=la.y, width=la.width, height=la.height,
                    radius=la.radius, index=la.index,
                )
            )

    # --- Write both DXFs ---
    legacy_path = tmp_path / "legacy.dxf"
    new_path = tmp_path / "new.dxf"

    legacy_write(
        legacy_valid, legacy_params, str(legacy_path),
        include_la=True, include_cables=True,
    )

    from pvlayout_core.core.dxf_exporter import write_layout_dxf as new_write
    from pvlayout_core.models.project import LayoutParameters as NewParams
    new_write(
        core_layout_results, NewParams(), str(new_path),
        include_la=True, include_cables=True,
    )

    # --- Parse + compare ---
    legacy_doc = ezdxf.readfile(str(legacy_path))
    new_doc = ezdxf.readfile(str(new_path))

    legacy_layers = {l.dxf.name for l in legacy_doc.layers}
    new_layers = {l.dxf.name for l in new_doc.layers}
    common = {
        "BOUNDARY", "OBSTACLES", "TABLES", "ICR", "OBSTRUCTIONS",
        "INVERTERS", "ANNOTATIONS", "DC_CABLES", "AC_CABLES", "LA",
    }
    # Use issuperset on both sides — ezdxf may auto-create system layers
    # like "0" that we don't care about; we only assert our layers match.
    assert common.issubset(legacy_layers), (
        f"legacy missing layers: {common - legacy_layers}"
    )
    assert common.issubset(new_layers), (
        f"new missing layers: {common - new_layers}"
    )
    # The auto-created system layers should be identical between runs.
    extra_legacy = legacy_layers - common
    extra_new = new_layers - common
    assert extra_legacy == extra_new, (
        f"system-layer drift: legacy {extra_legacy} vs new {extra_new}"
    )

    legacy_groups = _group_by_layer_type(legacy_doc)
    new_groups = _group_by_layer_type(new_doc)

    assert set(legacy_groups) == set(new_groups), (
        f"(layer, type) group key drift: "
        f"only legacy {set(legacy_groups) - set(new_groups)}, "
        f"only new {set(new_groups) - set(legacy_groups)}"
    )

    for key in sorted(legacy_groups):
        layer, dxftype = key
        legacy_list = legacy_groups[key]
        new_list = new_groups[key]
        assert len(legacy_list) == len(new_list), (
            f"({layer}, {dxftype}) count drift: "
            f"legacy {len(legacy_list)} vs new {len(new_list)}"
        )
        for i, (la, na) in enumerate(zip(legacy_list, new_list)):
            label = f"({layer}, {dxftype})[{i}]"
            if dxftype == "LWPOLYLINE":
                _assert_lwpolyline_eq(la, na, label)
            elif dxftype == "CIRCLE":
                _assert_circle_eq(la, na, label)
            elif dxftype in ("TEXT", "MTEXT"):
                _assert_text_eq(la, na, label)
            # Other types (POINT, LINE, etc.) — count parity is enough.
```

- [ ] **Step 5.2: Run only the new test file**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/integration/test_export_dxf.py -v 2>&1 | tail -25
```

Expected: 5 tests pass — `test_export_dxf_smoke`, `test_export_dxf_excludes_la_when_toggled_off`, `test_export_dxf_excludes_cables_when_toggled_off`, `test_export_dxf_empty_results_returns_422`, `test_export_dxf_structure_parity_with_legacy`.

If the **structure-parity test** fails on a per-entity assertion: capture the failing label (the assertion message includes layer, dxftype, and index). Read the actual coord/text values from the failing assertion, then check the corresponding section of `dxf_exporter.py` against legacy.

If the **smoke test** fails on `ezdxf.read(...)` parsing: the response body might be binary-mode DXF (R12 default in ezdxf 1.x is text/ASCII; verify). If parsing fails, switch the smoke read to `ezdxf.readfile(...)` after writing `resp.content` to a `tmp_path`.

If the **toggle tests** fail because the LA / cable layers are STILL present when toggled off: the layer-creation block in Task 1 step 1.3 didn't get the `if include_*:` guards. Re-read the file and verify.

If the **empty-results 422 test** fails because FastAPI returns the wrong shape: confirm `HTTPException(detail="…")` (not `detail={"…": …}`). Spec section 2.2 uses string detail.

- [ ] **Step 5.3: Run full pytest suite**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `106 passed, 6 skipped, 0 failed` (was 101 → +5 new tests). Contract is `0 failed`.

- [ ] **Step 5.4: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/tests/integration/test_export_dxf.py && git commit -m "wip: row #10 — integration tests for /export-dxf (smoke, toggles, structure parity)"
```

---

## Task 6: Flip PLAN.md, run final pytest, squash to `parity:` commit

- [ ] **Step 6.1: Update PLAN.md row #10 status and header**

Open `docs/PLAN.md`. Two edits:

(a) Header status — change:

```markdown
**Status:** 9 / 12 done.
```

to:

```markdown
**Status:** 10 / 12 done.
```

(b) Row #10 — change:

```markdown
| 10 | DXF exporter — LA + cable layers | T1 | `core/dxf_exporter.py` @ `9362083` + `fc1a5c5` | Exporter wired to FastAPI route; parity DXF structure match. | todo |
```

to:

```markdown
| 10 | DXF exporter — LA + cable layers | T1 | `core/dxf_exporter.py` @ `9362083` + `fc1a5c5` | Exporter wired to FastAPI route; parity DXF structure match. | **done** |
```

- [ ] **Step 6.2: Final pytest gate**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `106 passed, 6 skipped, 0 failed`.

- [ ] **Step 6.3: Inspect commits to squash**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git log --oneline origin/main..HEAD
```

Expected ordering (top = most recent):
1. `wip: row #10 — integration tests for /export-dxf (smoke, toggles, structure parity)`
2. `wip: row #10 — register dxf_router in server.py`
3. `wip: row #10 — add POST /export-dxf route`
4. `wip: row #10 — add ExportDxfRequest schema`
5. `wip: row #10 — port dxf_exporter include_la/include_cables toggles`
6. `docs: row #10 spec — DXF exporter (LA + cable layers)`

The spec commit (6) is *not* squashed — kept separate per the rows-#4–#9 pattern.

- [ ] **Step 6.4: Soft reset to spec commit and stage everything**

```bash
SPEC_COMMIT=$(git log --grep="docs: row #10 spec" --format=%H -n 1) && \
echo "Reset target (spec commit): $SPEC_COMMIT" && \
git reset --soft $SPEC_COMMIT
```

Stage all six row-#10 outputs (PLAN.md edit + 5 squashed-from-wip files):

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add \
    docs/PLAN.md \
    python/pvlayout_engine/pvlayout_core/core/dxf_exporter.py \
    python/pvlayout_engine/pvlayout_engine/schemas.py \
    python/pvlayout_engine/pvlayout_engine/routes/dxf.py \
    python/pvlayout_engine/pvlayout_engine/server.py \
    python/pvlayout_engine/tests/integration/test_export_dxf.py
```

Verify staging:

```bash
git status -s
```

Expected: 6 files staged (`A` for the new files, `M` for modifications), working tree otherwise clean.

- [ ] **Step 6.5: Create the final atomic commit**

```bash
git commit -m "$(cat <<'EOF'
parity: row #10 — DXF exporter (LA + cable layers)

Port legacy core/dxf_exporter.py @ baseline-v1-20260429 commits
9362083 + fc1a5c5 (~+30 line diff) into the new app's
pvlayout_core/core/dxf_exporter.py:

  1. write_layout_dxf gains include_la=True / include_cables=True
     kwargs.
  2. Layer creation: DC_CABLES/AC_CABLES/LA are conditionally
     appended to layer_defs only when their toggle is True;
     ANNOTATIONS moves earlier in the unconditional block.
  3. Drawing: DC + AC cables become simple per-cable lwpolylines
     with lineweight (DC=13, AC=25). Replaces new app's prior
     AC-edge-deduplication code with legacy's verbatim approach
     (shared corridors will overdraw — intentional verbatim port).
     LA drawing gated by include_la.

New sidecar route POST /export-dxf at
pvlayout_engine/routes/dxf.py wraps write_layout_dxf:
takes wire LayoutResult[] + LayoutParameters + the two toggle
flags, runs both through the existing result_to_core /
params_to_core adapters, writes DXF to a tempfile, returns
application/dxf binary with Content-Disposition. Per ADR-0005
+ session.py:105, exports are ungated (no require_feature).

ExportDxfRequest added to schemas.py; dxf_router registered
under authed in server.py.

Five integration tests in tests/integration/test_export_dxf.py:
  - test_export_dxf_smoke: 200 + valid DXF + expected layers
  - test_export_dxf_excludes_la_when_toggled_off
  - test_export_dxf_excludes_cables_when_toggled_off
  - test_export_dxf_empty_results_returns_422
  - test_export_dxf_structure_parity_with_legacy: sys.path bootstrap
    against legacy write_layout_dxf; asserts identical layer set,
    identical per-(layer, type) entity counts, per-entity geometry
    (LWPOLYLINE / CIRCLE / TEXT) within 1e-6 m

Sidecar pytest: 106 passed, 6 skipped, 0 failed (was 101 → +5).

T1 ceremony — no discovery memo. The diff and the green tests
are the audit trail.

PLAN.md row #10 flipped to done; status header bumped 9/12 → 10/12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6.6: Final verification**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git log --oneline origin/main..HEAD
```

Expected: exactly 2 commits ahead of `origin/main`:
1. `docs: row #10 spec — DXF exporter (LA + cable layers)`
2. `parity: row #10 — DXF exporter (LA + cable layers)`

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `106 passed, 6 skipped, 0 failed`.

- [ ] **Step 6.7: Hand off to user**

Report:
- Pytest count (e.g., `106 passed, 6 skipped`)
- The 2 unpushed commits' shortlog
- Reminder: `git push` is the next user-controlled step
- Note that next row is #11 (PDF exporter — tweaks, T1)

---

## Verification matrix

| Spec section | Plan task | Verification |
|---|---|---|
| 2.1 EDIT `dxf_exporter.py` (kwargs + conditional layers/drawing) | Task 1 | Step 1.5 import + 1.6 no regression + Task 5 tests |
| 2.2 CREATE `routes/dxf.py` | Task 3 | Step 3.2 import + Task 5 tests |
| 2.3 EDIT `schemas.py` (`ExportDxfRequest`) | Task 2 | Step 2.2 schema verify |
| 2.4 EDIT `server.py` (register router) | Task 4 | Step 4.3 OpenAPI path probe + Task 5 tests |
| 2.5 No other touch-points | (implicit) | Step 1.6 + 4.4 confirm no regression |
| 3 Five tests | Task 5 | 5 tests pass |
| 4 Acceptance: 0 failed pytest, route registered, parity test passes, PLAN flipped | Task 6 | Steps 6.2 + 6.6 |
| 4 Acceptance: atomic `parity:` commit | Task 6 | Steps 6.4–6.5 squash |

---

## Edge cases / known gotchas

- **`ezdxf.read` vs `ezdxf.readfile`.** `ezdxf.read` takes a *text* stream; the DXF bytes are ASCII-encoded. If `resp.content.decode("ascii", errors="replace")` produces parsing errors in the smoke test, fall back to writing `resp.content` to a `tmp_path` and using `ezdxf.readfile(...)`.
- **Module identity collision.** Legacy and new both export `dxf_exporter`. The `legacy_dxf` fixture's `_purge_legacy_modules()` deletes `core.*`, `models.*`, `utils.*` from `sys.modules` before legacy import and on teardown. The new app's `pvlayout_core.*` namespace re-resolves cleanly.
- **System-layer drift.** `ezdxf.new(dxfversion="R2010")` may auto-create layers like `"0"` that aren't in our explicit `layer_defs`. The structure-parity test asserts `extra_legacy == extra_new` — both sides should auto-create the same set, so any drift means an `ezdxf` version mismatch (which would be a sidecar-vs-legacy environment bug, not a port bug).
- **Tolerance choice.** `LWPOLYLINE` / `CIRCLE` / `TEXT` use `math.isclose(abs_tol=1e-6)` — same posture as row #6/#9 for shapely-derived coords. Strict `==` on text strings, `closed` flags, and entity counts.
- **Cable / LA injection.** The `core_layout_results` fixture injects synthetic `CableRun` and `PlacedLA` instances into each `LayoutResult` so the layer-presence / toggle-absence assertions are non-trivial. Default `LayoutParameters()` doesn't compute cables (cables are gated on `include_cables` in `LayoutParameters`, not the wire request flag — be careful about the name collision: the wire request's `include_cables` controls *DXF rendering*, the params field with the same name controls *layout-time cable computation*). The test fixture builds layouts without cables-computed, then adds synthetic cables manually.
- **Field-name compatibility for legacy injection.** The structure-parity test reuses `CableRun` / `PlacedLA` field names assumed identical between legacy and new. This held at row #2 (PlacedLA) and earlier rows. If a `TypeError: unexpected keyword argument` surfaces during legacy-side injection, inspect the legacy dataclass and adjust the call.
- **`uv sync` strips dev extras.** Don't run bare `uv sync` during this row. No deps change, but if you find yourself debugging "No module named pytest" or shapely import errors with mixed Python versions, run `uv sync --extra dev` (per `feedback_uv_sync_dev_extras.md`).
- **Bearer token vs X-Session-Token.** The existing `test_detect_water_route.py` uses `Authorization: Bearer <token>`. The plan's test follows the same pattern. If the new route inadvertently rejects the Bearer header, check `auth_dep` in `server.py` for the actual header it expects.
