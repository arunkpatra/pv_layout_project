import json
import threading
import urllib.error
import urllib.request
from http.server import HTTPServer

from server import LayoutEngineHandler


def test_health_returns_200_with_ok_body():
    server = HTTPServer(("127.0.0.1", 0), LayoutEngineHandler)
    port = server.server_address[1]

    t = threading.Thread(target=server.handle_request)
    t.daemon = True
    t.start()

    with urllib.request.urlopen(f"http://127.0.0.1:{port}/health") as resp:
        assert resp.status == 200
        assert resp.headers["Content-Type"] == "application/json"
        data = json.loads(resp.read())
        assert data == {"status": "ok"}

    t.join(timeout=3)


def test_unknown_route_returns_404():
    server = HTTPServer(("127.0.0.1", 0), LayoutEngineHandler)
    port = server.server_address[1]

    t = threading.Thread(target=server.handle_request)
    t.daemon = True
    t.start()

    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/nonexistent")
        assert False, "Expected HTTPError"
    except urllib.error.HTTPError as e:
        assert e.code == 404

    t.join(timeout=3)
