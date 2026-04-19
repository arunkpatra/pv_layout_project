"""
Layout engine HTTP server.
Spike 2b: GET /health + POST /layout (local contract, synchronous).
POST /layout becomes 202 fire-and-forget in Spike 2c.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from handlers import handle_layout


class LayoutEngineHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = json.dumps({"status": "ok"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/layout":
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))
            result = handle_layout(payload)
            response = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):  # noqa: A002
        pass  # suppress access logs


def run(port: int = 8000) -> None:
    server = HTTPServer(("0.0.0.0", port), LayoutEngineHandler)
    print(f"Layout engine listening on port {port}")
    server.serve_forever()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    run(port)
