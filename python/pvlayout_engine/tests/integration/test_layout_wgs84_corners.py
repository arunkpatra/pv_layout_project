"""
Integration test for the WGS84 corner fields added in S9.

`/layout` emits `placed_tables_wgs84` and `placed_icrs_wgs84` so the
desktop's MapCanvas can render polygons without client-side UTM↔WGS84
projection. This test confirms:

  * The new fields exist in every result.
  * Their length matches `placed_tables` / `placed_icrs`.
  * Each ring is closed (first == last) and has 5 points (4 corners + close).
  * Coordinates are in WGS84 range and within a reasonable distance of
    the input KMZ centroid (catches gross projection misuse).

Tolerances: not byte-exact; pyproj output drift across versions is
expected at the 1e-9 degree level. The structural + range checks are
the regression guard.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "wgs84-corner-test-token-abcdefghij"
KMZ_PATH = (
    Path(__file__).resolve().parents[1]
    / "golden"
    / "kmz"
    / "phaseboundary2.kmz"
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+wgs84-corner-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


def test_placed_tables_and_icrs_have_wgs84_corner_rings(
    client: TestClient,
) -> None:
    assert KMZ_PATH.exists(), KMZ_PATH

    with KMZ_PATH.open("rb") as fh:
        parse = client.post(
            "/parse-kmz",
            headers=auth(),
            files={"file": (KMZ_PATH.name, fh, "application/vnd.google-earth.kmz")},
        )
    assert parse.status_code == 200, parse.text
    parsed = parse.json()
    centroid_lon = parsed["centroid_lon"]
    centroid_lat = parsed["centroid_lat"]

    layout = client.post(
        "/layout",
        headers=auth(),
        json={"parsed_kmz": parsed, "params": {}},
    )
    assert layout.status_code == 200, layout.text
    results = layout.json()["results"]
    assert len(results) >= 1

    for r in results:
        # New fields are present.
        assert "placed_tables_wgs84" in r
        assert "placed_icrs_wgs84" in r

        # Length parity with the UTM lists.
        assert len(r["placed_tables_wgs84"]) == len(r["placed_tables"]), (
            f"tables wgs84 len {len(r['placed_tables_wgs84'])} != "
            f"placed_tables len {len(r['placed_tables'])}"
        )
        assert len(r["placed_icrs_wgs84"]) == len(r["placed_icrs"])

        # Each ring is closed and has 5 points (4 corners + close).
        for i, ring in enumerate(r["placed_tables_wgs84"]):
            assert len(ring) == 5, f"table[{i}] ring len {len(ring)}"
            assert ring[0] == ring[-1], f"table[{i}] not closed"
            for lon, lat in ring:
                assert -180.0 <= lon <= 180.0, f"table[{i}] lon out of range: {lon}"
                assert -90.0 <= lat <= 90.0, f"table[{i}] lat out of range: {lat}"
                # Sanity: corner within ~5 km of centroid (way beyond any
                # plant size; just catches projection misconfig).
                assert abs(lon - centroid_lon) < 0.05, (
                    f"table[{i}] lon {lon} far from centroid {centroid_lon}"
                )
                assert abs(lat - centroid_lat) < 0.05, (
                    f"table[{i}] lat {lat} far from centroid {centroid_lat}"
                )

        for i, ring in enumerate(r["placed_icrs_wgs84"]):
            assert len(ring) == 5
            assert ring[0] == ring[-1]
            for lon, lat in ring:
                assert -180.0 <= lon <= 180.0
                assert -90.0 <= lat <= 90.0
                assert abs(lon - centroid_lon) < 0.05
                assert abs(lat - centroid_lat) < 0.05
