"""
FastAPI application factory for the pvlayout sidecar.

The app is:
  * bound to loopback (127.0.0.1) by the main entry; see main.py.
  * token-gated on every non-public endpoint via a router-level dependency.
  * intentionally minimal in S2 — it exposes /health plus one echo endpoint
    per pydantic schema so the full type surface appears in /docs.

S3 replaces the echo endpoints with the real /parse-kmz, /layout,
/refresh-inverters routes. S2 is about proving the transport, auth, and
type plumbing are correct before any real compute is wired in.
"""
from __future__ import annotations

import hmac
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.schemas import (
    SCHEMAS_FOR_INSPECTION,
    HealthResponse,
)

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
            {"name": "schemas", "description": "Type inspection (dev-only; removed in S3)."},
        ],
    )

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

    # --- Dev-only schema echoes ---------------------------------------------
    # For each registered pydantic schema, register a POST that accepts and
    # returns it. This surfaces the whole type system in /docs so the human
    # gate #4 ("all schemas render in Swagger") can be verified visually.
    # These routes disappear in S3 when real endpoints take over.

    for name, schema_cls in SCHEMAS_FOR_INSPECTION.items():
        _register_echo_route(authed, name, schema_cls)

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


def _register_echo_route(router: APIRouter, name: str, schema_cls: type) -> None:
    """Register POST /_schemas/echo/<name> that echoes a payload validated
    against `schema_cls`. Used in S2 to expose every schema in /docs.

    FastAPI reads parameter annotations via ``typing.get_type_hints()`` which
    consults ``__annotations__``. A closure-captured ``cls`` annotation gets
    resolved to the generic type parameter, not the concrete class, so we
    build a plain handler and inject the annotations explicitly.
    """
    path = f"/_schemas/echo/{name}"

    def handler(payload):  # type: ignore[no-untyped-def]
        return payload

    handler.__annotations__ = {"payload": schema_cls, "return": schema_cls}
    handler.__name__ = f"echo_{name.replace('-', '_')}"
    handler.__doc__ = (
        f"Echo endpoint for the `{schema_cls.__name__}` schema. "
        "Dev-only; removed in S3."
    )

    router.post(
        path,
        response_model=schema_cls,
        tags=["schemas"],
        summary=f"Echo {schema_cls.__name__}",
    )(handler)
