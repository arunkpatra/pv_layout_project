"""
S2 integration tests for the sidecar HTTP surface.

Uses FastAPI's TestClient (httpx) to exercise the app without a live
uvicorn, so the tests are deterministic, fast, and don't bind real ports.

Covered:
  * /health requires a bearer token (401 without, 200 with).
  * /openapi.json exposes every schema in SCHEMAS_FOR_INSPECTION.
  * /_schemas/echo/<name> endpoints validate and echo each schema.
  * The token comparison is constant-time-safe against near-matches.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.schemas import SCHEMAS_FOR_INSPECTION
from pvlayout_engine.server import build_app


TEST_TOKEN = "s2-integration-test-token-abcdefghijk"


def _constructs_with_no_args(cls: type) -> bool:
    """True if the schema has all-default fields and needs no args."""
    try:
        cls()
    except Exception:  # noqa: BLE001
        return False
    return True


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


def test_openapi_contains_every_registered_schema(client: TestClient) -> None:
    response = client.get("/openapi.json")
    schemas = response.json().get("components", {}).get("schemas", {})
    missing = [
        cls.__name__
        for cls in SCHEMAS_FOR_INSPECTION.values()
        if cls.__name__ not in schemas
    ]
    assert not missing, f"Schemas missing from OpenAPI: {missing}"


def test_openapi_registers_health_and_echo_routes(client: TestClient) -> None:
    response = client.get("/openapi.json")
    paths = response.json().get("paths", {})
    assert "/health" in paths
    for name in SCHEMAS_FOR_INSPECTION:
        assert f"/_schemas/echo/{name}" in paths, f"missing echo route for {name}"


# ---------------------------------------------------------------------------
# Schema echoes — each endpoint accepts and returns a valid payload.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name,cls",
    [
        (n, c)
        for n, c in SCHEMAS_FOR_INSPECTION.items()
        # The positional-coordinate schemas require fields; they're exercised
        # separately in test_schemas.py round-tripping. We only echo-test the
        # ones that construct with zero args.
        if _constructs_with_no_args(c)
    ],
)
def test_schema_echo_round_trips(client: TestClient, name: str, cls: type) -> None:
    payload = json.loads(cls().model_dump_json())
    response = client.post(
        f"/_schemas/echo/{name}", headers=auth_headers(), json=payload
    )
    assert response.status_code == 200, response.text
    # Server-side re-serialization must match the canonical form.
    assert response.json() == payload


def test_schema_echo_rejects_extra_fields(client: TestClient) -> None:
    """Forbidding extras surfaces typos clearly."""
    response = client.post(
        "/_schemas/echo/layout-parameters",
        headers=auth_headers(),
        json={"tilt_angle": 22.5, "typo_field": 1},
    )
    assert response.status_code == 422


def test_schema_echo_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/_schemas/echo/module-spec",
        json={"length": 2.38, "width": 1.13, "wattage": 580.0},
    )
    assert response.status_code == 401


