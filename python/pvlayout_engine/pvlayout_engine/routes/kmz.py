"""POST /export-kmz — export multi-result layout to KMZ.

Row #12 of docs/PLAN.md. Wraps pvlayout_core.core.kmz_exporter.export_kmz
in a FastAPI route. Per ADR-0005 + session.py:105, exports are ungated.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response

from pvlayout_engine.adapters import params_to_core, result_to_core
from pvlayout_engine.schemas import ExportKmzRequest


router = APIRouter(tags=["export"])


@router.post(
    "/export-kmz",
    summary="Export multi-result layout to a KMZ file",
    response_class=Response,
    responses={200: {"content": {"application/vnd.google-earth.kmz": {}}}},
)
def export_kmz_route(request: ExportKmzRequest) -> Response:
    """Convert wire LayoutResult[] back to core, write KMZ to tempfile,
    return as application/vnd.google-earth.kmz binary.
    """
    from pvlayout_core.core.kmz_exporter import export_kmz

    if not request.results:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="results must be non-empty",
        )

    core_results = [result_to_core(r) for r in request.results]
    core_params = params_to_core(request.params)

    with tempfile.NamedTemporaryFile(suffix=".kmz", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        export_kmz(core_results, core_params, str(tmp_path))
        data = tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)

    return Response(
        content=data,
        media_type="application/vnd.google-earth.kmz",
        headers={"Content-Disposition": 'attachment; filename="layout.kmz"'},
    )
