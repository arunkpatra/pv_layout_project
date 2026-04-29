# Row #11 Implementation Plan — PDF exporter (tweaks)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port two legacy diff items in `pdf_exporter.py` (filter water/empty results from PDF tables; drop the GCR column from the summary), add a new `POST /export-pdf` sidecar route producing summary-only PDFs (page 1 layout-plot omitted), and verify via 5 integration tests.

**Architecture:** Two surgical edits to `pvlayout_core/core/pdf_exporter.py` + new FastAPI route at `pvlayout_engine/routes/pdf.py` mirroring row #10's `/export-dxf`. Schema `ExportPdfRequest` carries `results`, `params`, optional `energy_params`, and `edition` (string keyed off `Edition` enum's lowercase values). Tests verify HTTP contract (smoke + 422 cases), filter behavior (byte-size delta between filtered vs unfiltered runs), and GCR-column removal via direct `_build_summary_figure` inspection. T1 ceremony: no automated structure-parity test (PDFs aren't equivalently introspectable to DXFs); manual visual-parity recipe in the final commit message.

**Tech Stack:** Python 3.13, FastAPI, matplotlib 3.7+, pytest. uv-managed venv. No new deps.

**Spec:** [docs/superpowers/specs/2026-04-29-row-11-pdf-exporter-design.md](../specs/2026-04-29-row-11-pdf-exporter-design.md)

---

## File map

- **Modify:** `python/pvlayout_engine/pvlayout_core/core/pdf_exporter.py` — filter at top of `export_pdf` (line ~108) + drop GCR column in `_build_summary_figure` (lines 248, 271, 304).
- **Modify:** `python/pvlayout_engine/pvlayout_engine/schemas.py` — add `ExportPdfRequest` after `ExportDxfRequest`.
- **Create:** `python/pvlayout_engine/pvlayout_engine/routes/pdf.py` — `POST /export-pdf` endpoint.
- **Modify:** `python/pvlayout_engine/pvlayout_engine/server.py` — import + register `pdf_router`.
- **Create:** `python/pvlayout_engine/tests/integration/test_export_pdf.py` — 5 tests.
- **Modify:** `docs/PLAN.md` — row #11 status `todo` → `done`; header `10 / 12 done` → `11 / 12 done`.

---

## Pre-flight (one-time)

- [ ] **Step 0.1: Verify legacy repo state**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git rev-parse baseline-v1-20260429
```

Expected: `397aa2ab460d8f773376f51b393407e5be67dca0`.

- [ ] **Step 0.2: Verify clean working tree on main**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git status -s && git rev-parse --abbrev-ref HEAD
```

Expected: empty status, `main` branch.

- [ ] **Step 0.3: Verify baseline pytest is green**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `106 passed, 6 skipped, 0 failed` (post-row-#10 baseline).

- [ ] **Step 0.4: Verify required KMZ fixture exists**

```bash
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz
```

Expected: file listed.

---

## Task 1: Edit `pdf_exporter.py` — filter + drop GCR column

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/pdf_exporter.py`

Two surgical edits. Function name is `export_pdf` — same in legacy and new app.

- [ ] **Step 1.1: Add the filter at the top of `export_pdf`**

Open the file. Locate the `if isinstance(results, LayoutResult):` block (line ~107). Replace the block:

```python
    if isinstance(results, LayoutResult):
        results = [results]

    with PdfPages(output_path) as pdf:
```

with:

```python
    if isinstance(results, LayoutResult):
        results = [results]

    # Strip water bodies, obstacles and failed/empty results so they never
    # appear in any PDF summary or energy table — only real plant results shown.
    results = [
        r for r in results
        if not getattr(r, "is_water", False)
        and getattr(r, "utm_epsg", 0)
        and r.placed_tables   # must have at least one placed table
    ]

    with PdfPages(output_path) as pdf:
```

- [ ] **Step 1.2: Drop `"GCR"` from `col_headers` (line 247-248)**

Locate the `col_headers = ["Plant", ...]` initial assignment (line ~247). Replace:

```python
    col_headers = ["Plant", "Area\n(acres)", "MMS-\nTables", "Modules",
                   "Cap.\n(MWp)", "Tilt\n(°)", "Pitch\n(m)", "GCR", "ICR"]
```

with:

```python
    col_headers = ["Plant", "Area\n(acres)", "MMS-\nTables", "Modules",
                   "Cap.\n(MWp)", "Tilt\n(°)", "Pitch\n(m)", "ICR"]
```

(removed `"GCR",` between `"Pitch\n(m)"` and `"ICR"`)

- [ ] **Step 1.3: Drop the gcr_achieved entry from `_row_vals` (line 271)**

Locate the `_row_vals` function body (line ~262). The current body has:

```python
    def _row_vals(r):
        v = [
            r.boundary_name,
            f"{r.total_area_acres:.3f}",
            f"{len(r.placed_tables)}",
            f"{r.total_modules:,}",
            f"{r.total_capacity_mwp:.4f}",
            f"{r.tilt_angle_deg:.1f}{tilt_note}",
            f"{r.row_pitch_m:.2f}{pitch_note}",
            f"{r.gcr_achieved:.3f}",
            f"{len(r.placed_icrs)}",
        ]
```

Replace with (drop the `f"{r.gcr_achieved:.3f}",` line):

```python
    def _row_vals(r):
        v = [
            r.boundary_name,
            f"{r.total_area_acres:.3f}",
            f"{len(r.placed_tables)}",
            f"{r.total_modules:,}",
            f"{r.total_capacity_mwp:.4f}",
            f"{r.tilt_angle_deg:.1f}{tilt_note}",
            f"{r.row_pitch_m:.2f}{pitch_note}",
            f"{len(r.placed_icrs)}",
        ]
```

- [ ] **Step 1.4: Drop one empty cell from totals row (line 304)**

Locate the totals-row construction (line ~298). The current code has:

```python
        tot = [
            "TOTAL",
            f"{sum(r.total_area_acres for r in results):.3f}",
            f"{sum(len(r.placed_tables) for r in results):,}",
            f"{sum(r.total_modules for r in results):,}",
            f"{_tot_dc:.4f}",
            "", "", "",
            f"{sum(len(r.placed_icrs) for r in results)}",
        ]
```

Replace `"", "", "",` (three empties for Tilt/Pitch/GCR) with `"", "",` (two empties for Tilt/Pitch only):

```python
        tot = [
            "TOTAL",
            f"{sum(r.total_area_acres for r in results):.3f}",
            f"{sum(len(r.placed_tables) for r in results):,}",
            f"{sum(r.total_modules for r in results):,}",
            f"{_tot_dc:.4f}",
            "", "",
            f"{sum(len(r.placed_icrs) for r in results)}",
        ]
```

- [ ] **Step 1.5: Verify the module imports cleanly**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_core.core.pdf_exporter import export_pdf, _build_summary_figure
print('ok')
"
```

Expected: `ok`.

- [ ] **Step 1.6: Smoke-test export_pdf end-to-end on a real layout**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
import tempfile
from pathlib import Path
from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.pdf_exporter import export_pdf
from pvlayout_core.core.edition import Edition
from pvlayout_core.models.project import LayoutParameters

parsed = parse_kmz('tests/golden/kmz/phaseboundary2.kmz')
params = LayoutParameters()
results = run_layout_multi(
    boundaries=parsed.boundaries,
    params=params,
    centroid_lat=parsed.centroid_lat,
    centroid_lon=parsed.centroid_lon,
)
with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as t:
    p = Path(t.name)
export_pdf(results, params, str(p), layout_figure=None, energy_params=None, edition=Edition.PRO_PLUS)
size = p.stat().st_size
p.unlink()
print(f'pdf bytes: {size}')
assert size > 1000, 'pdf too small — likely empty'
print('ok')
"
```

Expected: prints `pdf bytes: <some size>` (typically 30-100 KB for the summary-only PDF) and `ok`.

- [ ] **Step 1.7: Run existing pytest (no regression)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `106 passed, 6 skipped, 0 failed`. No existing test exercises the PDF exporter.

- [ ] **Step 1.8: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_core/core/pdf_exporter.py && git commit -m "wip: row #11 — pdf_exporter filter water/empty + drop GCR column"
```

---

## Task 2: Add `ExportPdfRequest` schema

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_engine/schemas.py`

`ExportDxfRequest` is the existing anchor (added in row #10). Add `ExportPdfRequest` immediately after it.

- [ ] **Step 2.1: Add the schema**

Open `python/pvlayout_engine/pvlayout_engine/schemas.py`. Locate the closing of `ExportDxfRequest` (the line `    include_cables: bool = True`). Immediately after (and before the `# ---` comment block for "Health + error payloads"), insert:

```python


class ExportPdfRequest(_Model):
    """POST /export-pdf body — multi-result layout to PDF (summary pages).

    Page 1 of legacy's PDF is the live matplotlib layout plot; the new
    app has no server-side equivalent yet, so the sidecar PDF starts at
    the Summary page (legacy's page 2). Pages 2-4 (Summary, Energy,
    25-yr Forecast) are produced in full when energy_params is provided.
    Energy/25-yr pages are skipped when energy_params is None.

    `edition` is the lowercase string value of pvlayout_core.core.edition.Edition
    ("basic" / "pro" / "pro_plus"); the route maps it back via Edition(...).
    Per ADR-0005 + session.py:105, exports are ungated (no require_feature).
    """

    results: list[LayoutResult]
    params: LayoutParameters
    energy_params: EnergyParameters | None = None
    edition: str = "pro_plus"
```

- [ ] **Step 2.2: Verify the schema imports cleanly**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_engine.schemas import ExportPdfRequest
print('fields:', list(ExportPdfRequest.model_fields))
assert ExportPdfRequest.model_fields['edition'].default == 'pro_plus'
assert ExportPdfRequest.model_fields['energy_params'].default is None
print('ok')
"
```

Expected: `fields: ['results', 'params', 'energy_params', 'edition']` then `ok`.

- [ ] **Step 2.3: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_engine/schemas.py && git commit -m "wip: row #11 — add ExportPdfRequest schema"
```

---

## Task 3: Create `routes/pdf.py`

**Files:**
- Create: `python/pvlayout_engine/pvlayout_engine/routes/pdf.py`

- [ ] **Step 3.1: Write the route module**

Create `python/pvlayout_engine/pvlayout_engine/routes/pdf.py` with this exact content:

```python
"""POST /export-pdf — export multi-result layout to PDF (summary pages).

Row #11 of docs/PLAN.md. Wraps pvlayout_core.core.pdf_exporter.export_pdf
in a FastAPI route. Per ADR-0005 + session.py:105, exports are ungated.

Note: page 1 of legacy's PDF is the live matplotlib layout plot, which
the new app does not yet have a server-side equivalent for. This route
passes layout_figure=None → PDF starts at the Summary page (formerly
page 2). A future row may add a server-side _draw_layout to fill page 1.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response

from pvlayout_engine.adapters import params_to_core, result_to_core
from pvlayout_engine.schemas import ExportPdfRequest


router = APIRouter(tags=["export"])


@router.post(
    "/export-pdf",
    summary="Export multi-result layout to a PDF file (summary pages)",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def export_pdf_route(request: ExportPdfRequest) -> Response:
    """Convert wire LayoutResult[] back to core, write PDF to tempfile,
    return as application/pdf binary. Page 1 (layout plot) omitted —
    layout_figure=None → PDF starts at the Summary page.
    """
    from pvlayout_core.core.edition import Edition
    from pvlayout_core.core.pdf_exporter import export_pdf
    from pvlayout_core.models.project import EnergyParameters as CoreEnergyParameters

    if not request.results:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="results must be non-empty",
        )

    try:
        edition = Edition(request.edition)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"invalid edition '{request.edition}'; "
                f"expected one of: basic, pro, pro_plus"
            ),
        ) from exc

    core_results = [result_to_core(r) for r in request.results]
    core_params = params_to_core(request.params)

    core_energy = None
    if request.energy_params is not None:
        # Wire EnergyParameters and core EnergyParameters share field names.
        # If field-shape drift surfaces, replace with a dedicated adapter
        # (small/bounded/textbook in-row scope expansion).
        core_energy = CoreEnergyParameters(**request.energy_params.model_dump())

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        export_pdf(
            core_results,
            core_params,
            str(tmp_path),
            layout_figure=None,
            energy_params=core_energy,
            edition=edition,
        )
        data = tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)

    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="layout.pdf"'},
    )
```

- [ ] **Step 3.2: Verify the route module imports cleanly**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_engine.routes.pdf import router as pdf_router
print('routes:', [r.path for r in pdf_router.routes])
"
```

Expected: `routes: ['/export-pdf']`.

- [ ] **Step 3.3: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_engine/routes/pdf.py && git commit -m "wip: row #11 — add POST /export-pdf route"
```

---

## Task 4: Wire `pdf_router` into `server.py`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_engine/server.py`

- [ ] **Step 4.1: Add the import**

Open `python/pvlayout_engine/pvlayout_engine/server.py`. Locate the route imports (the block including `from pvlayout_engine.routes.dxf import router as dxf_router` added in row #10). Add the `pdf_router` import in alphabetical order — between `dxf_router` and `layout_router`:

```python
from pvlayout_engine.routes.dxf import router as dxf_router
from pvlayout_engine.routes.layout import router as layout_router
from pvlayout_engine.routes.pdf import router as pdf_router
from pvlayout_engine.routes.session import router as session_router
from pvlayout_engine.routes.water import router as water_router
```

- [ ] **Step 4.2: Register the router under `authed`**

Locate the existing DXF block (added in row #10):

```python
    # --- Export route (Row #10) ---------------------------------------------
    # /export-dxf — multi-result layout to DXF; token-gated. Per ADR-0005,
    # exports are ungated at the entitlements layer (no require_feature).
    authed.include_router(dxf_router)

    app.include_router(authed)
```

Insert the PDF block immediately after the DXF block, before `app.include_router(authed)`:

```python
    # --- Export route (Row #10) ---------------------------------------------
    # /export-dxf — multi-result layout to DXF; token-gated. Per ADR-0005,
    # exports are ungated at the entitlements layer (no require_feature).
    authed.include_router(dxf_router)

    # --- Export route (Row #11) ---------------------------------------------
    # /export-pdf — multi-result layout to PDF (summary pages); token-gated.
    # Page 1 (layout plot) is omitted — no server-side equivalent for legacy's
    # PyQt5 figure yet. Per ADR-0005, exports are ungated at the entitlements
    # layer.
    authed.include_router(pdf_router)

    app.include_router(authed)
```

- [ ] **Step 4.3: Verify the app builds and exposes /export-pdf**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app

cfg = SidecarConfig(host='127.0.0.1', port=0, token='probe', version='0.0.0+probe')
app = build_app(cfg)
paths = sorted(r.path for r in app.routes if hasattr(r, 'path'))
print([p for p in paths if 'export' in p])
"
```

Expected: `['/export-dxf', '/export-pdf']`.

- [ ] **Step 4.4: Run existing pytest (no regression)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `106 passed, 6 skipped, 0 failed`.

- [ ] **Step 4.5: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_engine/server.py && git commit -m "wip: row #11 — register pdf_router in server.py"
```

---

## Task 5: Integration tests

**Files:**
- Create: `python/pvlayout_engine/tests/integration/test_export_pdf.py`

5 tests: smoke, filter behavior (direct call, byte-size delta), GCR-column removal (direct `_build_summary_figure` inspection), empty-results 422, invalid-edition 422.

- [ ] **Step 5.1: Build the test module**

Create `python/pvlayout_engine/tests/integration/test_export_pdf.py` with this exact content:

```python
"""Sidecar /export-pdf route + filter / column tweaks (Row #11 of docs/PLAN.md).

PDFs aren't equivalently introspectable to DXFs without a heavy parser dep,
so the tests verify what's reliably checkable:
  - HTTP contract (smoke + 422 cases)
  - Filter behavior via byte-size delta (filtered vs unfiltered runs)
  - GCR column removal via direct _build_summary_figure inspection of the
    rendered matplotlib Table object

Manual visual parity (the row's "manual visual parity" acceptance) is the
user's bar — see the row #11 commit message for the recipe.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")  # headless — must precede any pyplot/figure import
import matplotlib.pyplot as plt
from matplotlib.table import Table

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.adapters import result_from_core
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "row11-export-pdf-test-token-abcdefghij"
KMZ_FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "tests/golden/kmz/phaseboundary2.kmz"
)


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+row11-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture(scope="module")
def core_layout_results() -> list:
    """Run parse_kmz + run_layout_multi on phaseboundary2.kmz; filter to
    valid (usable_polygon non-None) results."""
    from pvlayout_core.core.kmz_parser import parse_kmz
    from pvlayout_core.core.layout_engine import run_layout_multi
    from pvlayout_core.models.project import LayoutParameters

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
    return valid


@pytest.fixture(scope="module")
def export_request_body(core_layout_results) -> dict[str, Any]:
    """Wire-shape body for POST /export-pdf with energy_params=None
    (summary-only PDF)."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    wire_results = [result_from_core(r) for r in core_layout_results]
    return {
        "results": [r.model_dump(mode="json") for r in wire_results],
        "params": WireParams().model_dump(mode="json"),
        "energy_params": None,
        "edition": "pro_plus",
    }


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


def test_export_pdf_smoke(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """POST /export-pdf returns 200 + valid PDF magic bytes."""
    resp = client.post("/export-pdf", headers=auth(), json=export_request_body)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert "layout.pdf" in resp.headers.get("content-disposition", "")
    # PDF magic bytes: %PDF at start, %%EOF near end
    assert resp.content.startswith(b"%PDF"), "missing PDF magic header"
    assert b"%%EOF" in resp.content[-128:], "missing %%EOF terminator near end"


def test_export_pdf_empty_results_returns_422(client: TestClient) -> None:
    """results=[] returns 422 with explicit message."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    body = {
        "results": [],
        "params": WireParams().model_dump(mode="json"),
        "energy_params": None,
        "edition": "pro_plus",
    }
    resp = client.post("/export-pdf", headers=auth(), json=body)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "results must be non-empty"


def test_export_pdf_invalid_edition_returns_422(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """edition='enterprise' returns 422 with the expected-list message."""
    body = dict(export_request_body)
    body["edition"] = "enterprise"
    resp = client.post("/export-pdf", headers=auth(), json=body)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert "invalid edition 'enterprise'" in detail
    assert "basic" in detail and "pro" in detail and "pro_plus" in detail


# ---------------------------------------------------------------------------
# Direct (non-route) tests of the legacy diff items
# ---------------------------------------------------------------------------


def test_export_pdf_filters_water_and_empty_results(
    core_layout_results, tmp_path: Path
) -> None:
    """Filter at top of export_pdf drops water / empty / failed results.

    Verifies via byte-size delta: PDF generated from [valid] should be
    nearly byte-identical to PDF from [valid, empty_stub, failed_stub].
    If the filter were absent, the unfiltered PDF's summary table would
    have extra rows and grow noticeably.
    """
    from pvlayout_core.core.edition import Edition
    from pvlayout_core.core.pdf_exporter import export_pdf
    from pvlayout_core.models.project import LayoutParameters, LayoutResult

    valid = core_layout_results[0]
    empty_stub = LayoutResult()       # default — no placed_tables, utm_epsg=0
    failed_stub = LayoutResult(boundary_name="Failed-1")  # also no placed_tables

    params = LayoutParameters()

    path_a = tmp_path / "a.pdf"
    path_b = tmp_path / "b.pdf"

    export_pdf(
        [valid], params, str(path_a),
        layout_figure=None, energy_params=None, edition=Edition.PRO_PLUS,
    )
    export_pdf(
        [valid, empty_stub, failed_stub], params, str(path_b),
        layout_figure=None, energy_params=None, edition=Edition.PRO_PLUS,
    )

    bytes_a = path_a.read_bytes()
    bytes_b = path_b.read_bytes()

    assert len(bytes_a) > 0, "PDF A is empty"
    assert len(bytes_b) > 0, "PDF B is empty"

    # If the filter works, the two PDFs are nearly byte-identical (same
    # set of summary rows after filtering). Allow up to 5% delta to
    # accommodate matplotlib's stable-but-not-byte-identical PDF backend
    # (timestamps, handle counters).
    larger = max(len(bytes_a), len(bytes_b))
    delta = abs(len(bytes_a) - len(bytes_b))
    assert delta < larger * 0.05, (
        f"PDF size delta {delta} bytes exceeds 5% of larger ({larger}). "
        f"Filter likely failed — extra results leaking into the summary table."
    )


def test_export_pdf_summary_drops_gcr_column(core_layout_results) -> None:
    """_build_summary_figure renders the summary table without a GCR column.

    Direct unit test of the column-header change. Builds a fresh matplotlib
    Figure, invokes _build_summary_figure, walks the figure's axes for
    Table objects, and reads the header-row cell texts.
    """
    from pvlayout_core.core.edition import Edition
    from pvlayout_core.core.pdf_exporter import _build_summary_figure
    from pvlayout_core.models.project import LayoutParameters

    params = LayoutParameters()

    # _build_summary_figure(results, params, edition) → returns a fresh Figure
    fig = _build_summary_figure(
        core_layout_results,
        params,
        edition=Edition.PRO_PLUS,
    )

    # Walk the figure's axes for Table objects
    headers: list[str] = []
    for ax in fig.axes:
        for child in ax.get_children():
            if isinstance(child, Table):
                # Table._cells is a dict keyed by (row, col) tuples;
                # row 0 is the header row.
                col_idx = 0
                while (0, col_idx) in child._cells:
                    headers.append(child._cells[(0, col_idx)].get_text().get_text())
                    col_idx += 1
                # Only the summary table — break after first table found
                break
        if headers:
            break

    assert headers, "no Table found in summary figure"

    # The whole point of the row-#11 tweak: GCR column is gone.
    assert not any("GCR" in h for h in headers), (
        f"GCR column still present in summary: {headers}"
    )
    # Sanity: adjacent columns should still be there.
    assert any("Pitch" in h for h in headers), f"Pitch column missing: {headers}"
    assert any("ICR" == h.strip() for h in headers), f"ICR column missing: {headers}"

    plt.close(fig)
```

- [ ] **Step 5.2: Run only the new test file**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/integration/test_export_pdf.py -v 2>&1 | tail -20
```

Expected: 5 tests pass — `test_export_pdf_smoke`, `test_export_pdf_empty_results_returns_422`, `test_export_pdf_invalid_edition_returns_422`, `test_export_pdf_filters_water_and_empty_results`, `test_export_pdf_summary_drops_gcr_column`.

If the **smoke test** fails because the route returns binary that doesn't start with `b"%PDF"`: matplotlib's PDF backend should always emit `%PDF-1.4` or similar; if not, check `Response(content=...)` flow in the route — `tmp_path.read_bytes()` should return raw bytes.

If the **filter test** fails on the 5% size delta: the filter may not be in place. Re-read Task 1 step 1.1 and verify the filter block is between the `isinstance` line and the `with PdfPages(...)` line.

If the **GCR-column test** fails because no `Table` is found: matplotlib may have rendered the summary into a different axis than expected. Walk all `fig.axes` and check `_cells` on every `Table` — there's likely just one summary table.

If the **GCR-column test** fails because `"GCR"` IS in headers: Task 1 step 1.2 didn't apply correctly. Re-read the file at line 247-248 and verify the column was removed.

If the **invalid-edition test** fails because the route returns 200 instead of 422: the `try: edition = Edition(request.edition)` block in the route may not be wired. Re-read Task 3 step 3.1.

- [ ] **Step 5.3: Run full pytest suite**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `111 passed, 6 skipped, 0 failed` (was 106 → +5 new tests).

- [ ] **Step 5.4: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/tests/integration/test_export_pdf.py && git commit -m "wip: row #11 — integration tests for /export-pdf (smoke, filter, GCR drop, 422s)"
```

---

## Task 6: Flip PLAN.md, run final pytest, squash to `parity:` commit

- [ ] **Step 6.1: Update PLAN.md row #11 status and header**

Open `docs/PLAN.md`. Two edits:

(a) Header status — change:

```markdown
**Status:** 10 / 12 done.
```

to:

```markdown
**Status:** 11 / 12 done.
```

(b) Row #11 — change:

```markdown
| 11 | PDF exporter — tweaks | T1 | `core/pdf_exporter.py` @ `9362083` | Exporter wired; manual visual parity. | todo |
```

to:

```markdown
| 11 | PDF exporter — tweaks | T1 | `core/pdf_exporter.py` @ `9362083` | Exporter wired; manual visual parity. | **done** |
```

- [ ] **Step 6.2: Final pytest gate**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `111 passed, 6 skipped, 0 failed`.

- [ ] **Step 6.3: Inspect commits to squash**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git log --oneline origin/main..HEAD
```

Expected ordering (top = most recent):
1. `wip: row #11 — integration tests for /export-pdf (smoke, filter, GCR drop, 422s)`
2. `wip: row #11 — register pdf_router in server.py`
3. `wip: row #11 — add POST /export-pdf route`
4. `wip: row #11 — add ExportPdfRequest schema`
5. `wip: row #11 — pdf_exporter filter water/empty + drop GCR column`
6. `docs: row #11 spec — PDF exporter (tweaks)`

The spec commit (6) is *not* squashed.

- [ ] **Step 6.4: Soft reset to spec commit and stage everything**

```bash
SPEC_COMMIT=$(git log --grep="docs: row #11 spec" --format=%H -n 1) && \
echo "Reset target (spec commit): $SPEC_COMMIT" && \
git reset --soft $SPEC_COMMIT
```

Stage all six row-#11 outputs (PLAN.md edit + 5 squashed-from-wip files):

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add \
    docs/PLAN.md \
    python/pvlayout_engine/pvlayout_core/core/pdf_exporter.py \
    python/pvlayout_engine/pvlayout_engine/schemas.py \
    python/pvlayout_engine/pvlayout_engine/routes/pdf.py \
    python/pvlayout_engine/pvlayout_engine/server.py \
    python/pvlayout_engine/tests/integration/test_export_pdf.py
```

Verify staging:

```bash
git status -s
```

Expected: 6 files staged (`A` for new files, `M` for modifications), working tree otherwise clean.

- [ ] **Step 6.5: Create the final atomic commit**

```bash
git commit -m "$(cat <<'EOF'
parity: row #11 — PDF exporter (tweaks)

Port two legacy diff items in core/pdf_exporter.py @
baseline-v1-20260429 commit 9362083:

  1. Filter at top of export_pdf — drops water bodies, failed
     results, and empty stubs from every PDF table:
       results = [r for r in results
                  if not getattr(r, "is_water", False)
                  and getattr(r, "utm_epsg", 0)
                  and r.placed_tables]
  2. Drop the "GCR" column from the summary table in
     _build_summary_figure: removes from col_headers, the per-row
     data tuple, and the totals row's empty-cell padding.

New sidecar route POST /export-pdf at
pvlayout_engine/routes/pdf.py wraps export_pdf: takes wire
LayoutResult[] + LayoutParameters + optional EnergyParameters +
edition string ("basic" / "pro" / "pro_plus"). Calls export_pdf
with layout_figure=None — the new app produces a SUMMARY-ONLY PDF
(legacy's pages 2-4: Summary, Energy, 25-yr Forecast). Page 1 is
intentionally omitted: legacy renders it from PyQt5's live
canvas, which has no server-side equivalent yet. A future row may
add a server-side _draw_layout if/when the desktop UI requires it.
Per ADR-0005 + session.py:105, exports are ungated.

ExportPdfRequest added to schemas.py; pdf_router registered under
authed in server.py.

Five integration tests in tests/integration/test_export_pdf.py:
  - test_export_pdf_smoke: 200 + valid PDF magic bytes
    (%PDF header + %%EOF terminator)
  - test_export_pdf_empty_results_returns_422
  - test_export_pdf_invalid_edition_returns_422
  - test_export_pdf_filters_water_and_empty_results: byte-size
    delta between filtered vs unfiltered runs (within 5%)
  - test_export_pdf_summary_drops_gcr_column: direct
    _build_summary_figure call + Table cell inspection

Sidecar pytest: 111 passed, 6 skipped, 0 failed (was 106 → +5).

T1 ceremony — no discovery memo. The diff and the green tests
are the audit trail.

Manual visual parity (row #11 acceptance):
  1. Generate legacy PDF: from a baseline-v1-20260429 checkout,
     run a Python one-liner: parse_kmz → run_layout_multi →
     export_pdf on phaseboundary2.kmz to /tmp/legacy.pdf.
  2. Generate new PDF: POST /export-pdf with the same fixture
     (or run export_pdf via the new pvlayout_core.* import).
  3. Open both PDFs side-by-side; verify summary table has
     identical columns (Plant / Area / MMS-Tables / Modules /
     Cap. / Tilt / Pitch / ICR — no GCR), filter excludes
     water/empty rows. Page 1 (layout plot) is missing in
     new-app PDF — expected; future row.

PLAN.md row #11 flipped to done; status header bumped 10/12 → 11/12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6.6: Final verification**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git log --oneline origin/main..HEAD
```

Expected: exactly 2 commits ahead of `origin/main`:
1. `docs: row #11 spec — PDF exporter (tweaks)`
2. `parity: row #11 — PDF exporter (tweaks)`

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `111 passed, 6 skipped, 0 failed`.

- [ ] **Step 6.7: Hand off to user**

Report:
- Pytest count (e.g., `111 passed, 6 skipped`)
- The 2 unpushed commits' shortlog
- Reminder: `git push` is the next user-controlled step
- Note that next row is #12 (KMZ exporter — wiring, T1) — the last row of the parity sweep

---

## Verification matrix

| Spec section | Plan task | Verification |
|---|---|---|
| 2.1 EDIT `pdf_exporter.py` (filter + drop GCR) | Task 1 | Step 1.5 import + 1.6 smoke + Task 5 tests |
| 2.2 EDIT `schemas.py` (`ExportPdfRequest`) | Task 2 | Step 2.2 schema verify |
| 2.3 CREATE `routes/pdf.py` | Task 3 | Step 3.2 import + Task 5 tests |
| 2.4 EDIT `server.py` (register pdf_router) | Task 4 | Step 4.3 OpenAPI path probe |
| 2.5 No other touch-points | (implicit) | Step 1.7 + 4.4 confirm no regression |
| 3 Five tests | Task 5 | 5 tests pass |
| 4 Acceptance: 0 failed pytest, route registered, PLAN flipped | Task 6 | Steps 6.2 + 6.6 |
| 4 Acceptance: atomic `parity:` commit + manual recipe | Task 6 | Steps 6.4–6.5 squash |

---

## Edge cases / known gotchas

- **Function name is `export_pdf`** in both legacy and new app — same gotcha as row #10's `export_dxf` (the route handler is named `export_pdf_route` to avoid shadowing the imported `export_pdf`).
- **`EnergyParameters` round-trip via `**model_dump()`.** Wire and core dataclass field names should match (the wire schema is generated from the core dataclass). If a `TypeError: unexpected keyword argument` surfaces during impl, add a dedicated `energy_params_to_core` adapter in `adapters.py` — small/bounded scope expansion per `feedback_scope_expansion.md`.
- **`Edition` enum value lookup.** Use `Edition(request.edition)` (value lookup) not `Edition[request.edition.upper()]` (name lookup). Enum values are lowercase (`"basic"`, `"pro"`, `"pro_plus"`); name lookup would require all-caps Python identifiers.
- **Matplotlib in headless mode.** Test file sets `matplotlib.use("Agg")` before any pyplot/figure import. Without it, on macOS the test may try to open a graphical backend and fail in CI.
- **`Table._cells` dict access.** Matplotlib's internal `Table._cells` API has been stable for 5+ years but is technically private. If a future matplotlib upgrade breaks the GCR-column unit test, the fix is to walk `_cells` differently or use the public `get_celld()` method (returns the same dict).
- **Filter test 5% byte-size threshold.** matplotlib's PDF backend writes timestamps and handle counters that vary slightly run-to-run; pure byte-equality won't work. 5% is generous — the actual delta when the filter works is typically <0.1%; when broken, an extra 2-row table grows the PDF by 5-10%.
- **Page 1 omission.** The route docstring + the schema docstring both mention this explicitly. Don't be tempted to "improve" the route by adding a layout-figure parameter — that's a future row, not this one.
- **`uv sync` strips dev extras.** Don't run bare `uv sync`. No deps change in this row, but if pytest is missing from venv after a previous experiment, run `uv sync --extra dev`.
