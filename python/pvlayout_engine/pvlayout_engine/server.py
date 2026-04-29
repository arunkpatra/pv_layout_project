"""
FastAPI application factory for the pvlayout sidecar.

The app is:
  * bound to loopback (127.0.0.1) by the main entry; see main.py.
  * token-gated on every non-public endpoint via a router-level dependency.
  * wired to the vendored domain logic in ``pvlayout_core`` via route
    modules under ``pvlayout_engine.routes``.

S2 introduced dev-only echo routes to expose every schema in /docs.
S3 replaces them with the real ``/parse-kmz``, ``/layout``, and
``/refresh-inverters`` endpoints.
"""
from __future__ import annotations

import hmac
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.routes.dxf import router as dxf_router
from pvlayout_engine.routes.layout import router as layout_router
from pvlayout_engine.routes.session import router as session_router
from pvlayout_engine.routes.water import router as water_router
from pvlayout_engine.schemas import HealthResponse
from pvlayout_engine.session import SessionState

log = logging.getLogger("pvlayout_engine")


def build_app(config: SidecarConfig) -> FastAPI:
    """Create a FastAPI app configured for this sidecar session."""

    app = FastAPI(
        title="pvlayout-engine",
        version=config.version,
        description=(
            "Local sidecar for the SolarLayout desktop app. "
            "Bound to 127.0.0.1; every non-public endpoint requires "
            "`Authorization: Bearer <session-token>`."
        ),
        openapi_tags=[
            {"name": "meta", "description": "Health and version checks."},
            {"name": "session", "description": "Per-session entitlements pushed by the shell."},
            {"name": "layout", "description": "Parse KMZ, generate layout, refresh inverters."},
        ],
    )

    # Per-session state — entitlements set pushed by the shell; feature-gate
    # dependencies read from here. See pvlayout_engine.session.
    app.state.session = SessionState()

    # Loopback by construction; CORS kept permissive for the WebView origin
    # Tauri picks (tauri:// on Windows/Linux, null on macOS). Token auth is
    # the real boundary; CORS is a usability affordance for dev tools.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- Bearer-token dependency ---------------------------------------------
    # FastAPI's docs/openapi endpoints stay public; everything attached to
    # `authed` (below) enforces the token.

    def require_bearer_token(
        authorization: Annotated[str | None, Header()] = None,
    ) -> None:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or malformed Authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )
        presented = authorization.removeprefix("Bearer ").strip()
        if not hmac.compare_digest(presented, config.token):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )

    authed = APIRouter(dependencies=[Depends(require_bearer_token)])

    # --- /health -------------------------------------------------------------

    @authed.get(
        "/health",
        response_model=HealthResponse,
        tags=["meta"],
        summary="Liveness + version",
    )
    def health() -> HealthResponse:
        return HealthResponse(status="ok", version=config.version)

    # --- Session routes (S7) ------------------------------------------------
    # /session, /session/entitlements — token-gated but not feature-gated
    # (the whole point of /session is establishing that state).
    authed.include_router(session_router)

    # --- Layout routes (S3) -------------------------------------------------
    # /parse-kmz, /layout, /refresh-inverters — all token-gated.
    authed.include_router(layout_router)

    # --- Water-detection route (Row #5) -------------------------------------
    # /detect-water — sync; satellite tile fetch + classifier; token-gated.
    authed.include_router(water_router)

    # --- Export route (Row #10) ---------------------------------------------
    # /export-dxf — multi-result layout to DXF; token-gated. Per ADR-0005,
    # exports are ungated at the entitlements layer (no require_feature).
    authed.include_router(dxf_router)

    app.include_router(authed)

    # Global error shape: FastAPI's default {"detail": "..."} is fine for S2.
    # S3 will add structured error responses if needed.

    @app.middleware("http")
    async def _log_requests(request: Request, call_next):  # noqa: ANN001
        # S2 logging is minimal — just method + path + status. The full
        # observability layer lands with crash reporting in S14.
        response = await call_next(request)
        log.info("%s %s -> %d", request.method, request.url.path, response.status_code)
        return response

    return app


