"""
Satellite Water-Body Detector  (v3 — robust, preview-capable)
==============================================================
Fetches Web-Mercator tiles, classifies water pixels, vectorises results
and returns both polygon rings AND a composite preview image (satellite
tiles with water highlighted in blue) so the caller can show the user
exactly what was found before applying exclusions to the layout.

Key reliability fixes vs v1/v2
--------------------------------
* SSL bypass  — Windows machines often fail HTTPS cert checks silently.
  We disable certificate verification for tile downloads (read-only,
  low-risk) so downloads never silently return None due to SSL errors.
* Fallback tile sources — tries two Esri endpoints; if both fail for a
  tile the composite falls back to grey (still classified, not skipped).
* Two independent detection passes (normal zoom + one zoom level lower)
  with result union — catches water bodies that are very small at one zoom.
* Adjusted thresholds tuned for Deccan-plateau semi-arid terrain where
  water appears near-black/dark-grey rather than blue.
"""

import io
import math
import ssl
import urllib.request
from typing import Callable, Dict, List, Optional, Tuple

from shapely.geometry import Polygon, MultiPolygon
from shapely.geometry import box as _sbox
from shapely.ops import unary_union

# ---------------------------------------------------------------------------
# Optional PIL / NumPy
# ---------------------------------------------------------------------------
try:
    from PIL import Image as _PilImage
    import numpy as _np
    _DEPS_OK = True
except ImportError:
    _DEPS_OK = False


def satellite_available() -> bool:
    """Return True when Pillow + NumPy are importable."""
    return _DEPS_OK


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
# Two Esri endpoints — tried in order per tile; first success wins.
_TILE_SOURCES = [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
]

# SSL context that skips certificate verification.
# Tile downloads are read-only so this carries negligible risk.
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode    = ssl.CERT_NONE

_TILE_PX     = 256      # px per tile side
_MIN_IMG_PX  = 400      # minimum stitched image dimension
_MAX_ZOOM    = 17
_MIN_ZOOM    = 13
_MIN_AREA_M2 = 150      # discard polygons smaller than this
_CELL_PX     = 4        # downsampling cell size for vectorisation
_TIMEOUT_S   = 15       # per-tile HTTP timeout


# ---------------------------------------------------------------------------
# Coordinate maths
# ---------------------------------------------------------------------------

def _tile_xy(lat: float, lon: float, z: int) -> Tuple[int, int]:
    n = 1 << z
    tx = int((lon + 180.0) / 360.0 * n)
    s  = max(-0.9999, min(0.9999, math.sin(math.radians(lat))))
    ty = int((1.0 - math.log((1.0 + s) / (1.0 - s)) / (2 * math.pi)) / 2.0 * n)
    return tx, ty


def _tile_to_latlon(tx: float, ty: float, z: int) -> Tuple[float, float]:
    n   = 1 << z
    lon = tx / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * ty / n))))
    return lat, lon


def _pixel_to_latlon(px, py, tile_x0, tile_y0, z) -> Tuple[float, float]:
    return _tile_to_latlon(tile_x0 + px / _TILE_PX, tile_y0 + py / _TILE_PX, z)


def _approx_area_m2(poly: Polygon) -> float:
    c   = poly.centroid
    mlat = 111_320.0
    mlon = 111_320.0 * math.cos(math.radians(c.y))
    return poly.area * mlat * mlon


def _pick_zoom(lat_span: float, lon_span: float) -> int:
    for z in range(_MAX_ZOOM, _MIN_ZOOM - 1, -1):
        n     = 1 << z
        px_ns = lat_span / 180.0 * n * _TILE_PX
        px_ew = lon_span / 360.0 * n * _TILE_PX
        if min(px_ns, px_ew) >= _MIN_IMG_PX:
            return z
    return _MIN_ZOOM


# ---------------------------------------------------------------------------
# Tile fetching — with SSL bypass and multi-source fallback
# ---------------------------------------------------------------------------

def _fetch_tile(z: int, x: int, y: int):
    """Try each tile source; return first PIL Image that succeeds, else None."""
    for url_tmpl in _TILE_SOURCES:
        url = url_tmpl.format(z=z, x=x, y=y)
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 PVLayoutTool/3.0",
                    "Accept":     "image/webp,image/jpeg,image/*",
                },
            )
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S,
                                        context=_SSL_CTX) as resp:
                data = resp.read()
                if len(data) < 200:       # tile server returned empty/error tile
                    continue
                return _PilImage.open(io.BytesIO(data)).convert("RGB")
        except Exception:
            continue
    return None


def _stitch(tx0, ty0, tx1, ty1, z, cb, base_pct):
    """Download and stitch all tiles in the bounding box into one RGB image."""
    cols     = tx1 - tx0 + 1
    rows     = ty1 - ty0 + 1
    composite = _PilImage.new("RGB", (cols * _TILE_PX, rows * _TILE_PX), (100, 100, 100))
    n_total  = cols * rows
    done     = 0
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            tile = _fetch_tile(z, tx, ty)
            if tile:
                composite.paste(tile, ((tx - tx0) * _TILE_PX,
                                       (ty - ty0) * _TILE_PX))
            done += 1
            if cb and done % max(1, n_total // 10) == 0:
                pct = base_pct + done * 25 // n_total
                cb(f"Fetching tiles … {done}/{n_total}", pct)
    return composite


# ---------------------------------------------------------------------------
# Morphological helpers (pure NumPy, no scipy)
# ---------------------------------------------------------------------------

def _box_mean(arr, radius: int):
    """O(N) uniform box filter via integral images."""
    h, w  = arr.shape
    S     = _np.zeros((h + 1, w + 1), dtype=_np.float64)
    S[1:, 1:] = _np.cumsum(_np.cumsum(arr.astype(_np.float64), axis=0), axis=1)
    r  = radius
    ya = _np.clip(_np.arange(h) - r,     0, h).reshape(-1, 1)
    yb = _np.clip(_np.arange(h) + r + 1, 0, h).reshape(-1, 1)
    xa = _np.clip(_np.arange(w) - r,     0, w).reshape(1, -1)
    xb = _np.clip(_np.arange(w) + r + 1, 0, w).reshape(1, -1)
    total = S[yb, xb] - S[ya, xb] - S[yb, xa] + S[ya, xa]
    count = (yb - ya) * (xb - xa)
    return (total / _np.maximum(count, 1)).astype(_np.float32)


def _morph(mask, radius: int, dilate: bool):
    """Binary erosion (dilate=False) or dilation (dilate=True) — square SE."""
    out = mask.copy()
    h, w = mask.shape
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dy == 0 and dx == 0:
                continue
            ys = max(0, dy);   ye = h + min(0, dy)
            xs = max(0, dx);   xe = w + min(0, dx)
            yd = max(0, -dy);  yd2 = h + min(0, -dy)
            xd = max(0, -dx);  xd2 = w + min(0, -dx)
            shifted = _np.zeros_like(mask)
            shifted[yd:yd2, xd:xd2] = mask[ys:ye, xs:xe]
            if dilate:
                out |= shifted
            else:
                out &= shifted
    return out


# ---------------------------------------------------------------------------
# Water-pixel classifier — tuned for Deccan-plateau semi-arid terrain
# ---------------------------------------------------------------------------

def _water_mask(arr) -> "_np.ndarray":
    """
    Returns boolean mask (True = water).

    Rules (any one triggers water classification):
      1. Absolutely dark   – brightness < 75, B ≥ R×0.80
         Catches turbid Indian tanks/ponds (near-black appearance).
      2. Locally dark      – brightness < 58 % of 30-px neighbourhood mean
                           AND brightness < 110  AND B ≥ R×0.75
         Catches dark ponds surrounded by bright red Deccan soil.
      3. Blue-dominant     – B > R×1.15, B > G×1.05, brightness < 160
         Catches clear reservoirs/lakes.
      4. Turbid grey-brown – brightness < 90, |R-G|<25, |R-B|<30, B≥R×0.78
         Catches silty water (low colour saturation, dark).

    Post-rules exclusions:
      • NDVI proxy > 0.10 → vegetation (scrub, crops) → excluded.
      • brightness ≥ 150  → bright surface (buildings, sand) → excluded.

    Morphological clean-up: erosion radius 3, dilation radius 5.
    """
    r   = arr[:, :, 0].astype(_np.float32)
    g   = arr[:, :, 1].astype(_np.float32)
    b   = arr[:, :, 2].astype(_np.float32)
    bright = (r + g + b) / 3.0

    local_mean = _box_mean(bright, radius=30)

    abs_dark   = (bright < 75) & (b >= r * 0.80)
    local_dark = (bright < local_mean * 0.58) & (bright < 110) & (b >= r * 0.75)
    blue_dom   = (b > r * 1.15) & (b > g * 1.05) & (bright < 160)
    turbid     = ((bright < 90) & (_np.abs(r - g) < 25) &
                  (_np.abs(r - b) < 30) & (b >= r * 0.78))

    raw  = abs_dark | local_dark | blue_dom | turbid
    ndvi = (g - r) / (g + r + 1e-3)
    raw  = raw & ~((ndvi > 0.10) & (bright > 50))   # exclude vegetation
    raw  = raw & (bright < 150)                      # exclude bright surfaces

    mask = _morph(raw, radius=3, dilate=False)
    mask = _morph(mask, radius=5, dilate=True)
    return mask


# ---------------------------------------------------------------------------
# Vectorisation
# ---------------------------------------------------------------------------

def _mask_to_polygons(mask, tile_x0, tile_y0, z) -> List[Polygon]:
    h, w = mask.shape
    cs   = _CELL_PX
    cell_polys = []
    for cy in range(0, h - cs + 1, cs):
        for cx in range(0, w - cs + 1, cs):
            if mask[cy:cy + cs, cx:cx + cs].sum() < 0.50 * cs * cs:
                continue
            lat0, lon0 = _pixel_to_latlon(cx,      cy,      tile_x0, tile_y0, z)
            lat1, lon1 = _pixel_to_latlon(cx + cs, cy + cs, tile_x0, tile_y0, z)
            cell_polys.append(_sbox(
                min(lon0, lon1), min(lat0, lat1),
                max(lon0, lon1), max(lat0, lat1),
            ))
    if not cell_polys:
        return []
    try:
        merged = unary_union(cell_polys).simplify(0.00005, preserve_topology=True)
        if merged.is_empty:
            return []
        return list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
    except Exception:
        return []


def _clip_and_filter(raw_polys, b_poly) -> List[List[Tuple[float, float]]]:
    """Clip detected polygons to plant boundary, filter small areas."""
    kept = []
    for wp in raw_polys:
        try:
            clipped = wp.intersection(b_poly)
            if not clipped or clipped.is_empty:
                continue
            geoms = list(clipped.geoms) if hasattr(clipped, "geoms") else [clipped]
            for g in geoms:
                parts = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
                for part in parts:
                    if part.is_empty or part.geom_type != "Polygon":
                        continue
                    if _approx_area_m2(part) < _MIN_AREA_M2:
                        continue
                    ring = list(part.exterior.coords)
                    if ring[0] != ring[-1]:
                        ring.append(ring[0])
                    kept.append([(float(x), float(y)) for x, y in ring])
        except Exception:
            pass
    return kept


# ---------------------------------------------------------------------------
# Preview image builder
# ---------------------------------------------------------------------------

def _build_preview(composite_img, mask) -> "_PilImage.Image":
    """
    Return a copy of composite_img with water pixels tinted vivid cyan-blue
    so the user can immediately see what was detected.
    """
    arr     = _np.array(composite_img, dtype=_np.uint8).copy()
    water   = mask.astype(bool)
    # Blend: 35 % original + 65 % cyan (0, 160, 255)
    arr[water, 0] = (arr[water, 0] * 0.35).astype(_np.uint8)
    arr[water, 1] = (arr[water, 1] * 0.35 + 160 * 0.65).astype(_np.uint8)
    arr[water, 2] = (arr[water, 2] * 0.35 + 255 * 0.65).astype(_np.uint8)
    return _PilImage.fromarray(arr)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_with_preview(
    boundaries,
    progress_callback: Optional[Callable[[str, int], None]] = None,
) -> Tuple[Dict[str, List[List[Tuple[float, float]]]], Dict[str, "_PilImage.Image"]]:
    """
    Detect water bodies and return BOTH polygon rings and preview images.

    Parameters
    ----------
    boundaries : list[BoundaryInfo]
    progress_callback : callable(message, percent) | None

    Returns
    -------
    detections : {boundary_name: [(lon, lat) rings]}
    previews   : {boundary_name: PIL.Image with cyan water overlay | None}

    Notes
    -----
    Seasonal channels (nalah, dry streams) that are DRY at image capture time
    cannot be detected.  These must be drawn manually in the KMZ file.
    """
    if not _DEPS_OK:
        raise RuntimeError(
            "Satellite detection requires Pillow and NumPy.\n"
            "Install with:  pip install Pillow numpy"
        )

    def _cb(msg, pct):
        if progress_callback:
            progress_callback(msg, max(0, min(100, pct)))

    detections: Dict[str, List] = {}
    previews:   Dict[str, object] = {}

    # Defensive against legacy's dormant AttributeError: BoundaryInfo at
    # baseline-v1-20260429 has no is_water field. Today this means is_water
    # is always False for items in `boundaries` (top-level water polygons
    # are routed to water_obstacles[] by row #4's parser, not into
    # boundaries[]). If a future row adds is_water (e.g. for water-named
    # top-level polygons that survive into boundaries), the existing
    # semantics here still hold without code change.
    plant_bounds = [b for b in boundaries if not getattr(b, "is_water", False)]
    n = max(len(plant_bounds), 1)

    for bidx, boundary in enumerate(boundaries):
        if getattr(boundary, "is_water", False):
            detections[boundary.name] = []
            previews[boundary.name]   = None
            continue

        base = bidx * 100 // n
        _cb(f"Preparing '{boundary.name}' …", base)

        lons = [c[0] for c in boundary.coords]
        lats = [c[1] for c in boundary.coords]
        lon_min, lon_max = min(lons), max(lons)
        lat_min, lat_max = min(lats), max(lats)

        # 12 % padding so boundary edges don't clip water bodies near the edge
        pad_lat = max((lat_max - lat_min) * 0.12, 0.001)
        pad_lon = max((lon_max - lon_min) * 0.12, 0.001)
        lat_min -= pad_lat; lat_max += pad_lat
        lon_min -= pad_lon; lon_max += pad_lon

        z = _pick_zoom(lat_max - lat_min, lon_max - lon_min)

        tx0, ty0 = _tile_xy(lat_max, lon_min, z)
        tx1, ty1 = _tile_xy(lat_min, lon_max, z)
        if tx1 < tx0: tx0, tx1 = tx1, tx0
        if ty1 < ty0: ty0, ty1 = ty1, ty0

        n_tiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
        _cb(f"Fetching {n_tiles} tile(s) — zoom {z} — '{boundary.name}' …", base)

        composite = _stitch(tx0, ty0, tx1, ty1, z, progress_callback, base)

        _cb("Analysing pixels for water …", base + 28)
        arr  = _np.array(composite, dtype=_np.uint8)
        mask = _water_mask(arr)

        # ── Second pass at one zoom lower for larger water bodies ──────────
        # Large reservoirs / lakes may be smeared at high zoom; try lower too.
        if z > _MIN_ZOOM:
            z2 = z - 1
            tx0b, ty0b = _tile_xy(lat_max, lon_min, z2)
            tx1b, ty1b = _tile_xy(lat_min, lon_max, z2)
            if tx1b < tx0b: tx0b, tx1b = tx1b, tx0b
            if ty1b < ty0b: ty0b, ty1b = ty1b, ty0b
            comp2 = _stitch(tx0b, ty0b, tx1b, ty1b, z2, None, base)
            arr2  = _np.array(comp2, dtype=_np.uint8)
            mask2 = _water_mask(arr2)
            # Convert mask2 polygons to lat/lon and union with mask1 polygons
            raw2  = _mask_to_polygons(mask2, tx0b, ty0b, z2)
        else:
            raw2 = []

        _cb("Vectorising water areas …", base + 42)
        raw1 = _mask_to_polygons(mask, tx0, ty0, z)
        raw_all = raw1 + raw2

        b_poly = Polygon(boundary.coords)
        if not b_poly.is_valid:
            b_poly = b_poly.buffer(0)

        kept = _clip_and_filter(raw_all, b_poly)
        detections[boundary.name] = kept

        # Build preview image (only for primary zoom — more useful to user)
        previews[boundary.name] = _build_preview(composite, mask)

        _cb(
            f"✔ Found {len(kept)} water area(s) in '{boundary.name}'.",
            (bidx + 1) * 100 // n,
        )

    return detections, previews


def detect_water_bodies(
    boundaries,
    progress_callback=None,
) -> Dict[str, List[List[Tuple[float, float]]]]:
    """Convenience wrapper — returns only detections (no preview images)."""
    detections, _ = detect_with_preview(boundaries, progress_callback)
    return detections
