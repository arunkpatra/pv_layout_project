"""POST /detect-water — autodetect water bodies from satellite imagery.

Row #5 of docs/PLAN.md. Wraps pvlayout_core.core.satellite_water_detector
in a FastAPI route. Sync endpoint; takes 30-60 s on real network.
Mocked-tile tests run in milliseconds.
"""

from __future__ import annotations

import base64
import io
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from pvlayout_engine.routes.layout import _boundaries_to_core
from pvlayout_engine.schemas import (
    DetectWaterRequest,
    DetectWaterResponse,
    WaterDetectionPerBoundary,
)


router = APIRouter(tags=["water-detection"])


@router.post(
    "/detect-water",
    response_model=DetectWaterResponse,
    summary="Detect water bodies from satellite imagery for each boundary",
)
def detect_water(request: DetectWaterRequest) -> DetectWaterResponse:
    """Run the satellite water detector on each boundary in the parsed KMZ.

    Synchronous; production wall-clock 30-60 s depending on boundary size +
    tile-fetch latency. Returns one entry per boundary: detected water
    polygon rings (lon, lat) plus an optional base64 PNG preview (stitched
    satellite tiles with cyan tint over detected water).
    """
    from pvlayout_core.core.satellite_water_detector import (
        detect_with_preview,
        satellite_available,
    )

    if not satellite_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Satellite detection requires Pillow + NumPy on the sidecar.",
        )

    if not request.parsed_kmz.boundaries:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="parsed_kmz contains no boundaries",
        )

    core_boundaries = _boundaries_to_core(request.parsed_kmz.boundaries)
    detections, previews = detect_with_preview(core_boundaries, progress_callback=None)

    out: list[WaterDetectionPerBoundary] = []
    for b in core_boundaries:
        rings = detections.get(b.name, [])
        preview_b64: Optional[str] = None
        if request.return_previews:
            img = previews.get(b.name)
            if img is not None:
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                preview_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        out.append(
            WaterDetectionPerBoundary(
                boundary_name=b.name,
                rings_wgs84=[[(lon, lat) for (lon, lat) in ring] for ring in rings],
                preview_png_b64=preview_b64,
            )
        )

    return DetectWaterResponse(results=out)
