"""
Integration tests for the /session endpoints + require_feature dependency.

Covers the S7 infrastructure:
  * POST /session/entitlements stores the set.
  * GET /session reflects it.
  * require_feature() raises 503 before init, 403 on missing feature, passes otherwise.
  * Replacement (not union) semantics on second POST.
"""
from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI, status
from fastapi.testclient import TestClient

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app
from pvlayout_engine.session import SessionState, get_session, require_feature


TEST_TOKEN = "integration-test-token-abcdefghijklmnop"


@pytest.fixture()
def config() -> SidecarConfig:
    return SidecarConfig(
        host="127.0.0.1",
        port=54321,
        token=TEST_TOKEN,
        version="0.0.0+test",
    )


@pytest.fixture()
def app_client(config: SidecarConfig) -> TestClient:
    # Fresh app per test so session state starts clean.
    app = build_app(config)
    return TestClient(app)


def auth_headers(token: str = TEST_TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Basic push + read ------------------------------------------------------


def test_session_initial_state_is_uninitialized(app_client: TestClient) -> None:
    resp = app_client.get("/session", headers=auth_headers())
    assert resp.status_code == 200
    body = resp.json()
    assert body["initialized"] is False
    assert body["available_features"] == []
    assert body["plan_name"] is None


def test_push_entitlements_updates_state(app_client: TestClient) -> None:
    resp = app_client.post(
        "/session/entitlements",
        headers=auth_headers(),
        json={
            "available_features": ["plant_layout", "cables"],
            "plan_name": "Free",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["initialized"] is True
    assert sorted(body["available_features"]) == ["cables", "plant_layout"]
    assert body["plan_name"] == "Free"

    # GET reflects the POST
    resp2 = app_client.get("/session", headers=auth_headers())
    assert resp2.json() == body


def test_second_push_replaces_rather_than_unions(app_client: TestClient) -> None:
    app_client.post(
        "/session/entitlements",
        headers=auth_headers(),
        json={"available_features": ["cables"], "plan_name": "Free"},
    )
    app_client.post(
        "/session/entitlements",
        headers=auth_headers(),
        json={"available_features": ["dxf"], "plan_name": "Pro Plus"},
    )
    resp = app_client.get("/session", headers=auth_headers())
    assert resp.json()["available_features"] == ["dxf"]
    assert resp.json()["plan_name"] == "Pro Plus"


def test_session_requires_auth(app_client: TestClient) -> None:
    resp = app_client.get("/session")
    assert resp.status_code == 401
    resp2 = app_client.post("/session/entitlements", json={"available_features": []})
    assert resp2.status_code == 401


def test_push_schema_forbids_unknown_fields(app_client: TestClient) -> None:
    resp = app_client.post(
        "/session/entitlements",
        headers=auth_headers(),
        json={"available_features": [], "future_field": "oops"},
    )
    assert resp.status_code == 422


# --- require_feature dependency --------------------------------------------


def _build_feature_app(config: SidecarConfig, state: SessionState) -> TestClient:
    """Build a minimal FastAPI app that mounts require_feature() on a test
    route. We override the SessionState dependency to share ``state`` across
    the ``require_feature`` dep and our assertions.
    """
    app = FastAPI()
    app.state.session = state

    @app.get(
        "/protected",
        dependencies=[Depends(require_feature("dxf"))],
    )
    def protected() -> dict[str, str]:
        return {"ok": "dxf"}

    return TestClient(app)


def test_require_feature_503_before_initialized(config: SidecarConfig) -> None:
    state = SessionState()
    client = _build_feature_app(config, state)
    resp = client.get("/protected")
    assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert resp.json()["detail"]["error"] == "session_not_initialized"


def test_require_feature_403_when_missing(config: SidecarConfig) -> None:
    state = SessionState()
    state.update(available_features={"plant_layout"}, plan_name="Free")
    client = _build_feature_app(config, state)
    resp = client.get("/protected")
    assert resp.status_code == status.HTTP_403_FORBIDDEN
    detail = resp.json()["detail"]
    assert detail["error"] == "feature_not_entitled"
    assert detail["feature"] == "dxf"


def test_require_feature_200_when_present(config: SidecarConfig) -> None:
    state = SessionState()
    state.update(available_features={"dxf", "plant_layout"}, plan_name="Pro Plus")
    client = _build_feature_app(config, state)
    resp = client.get("/protected")
    assert resp.status_code == 200
    assert resp.json() == {"ok": "dxf"}


def test_require_feature_reflects_clear(config: SidecarConfig) -> None:
    state = SessionState()
    state.update(available_features={"dxf"}, plan_name="Pro Plus")
    state.clear()
    client = _build_feature_app(config, state)
    resp = client.get("/protected")
    assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
