"""Local HTTP server for parse-kmz Lambda — sync-mode (per spec C3.5 + C4).

Runs natively on the host:

    cd python/lambdas/parse-kmz
    uv run python -m parse_kmz_lambda.server

Pattern source: journium-bip-pipeline/src/server.py + journium-litellm-proxy/src/server.py
(transport stays in server.py; handler.handler is unchanged from cloud).

Sync-mode: POST /invoke calls handler.handler(body, None) inline and returns
its dict as JSON; 200 on success, 500 on Python exception. GET /health returns
{"ok": true}.

Port 4101 per spec C3.5 + python/lambdas/README.md.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from parse_kmz_lambda.handler import handler as lambda_handler

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

PORT = int(os.environ.get("PORT", "4101"))


class ParseKmzHandler(BaseHTTPRequestHandler):
    """Routes: GET /health, POST /invoke."""

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        logger.info("[%s] %s", self.address_string(), format % args)

    def _send_json(self, status: int, body: dict[str, Any]) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send_json(200, {"ok": True})
            return
        self._send_json(404, {"error": f"not found: {self.path}"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/invoke":
            self._send_json(404, {"error": f"not found: {self.path}"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        try:
            event = json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            self._send_json(400, {"error": f"invalid JSON: {exc}"})
            return

        try:
            result = lambda_handler(event, None)
        except Exception as exc:  # noqa: BLE001
            logger.exception("handler raised")
            self._send_json(500, {"error": str(exc)})
            return

        self._send_json(200, result)


def main() -> None:
    server = HTTPServer(("0.0.0.0", PORT), ParseKmzHandler)
    logger.info("parse-kmz local server listening on port %d", PORT)
    server.serve_forever()


if __name__ == "__main__":
    main()
