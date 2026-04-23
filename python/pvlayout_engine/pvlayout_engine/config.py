"""
Sidecar runtime configuration.

Resolves the port the sidecar listens on, the bearer token it expects, and
the reported version string. All three can be injected by the Tauri shell
via environment variables; sensible dev-mode fallbacks are provided.
"""
from __future__ import annotations

import os
import secrets
import socket
import subprocess
from dataclasses import dataclass
from pathlib import Path

from pvlayout_engine import __version__ as _PKG_VERSION


ENV_PORT = "PVLAYOUT_SIDECAR_PORT"
ENV_TOKEN = "PVLAYOUT_SIDECAR_TOKEN"
ENV_VERSION = "PVLAYOUT_VERSION"
ENV_HOST = "PVLAYOUT_SIDECAR_HOST"

DEFAULT_HOST = "127.0.0.1"


@dataclass(frozen=True)
class SidecarConfig:
    """Resolved runtime configuration for this sidecar session."""

    host: str
    port: int
    token: str
    version: str

    def startup_json(self) -> dict[str, object]:
        """The JSON dict written to stdout on ready so the parent process
        (Tauri shell, dev scripts) can discover where to connect.

        NOTE: includes the bearer token. The sidecar's stdout is piped to
        the parent and never written to disk.
        """
        return {
            "host": self.host,
            "port": self.port,
            "token": self.token,
            "version": self.version,
        }


def resolve_config() -> SidecarConfig:
    """Build a SidecarConfig from env + fallbacks."""
    return SidecarConfig(
        host=os.environ.get(ENV_HOST, DEFAULT_HOST),
        port=_resolve_port(),
        token=_resolve_token(),
        version=_resolve_version(),
    )


def _resolve_port() -> int:
    raw = os.environ.get(ENV_PORT)
    if raw:
        try:
            port = int(raw)
        except ValueError as exc:
            raise RuntimeError(
                f"Invalid {ENV_PORT}={raw!r}; expected an integer"
            ) from exc
        if not (1 <= port <= 65535):
            raise RuntimeError(f"{ENV_PORT}={port} out of range")
        return port
    # No env override — pick a free port by asking the OS.
    return _find_free_port()


def _find_free_port() -> int:
    """Bind a socket to port 0, read the assigned port, close.

    There is a tiny TOCTOU window between closing here and uvicorn binding,
    but on localhost with a short window it is effectively nil. If it does
    race in practice we'll add a retry loop.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((DEFAULT_HOST, 0))
        return s.getsockname()[1]


def _resolve_token() -> str:
    raw = os.environ.get(ENV_TOKEN)
    if raw:
        if len(raw) < 16:
            raise RuntimeError(
                f"{ENV_TOKEN} too short ({len(raw)} chars); need at least 16"
            )
        return raw
    # Dev mode — mint a fresh token for this session.
    return secrets.token_urlsafe(32)


def _resolve_version() -> str:
    """Build a version string.

    Order of precedence:
      1. ``PVLAYOUT_VERSION`` env var (set at build time by S14 release pipeline).
      2. Short git SHA if the sidecar is running from a git checkout.
      3. The package ``__version__`` string as a last resort.
    """
    raw = os.environ.get(ENV_VERSION)
    if raw:
        return raw

    sha = _git_short_sha()
    if sha:
        return f"{_PKG_VERSION}+git.{sha}"

    return _PKG_VERSION


def _git_short_sha() -> str | None:
    # Walk up from this file to find a .git dir, then ask git for the sha.
    here = Path(__file__).resolve().parent
    for parent in (here, *here.parents):
        if (parent / ".git").exists():
            try:
                sha = subprocess.check_output(
                    ["git", "rev-parse", "--short", "HEAD"],
                    cwd=parent,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    timeout=2,
                ).strip()
                return sha or None
            except (OSError, subprocess.SubprocessError):
                return None
    return None
