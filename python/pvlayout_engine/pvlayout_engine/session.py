"""
Sidecar per-session state — currently just the entitlements set pushed in
by the React shell after it has fetched them from api.solarlayout.in.

Why the sidecar stores entitlements:
  * Defense in depth — even though the shell hides feature-gated UI, the
    sidecar independently rejects feature-gated routes (/export/dxf,
    /energy-yield, etc.) when the feature key isn't in the set.
  * The shell cannot speak for the sidecar's enforcement layer — the
    sidecar is the only code that can write a DXF file.

Why push rather than fetch:
  * Single network dependency path. The shell holds the license key and
    does the /entitlements call; the sidecar never needs the key at boot.
  * Mid-session updates (user pastes a new key, user upgrades via the
    web dashboard and refreshes) work naturally — the shell re-pushes.
  * Sidecar startup stays fast and deterministic; no waiting on
    api.solarlayout.in before READY.

Trust model:
  * The sidecar is bound to loopback and token-gated. Only the user's
    own shell can call it. A tampered shell "attacking" the sidecar is
    the user attacking themselves — real revenue protection lives on
    api.solarlayout.in via /usage/report quota decrements.

State lifecycle:
  * ``initialized = False`` on boot. Feature-gated routes return 503 in
    this window, distinguishing "not yet entitled" from "not entitled".
  * After the shell posts /session/entitlements, ``initialized = True``
    and ``available_features`` is the authoritative set for routes.
  * A subsequent POST replaces (not unions) the set — the shell is
    always the source of truth.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status


@dataclass
class SessionState:
    """In-memory per-session entitlements snapshot.

    Not persisted — a sidecar restart drops the state and requires the
    shell to push entitlements again on next boot. That matches the
    shell's own boot flow (fetch from api.solarlayout.in on every
    launch) per ADR 0001.
    """

    initialized: bool = False
    available_features: set[str] = field(default_factory=set)
    plan_name: str | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def update(self, *, available_features: set[str], plan_name: str | None) -> None:
        with self._lock:
            self.available_features = set(available_features)
            self.plan_name = plan_name
            self.initialized = True

    def clear(self) -> None:
        with self._lock:
            self.available_features = set()
            self.plan_name = None
            self.initialized = False

    def has_feature(self, name: str) -> bool:
        with self._lock:
            return name in self.available_features

    def snapshot(self) -> dict[str, object]:
        """Shallow copy safe to serialize without holding the lock."""
        with self._lock:
            return {
                "initialized": self.initialized,
                "available_features": sorted(self.available_features),
                "plan_name": self.plan_name,
            }


# --- FastAPI integration ----------------------------------------------------


def get_session(request: Request) -> SessionState:
    """Dependency that pulls the SessionState off ``app.state``.

    Installed on app startup in ``server.build_app``.
    """
    state: SessionState | None = getattr(request.app.state, "session", None)
    if state is None:
        # Developer error — the server factory always installs it. Surface
        # the misconfiguration loudly rather than silently 500-ing later.
        raise RuntimeError("SessionState not attached to app.state.session")
    return state


def require_feature(feature_key: str):
    """Build a FastAPI dependency that enforces a single feature key.

    Usage::

        @router.post("/export/dxf", dependencies=[Depends(require_feature("dxf"))])
        def export_dxf(...): ...

    Behaviour:
      * 503 ``session_not_initialized`` — before the shell pushes entitlements.
        Distinct from 403 so the shell can retry (push) rather than surface
        an "upgrade" banner.
      * 403 ``feature_not_entitled`` — entitlements loaded but ``feature_key``
        not in the set.
      * Otherwise, pass-through.
    """

    def dep(
        session: Annotated[SessionState, Depends(get_session)],
    ) -> None:
        if not session.initialized:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": "session_not_initialized",
                    "message": "Entitlements have not been pushed to the sidecar yet.",
                },
            )
        if not session.has_feature(feature_key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "feature_not_entitled",
                    "feature": feature_key,
                    "message": f"The current session is not entitled to feature {feature_key!r}.",
                },
            )

    return dep
