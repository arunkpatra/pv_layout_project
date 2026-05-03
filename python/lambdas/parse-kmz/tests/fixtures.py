"""Synthetic KMZ fixtures for parse-kmz Lambda tests.

Each generator returns raw bytes of a .kmz archive (zip containing a doc.kml).
Used to exercise the validation gradient without hand-crafting binary blobs
in test files.
"""
from __future__ import annotations

import io
import zipfile


def kmz_from_kml(kml_text: str) -> bytes:
    """Wrap KML text into a KMZ archive (zip containing doc.kml)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("doc.kml", kml_text)
    return buf.getvalue()


def garbage_bytes() -> bytes:
    """Return bytes that look nothing like a KMZ (text file with .kmz rename simulation)."""
    return b"This is just a text file pretending to be KMZ\n"


def kmz_with_no_boundaries() -> bytes:
    """Valid KMZ structure but no boundary Placemarks — exercises level-1 validation."""
    kml = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Empty</name>
  </Document>
</kml>"""
    return kmz_from_kml(kml)


def kmz_with_two_vertex_boundary() -> bytes:
    """Valid KMZ with a boundary that has only 2 coords — exercises level-2 validation."""
    kml = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>boundary</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>78.0,12.0,0 78.1,12.0,0</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>"""
    return kmz_from_kml(kml)


def kmz_with_out_of_range_coords() -> bytes:
    """Valid KMZ with coords outside WGS84 — exercises level-3 validation."""
    kml = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>boundary</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>200.0,12.0,0 200.1,12.0,0 200.0,12.1,0 200.0,12.0,0</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>"""
    return kmz_from_kml(kml)


def kmz_with_self_intersecting_polygon() -> bytes:
    """Valid KMZ with a bow-tie polygon — exercises level-4 validation."""
    kml = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>boundary</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>78.0,12.0,0 78.1,12.1,0 78.1,12.0,0 78.0,12.1,0 78.0,12.0,0</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>"""
    return kmz_from_kml(kml)
