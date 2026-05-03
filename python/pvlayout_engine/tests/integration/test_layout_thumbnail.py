"""Sidecar /layout/thumbnail route — SP1 / B23 cross-repo flow.

Verifies the route end-to-end against `phaseboundary2.kmz`:
  - HTTP smoke (200 + image/webp content-type + non-empty body)
  - WebP magic bytes (RIFF...WEBP) + Pillow round-trip
  - Output dimensions = 400×300 (memo v3 §2 lock)
  - Output size ≤ 50 KB (memo v3 §10 Q4 ceiling — same cap backend's
    B7 RUN_RESULT_SPEC.thumbnail enforces on the upload side)
  - Bearer-token auth: missing / invalid → 401
  - Determinism: same input → byte-identical output (matplotlib +
    Pillow with fixed quality params is bit-stable across calls in
    the same process)

Manual visual parity (the row's "thumbnail looks like the project")
is the user's bar — the row's commit message logs the recipe.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")  # headless — must precede any pyplot/figure import

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from pvlayout_engine.adapters import result_from_core
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "sp1-thumbnail-test-token-abcdefghij"
# KMZ fixtures moved to pvlayout_core per cloud-offload C2.
# parents[3] from this file = repo_root/python/.
KMZ_FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "pvlayout_core/tests/golden/kmz/phaseboundary2.kmz"
)


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+sp1-thumbnail-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture(scope="module")
def wire_layout_result() -> dict[str, Any]:
    """Run parse_kmz + run_layout_multi on phaseboundary2.kmz; pick the
    first valid (usable_polygon non-None) result and convert to wire."""
    from pvlayout_core.core.kmz_parser import parse_kmz
    from pvlayout_core.core.layout_engine import run_layout_multi
    from pvlayout_core.models.project import LayoutParameters

    parsed = parse_kmz(str(KMZ_FIXTURE))
    params = LayoutParameters()
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    valid = [r for r in results if r.usable_polygon is not None]
    assert valid, (
        "expected at least one valid LayoutResult from phaseboundary2.kmz"
    )
    wire = result_from_core(valid[0])
    return wire.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_thumbnail_smoke_returns_webp(
    client: TestClient, wire_layout_result: dict[str, Any]
) -> None:
    """End-to-end: POST /layout/thumbnail returns 200 + image/webp + non-empty body."""
    response = client.post(
        "/layout/thumbnail",
        json={"result": wire_layout_result},
        headers=auth(),
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("image/webp")
    assert len(response.content) > 0


def test_thumbnail_has_valid_webp_magic_bytes(
    client: TestClient, wire_layout_result: dict[str, Any]
) -> None:
    """Body bytes start with the canonical RIFF...WEBP marker."""
    response = client.post(
        "/layout/thumbnail",
        json={"result": wire_layout_result},
        headers=auth(),
    )
    body = response.content
    # WebP files begin with: 'RIFF' (4) + 4-byte size + 'WEBP' (4)
    assert body[:4] == b"RIFF", f"expected RIFF magic; got {body[:4]!r}"
    assert body[8:12] == b"WEBP", f"expected WEBP magic; got {body[8:12]!r}"


def test_thumbnail_dimensions_are_400x300(
    client: TestClient, wire_layout_result: dict[str, Any]
) -> None:
    """Memo v3 §2 lock: dimensions = 400×300 px (single asset for both
    Run gallery cards and RecentsView project cards)."""
    response = client.post(
        "/layout/thumbnail",
        json={"result": wire_layout_result},
        headers=auth(),
    )
    img = Image.open(BytesIO(response.content))
    assert img.format == "WEBP", f"expected WEBP; got {img.format}"
    assert img.size == (400, 300), f"expected (400, 300); got {img.size}"


def test_thumbnail_size_under_50kb_ceiling(
    client: TestClient, wire_layout_result: dict[str, Any]
) -> None:
    """Memo v3 §10 Q4 lock: ≤50 KB. The cap backend's B7
    RUN_RESULT_SPEC.thumbnail enforces; sidecar must produce blobs that
    pass the upload gate."""
    response = client.post(
        "/layout/thumbnail",
        json={"result": wire_layout_result},
        headers=auth(),
    )
    assert len(response.content) <= 50_000, (
        f"thumbnail exceeds 50KB ceiling: {len(response.content)} bytes"
    )


def test_thumbnail_render_is_deterministic(
    client: TestClient, wire_layout_result: dict[str, Any]
) -> None:
    """Memo v3 §10 Q3 — semantic determinism is sufficient (no
    idempotency key on the render path); matplotlib + Pillow with
    fixed quality params produces byte-stable output across calls in
    the same process. This test asserts the strong form (bit-exact)
    so any drift surfaces immediately."""
    a = client.post(
        "/layout/thumbnail",
        json={"result": wire_layout_result},
        headers=auth(),
    )
    b = client.post(
        "/layout/thumbnail",
        json={"result": wire_layout_result},
        headers=auth(),
    )
    assert a.content == b.content, (
        "thumbnail render drifted across two identical requests "
        f"({len(a.content)} vs {len(b.content)} bytes)"
    )


def test_thumbnail_requires_bearer_token(
    client: TestClient, wire_layout_result: dict[str, Any]
) -> None:
    """Token-gate parity with the rest of the sidecar — no auth → 401."""
    response = client.post(
        "/layout/thumbnail",
        json={"result": wire_layout_result},
    )
    assert response.status_code == 401


def test_thumbnail_rejects_wrong_token(
    client: TestClient, wire_layout_result: dict[str, Any]
) -> None:
    """Wrong token → 401."""
    response = client.post(
        "/layout/thumbnail",
        json={"result": wire_layout_result},
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401


def test_thumbnail_rejects_missing_result_field(
    client: TestClient,
) -> None:
    """Pydantic validation surfaces a 422 for malformed bodies — keeps
    the sidecar honest about what `LayoutThumbnailRequest` actually
    requires (see schemas.py)."""
    response = client.post(
        "/layout/thumbnail",
        json={},  # missing the required `result` field
        headers=auth(),
    )
    assert response.status_code == 422


def test_thumbnail_handles_empty_layout_result(
    client: TestClient,
) -> None:
    """An empty LayoutResult (zero boundary, zero tables, zero ICRs)
    still produces a valid WebP — the renderer emits a blank canvas
    rather than raising. The desktop's `<img onError>` fallback would
    have masked a render failure anyway, but the cleaner contract is
    to always return valid bytes when the input is shaped correctly.
    """
    empty_result: dict[str, Any] = {}  # all LayoutResult fields default
    response = client.post(
        "/layout/thumbnail",
        json={"result": empty_result},
        headers=auth(),
    )
    assert response.status_code == 200, response.text
    img = Image.open(BytesIO(response.content))
    assert img.format == "WEBP"
    assert img.size == (400, 300)
