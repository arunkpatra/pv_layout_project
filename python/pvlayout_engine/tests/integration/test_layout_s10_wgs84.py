"""
Integration test for the S10 WGS84 geometry fields on real /layout output.

Covers the subset of S10 fields that don't require
``enable_cable_calc=True`` (which is O(minutes) on the phaseboundary2
fixture and is not worth the CI time for a shape check):

  * ``placed_las_wgs84``              — 5-point closed rect rings
  * ``placed_las_circles_wgs84``      — 65-point closed circle rings
  * shape/length parity with ``placed_las``

String inverters and cables are checked in
``tests/smoke/test_adapters_s10.py`` via synthetic core data — that's a
true unit test of ``result_from_core`` and runs in milliseconds rather
than seconds.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "s10-wgs84-test-token-abcdefghij"
# KMZ fixtures moved to pvlayout_core per cloud-offload C2.
# parents[3] from this file = repo_root/python/.
KMZ_PATH = (
    Path(__file__).resolve().parents[3]
    / "pvlayout_core/tests/golden/kmz/phaseboundary2.kmz"
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+s10-wgs84-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


def test_s10_la_wgs84_fields_on_real_layout(client: TestClient) -> None:
    assert KMZ_PATH.exists(), KMZ_PATH

    with KMZ_PATH.open("rb") as fh:
        parse = client.post(
            "/parse-kmz",
            headers=auth(),
            files={"file": (KMZ_PATH.name, fh, "application/vnd.google-earth.kmz")},
        )
    assert parse.status_code == 200, parse.text
    parsed = parse.json()

    # cable_calc stays OFF (default) — keeps the test fast. LAs are placed
    # regardless, so the LA fields still validate the real projection path.
    layout = client.post(
        "/layout",
        headers=auth(),
        json={"parsed_kmz": parsed, "params": {}},
    )
    assert layout.status_code == 200, layout.text
    results = layout.json()["results"]
    assert len(results) >= 1

    for r in results:
        # Every new S10 field is present, regardless of population.
        for field in (
            "placed_string_inverters_wgs84",
            "dc_cable_runs_wgs84",
            "ac_cable_runs_wgs84",
            "placed_las_wgs84",
            "placed_las_circles_wgs84",
        ):
            assert field in r, f"missing field: {field}"

        # Without cable_calc, inverters + cables are empty. Their WGS84
        # counterparts should also be empty (length parity).
        assert len(r["placed_string_inverters_wgs84"]) == len(r["placed_string_inverters"])
        assert len(r["dc_cable_runs_wgs84"]) == len(r["dc_cable_runs"])
        assert len(r["ac_cable_runs_wgs84"]) == len(r["ac_cable_runs"])

        # LAs must be populated for phaseboundary2 — it's a large enough
        # plant that la_manager always places several.
        num_las = len(r["placed_las"])
        assert num_las > 0, "expected phaseboundary2 to place at least one LA"
        assert len(r["placed_las_wgs84"]) == num_las
        assert len(r["placed_las_circles_wgs84"]) == num_las

        # LA rect rings — closed, 5 points.
        for i, ring in enumerate(r["placed_las_wgs84"]):
            assert len(ring) == 5, f"la[{i}] rect ring len {len(ring)}"
            assert ring[0] == ring[-1], f"la[{i}] rect not closed"

        # LA circle rings — closed, 65 points (64 segments + closing).
        for i, ring in enumerate(r["placed_las_circles_wgs84"]):
            assert len(ring) == 65, f"la[{i}] circle ring len {len(ring)}"
            assert ring[0] == ring[-1], f"la[{i}] circle not closed"
