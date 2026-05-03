"""Smoketest Lambda handler — proves C3 plumbing.

Deleted in C4 when parse-kmz arrives.
"""

from __future__ import annotations

import os
from typing import Any


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    """Return a trivial JSON response.

    Reads GIT_SHA from env (baked at build time by the Dockerfile's
    ARG GIT_SHA → ENV GIT_SHA pattern). Imports pvlayout_core to prove
    the path-dep is wired into the container runtime.
    """
    try:
        import pvlayout_core  # noqa: F401

        pvlayout_core_importable = True
    except ImportError:
        pvlayout_core_importable = False

    return {
        "ok": True,
        "engine_version": os.environ.get("GIT_SHA", "unknown"),
        "pvlayout_core_importable": pvlayout_core_importable,
    }
