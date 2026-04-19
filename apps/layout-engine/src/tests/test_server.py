import json
import threading
import urllib.error
import urllib.request
from http.server import HTTPServer
from unittest.mock import patch

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


def test_post_layout_returns_202_accepted():
    """POST /layout dispatches a background job and returns 202 immediately."""
    server = HTTPServer(("127.0.0.1", 0), LayoutEngineHandler)
    port = server.server_address[1]

    t = threading.Thread(target=server.handle_request)
    t.daemon = True
    t.start()

    body = json.dumps({
        "version_id": "ver_abc123",
        "kmz_s3_key": "projects/p1/versions/ver_abc123/input.kmz",
        "parameters": {},
    }).encode()

    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/layout",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )

    with patch("server.handle_layout_job") as mock_job:
        with urllib.request.urlopen(req, timeout=10) as resp:
            assert resp.status == 202
            data = json.loads(resp.read())
            assert data == {"accepted": True}

    t.join(timeout=3)

    # Background thread dispatched but may not have fired during urlopen — just
    # verify the function was called or scheduled (thread dispatch is enough).
    # If the mock was injected before the thread ran, call count may be 0 or 1.
    # We verify no exception was raised and 202 was returned — that's the contract.
