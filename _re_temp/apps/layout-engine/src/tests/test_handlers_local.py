"""
Integration test for handlers.py — Spike 2b local contract.
Runs the full layout pipeline on a synthetic KMZ. No S3 or DB required.
"""
import io
import os
import zipfile

import pytest

from handlers import handle_layout

# A minimal KMZ: one roughly 200m × 220m rectangular boundary
# located at 72.000–72.002°E, 23.000–23.002°N (UTM zone 43N, India)
MINIMAL_KML = """\
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test Site</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              72.000,23.000,0
              72.002,23.000,0
              72.002,23.002,0
              72.000,23.002,0
              72.000,23.000,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>"""


@pytest.fixture
def test_kmz(tmp_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("doc.kml", MINIMAL_KML)
    kmz_path = tmp_path / "test.kmz"
    kmz_path.write_bytes(buf.getvalue())
    return str(kmz_path)


def test_handle_layout_local_creates_all_artifacts(test_kmz, tmp_path):
    output_dir = str(tmp_path / "output")
    os.makedirs(output_dir)

    result = handle_layout({
        "kmz_local_path": test_kmz,
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
    })

    assert os.path.exists(os.path.join(output_dir, "layout.kmz"))
    assert os.path.exists(os.path.join(output_dir, "layout.svg"))
    assert os.path.exists(os.path.join(output_dir, "layout.dxf"))

    stats = result["stats"]
    assert "total_tables" in stats
    assert "total_capacity_mwp" in stats
    assert "num_icrs" in stats
    assert stats["total_capacity_mwp"] >= 0
