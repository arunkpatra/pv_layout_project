# Row #5 — Satellite water-body detection (design)

**PLAN row:** [`docs/PLAN.md`](../../PLAN.md) row #5
**Tier:** T3 (port + parity test + deferred-review discovery memo)
**Source:** legacy `core/satellite_water_detector.py` (new file) @ branch `baseline-v1-20260429`, originating commit `9362083`
**Target:** `python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py`
**Acceptance:** sidecar pytest green; bit-exact `_water_mask` parity against legacy on synthetic RGB array; `POST /detect-water` route reachable with documented request/response shape; discovery memo committed.
**Date:** 2026-04-29

---

## 1. Goal

Port legacy `core/satellite_water_detector.py` (441 lines, new file) into the new project verbatim. Then expose it via a new sidecar route `POST /detect-water` so a future React UI can call it to replicate legacy's two-phase dialog (progress → review-with-preview).

The detector fetches Esri World Imagery tiles, classifies water pixels using four rules tuned for Deccan-plateau / India semi-arid terrain (absolute-dark, locally-dark, blue-dominant, turbid grey-brown), runs morphological cleanup, vectorises the mask into shapely polygons, clips to the plant boundary, and returns both polygon rings and a cyan-tinted preview image.

**Direction one-way:** legacy → new project. Legacy is read-only reference per [CLAUDE.md §7](../../../CLAUDE.md). Nothing in this row modifies any file under `/Users/arunkpatra/codebase/PVlayout_Advance`.

**Scope is parser + sidecar route + tests + memo.** Frontend React wiring is **out of scope**. The row's "reachable from new-app UI" acceptance is met by the API surface existing and being complete enough for a future React row to consume — it is not "a button is wired up." This honors [CLAUDE.md §2's](../../../CLAUDE.md) "No new features during the parity push" and "Frontend UI work resumes after the table is fully done."

**Sync endpoint, no streaming.** Caller waits 30–60 s; sees a static "Detecting…" spinner client-side. The API contract returns detections + previews together. Server-Sent Events progress streaming is a future enhancement, not a row #5 acceptance.

**T3 ceremony.** Per the 2026-04-29 policy update ([CLAUDE.md §2](../../../CLAUDE.md), [PLAN.md "Tier policy"](../../PLAN.md)), no per-row Prasanta gate. Discovery memo at `docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md` lands in the row commit; deferred review at end-of-port.

## 2. Changes

### 2.1 `python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py` — new

Verbatim port of legacy `core/satellite_water_detector.py`. The only intentional deviation:

- Replace `boundary.is_water` references with `getattr(boundary, "is_water", False)`.

  Why: legacy's `BoundaryInfo` at the baseline has no `is_water` field; the references would AttributeError at runtime if exercised. They aren't exercised today because top-level water-named polygons are now routed to `water_obstacles[]` by row #4's parser and never appear in `boundaries[]`. The defensive `getattr` makes this future-proof against any consumer that does set `is_water` and avoids tripping on legacy's dormant bug.

All other code byte-equivalent to legacy (imports, constants, helper functions, classifier rules, morphological ops, vectorisation, preview builder, public API).

Public API surface ported:
- `satellite_available() -> bool` — Pillow + NumPy importability check.
- `detect_with_preview(boundaries, progress_callback=None) -> (detections_dict, previews_dict)` — main entry; returns rings AND PIL preview images.
- `detect_water_bodies(boundaries, progress_callback=None) -> detections_dict` — wrapper without previews.

Internal helpers ported (also useful as test seams): `_water_mask`, `_fetch_tile`, `_stitch`, `_box_mean`, `_morph`, `_mask_to_polygons`, `_clip_and_filter`, `_build_preview`, `_tile_xy`, `_tile_to_latlon`, `_pixel_to_latlon`, `_approx_area_m2`, `_pick_zoom`.

### 2.2 `python/pvlayout_engine/pyproject.toml` — explicit Pillow dep

Add `Pillow>=10.0` to the `dependencies` array. Currently transitive via matplotlib; promoting to explicit since this row uses Pillow directly. Stable PIL APIs we touch (`Image.open`, `Image.new`, `paste`, `save("PNG")`) have been unchanged since Pillow 8 — `>=10.0` is safe.

### 2.3 `python/pvlayout_engine/pvlayout_engine/schemas.py` — three new Pydantic models

```python
class DetectWaterRequest(_Model):
    parsed_kmz: ParsedKMZ
    return_previews: bool = True   # set False to skip base64 PNG payload (faster)


class WaterDetectionPerBoundary(_Model):
    boundary_name: str
    rings_wgs84: list[list[Wgs84Point]]   # detected water polygon rings
    preview_png_b64: str | None = None    # base64-encoded PNG of stitched satellite + cyan tint


class DetectWaterResponse(_Model):
    results: list[WaterDetectionPerBoundary]
```

Insertion point: after `LayoutResponse` (matches the file's existing topical grouping).

`return_previews=True` is the default because the legacy GUI's review phase needs the preview to function. Setting it to `False` is for future bandwidth-conscious flows (e.g., headless batch detection).

`preview_png_b64` is `None` when previews are skipped OR when the boundary's preview generation failed (e.g., no tiles fetched successfully). Frontend should handle null gracefully.

### 2.4 `python/pvlayout_engine/pvlayout_engine/routes/water.py` — new route module

```python
"""POST /detect-water — autodetect water bodies from satellite imagery."""

import base64
import io
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from pvlayout_engine.routes.layout import _boundaries_to_core
from pvlayout_engine.schemas import (
    DetectWaterRequest, DetectWaterResponse, WaterDetectionPerBoundary,
)

router = APIRouter(tags=["water-detection"])


@router.post(
    "/detect-water",
    response_model=DetectWaterResponse,
    summary="Detect water bodies from satellite imagery for each boundary",
)
def detect_water(request: DetectWaterRequest) -> DetectWaterResponse:
    """Run the satellite water detector on each boundary in the parsed KMZ.

    Synchronous; takes 30-60 s depending on boundary size + tile-fetch latency.
    Returns one entry per boundary: detected water polygon rings (lon, lat)
    plus an optional base64 PNG preview (stitched satellite tiles with cyan
    tint over detected water).
    """
    from pvlayout_core.core.satellite_water_detector import (
        detect_with_preview, satellite_available,
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

    out = []
    for b in core_boundaries:
        rings = detections.get(b.name, [])
        preview_b64: Optional[str] = None
        if request.return_previews:
            img = previews.get(b.name)
            if img is not None:
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                preview_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        out.append(WaterDetectionPerBoundary(
            boundary_name=b.name,
            rings_wgs84=[[(lon, lat) for (lon, lat) in ring] for ring in rings],
            preview_png_b64=preview_b64,
        ))
    return DetectWaterResponse(results=out)
```

Reuses `_boundaries_to_core` from the existing `pvlayout_engine/routes/layout.py` (which already handles the wire→domain conversion including row #4's `water_obstacles` field). No duplication.

### 2.5 `python/pvlayout_engine/pvlayout_engine/main.py` — register the new router

One-line addition next to the existing `/layout` router include:

```python
from pvlayout_engine.routes import water as water_routes
...
app.include_router(water_routes.router)
```

(Exact placement matches the file's existing router-registration pattern.)

### 2.6 `python/pvlayout_engine/tests/parity/test_satellite_water_detector_parity.py` — new

Bit-exact `_water_mask` parity against legacy via `sys.path` bootstrap. Same fixture pattern row #4 established.

```python
"""
Parity test for satellite water-body detector (Row #5 of docs/PLAN.md).

The classifier (`_water_mask`) is the heart of the detector. Bit-exact
mask comparison on a synthetic RGB array proves the port preserves all
four classification rules + NDVI exclusion + brightness ceiling +
morphological cleanup.

No network. Tile fetching is operational, not algorithmic.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest


LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")


def _purge_legacy_modules():
    for m in list(sys.modules):
        if m == "core" or m.startswith("core."):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_water_mask():
    """Module-scoped: bound the sys.path mutation; remove cached
    bare `core.*` modules on enter and exit so the new app's
    pvlayout_core namespace is unaffected."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core.satellite_water_detector import _water_mask
        yield _water_mask
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


def _synthetic_rgb_with_known_water_regions() -> np.ndarray:
    """Build a 256×256 RGB array containing patches that hit each
    classifier rule (absolute-dark, blue-dominant, turbid grey-brown,
    locally-dark). Deterministic — uses fixed-seed RNG for noise floor."""
    arr = np.zeros((256, 256, 3), dtype=np.uint8)

    rng = np.random.RandomState(42)
    # Background: random Deccan-soil reddish-brown
    arr[:, :, 0] = 120 + (rng.rand(256, 256) * 40).astype(np.uint8)   # R 120-160
    arr[:, :, 1] = 80  + (rng.rand(256, 256) * 30).astype(np.uint8)   # G  80-110
    arr[:, :, 2] = 60  + (rng.rand(256, 256) * 30).astype(np.uint8)   # B  60- 90

    # Region A (top-left, 60×60): absolute-dark turbid pond — RGB ~ (50, 55, 60)
    arr[10:70, 10:70, 0] = 50
    arr[10:70, 10:70, 1] = 55
    arr[10:70, 10:70, 2] = 60

    # Region B (top-right, 60×60): blue-dominant clear lake — RGB ~ (60, 80, 120)
    arr[10:70, 180:240, 0] = 60
    arr[10:70, 180:240, 1] = 80
    arr[10:70, 180:240, 2] = 120

    # Region C (bottom-left, 60×60): turbid grey-brown — RGB ~ (75, 75, 80)
    arr[180:240, 10:70, 0] = 75
    arr[180:240, 10:70, 1] = 75
    arr[180:240, 10:70, 2] = 80

    # Region D (bottom-right, 60×60): locally-dark — surrounded by bright soil
    arr[180:240, 180:240, 0] = 90
    arr[180:240, 180:240, 1] = 90
    arr[180:240, 180:240, 2] = 90

    return arr


def test_water_mask_bit_exact_parity(legacy_water_mask):
    """The classifier is the heart of the detector. Bit-exact mask match
    proves the port preserves all four classification rules + NDVI exclusion
    + brightness ceiling + morphological cleanup."""
    from pvlayout_core.core.satellite_water_detector import _water_mask as new_mask_fn

    arr = _synthetic_rgb_with_known_water_regions()
    legacy_mask = legacy_water_mask(arr)
    new_mask = new_mask_fn(arr)

    assert legacy_mask.shape == new_mask.shape, "mask shape drift"
    assert legacy_mask.dtype == new_mask.dtype, "mask dtype drift"
    assert np.array_equal(legacy_mask, new_mask), (
        f"mask diff: {(legacy_mask != new_mask).sum()} pixels differ "
        f"(out of {legacy_mask.size})"
    )


def test_satellite_module_importable():
    """Smoke check — module imports, satellite_available() honest about deps."""
    from pvlayout_core.core import satellite_water_detector as swd
    assert callable(swd.satellite_available)
    assert callable(swd.detect_with_preview)
    assert callable(swd.detect_water_bodies)
    assert swd.satellite_available() is True   # Pillow + NumPy guaranteed by deps
```

**Test count from this file: 2 (one parametrized parity test + one module smoke).**

### 2.7 `python/pvlayout_engine/tests/integration/test_detect_water_route.py` — new

Sidecar route smoke test with `_fetch_tile` mocked to return a synthetic bright-soil tile. Asserts the route returns 200, the response shape matches the schema, and the empty-water-rings + non-null preview path works end-to-end.

```python
"""Sidecar /detect-water route — smoke test with mocked tile fetcher."""

from unittest.mock import patch

import numpy as np
from PIL import Image


def _fake_tile_fetcher(z, x, y):
    """Return a synthetic 256×256 PIL image (bright soil) for any (z, x, y).
    Bright-soil tile contains no water → expect empty rings."""
    arr = np.full((256, 256, 3), fill_value=140, dtype=np.uint8)
    return Image.fromarray(arr)


def test_detect_water_route_smoke(client, auth):
    """End-to-end /detect-water happy path with mocked tile fetch."""
    parsed = {
        "boundaries": [{
            "name": "test_plant",
            "coords": [
                (78.0, 12.0), (78.01, 12.0), (78.01, 12.01), (78.0, 12.01), (78.0, 12.0),
            ],
            "obstacles": [],
            "water_obstacles": [],
            "line_obstructions": [],
        }],
        "centroid_lat": 12.005,
        "centroid_lon": 78.005,
    }

    with patch(
        "pvlayout_core.core.satellite_water_detector._fetch_tile",
        side_effect=_fake_tile_fetcher,
    ):
        resp = client.post(
            "/detect-water",
            headers=auth(),
            json={"parsed_kmz": parsed, "return_previews": True},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["results"]) == 1
    r = body["results"][0]
    assert r["boundary_name"] == "test_plant"
    assert isinstance(r["rings_wgs84"], list)
    assert r["rings_wgs84"] == []   # bright-soil tile → no water
    assert r["preview_png_b64"] is not None
    assert len(r["preview_png_b64"]) > 100   # base64 payload non-trivial
```

**Test count from this file: 1.**

The `client` and `auth` fixtures are sidecar test conventions already in place (used by `test_layout_parity.py` and other route tests). Verified during planning that they're available via `tests/conftest.py`.

### 2.8 `docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md` — new

Discovery memo. Sections: (i) what landed, (ii) algorithm summary (4 classifier rules, two-zoom union, NDVI exclusion), (iii) Esri tile dependency + SSL bypass rationale (Windows compat), (iv) the dormant `b.is_water` AttributeError defensively wrapped with `getattr`, (v) Open Questions for end-of-port review.

### 2.9 `docs/PLAN.md` — flip status

Row #5 → **done**, status bump `4 / 12 done.` → `5 / 12 done.`

## 3. Acceptance

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q
```

- All existing tests still pass (80 passed remains the floor).
- 3 new tests pass (2 parity + 1 route smoke).
- Expected total: **83 passed**, 6 skipped, 0 failed.
- Discovery memo committed.
- New route `POST /detect-water` documented in OpenAPI; `/docs` shows the schema.

## 4. Risks

- **`_fetch_tile` patch path in route smoke test.** Mocking `pvlayout_core.core.satellite_water_detector._fetch_tile` works only if the route code calls it as a module-level lookup, not a captured reference. Verified: `_stitch` calls `_fetch_tile(z, tx, ty)` as a free name, so the module attribute patch propagates correctly.
- **Pillow / NumPy version drift.** `Pillow>=10.0` and NumPy>=1.20 (transitive). APIs we touch are stable since Pillow 8 / NumPy 1.20. Risk minor.
- **Synthetic-array test brittleness.** The four hand-placed regions in `_synthetic_rgb_with_known_water_regions()` are calibrated to hit each classifier rule. If a future legacy commit changes thresholds (it shouldn't — this is the baseline), the test would fail. Mitigation: the test asserts identical output between legacy and new, not a specific mask shape — drift in legacy thresholds would be caught and surfaced.
- **Network-free test guarantee.** Both new tests are hermetic (synthetic numpy array; mocked tile fetcher). CI does not need internet.
- **`detect_with_preview` long-running on real network.** Production callers see 30–60 s wall time per detection. Sync endpoint with default FastAPI timeout (no timeout) is fine for desktop-Tauri; production reverse proxies would need timeout tuning if exposed publicly. Not a row #5 concern.

## 5. Out of scope

- **SSE / WebSocket progress streaming.** Sync endpoint is acceptance-sufficient.
- **Frontend React wiring** — no button, no dialog, no preview-image rendering. Sidecar surface complete.
- **Tile caching.** Per-request fresh fetch; future optimisation.
- **Layout engine integration of detected water.** This row produces water polygon rings; consumers (frontend in a future row) append them to `BoundaryInfo.water_obstacles[]` before calling `/layout`. Once row #6 properly routes water_obstacles through the layout engine (removing the row #4 bridge), the end-to-end flow works.
- **Pydantic deep-validation of polygon shape.** Rings returned as raw lon/lat lists; downstream consumers validate.
- **`_TL_KEYWORDS` consumption.** Defined-but-unused parser constant from row #4. Not relevant here.

## 6. Implementation order (for the implementation plan)

1. Pre-flight: confirm legacy at `baseline-v1-20260429`; pytest baseline 80 passed.
2. Add `Pillow>=10.0` to `pyproject.toml` dependencies; run `uv sync` to lock.
3. Create `pvlayout_core/core/satellite_water_detector.py` — verbatim port + `getattr` fix on `b.is_water`.
4. Add three Pydantic models to `schemas.py`.
5. Create `pvlayout_engine/routes/water.py`.
6. Wire the new router in `pvlayout_engine/main.py`.
7. Create `tests/parity/test_satellite_water_detector_parity.py`.
8. Create `tests/integration/test_detect_water_route.py`.
9. Run `uv run pytest tests/ -q`. Expect 83 passed, 6 skipped, 0 failed.
10. Draft discovery memo at `docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md`.
11. Flip `docs/PLAN.md` row #5 + status count.
12. Commit: `parity: row #5 — satellite water-body detection`.

One atomic commit on `main`. PLAN.md flip lands with the row commit.

## 7. Cross-references

- [`docs/PLAN.md`](../../PLAN.md) row #5.
- [`docs/superpowers/specs/2026-04-29-row-4-kmz-parser-autodetect-design.md`](2026-04-29-row-4-kmz-parser-autodetect-design.md) — row #4 added `BoundaryInfo.water_obstacles[]`; consumers of detected water append to that list.
- [`docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md`](../../parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md) — row #4 memo; this row's memo follows the same pattern.
- [`python/pvlayout_engine/pvlayout_engine/routes/layout.py`](../../../python/pvlayout_engine/pvlayout_engine/routes/layout.py) — `_boundaries_to_core` reused by the new water route.
- [`python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py`](../../../python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py) — `sys.path` bootstrap fixture pattern reused.
- Legacy source at `/Users/arunkpatra/codebase/PVlayout_Advance/core/satellite_water_detector.py` on branch `baseline-v1-20260429`.
- Legacy GUI at `/Users/arunkpatra/codebase/PVlayout_Advance/gui/satellite_detection_dialog.py` — reference for the eventual React UI's two-phase dialog.
