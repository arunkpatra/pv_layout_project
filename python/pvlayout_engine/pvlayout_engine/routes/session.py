"""
/session routes — the shell-to-sidecar entitlements push and a matching
read endpoint.

All routes here are token-gated; the feature-gate dependency
(``require_feature``) is not applied to /session itself because the
entire point of /session is to establish that state.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from pvlayout_engine.schemas import SessionEntitlementsRequest, SessionInfoResponse
from pvlayout_engine.session import SessionState, get_session

router = APIRouter(tags=["session"])


@router.post(
    "/session/entitlements",
    response_model=SessionInfoResponse,
    summary="Push the shell's current entitlements to the sidecar",
    description=(
        "Called by the React shell after it has fetched entitlements from "
        "api.solarlayout.in. Replaces the current session's "
        "`available_features` set verbatim. Subsequent calls overwrite "
        "previous state — the shell is always the source of truth."
    ),
)
def push_entitlements(
    payload: SessionEntitlementsRequest,
    session: Annotated[SessionState, Depends(get_session)],
) -> SessionInfoResponse:
    session.update(
        available_features=set(payload.available_features),
        plan_name=payload.plan_name,
    )
    snap = session.snapshot()
    return SessionInfoResponse(
        initialized=bool(snap["initialized"]),
        available_features=list(snap["available_features"] or []),
        plan_name=snap["plan_name"],  # type: ignore[arg-type]
    )


@router.get(
    "/session",
    response_model=SessionInfoResponse,
    summary="Read the sidecar's current session entitlements",
    description=(
        "Diagnostics for the shell and the gate test — returns whether "
        "entitlements have been pushed, the feature keys the sidecar will "
        "accept, and the plan name (informational)."
    ),
)
def get_session_info(
    session: Annotated[SessionState, Depends(get_session)],
) -> SessionInfoResponse:
    snap = session.snapshot()
    return SessionInfoResponse(
        initialized=bool(snap["initialized"]),
        available_features=list(snap["available_features"] or []),
        plan_name=snap["plan_name"],  # type: ignore[arg-type]
    )
