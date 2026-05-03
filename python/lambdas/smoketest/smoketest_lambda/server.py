"""Local HTTP server for smoketest Lambda — sync-mode demonstrator.

Runs natively on the host via:

    cd python/lambdas/smoketest && uv run python -m smoketest_lambda.server

Pattern source: journium-bip-pipeline/src/server.py (transport)
                + journium-litellm-proxy/src/server.py (HTTP handler shape).

Sync-mode (per spec C3.5): POST /invoke calls handler.handler(body, None)
inline and returns its dict as JSON; 200 on success, 500 on exception.
GET /health returns {"ok": true}.

Throwaway: deleted in C4 alongside the rest of python/lambdas/smoketest/.
Future Lambdas (parse-kmz at C4 = sync-mode; compute-layout at C6 =
async-mode 202+daemon-thread) follow this same shape adapted to their
cloud trigger type. Async pattern reference: journium-bip-pipeline.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from smoketest_lambda.handler import handler as lambda_handler

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
)

logger = logging.getLogger(__name__)

PORT = int(os.environ.get("PORT", "4100"))


class SmoketestHandler(BaseHTTPRequestHandler):
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
    server = HTTPServer(("0.0.0.0", PORT), SmoketestHandler)
    logger.info("smoketest local server listening on port %d", PORT)
    server.serve_forever()


if __name__ == "__main__":
    main()
