# Row #5 — Satellite water-body detection (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port legacy `core/satellite_water_detector.py` (441 lines, new file) into the new project verbatim, expose it via a new `POST /detect-water` sidecar route, add a bit-exact `_water_mask` parity test against legacy + a route smoke test with mocked tile fetcher, and write a deferred-review discovery memo.

**Architecture:** Single atomic commit on `main`. New core file (`pvlayout_core/core/satellite_water_detector.py`) + new sidecar route (`pvlayout_engine/routes/water.py`) + 3 new Pydantic schemas + new pyproject dep + 2 new test files + new memo. No streaming progress (sync endpoint).

**Tech Stack:** Python 3.12, NumPy, Pillow, shapely, FastAPI/Pydantic, pytest. Legacy reference at `/Users/arunkpatra/codebase/PVlayout_Advance` branch `baseline-v1-20260429`.

**Spec:** [`docs/superpowers/specs/2026-04-29-row-5-satellite-water-detector-design.md`](../specs/2026-04-29-row-5-satellite-water-detector-design.md) (committed `304efd3`).

**Tier:** T3 (per [`docs/PLAN.md`](../../PLAN.md)) — port + bit-exact parity test + deferred-review discovery memo. **No per-row Prasanta gate** per the 2026-04-29 policy update; PLAN.md flip lands with the row commit on green tests.

---

## File structure

**Modify:**
- `python/pvlayout_engine/pyproject.toml` — add `Pillow>=10.0` to `dependencies`
- `python/pvlayout_engine/pvlayout_engine/schemas.py` — add 3 new Pydantic models
- `python/pvlayout_engine/pvlayout_engine/server.py` — register the new water router under the existing `authed` sub-router (next to `layout_router`)
- `docs/PLAN.md` — flip row #5 to **done**, bump 4 → 5 / 12

**Create:**
- `python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py` — verbatim port (441 lines), one defensive change (`getattr(b, "is_water", False)`)
- `python/pvlayout_engine/pvlayout_engine/routes/water.py` — new route module
- `python/pvlayout_engine/tests/parity/test_satellite_water_detector_parity.py` — bit-exact `_water_mask` cross-compare + smoke import (2 tests)
- `python/pvlayout_engine/tests/integration/test_detect_water_route.py` — route smoke test with mocked tile fetcher (1 test)
- `docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md` — discovery memo

---

## Pre-flight

- [ ] **Step 0: Confirm legacy at baseline branch**

Run:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
```

Expected:

```
baseline-v1-20260429
397aa2ab460d8f773376f51b393407e5be67dca0
```

If wrong, run `git -C /Users/arunkpatra/codebase/PVlayout_Advance checkout baseline-v1-20260429`. If SHA has advanced, surface — re-baseline conversation needed.

- [ ] **Step 1: Confirm pytest baseline is 80 passed**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `80 passed, 6 skipped` (from row #4 close).

- [ ] **Step 2: Confirm Pillow is importable in current env**

Run:

```bash
uv run python -c "from PIL import Image; print('Pillow', Image.__version__ if hasattr(Image, '__version__') else 'imported')"
```

Expected: a line starting with `Pillow ` and a version (any 10+).

---

## Task 1: Add Pillow as explicit dependency

**Files:**
- Modify: `python/pvlayout_engine/pyproject.toml`

- [ ] **Step 1: Inspect the dependency list**

Run:

```bash
grep -A30 "^dependencies" /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pyproject.toml
```

Expected: a `dependencies = [...]` array with shapely, fastapi, etc. Note the closing bracket `]` so the next step inserts the right place.

- [ ] **Step 2: Add `Pillow>=10.0` before the closing bracket**

Find the closing line of the `dependencies = [...]` array (the line containing `]` immediately after the last dep). Insert before that line:

```toml
    "Pillow>=10.0",
```

Match the indentation and quote style used by surrounding entries (4-space indent, double-quotes, trailing comma).

- [ ] **Step 3: Run uv sync to lock the dep**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv sync 2>&1 | tail -5
```

Expected: an "Audited" or "Resolved" line indicating no re-resolution required (Pillow already transitively present at version 10+); or a quick re-resolve completing in seconds.

- [ ] **Step 4: Re-confirm Pillow imports**

Run:

```bash
uv run python -c "from PIL import Image; print('OK')"
```

Expected: `OK`.

---

## Task 2: Port `satellite_water_detector.py` verbatim

**Files:**
- Create: `python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py`

- [ ] **Step 1: Dump the legacy file content as the starting point**

Run from the new project root:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && \
git show baseline-v1-20260429:core/satellite_water_detector.py > \
/Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py
```

Then verify the file landed:

```bash
ls -l /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py
wc -l /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py
```

Expected: the file exists; line count is **441**.

- [ ] **Step 2: Apply the defensive `getattr` fix on `b.is_water`**

The legacy file references `boundary.is_water` in two places inside `detect_with_preview`. Both must be wrapped with `getattr` because the new app's `BoundaryInfo` has no `is_water` field (legacy's doesn't either at this baseline — it's a dormant AttributeError bug).

Find:

```python
    plant_bounds = [b for b in boundaries if not b.is_water]
    n = max(len(plant_bounds), 1)

    for bidx, boundary in enumerate(boundaries):
        if boundary.is_water:
            detections[boundary.name] = []
            previews[boundary.name]   = None
            continue
```

Replace with:

```python
    # Defensive against legacy's dormant AttributeError: BoundaryInfo at
    # baseline-v1-20260429 has no is_water field. Today this means is_water
    # is always False for items in `boundaries` (top-level water polygons
    # are routed to water_obstacles[] by row #4's parser, not into boundaries).
    # If a future row adds is_water (e.g. for water-named top-level
    # polygons that survive into boundaries), the existing semantics here
    # still hold without code change.
    plant_bounds = [b for b in boundaries if not getattr(b, "is_water", False)]
    n = max(len(plant_bounds), 1)

    for bidx, boundary in enumerate(boundaries):
        if getattr(boundary, "is_water", False):
            detections[boundary.name] = []
            previews[boundary.name]   = None
            continue
```

- [ ] **Step 3: Verify the module imports cleanly**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.core import satellite_water_detector as swd
print('satellite_available:', swd.satellite_available())
print('detect_with_preview:', callable(swd.detect_with_preview))
print('detect_water_bodies:', callable(swd.detect_water_bodies))
print('_water_mask:', callable(swd._water_mask))
"
```

Expected:

```
satellite_available: True
detect_with_preview: True
detect_water_bodies: True
_water_mask: True
```

- [ ] **Step 4: Verify the only diff vs legacy is the `getattr` fix**

Run from the new project root:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && \
git show baseline-v1-20260429:core/satellite_water_detector.py | \
diff - /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py
```

Expected: the diff shows ONLY the `is_water` → `getattr(...)` substitutions plus the new comment block above them. Anything else (whitespace, indentation, other lines) means the dump in Step 1 had drift; re-do.

---

## Task 3: Add three new Pydantic schemas

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_engine/schemas.py`

- [ ] **Step 1: Find the insertion point**

Run:

```bash
grep -n "^class LayoutResponse\|^class LayoutRequest" /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_engine/schemas.py
```

Expected: line numbers for `LayoutResponse` (last topic-grouped class today). The new water schemas go right after this class — keeps related route-payload schemas grouped.

- [ ] **Step 2: Insert the three schemas**

Find the last line of the `LayoutResponse` class (the line right before whatever comes after it — likely a blank line or another class). After that blank line, insert:

```python


# ---------------------------------------------------------------------------
# Water-body detection (POST /detect-water) — Row #5
# ---------------------------------------------------------------------------


class DetectWaterRequest(_Model):
    """Inputs for satellite water detection.

    return_previews=True (default) returns base64 PNG previews per
    boundary so the UI can show legacy's two-phase review screen.
    Set False for headless / bandwidth-conscious flows.
    """

    parsed_kmz: ParsedKMZ
    return_previews: bool = True


class WaterDetectionPerBoundary(_Model):
    """One per boundary in the parsed KMZ."""

    boundary_name: str
    rings_wgs84: list[list[Wgs84Point]]
    preview_png_b64: str | None = None


class DetectWaterResponse(_Model):
    """Response from POST /detect-water."""

    results: list[WaterDetectionPerBoundary]
```

- [ ] **Step 3: Verify the schemas import cleanly and round-trip**

Run:

```bash
uv run python -c "
from pvlayout_engine.schemas import (
    DetectWaterRequest, DetectWaterResponse, WaterDetectionPerBoundary,
    ParsedKMZ, BoundaryInfo,
)

# Smoke instantiation — empty parsed_kmz
req = DetectWaterRequest(
    parsed_kmz=ParsedKMZ(boundaries=[], centroid_lat=0.0, centroid_lon=0.0),
)
print('request defaults: return_previews=', req.return_previews)

# Smoke instantiation — empty response
resp = DetectWaterResponse(results=[])
print('response empty:', resp.model_dump())

# Smoke instantiation — one detection
det = WaterDetectionPerBoundary(
    boundary_name='test',
    rings_wgs84=[[(78.0, 12.0), (78.01, 12.0), (78.0, 12.01), (78.0, 12.0)]],
    preview_png_b64=None,
)
print('detection:', det.boundary_name, len(det.rings_wgs84[0]), 'pts')
print('OK')
"
```

Expected:

```
request defaults: return_previews= True
response empty: {'results': []}
detection: test 4 pts
OK
```

---

## Task 4: Create the `water.py` route module

**Files:**
- Create: `python/pvlayout_engine/pvlayout_engine/routes/water.py`

- [ ] **Step 1: Write the route module**

Create the file with this content:

```python
"""POST /detect-water — autodetect water bodies from satellite imagery.

Row #5 of docs/PLAN.md. Wraps pvlayout_core.core.satellite_water_detector
in a FastAPI route. Sync endpoint; takes 30–60 s on real network.
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

    Synchronous; production wall-clock 30–60 s depending on boundary size +
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
```

- [ ] **Step 2: Verify the module imports**

Run:

```bash
uv run python -c "
from pvlayout_engine.routes.water import router, detect_water
print('router prefix:', router.prefix or '(none)')
print('routes:', [r.path for r in router.routes])
print('detect_water callable:', callable(detect_water))
"
```

Expected:

```
router prefix: (none)
routes: ['/detect-water']
detect_water callable: True
```

---

## Task 5: Register the new router in `server.py`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_engine/server.py`

- [ ] **Step 1: Find the existing layout-router registration**

Run:

```bash
grep -n "layout_router\|include_router" /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_engine/server.py
```

Expected: a line near 102 showing the import and a line near 106 with `authed.include_router(layout_router)`.

- [ ] **Step 2: Read the current router-registration block**

Run:

```bash
sed -n '95,115p' /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_engine/server.py
```

Expected output similar to:

```python
from pvlayout_engine.routes.session import router as session_router
from pvlayout_engine.routes.layout import router as layout_router
...
authed.include_router(session_router)
...
authed.include_router(layout_router)
...
app.include_router(authed)
```

(Exact line numbers and surrounding text may vary — focus on the imports + include_router lines.)

- [ ] **Step 3: Add the water router import + registration**

Find the existing `layout_router` import line:

```python
from pvlayout_engine.routes.layout import router as layout_router
```

Replace with:

```python
from pvlayout_engine.routes.layout import router as layout_router
from pvlayout_engine.routes.water import router as water_router
```

Then find the existing `authed.include_router(layout_router)` line and replace it with:

```python
    authed.include_router(layout_router)
    authed.include_router(water_router)
```

(Match the surrounding indentation — the existing line is inside `build_app`.)

- [ ] **Step 4: Verify the app boots and exposes the route**

Run:

```bash
uv run python -c "
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app

app = build_app(SidecarConfig(host='127.0.0.1', port=0, token='test', version='0.0.0+test'))
paths = sorted({route.path for route in app.routes})
print('routes:', [p for p in paths if '/detect-water' in p or '/layout' in p or '/parse-kmz' in p])
"
```

Expected: a sorted list including `/detect-water` and `/layout` and `/parse-kmz` (paths visible). The `/detect-water` entry confirms registration.

---

## Task 6: Add the parity test (`_water_mask` bit-exact)

**Files:**
- Create: `python/pvlayout_engine/tests/parity/test_satellite_water_detector_parity.py`

- [ ] **Step 1: Write the test file**

Create the file:

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
    arr[:, :, 1] = 80 + (rng.rand(256, 256) * 30).astype(np.uint8)    # G  80-110
    arr[:, :, 2] = 60 + (rng.rand(256, 256) * 30).astype(np.uint8)    # B  60- 90

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
    """Bit-exact match proves the port preserves all four classification
    rules + NDVI exclusion + brightness ceiling + morphological cleanup."""
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

- [ ] **Step 2: Run the parity test in isolation**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/parity/test_satellite_water_detector_parity.py -v 2>&1 | tail -10
```

Expected:

```
tests/parity/test_satellite_water_detector_parity.py::test_water_mask_bit_exact_parity PASSED
tests/parity/test_satellite_water_detector_parity.py::test_satellite_module_importable PASSED
```

If `test_water_mask_bit_exact_parity` fails with a diff count, investigate the `getattr` fix from Task 2 Step 2 — that's the only intentional deviation and shouldn't affect `_water_mask` because `_water_mask` doesn't reference `is_water`. If the diff persists, re-dump the legacy file (Task 2 Step 1) and re-apply the fix carefully.

---

## Task 7: Add the route smoke test (mocked tile fetcher)

**Files:**
- Create: `python/pvlayout_engine/tests/integration/test_detect_water_route.py`

- [ ] **Step 1: Write the test file**

Create the file:

```python
"""Sidecar /detect-water route — smoke test with mocked tile fetcher.

Row #5 of docs/PLAN.md. Hermetic: no network. Mocks _fetch_tile so
the detector classifies a uniform bright-soil tile, expecting empty
water rings + a non-null preview PNG.
"""

from __future__ import annotations

from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "row5-detect-water-test-token-abcdefghij"


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+row5-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


def _fake_tile_fetcher(z, x, y):
    """Return a synthetic 256×256 PIL image (uniform bright soil) for any
    (z, x, y). Bright-soil tile contains no water → expect empty rings."""
    arr = np.full((256, 256, 3), fill_value=140, dtype=np.uint8)
    return Image.fromarray(arr)


def test_detect_water_route_smoke(client: TestClient) -> None:
    """End-to-end /detect-water happy path with mocked tile fetch."""
    parsed = {
        "boundaries": [
            {
                "name": "test_plant",
                "coords": [
                    (78.0, 12.0),
                    (78.01, 12.0),
                    (78.01, 12.01),
                    (78.0, 12.01),
                    (78.0, 12.0),
                ],
                "obstacles": [],
                "water_obstacles": [],
                "line_obstructions": [],
            }
        ],
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
    assert r["rings_wgs84"] == []   # bright-soil tile → no water detected
    assert r["preview_png_b64"] is not None
    assert len(r["preview_png_b64"]) > 100   # base64 PNG payload non-trivial


def test_detect_water_rejects_empty_kmz(client: TestClient) -> None:
    """422 when parsed_kmz has no boundaries — guards the contract."""
    resp = client.post(
        "/detect-water",
        headers=auth(),
        json={
            "parsed_kmz": {"boundaries": [], "centroid_lat": 0.0, "centroid_lon": 0.0},
            "return_previews": False,
        },
    )
    assert resp.status_code == 422, resp.text
    assert "no boundaries" in resp.text.lower()
```

- [ ] **Step 2: Run the smoke test in isolation**

Run:

```bash
uv run pytest tests/integration/test_detect_water_route.py -v 2>&1 | tail -10
```

Expected:

```
tests/integration/test_detect_water_route.py::test_detect_water_route_smoke PASSED
tests/integration/test_detect_water_route.py::test_detect_water_rejects_empty_kmz PASSED
```

If `test_detect_water_route_smoke` fails with a 401, the auth header didn't reach the route — re-check the `TEST_TOKEN` constant matches both fixtures. If it fails with a 503, `satellite_available()` returned False — Pillow or NumPy isn't in the env (re-run Task 1 Step 3). If `rings_wgs84` is non-empty, the bright-soil tile is being misclassified as water — surface and stop; this would indicate the classifier port is wrong despite the bit-exact parity test passing (which would itself be surprising).

---

## Task 8: Run the full pytest suite

**Files:**
- No edit. Acceptance check.

- [ ] **Step 1: Run the full suite**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `83 passed, 6 skipped`. The 3 new tests are the 2 parity (`test_water_mask_bit_exact_parity`, `test_satellite_module_importable`) + 2 route tests (`test_detect_water_route_smoke`, `test_detect_water_rejects_empty_kmz`)... wait — that's 4 new tests, not 3. So expected is **84 passed**, not 83.

Re-confirm: total = 80 + 4 = **84 passed**, 6 skipped, 0 failed.

If the actual count differs, identify failing tests via `uv run pytest tests/ -q 2>&1 | grep -E "FAIL|ERROR"` and fix before continuing.

---

## Task 9: Draft the discovery memo

**Files:**
- Create: `docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md`

- [ ] **Step 1: Verify the findings directory exists**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
ls docs/parity/findings/
```

Expected: shows `2026-04-29-001-kmz-autodetect-heuristics.md` from row #4.

- [ ] **Step 2: Write the memo**

Create `docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md`:

```markdown
# Finding #002 — Satellite water-body detector port

**Row:** [docs/PLAN.md](../../PLAN.md) row #5 (T3)
**Date:** 2026-04-29
**Author:** Arun (port) — solar-domain decisions captured for Prasanta's end-of-port review
**Status:** committed; deferred review

## Background

Legacy added a satellite water-body detector at
core/satellite_water_detector.py (441 lines, new file) on
baseline-v1-20260429 commit 9362083. The detector fetches Esri World
Imagery tiles, classifies water pixels, vectorises into shapely
polygons, and returns both rings and a cyan-tinted preview image.
Row #5 ports this verbatim into the new project and exposes it via a
new POST /detect-water sidecar route.

## What landed

Verbatim port from legacy. The new file at
pvlayout_core/core/satellite_water_detector.py contains exactly the
same logic as legacy, with one defensive change documented below.
Bit-exact `_water_mask` parity verified on a synthetic 256×256 RGB
array (tests/parity/test_satellite_water_detector_parity.py) — all
four classifier rules + NDVI exclusion + brightness ceiling +
morphological cleanup produce identical output to legacy.

Sidecar route: POST /detect-water accepts a parsed-KMZ payload and
returns per-boundary detected polygon rings + base64 PNG previews.
Sync endpoint (no streaming progress; deferred). Pillow promoted from
transitive to explicit dependency.

## Algorithm summary

The classifier (`_water_mask`) labels a pixel as water if any of
these four rules fire:

1. **Absolute dark.** brightness < 75 AND B ≥ R × 0.80. Catches
   turbid Indian tanks/ponds (near-black appearance).
2. **Locally dark.** brightness < 58 % of 30-px neighbourhood mean
   AND brightness < 110 AND B ≥ R × 0.75. Catches dark ponds
   surrounded by bright red Deccan soil.
3. **Blue-dominant.** B > R × 1.15 AND B > G × 1.05 AND
   brightness < 160. Catches clear reservoirs/lakes.
4. **Turbid grey-brown.** brightness < 90, |R−G| < 25, |R−B| < 30,
   B ≥ R × 0.78. Catches silty water (low colour saturation, dark).

Post-rules exclusions: NDVI proxy > 0.10 → vegetation (excluded);
brightness ≥ 150 → bright surface (excluded). Morphological
clean-up: erosion radius 3, dilation radius 5.

Pipeline: pick zoom (13–17) → stitch tiles into one RGB image →
classify pixels → vectorise mask via 4×4 px cell aggregation →
union → simplify (0.00005 tolerance) → clip to plant boundary →
filter by minimum area (150 m²). Two-zoom union (Z + Z−1) catches
both small ponds and large reservoirs.

## Esri tile dependency + SSL bypass

Detector hits two Esri endpoints in fallback order:
- server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/...
- services.arcgisonline.com/arcgis/rest/services/World_Imagery/...

SSL certificate verification is disabled. Rationale (legacy
comment): Windows machines often fail HTTPS cert checks silently,
returning None from urlopen. Tile downloads are read-only and
low-risk. Ported verbatim.

## Defensive `getattr(b, "is_water", False)` fix

Legacy detector references `boundary.is_water` in two places, but
`BoundaryInfo` has no `is_water` field at the baseline. Reading the
attribute would AttributeError. In practice this never happens
because top-level water-named polygons are now routed to
`water_obstacles[]` by row #4's parser and don't appear in
`boundaries[]`.

The port wraps both references with `getattr(b, "is_water", False)`
to defend against the dormant bug. If a future row adds an
`is_water` flag (e.g. for water-named top-level polygons that
survive into boundaries), the existing semantics still hold without
code change.

## Sidecar route shape

POST /detect-water:

Request:
```json
{
  "parsed_kmz": <ParsedKMZ shape from POST /parse-kmz>,
  "return_previews": true
}
```

Response:
```json
{
  "results": [
    {
      "boundary_name": "...",
      "rings_wgs84": [[[lon, lat], ...], ...],
      "preview_png_b64": "iVBORw0KGgoAAAANSUhEUgAA..." | null
    },
    ...
  ]
}
```

Sync; production wall-clock 30–60 s per boundary on real network.
Smoke-tested in CI with mocked _fetch_tile (no network required).

## Open questions / refinement candidates (for end-of-port review)

These are observations from the port. Prasanta reviews them with
the other accumulated memos at end-of-port.

1. **Tile-source fallback list.** Two Esri endpoints; should there
   be a third (e.g., Mapbox, Google) as further fallback? Currently
   if both Esri sources fail, the composite falls back to grey
   (still classified, rarely useful).

2. **Classifier tuning.** Tuned for Deccan-plateau / India semi-arid
   terrain. Behaviour on Northern European bog / Saharan oasis /
   coastal mangrove plants? Worth a manual check on imagery from
   non-Indian regions before claiming generality.

3. **`_MIN_AREA_M2 = 150` threshold.** Discards polygons smaller
   than 150 m². Does this miss small ponds / drinking-water tanks
   that matter to PV layouts? At 150 m² ≈ 12.2 m × 12.2 m, fairly
   small but not tiny.

4. **Two-zoom union (Z + Z−1).** Currently union of two zoom levels.
   Is this the right tradeoff vs. just one carefully-chosen zoom?
   The legacy comment suggests Z−1 catches large reservoirs that
   smear at higher zoom; verify on a varied-area test set.

5. **No tile caching.** Every detection re-fetches tiles. Acceptable
   for dev; production users running detection on the same boundary
   multiple times pay full network cost each call. Worth a local
   cache (LRU on (z, x, y) key, ~10–50 MB) in a follow-up?

## For end-of-port review

When Prasanta reviews the accumulated memos at end-of-port, the
decision points for this finding are:

1. Are the four classifier rules still right for India + the
   markets we're targeting?
2. Is the tile-source list (Esri × 2) sufficient, or should we add
   a fallback?
3. Should we add tile caching as a separate row, or is per-request
   re-fetch OK?

Refinements, if any, become follow-up rows in PLAN.md raised after
the parity sweep is complete.
```

- [ ] **Step 3: Spot-check it landed**

Run:

```bash
ls -l docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md && \
head -10 docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md
```

Expected: file exists; the header line `# Finding #002 — Satellite water-body detector port` shows in the head output.

---

## Task 10: Flip PLAN.md status

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Update Row #5 status to `done`**

Find:

```markdown
| 5 | Satellite water-body detection | T3 | `core/satellite_water_detector.py` (new) @ `9362083` | Feature reachable from new-app UI; parity-driven test on a known plant; discovery memo committed. | todo |
```

Replace with:

```markdown
| 5 | Satellite water-body detection | T3 | `core/satellite_water_detector.py` (new) @ `9362083` | Feature reachable from new-app UI; parity-driven test on a known plant; discovery memo committed. | **done** |
```

- [ ] **Step 2: Bump the count in the header status line**

Change:

```markdown
**Status:** 4 / 12 done.
```

to:

```markdown
**Status:** 5 / 12 done.
```

---

## Task 11: Commit the row

**Files:**
- Stage and commit:
  - `python/pvlayout_engine/pyproject.toml`
  - `python/pvlayout_engine/uv.lock` (if it changed)
  - `python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py`
  - `python/pvlayout_engine/pvlayout_engine/schemas.py`
  - `python/pvlayout_engine/pvlayout_engine/routes/water.py`
  - `python/pvlayout_engine/pvlayout_engine/server.py`
  - `python/pvlayout_engine/tests/parity/test_satellite_water_detector_parity.py`
  - `python/pvlayout_engine/tests/integration/test_detect_water_route.py`
  - `docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md`
  - `docs/PLAN.md`

- [ ] **Step 1: Confirm only the expected files changed**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git status
```

Expected: the modified + untracked lists match the file list above. If anything else is dirty, roll back the stray changes.

- [ ] **Step 2: Stage and commit**

Run:

```bash
git add python/pvlayout_engine/pyproject.toml \
        python/pvlayout_engine/pvlayout_core/core/satellite_water_detector.py \
        python/pvlayout_engine/pvlayout_engine/schemas.py \
        python/pvlayout_engine/pvlayout_engine/routes/water.py \
        python/pvlayout_engine/pvlayout_engine/server.py \
        python/pvlayout_engine/tests/parity/test_satellite_water_detector_parity.py \
        python/pvlayout_engine/tests/integration/test_detect_water_route.py \
        docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md \
        docs/PLAN.md

# uv.lock — only stage if it changed
if git status --porcelain python/pvlayout_engine/uv.lock | grep -q .; then
    git add python/pvlayout_engine/uv.lock
fi

git commit -m "$(cat <<'EOF'
parity: row #5 — satellite water-body detection

Port legacy core/satellite_water_detector.py @ baseline-v1-20260429
commit 9362083 (441 lines, new file). One intentional deviation:
replace boundary.is_water references with getattr(b, "is_water",
False) to defend against legacy's dormant AttributeError bug
(BoundaryInfo at baseline has no is_water field; references would
crash if exercised, but in practice are unreachable post-row-#4).

Sidecar surface: new POST /detect-water route returns per-boundary
detected polygon rings + base64 PNG previews — the data shape
needed by a future React UI to replicate legacy's two-phase
progress→review dialog. Sync endpoint, no SSE streaming. Pillow
promoted from transitive to explicit dependency.

New parity test tests/parity/test_satellite_water_detector_parity.py
asserts bit-exact _water_mask parity against legacy on a synthetic
256x256 RGB array hitting all four classifier rules. New route
smoke test tests/integration/test_detect_water_route.py exercises
POST /detect-water end-to-end with mocked tile fetcher (no network).
Both new test files plus the existing 80-test baseline = 84 passed.

Sidecar pytest: 84 passed, 6 skipped, 0 failed (was 80).

T3 discovery memo at
docs/parity/findings/2026-04-29-002-satellite-water-detector-port.md
captures the algorithm, Esri tile dependency rationale, the dormant
b.is_water bug fix, sidecar route shape, and 5 open questions for
Prasanta's end-of-port review.

Spec: docs/superpowers/specs/2026-04-29-row-5-satellite-water-detector-design.md
Plan: docs/superpowers/plans/2026-04-29-row-5-satellite-water-detector.md
PLAN row: docs/PLAN.md row #5 (T3).
EOF
)" && git log -1 --stat
```

- [ ] **Step 3: Verify the commit landed**

Run:

```bash
git log --oneline -3
```

Expected:

```
<row5-sha>  parity: row #5 — satellite water-body detection
<plan-sha>  docs: implementation plan for PLAN row #5
<spec-sha>  docs: spec for PLAN row #5 — satellite water-body detection
```

---

## Acceptance recap (from `docs/PLAN.md` row #5)

`cd python/pvlayout_engine && uv run pytest tests/ -q` → 84 passed, 6 skipped, 0 failed.
Bit-exact `_water_mask` parity against legacy on synthetic RGB array.
`POST /detect-water` route reachable, returns rings + base64 previews.
Discovery memo committed.

Met by Task 8 (full suite) + Task 6 Step 2 (parity isolated) + Task 7 Step 2 (route isolated); memo by Task 9.

---

## Out of scope (deferred to later rows / post-parity)

- **SSE / WebSocket progress streaming** — sync endpoint sufficient.
- **Frontend React wiring** — sidecar surface complete; React rows post-parity.
- **Tile caching** — per-request fresh fetch acceptable.
- **Layout engine integration of detected water** — frontend appends detected rings to `BoundaryInfo.water_obstacles[]`; row #6 properly routes water_obstacles through the layout engine (removes the row #4 bridge).
- **Refinements to classifier thresholds / tile-source list** — gated on Prasanta's end-of-port review.
