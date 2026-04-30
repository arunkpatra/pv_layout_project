"""Thumbnail rendering for SP1 / B23 cross-repo flow.

Produces a 400×300 WebP preview image from a wire `LayoutResult` —
boundary outline + placed PV table footprints + ICR rectangles.
Cables / lightning arresters / string inverters are intentionally
omitted: at thumbnail scale they're sub-pixel and add visual noise.
Labels, scale bar, and the legend are also dropped — gallery cards
are too small to read them.

The output is bounded by memo v3 §10 Q4: WebP q=85, 50 KB ceiling.
matplotlib + Pillow combined produces 5–15 KB on dense layouts at
this resolution; the cap is comfortable headroom that catches
accidentally-uncompressed PNG PUTs (which would hit ~80–150 KB at
400×300).

Coordinate space: WGS84 (lon, lat) treated as planar. At single-
site scale (boundaries spanning <2 km), lon/lat distortion is
negligible for a thumbnail. `ax.set_aspect('equal')` preserves the
rendered aspect ratio against typical landscape-leaning plant
boundaries; matplotlib auto-bounds the data extent into the figure.

Per memo §5, this file owns the drawing primitives in a shared
form so a future "PDF page 1 layout figure" row can reuse them
without re-implementing the geometry walk.
"""
from __future__ import annotations

from io import BytesIO

import matplotlib

# Headless backend — must precede any pyplot / figure import. The
# sidecar runs without a display server and would otherwise pick up
# Qt / Tk by default.
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from PIL import Image  # noqa: E402

from pvlayout_engine.schemas import LayoutResult  # noqa: E402


# ---------------------------------------------------------------------------
# Decisions locked in memo v3 §2.
# ---------------------------------------------------------------------------

THUMBNAIL_W_PX = 400
THUMBNAIL_H_PX = 300
THUMBNAIL_DPI = 100
THUMBNAIL_FIGSIZE_IN = (
    THUMBNAIL_W_PX / THUMBNAIL_DPI,
    THUMBNAIL_H_PX / THUMBNAIL_DPI,
)
THUMBNAIL_QUALITY = 85
THUMBNAIL_METHOD = 4  # Pillow speed/size balance default; q=85 + method=4 ≈ 5–15 KB

# Subdued palette — the sidecar doesn't see the desktop's theme tokens,
# so the colours are baked. Chosen to read on both light + dark card
# surfaces without being garish at thumbnail scale.
BOUNDARY_STROKE = "#2A2A28"
TABLE_FILL = "#7B8FA1"
ICR_FILL = "#3D4A5A"
ICR_STROKE = "#1F2730"
BG_FACECOLOR = "#FAFAF9"  # Warm off-white — matches the light-theme ground


def render_thumbnail(result: LayoutResult) -> bytes:
    """Render a wire LayoutResult to WebP bytes (400×300, q=85).

    Returns:
        WebP image bytes ready for an HTTP `image/webp` response or an
        S3 PUT against `RUN_RESULT_SPEC.thumbnail`. Always under 50 KB
        for layouts the solver produces; the upstream bytes-cap on B7
        is the authoritative guard.

    Notes:
        - Empty `boundary_wgs84` results are valid (rare; happens when
          the upstream solver couldn't produce a usable polygon). The
          renderer emits a blank thumbnail rather than raising — the
          caller's `<img onError>` fallback handles "no useful preview"
          symmetrically with "PUT failed" anyway.
        - `bbox_inches=None` keeps the saved PNG at exactly the figure
          size (400×300). `bbox_inches="tight"` would trim padding and
          drift the dimensions per-call.
    """
    fig, ax = plt.subplots(
        figsize=THUMBNAIL_FIGSIZE_IN,
        dpi=THUMBNAIL_DPI,
        facecolor=BG_FACECOLOR,
    )
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_facecolor(BG_FACECOLOR)
    # Strip the default 0.05-rel margin around the data extent —
    # we want the boundary to fill the canvas, not float in whitespace.
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

    # Plant boundary — thin outline of the perimeter polygon.
    if result.boundary_wgs84:
        xs = [p[0] for p in result.boundary_wgs84]
        ys = [p[1] for p in result.boundary_wgs84]
        ax.plot(xs, ys, color=BOUNDARY_STROKE, linewidth=0.8)

    # Tables — the visual signature of the project. Filled rectangles,
    # no stroke (at 400×300 the stroke would dominate the fill).
    for ring in result.placed_tables_wgs84:
        if not ring:
            continue
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        ax.fill(xs, ys, color=TABLE_FILL, linewidth=0)

    # ICRs — slightly larger than tables, drawn on top with a thin stroke
    # so they read as "control buildings" rather than "more panels".
    for ring in result.placed_icrs_wgs84:
        if not ring:
            continue
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        ax.fill(xs, ys, color=ICR_FILL, edgecolor=ICR_STROKE, linewidth=0.5)

    # PNG → BytesIO → PIL Image → WebP. matplotlib doesn't write WebP
    # directly (Pillow does, and Pillow is already a dep via Row #5).
    png_buf = BytesIO()
    fig.savefig(
        png_buf,
        format="png",
        dpi=THUMBNAIL_DPI,
        bbox_inches=None,
        pad_inches=0,
        facecolor=BG_FACECOLOR,
    )
    plt.close(fig)
    png_buf.seek(0)

    img = Image.open(png_buf).convert("RGB")
    webp_buf = BytesIO()
    img.save(
        webp_buf,
        format="webp",
        quality=THUMBNAIL_QUALITY,
        method=THUMBNAIL_METHOD,
    )
    return webp_buf.getvalue()
