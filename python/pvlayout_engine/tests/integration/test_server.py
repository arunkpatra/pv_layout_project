"""
Integration tests for the sidecar HTTP surface.

Uses FastAPI's TestClient (httpx) to exercise the app without a live
uvicorn, so the tests are deterministic, fast, and don't bind real ports.

Covered (as of S3):
  * /health requires a bearer token (401 without, 200 with).
  * /docs and /openapi.json stay public.
  * OpenAPI registers every schema referenced by any route and every route.
  * The token comparison is constant-time-safe against near-matches.

S3 route behaviour (/parse-kmz, /layout, /refresh-inverters) is covered by
``tests/golden/`` against real KMZ inputs.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "integration-test-token-abcdefghijklmnop"


@pytest.fixture(scope="module")
def config() -> SidecarConfig:
    return SidecarConfig(
        host="127.0.0.1",
        port=54321,
        token=TEST_TOKEN,
        version="0.0.0+test",
    )


@pytest.fixture(scope="module")
def client(config: SidecarConfig) -> TestClient:
    app = build_app(config)
    return TestClient(app)


def auth_headers(token: str = TEST_TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_health_without_token_is_401(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


def test_health_with_wrong_token_is_401(client: TestClient) -> None:
    response = client.get("/health", headers=auth_headers("not-the-right-token"))
    assert response.status_code == 401


def test_health_with_malformed_scheme_is_401(client: TestClient) -> None:
    response = client.get("/health", headers={"Authorization": f"Token {TEST_TOKEN}"})
    assert response.status_code == 401


def test_health_with_correct_token_is_200(client: TestClient, config: SidecarConfig) -> None:
    response = client.get("/health", headers=auth_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == config.version


# ---------------------------------------------------------------------------
# Public docs endpoints stay unauthenticated
# ---------------------------------------------------------------------------


def test_openapi_is_public(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200


def test_docs_is_public(client: TestClient) -> None:
    response = client.get("/docs")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")


# ---------------------------------------------------------------------------
# OpenAPI surface — every registered schema must appear.
# ---------------------------------------------------------------------------


def test_openapi_contains_real_route_schemas(client: TestClient) -> None:
    """S3: every schema reachable from /parse-kmz, /layout, /refresh-inverters
    must appear in OpenAPI. Ancillary schemas not referenced by any live
    route (e.g. EnergyParameters) are no longer surfaced — intentional."""
    response = client.get("/openapi.json")
    schemas = response.json().get("components", {}).get("schemas", {})
    required = {
        # Request/response envelopes
        "LayoutRequest",
        "LayoutResponse",
        "RefreshInvertersRequest",
        "ParsedKMZ",
        "BoundaryInfo",
        # Parameters + nested
        "LayoutParameters",
        "ModuleSpec",
        "TableConfig",
        "DesignType",
        "Orientation",
        "DesignMode",
        # Result + nested
        "LayoutResult",
        "PlacedTable",
        "PlacedICR",
        "PlacedRoad",
        "PlacedStringInverter",
        "CableRun",
        "PlacedLA",
        "EnergyResult",
        # Meta
        "HealthResponse",
    }
    missing = sorted(required - set(schemas))
    assert not missing, f"Schemas missing from OpenAPI: {missing}"


def test_openapi_registers_real_routes(client: TestClient) -> None:
    response = client.get("/openapi.json")
    paths = response.json().get("paths", {})
    # S3 routes + S7 session routes:
    assert "/health" in paths
    assert "/parse-kmz" in paths
    assert "/layout" in paths
    assert "/refresh-inverters" in paths
    assert "/session" in paths
    assert "/session/entitlements" in paths


def test_layout_requires_auth(client: TestClient) -> None:
    response = client.post("/layout", json={})
    assert response.status_code == 401


def test_layout_rejects_empty_boundaries(client: TestClient) -> None:
    body = {
        "parsed_kmz": {"boundaries": [], "centroid_lat": 0, "centroid_lon": 0},
        "params": {},
    }
    response = client.post("/layout", headers=auth_headers(), json=body)
    assert response.status_code == 422


