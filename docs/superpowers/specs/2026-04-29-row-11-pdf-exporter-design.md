# Row #11 Spec — PDF exporter (tweaks)

**PLAN.md row:** [docs/PLAN.md](../../PLAN.md) row #11 (T1).
**Source:** legacy `core/pdf_exporter.py` @ `baseline-v1-20260429` commit `9362083`.
**Acceptance (PLAN.md):** Exporter wired; manual visual parity.

---

## 1. Goal

Port two legacy diff items in `pdf_exporter.py` (filter water/empty results from every PDF table; drop the "GCR" column from the summary table), and add a new sidecar `POST /export-pdf` route that wraps `export_pdf` to produce summary-only PDFs (pages 2-4 of legacy's PDF).

T1 ceremony — port + sidecar pytest + commit. No discovery memo. The acceptance is "manual visual parity" (the user opens legacy and new PDFs and eyeballs them); automated structure-parity is **out of scope** for this row.

**Page 1 (layout plot) is intentionally omitted** in the new-app PDF for this row. Legacy renders it from PyQt5's live `self.figure`, which has no server-side equivalent yet. A future row may add a server-side `_draw_layout` if/when the desktop UI requires page 1; for now, the route passes `layout_figure=None` and the PDF starts at the Summary page (formerly page 2).

---

## 2. Port surface

### 2.1 EDIT `pvlayout_core/core/pdf_exporter.py`

Two surgical edits inside the existing `export_pdf` function. The function name is `export_pdf` in both legacy and new app — no rename.

**(a) Filter water / failed / empty results at top of `export_pdf`.**

After the existing `isinstance(results, LayoutResult)` guard (line ~108), insert the legacy filter:

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

`is_water` is read defensively via `getattr(..., False)` — same pattern legacy uses. The field doesn't exist on `LayoutResult` and that's intentional; water boundaries are filtered upstream by `kmz_parser` into `BoundaryInfo.water_obstacles`, but the defensive `getattr` keeps the filter robust against future additions.

**(b) Drop the `"GCR"` column from the summary table.**

Inside `_build_summary_figure(...)`, three sub-edits:

1. `col_headers` (line ~247) — current new-app code:
   ```python
   col_headers = ["Plant", "Area\n(acres)", "MMS-\nTables", "Modules",
                  "Cap.\n(MWp)", "Tilt\n(°)", "Pitch\n(m)", "GCR", "ICR"]
   ```
   Replace with:
   ```python
   col_headers = ["Plant", "Area\n(acres)", "MMS-\nTables", "Modules",
                  "Cap.\n(MWp)", "Tilt\n(°)", "Pitch\n(m)", "ICR"]
   ```

2. Per-row data tuple (around line ~280) — remove the line:
   ```python
   f"{r.gcr_achieved:.3f}",
   ```

3. Totals row (around line ~312) — current code has three trailing empty cells `"", "", ""` for the three numeric columns Tilt/Pitch/GCR. Replace with two empties `"", ""` (Tilt + Pitch only).

**No other changes** to `pdf_exporter.py`. The 6 `core.X`/`models.X` imports in the legacy diff are already correct (`pvlayout_core.X`) in the new app — do **not** regress to legacy's bare prefix.

### 2.2 EDIT `pvlayout_engine/pvlayout_engine/schemas.py`

Add the new request schema after `ExportDxfRequest` (which lives just before the `# Health + error payloads` block):

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

### 2.3 CREATE `pvlayout_engine/pvlayout_engine/routes/pdf.py`

Mirrors `routes/dxf.py` (row #10):

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

### 2.4 EDIT `pvlayout_engine/pvlayout_engine/server.py`

Add the import next to the other route imports:

```python
from pvlayout_engine.routes.pdf import router as pdf_router
```

Register `pdf_router` under `authed`, immediately after `dxf_router` (which was added in row #10):

```python
    # --- Export route (Row #11) ---------------------------------------------
    # /export-pdf — multi-result layout to PDF (summary pages); token-gated.
    # Per ADR-0005, exports are ungated at the entitlements layer.
    authed.include_router(pdf_router)
```

### 2.5 No other touch-points

- `LayoutResult` Pydantic schema: unchanged.
- `EnergyParameters` Pydantic schema: unchanged. The `**model_dump()` round-trip into the dataclass should work because field names match. Verify during impl; if a `TypeError: unexpected keyword argument` surfaces, add a dedicated `energy_params_to_core` adapter in `adapters.py`.
- `result_to_core` / `params_to_core` adapters: reused.
- No new dependencies (`matplotlib>=3.7` already in `pyproject.toml`).

---

## 3. Tests

**File:** `python/pvlayout_engine/tests/integration/test_export_pdf.py` (new, ~150 lines).

PDF inspection is intentionally lightweight — per the row's "manual visual parity" acceptance, the user eyeballs the rendered PDF; the automated tests verify HTTP contract + the two specific tweaks from the legacy diff. No `pikepdf` / `pdfplumber` dep added.

### 3.1 Module-scoped fixtures

**`core_layout_results`** — same shape as row #10. Run `parse_kmz + run_layout_multi` on `phaseboundary2.kmz`, filter to valid results.

**`export_request_body`** — wire-shape body with `energy_params=None` (summary-only PDF), `edition="pro_plus"`, default `LayoutParameters`.

**`client`** — TestClient on `build_app` with `TEST_TOKEN`.

### 3.2 Test cases

**`test_export_pdf_smoke(client, export_request_body)`** — `POST /export-pdf` returns 200, `content-type: application/pdf`, `Content-Disposition` includes `"layout.pdf"`. Assert response body starts with `b"%PDF"` (4-byte magic) and contains `b"%%EOF"` (PDF terminator). No deeper inspection — that's the manual-parity bar.

**`test_export_pdf_filters_water_and_empty_results(core_layout_results, tmp_path)`** — call `export_pdf` directly (not via route) twice:

1. `export_pdf([valid_result], params, path_a, layout_figure=None, energy_params=None, edition=Edition.PRO_PLUS)` → bytes_a
2. Build a second list with the valid result + a stub `LayoutResult()` (empty `placed_tables`, `utm_epsg=0`) + a `LayoutResult(utm_epsg=0)` (failed). Call `export_pdf([valid, stub, failed], ...)` → bytes_b

Assert `len(bytes_a) > 0` and `abs(len(bytes_a) - len(bytes_b)) < max(len(bytes_a), len(bytes_b)) * 0.05` (within 5%). If the filter works, the two PDFs are nearly byte-identical (same valid result rendered; the stub/failed entries are dropped before `_build_summary_figure` runs). If the filter were absent, the unfiltered PDF would have extra summary rows and grow noticeably.

**`test_export_pdf_summary_drops_gcr_column()`** — direct unit test of the column-header change. Call `_build_summary_figure(...)` on a synthetic 2-result fixture into a fresh matplotlib `Figure`. Walk the figure's axes for `matplotlib.table.Table` instances; for each table, read `_cells[(0, col_idx)].get_text().get_text()` for col_idx in `range(ncols)` to extract header strings. Assert `"GCR"` not in the collected header set; assert `"Pitch"` and `"ICR"` (the columns adjacent to where GCR used to be) are both present.

**`test_export_pdf_empty_results_returns_422(client)`** — `POST /export-pdf` with `results=[]` returns 422 with `"results must be non-empty"`.

**`test_export_pdf_invalid_edition_returns_422(client, export_request_body)`** — `POST /export-pdf` with `edition="enterprise"` returns 422 with the "expected one of: basic, pro, pro_plus" error message. Smoke check that the route's edition-mapping path is hit.

### 3.3 No structure-parity-with-legacy test

Row #10 had `test_export_dxf_structure_parity_with_legacy` because DXF is parseable by `ezdxf`. PDFs aren't equivalently introspectable without a heavy dep. Per the row's "manual visual parity" acceptance, structural automated parity is explicitly out of scope.

### 3.4 Manual visual-parity recipe (in commit message)

The final `parity:` commit message body documents a 3-step manual check so future readers (and Arun) know how to validate:

```
Manual visual parity (T1 acceptance):
  1. legacy: `cd /Users/arunkpatra/codebase/PVlayout_Advance && \
     git checkout baseline-v1-20260429 && python -c \
     "from core.pdf_exporter import export_pdf; \
      from core.kmz_parser import parse_kmz; \
      from core.layout_engine import run_layout_multi; \
      from models.project import LayoutParameters; \
      p = parse_kmz('phaseboundary2.kmz'); \
      r = run_layout_multi(p.boundaries, LayoutParameters(), p.centroid_lat, p.centroid_lon); \
      export_pdf(r, LayoutParameters(), '/tmp/legacy.pdf')"`
  2. new: `curl -X POST http://localhost:7321/export-pdf ...` (or invoke via desktop)
  3. open both PDFs side-by-side; verify summary table has identical
     columns (Plant / Area / MMS-Tables / Modules / Cap. / Tilt / Pitch / ICR
     — no GCR), filter excludes water/empty rows. Page 1 (layout plot)
     is missing in new-app PDF — expected; future row.
```

This recipe + the green automated tests + the diff are the audit trail per T1.

---

## 4. Acceptance criteria

Mapped to PLAN.md row #11's "Acceptance" + tier ceremony:

1. `uv run pytest tests/ -q` from `python/pvlayout_engine` is **green**. Target: prior `106 passed → ~111 passed`, **6 skipped**, **0 failed** (5 new integration tests).
2. `POST /export-pdf` is registered (visible in `/openapi.json`) and reachable; smoke test confirms 200 + `application/pdf` + valid PDF magic bytes.
3. `test_export_pdf_filters_water_and_empty_results` verifies the filter via byte-size delta.
4. `test_export_pdf_summary_drops_gcr_column` verifies via direct `_build_summary_figure` call that `"GCR"` is not in the rendered table headers.
5. PLAN.md row #11 `Status` flipped to `done`; status header bumped `10 / 12 done` → `11 / 12 done`.
6. Atomic commit per row: `parity: row #11 — PDF exporter (tweaks)`. Intra-row `wip:` checkpoints; squash before close. Manual visual-parity recipe in the commit-message body.

---

## 5. Out of scope (deferred)

- **Page 1 (layout plot) in the new-app PDF.** A future row (likely T2) adds a server-side `_draw_layout` if/when the desktop UI requires it.
- **Frontend export-PDF button wiring.** Post-parity per CLAUDE.md §2.
- **Edition / feature gating.** Per `session.py:105` and ADR-0005, exports are ungated.
- **Discovery memo.** T1 doesn't require one. The legacy diff is two cosmetic-table tweaks, no solar-domain decisions.
- **KMZ exporter (row #12).** Sibling row, not blocked by this one.
- **Heavy PDF parser dep** (`pikepdf` / `pdfplumber`). Tests use byte-magic + byte-size checks + direct figure-object inspection — no new deps.
- **Stale `session.py:7` comment** (mentions `/export/dxf` as feature-gated — same nit as row #10). Not scoped here unless it's a one-character edit during impl.

---

## 6. Pre-implementation operational notes

- Verify `EnergyParameters(**request.energy_params.model_dump())` round-trips during Task 3 (route impl). If field shapes drift, add `energy_params_to_core` adapter — small/bounded in-row fix per `feedback_scope_expansion.md`.
- `Edition` enum values are lowercase (`"basic"`, `"pro"`, `"pro_plus"`) — `Edition(request.edition)` is the value-lookup path. `Edition[name]` would be the name-lookup path (which uses uppercase Python identifiers); use the value path for the wire string.
- Matplotlib's `Table._cells[(row, col)]` API has been stable for 5+ years; if a future matplotlib upgrade breaks the GCR-column unit test, the fix is to walk `_cells` differently (it's a dict keyed by `(row, col)` tuples).
- No `pyproject.toml` change → no `uv sync --extra dev` needed.
- Legacy reference repo at `baseline-v1-20260429` is needed only for manual visual-parity comparison; no automated cross-compare in this row, so no `pytest.skip` machinery.
