"""Smoketest Lambda handler — verifies plumbing only.

This Lambda exists to prove the C3 monorepo build/push pipeline. It
imports pvlayout_core (to prove the path-dep wires correctly) and
returns a trivial JSON response carrying the GIT_SHA env var (which
the Dockerfile bakes at build time per D21's pattern).

Deleted in C4.
"""

from __future__ import annotations

import os

from smoketest_lambda.handler import handler


def test_handler_returns_ok():
    """Handler returns a dict with ok=True."""
    response = handler({}, None)
    assert isinstance(response, dict)
    assert response["ok"] is True


def test_handler_returns_engine_version_from_env():
    """Handler reads GIT_SHA from env and returns it as engine_version."""
    os.environ["GIT_SHA"] = "test-sha-abc123"
    try:
        response = handler({}, None)
        assert response["engine_version"] == "test-sha-abc123"
    finally:
        del os.environ["GIT_SHA"]


def test_handler_engine_version_defaults_to_unknown():
    """Handler returns 'unknown' when GIT_SHA is unset."""
    os.environ.pop("GIT_SHA", None)
    response = handler({}, None)
    assert response["engine_version"] == "unknown"


def test_handler_imports_pvlayout_core():
    """Handler proves pvlayout_core is importable in the runtime."""
    response = handler({}, None)
    # The handler attempts the import internally and surfaces the result.
    assert response["pvlayout_core_importable"] is True
