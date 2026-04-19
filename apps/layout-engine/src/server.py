"""
Layout engine HTTP server.
Spike 2a: GET /health only.
POST /layout added in Spike 2b.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


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

    def log_message(self, format, *args):  # noqa: A002
        pass  # suppress access logs


def run(port: int = 5000) -> None:
    server = HTTPServer(("0.0.0.0", port), LayoutEngineHandler)
    print(f"Layout engine listening on port {port}")
    server.serve_forever()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    run(port)
