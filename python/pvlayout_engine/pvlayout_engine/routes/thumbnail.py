"""POST /layout/thumbnail — render a single LayoutResult to WebP bytes.

SP1 / B23 cross-repo flow. Called by the desktop's P6 Generate-Layout
flow after `/layout` returns and before B7 mints the thumbnail upload
URL: sidecar produces the WebP bytes here, desktop PUTs them to the
deterministic-key S3 path that B17 + B24 already sign blindly.

Per memo v3 §5, the route is a thin wrapper around
`pvlayout_engine.thumbnail.render_thumbnail` — all geometry / encoding
logic lives there. Per ADR-0005, like other render-only routes,
this endpoint is ungated at the entitlements layer (no
`require_feature` dependency).
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from pvlayout_engine.schemas import LayoutThumbnailRequest
from pvlayout_engine.thumbnail import render_thumbnail


router = APIRouter(tags=["layout"])


@router.post(
    "/layout/thumbnail",
    summary="Render a single LayoutResult to a 400×300 WebP preview",
    response_class=Response,
    responses={200: {"content": {"image/webp": {}}}},
)
def layout_thumbnail_route(request: LayoutThumbnailRequest) -> Response:
    """Render the supplied wire LayoutResult as a 400×300 WebP image
    (q=85, ≤50 KB). Body is empty WebP bytes; the upstream caller
    (desktop's P6 flow) PUTs the response straight to S3 against the
    deterministic key path the backend signs from B17 + B24.
    """
    data = render_thumbnail(request.result)
    return Response(content=data, media_type="image/webp")
