"""
Sidecar entry point.

Resolves the runtime config (port/token/version), prints a single-line
JSON document to stdout so the parent process (Tauri shell or dev script)
can parse ``{host, port, token, version}``, then hands control to uvicorn.

Invoked as::

    uv run python -m pvlayout_engine.main

or, from a PyInstaller bundle (S4+)::

    ./pvlayout-engine
"""
from __future__ import annotations

import json
import logging
import sys

import uvicorn

from pvlayout_engine.config import resolve_config
from pvlayout_engine.server import build_app


def _announce_ready(config) -> None:  # noqa: ANN001 — frozen dataclass
    """Write the startup JSON to stdout and flush.

    The parent process captures our stdout to discover how to connect.
    We prefix with ``READY `` so multi-line logging output can be filtered
    out by a simple ``startswith`` check on the parent side.
    """
    payload = {"ready": True, **config.startup_json()}
    sys.stdout.write(f"READY {json.dumps(payload)}\n")
    sys.stdout.flush()


def main() -> int:
    # Minimal logging config — structured observability arrives in S14.
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )

    config = resolve_config()
    app = build_app(config)

    # Announce BEFORE uvicorn starts logging. The parent process doesn't
    # wait for an HTTP probe — it parses this one line and moves on.
    _announce_ready(config)

    # uvicorn.run blocks until the server is stopped.
    uvicorn.run(
        app,
        host=config.host,
        port=config.port,
        log_level="info",
        access_log=False,  # request logs are emitted by our middleware
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
