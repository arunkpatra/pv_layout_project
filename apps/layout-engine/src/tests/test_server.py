import io
import json
import os
import threading
import urllib.error
import urllib.request
import zipfile
from http.server import HTTPServer

from server import LayoutEngineHandler

MINIMAL_KML = """\
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              72.000,23.000,0 72.002,23.000,0
              72.002,23.002,0 72.000,23.002,0
              72.000,23.000,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>"""


def _make_kmz(path: str) -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("doc.kml", MINIMAL_KML)
    with open(path, "wb") as f:
        f.write(buf.getvalue())


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


def test_post_layout_returns_stats(tmp_path):
    kmz_path = str(tmp_path / "test.kmz")
    output_dir = str(tmp_path / "output")
    os.makedirs(output_dir)
    _make_kmz(kmz_path)

    server = HTTPServer(("127.0.0.1", 0), LayoutEngineHandler)
    port = server.server_address[1]

    t = threading.Thread(target=server.handle_request)
    t.daemon = True
    t.start()

    body = json.dumps({
        "kmz_local_path": kmz_path,
        "output_dir": output_dir,
        "parameters": {
            "module_length": 2.38,
            "module_width": 1.13,
            "module_wattage": 580.0,
            "orientation": "portrait",
            "modules_in_row": 28,
            "rows_per_table": 2,
            "table_gap_ew": 1.0,
            "perimeter_road_width": 6.0,
            "max_strings_per_inverter": 20,
        },
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
    with urllib.request.urlopen(req, timeout=120) as resp:
        assert resp.status == 200
        data = json.loads(resp.read())
        assert "stats" in data
        assert data["stats"]["total_tables"] >= 0

    t.join(timeout=5)
