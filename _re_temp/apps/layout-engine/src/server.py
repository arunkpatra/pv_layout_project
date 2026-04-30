"""Layout engine HTTP server.

GET  /health  → 200 {"status": "ok"}
POST /layout  → 202 {"accepted": true}  (fires handle_layout_job in a daemon thread)

Request body for POST /layout:
  {
    "version_id":  str   — Version.id from the DB
  }
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from handlers import handle_layout_job


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

            version_id = payload["version_id"]

            t = threading.Thread(
                target=handle_layout_job,
                args=(version_id,),
                daemon=True,
            )
            t.start()

            body = json.dumps({"accepted": True}).encode()
            self.send_response(202)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):  # noqa: A002
        pass


def run(port: int = 8000) -> None:
    server = HTTPServer(("0.0.0.0", port), LayoutEngineHandler)
    print(f"Layout engine listening on port {port}")
    server.serve_forever()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    run(port)
