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
