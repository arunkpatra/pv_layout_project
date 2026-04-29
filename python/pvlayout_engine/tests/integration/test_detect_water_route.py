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
