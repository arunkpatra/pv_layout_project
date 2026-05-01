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
import multiprocessing
import os
import socket
import sys
import threading
import time

import uvicorn

from pvlayout_engine.config import resolve_config
from pvlayout_engine.server import build_app


log = logging.getLogger("pvlayout_engine")


def _announce_ready(config) -> None:  # noqa: ANN001 — frozen dataclass
    """Write the startup JSON to stdout and flush.

    IMPORTANT: must fire only *after* uvicorn has bound the TCP socket.
    The parent (Tauri) uses this as the "go ahead and connect" signal;
    publishing it before the socket is listening causes a race where the
    client's first request hits connection-refused. We attach this to a
    FastAPI lifespan in ``main()`` so it runs after bind + before serve.

    We prefix with ``READY `` so multi-line logging can be filtered out by
    a simple ``startswith`` check on the parent side.
    """
    payload = {"ready": True, **config.startup_json()}
    sys.stdout.write(f"READY {json.dumps(payload)}\n")
    sys.stdout.flush()


def _announce_when_listening(
    config,  # noqa: ANN001
    poll_interval_s: float = 0.05,
    timeout_s: float = 10.0,
) -> None:
    """Wait until uvicorn actually accepts TCP connections, then emit READY.

    uvicorn runs lifespan startup *before* binding the socket, so any
    startup-event hook announces too early. A TCP connect attempt is the
    ground-truth signal that the server is reachable. If the timeout
    passes without a successful connect we announce anyway — the parent
    will see its next fetch fail, which is a better failure mode than
    hanging forever.
    """
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(
                (config.host, config.port), timeout=poll_interval_s
            ):
                _announce_ready(config)
                return
        except (OSError, ConnectionRefusedError, TimeoutError):
            time.sleep(poll_interval_s)
    # Timed out. Announce anyway so the parent stops waiting; subsequent
    # requests will surface the real problem.
    log.warning(
        "uvicorn did not start accepting connections within %.1fs; "
        "announcing READY anyway",
        timeout_s,
    )
    _announce_ready(config)


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

    # Poll TCP connect in a background thread; emit READY only once uvicorn
    # is actually accepting connections. Uvicorn runs lifespan startup
    # *before* it binds the socket, so a FastAPI startup event would still
    # announce too early; polling the real socket is the reliable signal.
    threading.Thread(
        target=_announce_when_listening, args=(config,), daemon=True
    ).start()

    # Start parent-death watchdog. Daemon thread so it doesn't block exit.
    threading.Thread(target=_watch_parent_exit, daemon=True).start()

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
    # MUST be the first call inside the `__main__` guard. Required for
    # PyInstaller-bundled binaries that use `multiprocessing` with the
    # `spawn` start method: workers re-execute the entry point, and
    # without `freeze_support()` they would re-run `main()` and spin up
    # their own uvicorn servers. Harmless no-op when running unbundled.
    multiprocessing.freeze_support()
    raise SystemExit(main())
