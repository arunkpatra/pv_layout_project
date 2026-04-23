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
import os
import sys
import threading
import time

import uvicorn

from pvlayout_engine.config import resolve_config
from pvlayout_engine.server import build_app


log = logging.getLogger("pvlayout_engine")


def _announce_ready(config) -> None:  # noqa: ANN001 — frozen dataclass
    """Write the startup JSON to stdout and flush.

    The parent process captures our stdout to discover how to connect.
    We prefix with ``READY `` so multi-line logging output can be filtered
    out by a simple ``startswith`` check on the parent side.
    """
    payload = {"ready": True, **config.startup_json()}
    sys.stdout.write(f"READY {json.dumps(payload)}\n")
    sys.stdout.flush()


def _watch_parent_exit(poll_interval_s: float = 1.0) -> None:
    """Exit the sidecar when its parent (the Tauri shell) goes away.

    The Tauri shell passes its own PID via ``PVLAYOUT_PARENT_PID`` when it
    spawns us. We watch *that* specific PID — not ``os.getppid()`` —
    because PyInstaller's onefile bootloader inserts itself between Tauri
    and the actual Python process, so our immediate parent is the
    bootloader, not Tauri.

    Polling every ``poll_interval_s``; ``os.kill(pid, 0)`` raises
    ``ProcessLookupError`` once the watched PID is gone. No signal is
    actually sent.

    If the env var is missing (e.g. running standalone for testing), the
    watchdog is a no-op.
    """
    raw = os.environ.get("PVLAYOUT_PARENT_PID")
    if not raw:
        return

    try:
        parent_pid = int(raw)
    except ValueError:
        log.warning("Invalid PVLAYOUT_PARENT_PID=%r; watchdog disabled", raw)
        return

    if parent_pid <= 1:
        return

    while True:
        time.sleep(poll_interval_s)
        try:
            os.kill(parent_pid, 0)
        except ProcessLookupError:
            log.warning("Parent process %d gone; exiting sidecar", parent_pid)
            os._exit(0)
        except PermissionError:
            # PID reused by a different user — treat as gone too.
            log.warning(
                "Parent process %d no longer signalable; exiting sidecar",
                parent_pid,
            )
            os._exit(0)
        except Exception:  # noqa: BLE001 — never take down the server
            return


def main() -> int:
    # Minimal logging config — structured observability arrives in S14.
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )

    config = resolve_config()
    app = build_app(config)

    # Start parent-death watchdog. Daemon thread so it doesn't block exit.
    threading.Thread(target=_watch_parent_exit, daemon=True).start()

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
