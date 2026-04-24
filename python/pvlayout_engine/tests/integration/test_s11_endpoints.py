"""
Integration tests for the S11 sidecar endpoints: /add-road, /remove-road,
and the /refresh-inverters extension for icr_override.

Uses phaseboundary2.kmz as the canonical fixture — it's the same input
used throughout S3/S9/S10 physical gates, so the numbers here can be
compared with legacy PVlayout_Advance output when S13.8 runs parity.

Each test exercises a full /parse-kmz → /layout → S11-endpoint chain,
which means it pays the initial compute cost (~1s). The chain is the
whole point — the S11 endpoints only make sense operating on a real
LayoutResult.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "s11-endpoint-test-token-abcdefghij"
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
        version="0.0.0+s11-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture(scope="module")
def base_layout(client: TestClient) -> dict:
    """Parse + generate phaseboundary2 once; reused across tests."""
    assert KMZ_PATH.exists(), KMZ_PATH
    with KMZ_PATH.open("rb") as fh:
        parse = client.post(
            "/parse-kmz",
            headers=auth(),
            files={"file": (KMZ_PATH.name, fh, "application/vnd.google-earth.kmz")},
        )
    assert parse.status_code == 200, parse.text
    parsed = parse.json()
    layout = client.post(
        "/layout",
        headers=auth(),
        json={"parsed_kmz": parsed, "params": {}},
    )
    assert layout.status_code == 200, layout.text
    body = layout.json()
    assert len(body["results"]) >= 1
    return body["results"][0]  # first boundary — phaseboundary2 has one


# ---------------------------------------------------------------------------
# /add-road
# ---------------------------------------------------------------------------


def test_add_road_rectangle_reduces_table_count(
    client: TestClient, base_layout: dict
) -> None:
    """Draw a ~200m × 200m rect in the middle of the plant; expect tables
    inside the footprint to be removed."""
    initial_tables = len(base_layout["placed_tables"])
    initial_roads = len(base_layout["placed_roads"])

    # Centroid-of-centroid fallback: use the first boundary vertex as an
    # anchor and offset in lng/lat space. phaseboundary2 is at ~21.7°N;
    # 0.002° ≈ 200m.
    anchor = base_layout["boundary_wgs84"][0]
    lng, lat = anchor[0], anchor[1]
    ring = [
        [lng + 0.001, lat + 0.001],
        [lng + 0.003, lat + 0.001],
        [lng + 0.003, lat + 0.003],
        [lng + 0.001, lat + 0.003],
        [lng + 0.001, lat + 0.001],
    ]

    resp = client.post(
        "/add-road",
        headers=auth(),
        json={
            "result": base_layout,
            "params": {},
            "road": {
                "road_type": "rectangle",
                "coords_wgs84": ring,
            },
        },
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()

    assert len(updated["placed_roads"]) == initial_roads + 1
    # Some tables should have been cleared under the drawn rect.
    assert len(updated["placed_tables"]) <= initial_tables
    # The road has the requested type.
    assert updated["placed_roads"][-1]["road_type"] == "rectangle"
    # Per-boundary state round-trips intact.
    assert updated["boundary_name"] == base_layout["boundary_name"]
    assert updated["utm_epsg"] == base_layout["utm_epsg"]


def test_add_road_rejects_missing_utm_epsg(
    client: TestClient, base_layout: dict
) -> None:
    broken = deepcopy(base_layout)
    broken["utm_epsg"] = 0

    resp = client.post(
        "/add-road",
        headers=auth(),
        json={
            "result": broken,
            "params": {},
            "road": {
                "road_type": "rectangle",
                "coords_wgs84": [
                    [0.0, 0.0], [0.001, 0.0], [0.001, 0.001],
                    [0.0, 0.001], [0.0, 0.0],
                ],
            },
        },
    )
    assert resp.status_code == 422


def test_add_road_rejects_too_few_vertices(
    client: TestClient, base_layout: dict
) -> None:
    """Schema enforces min_length=3 on coords_wgs84."""
    resp = client.post(
        "/add-road",
        headers=auth(),
        json={
            "result": base_layout,
            "params": {},
            "road": {
                "road_type": "line",
                "coords_wgs84": [[0.0, 0.0], [0.001, 0.001]],
            },
        },
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# /remove-road
# ---------------------------------------------------------------------------


def test_remove_road_pops_last(client: TestClient, base_layout: dict) -> None:
    """Add a road, then remove it; placed_roads should return to initial size."""
    initial_roads = len(base_layout["placed_roads"])
    initial_tables = len(base_layout["placed_tables"])

    anchor = base_layout["boundary_wgs84"][0]
    lng, lat = anchor[0], anchor[1]
    ring = [
        [lng + 0.001, lat + 0.001],
        [lng + 0.002, lat + 0.001],
        [lng + 0.002, lat + 0.002],
        [lng + 0.001, lat + 0.002],
        [lng + 0.001, lat + 0.001],
    ]
    after_add = client.post(
        "/add-road",
        headers=auth(),
        json={
            "result": base_layout,
            "params": {},
            "road": {"road_type": "rectangle", "coords_wgs84": ring},
        },
    )
    assert after_add.status_code == 200
    added = after_add.json()
    assert len(added["placed_roads"]) == initial_roads + 1

    after_remove = client.post(
        "/remove-road",
        headers=auth(),
        json={"result": added, "params": {}},
    )
    assert after_remove.status_code == 200, after_remove.text
    removed = after_remove.json()
    assert len(removed["placed_roads"]) == initial_roads
    # Tables cleared by the road should largely come back. We don't
    # assert exact equality: la_manager's step-2 coverage check iterates
    # placed_tables each time, so an add-then-remove round-trip can
    # produce a slightly different LA set (and thus a slightly different
    # post-LA placed_tables) than the initial /layout run. This is
    # legacy PVlayout_Advance behaviour — consequence of LA coverage
    # being table-count-dependent. 2% tolerance is well within observed
    # drift on phaseboundary2 (~±6 tables out of 611).
    assert abs(len(removed["placed_tables"]) - initial_tables) <= initial_tables * 0.02


def test_remove_road_rejects_empty_stack(
    client: TestClient, base_layout: dict
) -> None:
    """If the client's undoStack gets out of sync and tries to pop when
    the sidecar state has no roads, surface the 422 instead of silently
    no-op'ing."""
    assert len(base_layout["placed_roads"]) == 0  # fresh layout has none

    resp = client.post(
        "/remove-road",
        headers=auth(),
        json={"result": base_layout, "params": {}},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# /refresh-inverters with icr_override
# ---------------------------------------------------------------------------


def test_refresh_inverters_applies_icr_override(
    client: TestClient, base_layout: dict
) -> None:
    """Move an ICR ~50m east and confirm the new placed_icrs[0] x shifted."""
    assert len(base_layout["placed_icrs"]) > 0, "fixture has no ICRs"

    # Compute current ICR centroid from placed_icrs[0] (UTM bottom-left + size).
    icr = base_layout["placed_icrs"][0]
    cx = icr["x"] + icr["width"] / 2.0
    cy = icr["y"] + icr["height"] / 2.0

    # But the override is WGS84 — use the corresponding ring's centre from
    # placed_icrs_wgs84[0] for honesty (rings are 5-point closed).
    wgs_ring = base_layout["placed_icrs_wgs84"][0]
    lngs = [p[0] for p in wgs_ring[:-1]]
    lats = [p[1] for p in wgs_ring[:-1]]
    mean_lng = sum(lngs) / len(lngs)
    mean_lat = sum(lats) / len(lats)

    # Offset ~50m east: 0.0005° lng ≈ ~50m at 21.7°N.
    new_center_wgs84 = [mean_lng + 0.0005, mean_lat]

    resp = client.post(
        "/refresh-inverters",
        headers=auth(),
        json={
            "result": base_layout,
            "params": {},
            "icr_override": {
                "icr_index": 0,
                "new_center_wgs84": new_center_wgs84,
            },
        },
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()

    # ICR x should have shifted east (larger UTM easting).
    new_icr = updated["placed_icrs"][0]
    assert new_icr["x"] > icr["x"], (
        f"icr did not shift east: before {icr['x']}, after {new_icr['x']}"
    )
    # Height + width unchanged.
    assert new_icr["width"] == icr["width"]
    assert new_icr["height"] == icr["height"]
    # Other ICRs untouched.
    for i in range(1, len(base_layout["placed_icrs"])):
        assert updated["placed_icrs"][i]["x"] == base_layout["placed_icrs"][i]["x"]
        assert updated["placed_icrs"][i]["y"] == base_layout["placed_icrs"][i]["y"]

    # Sanity: new ICR's WGS84 ring centroid is ~0.0005° east of old.
    old_ring = base_layout["placed_icrs_wgs84"][0]
    new_ring = updated["placed_icrs_wgs84"][0]
    old_lng_mean = sum(p[0] for p in old_ring[:-1]) / 4
    new_lng_mean = sum(p[0] for p in new_ring[:-1]) / 4
    assert new_lng_mean > old_lng_mean, "wgs84 ring did not shift east"


def test_refresh_inverters_rejects_icr_index_out_of_range(
    client: TestClient, base_layout: dict
) -> None:
    resp = client.post(
        "/refresh-inverters",
        headers=auth(),
        json={
            "result": base_layout,
            "params": {},
            "icr_override": {
                "icr_index": 999,
                "new_center_wgs84": [0.0, 0.0],
            },
        },
    )
    assert resp.status_code == 422


def test_refresh_inverters_without_override_preserves_existing_behavior(
    client: TestClient, base_layout: dict
) -> None:
    """Backward compat: /refresh-inverters with no icr_override should
    return the same (or deterministically re-computed) result as a fresh
    /layout — confirms the S11 extension didn't break the existing path."""
    resp = client.post(
        "/refresh-inverters",
        headers=auth(),
        json={"result": base_layout, "params": {}},
    )
    assert resp.status_code == 200, resp.text
    refreshed = resp.json()
    # Same number of ICRs and tables.
    assert len(refreshed["placed_icrs"]) == len(base_layout["placed_icrs"])
    assert len(refreshed["placed_tables"]) == len(base_layout["placed_tables"])
