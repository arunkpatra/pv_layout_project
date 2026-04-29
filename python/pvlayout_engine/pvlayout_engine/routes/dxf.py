"""POST /export-dxf — export multi-result layout to AutoCAD DXF.

Row #10 of docs/PLAN.md. Wraps pvlayout_core.core.dxf_exporter.export_dxf
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
def export_dxf_route(request: ExportDxfRequest) -> Response:
    """Convert wire LayoutResult[] back to core, write DXF to tempfile,
    return as application/dxf binary.

    Streams the file via Response(content=bytes, media_type=...) — small
    enough (typical layout DXF is < 5 MB) that an in-memory buffer is
    fine; switching to StreamingResponse is a future optimization.
    """
    from pvlayout_core.core.dxf_exporter import export_dxf

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
        export_dxf(
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
