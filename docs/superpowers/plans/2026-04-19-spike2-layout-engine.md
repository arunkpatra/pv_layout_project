# Spike 2 — `apps/layout-engine` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/layout-engine` as a Python compute service in the monorepo — scaffold, full layout pipeline, S3 I/O, and direct DB state ownership — in three independently-verifiable sub-spikes.

**Architecture:** Python 3.13 stdlib HTTP server (no framework) wraps the layout pipeline from the existing desktop app (`/Users/arunkpatra/codebase/PVlayout_Advance`). Compute runs in `handlers.py`; S3 I/O in `s3_client.py`; DB transitions in `db_client.py`. The server returns 202 immediately and runs compute in a background thread. Python owns all DB state after the initial QUEUED write — Hono never updates job status after dispatch.

**Tech Stack:** Python 3.13, uv, pytest, ruff, Shapely, pyproj, matplotlib (Agg backend), simplekml, ezdxf, boto3, psycopg2-binary.

---

## Design Reference

- Spec: `docs/superpowers/specs/2026-04-19-spike2-design.md`
- Spike plan: `docs/initiatives/pv-layout-spike-plan.md` — Spikes 2a, 2b, 2c
- Source app to copy from: `/Users/arunkpatra/codebase/PVlayout_Advance`

---

## File Map

### Created from scratch

| File | Responsibility |
|---|---|
| `apps/layout-engine/pyproject.toml` | All Python deps, pytest config, ruff config |
| `apps/layout-engine/package.json` | Turbo workspace entry — lint/test/build scripts |
| `apps/layout-engine/src/server.py` | HTTP server: GET /health (2a), POST /layout (2b→2c) |
| `apps/layout-engine/src/svg_exporter.py` | Headless matplotlib SVG render with gid-tagged groups |
| `apps/layout-engine/src/handlers.py` | Layout pipeline orchestration (2b local → 2c production) |
| `apps/layout-engine/src/s3_client.py` | boto3 S3 download/upload helpers |
| `apps/layout-engine/src/db_client.py` | psycopg2 LayoutJob + Version status transitions |
| `apps/layout-engine/src/tests/test_server.py` | Health endpoint tests |
| `apps/layout-engine/src/tests/test_svg_exporter.py` | gid group presence tests |
| `apps/layout-engine/src/tests/test_handlers_local.py` | End-to-end local pipeline test (Spike 2b) |
| `apps/layout-engine/src/tests/test_s3_client.py` | S3 client unit tests (mocked boto3) |
| `apps/layout-engine/src/tests/test_db_client.py` | DB client unit tests (mocked psycopg2) |

### Copied verbatim from `PVlayout_Advance`

| Source | Destination | Change |
|---|---|---|
| `PVlayout_Advance/core/` (all .py files) | `apps/layout-engine/src/core/` | Add `matplotlib.use('Agg')` to `pdf_exporter.py` only |
| `PVlayout_Advance/models/project.py` | `apps/layout-engine/src/models/project.py` | None |
| `PVlayout_Advance/utils/geo_utils.py` | `apps/layout-engine/src/utils/geo_utils.py` | None |

### Modified

| File | Change |
|---|---|
| `turbo.json` | No change needed — layout-engine's `package.json` scripts are picked up automatically via `apps/*` workspace glob |

---

## Key API Signatures (reference for all tasks)

```python
# core/kmz_parser.py
def parse_kmz(path: str) -> KMZParseResult:
    # .boundaries: List[BoundaryInfo]
    # .centroid_lat: float
    # .centroid_lon: float

# core/layout_engine.py
def run_layout_multi(
    boundaries: List[BoundaryInfo],
    params: LayoutParameters,
    centroid_lat: float,
    centroid_lon: float,
) -> List[LayoutResult]: ...

# core/string_inverter_manager.py
def place_string_inverters(result: LayoutResult, params: LayoutParameters) -> None: ...

# core/la_manager.py
def place_lightning_arresters(result: LayoutResult, params: Optional[LayoutParameters] = None) -> None: ...

# core/kmz_exporter.py
def export_kmz(results: List[LayoutResult], params: LayoutParameters, output_path: str) -> None: ...

# core/dxf_exporter.py
def export_dxf(results: List[LayoutResult], params: LayoutParameters, output_path: str) -> None: ...
```

---

## ── SPIKE 2a: SCAFFOLD ──

### Task 1: Create project scaffold

**Files:**
- Create: `apps/layout-engine/pyproject.toml`
- Create: `apps/layout-engine/package.json`

- [ ] **Step 1: Create `apps/layout-engine/pyproject.toml`**

```toml
[project]
name = "layout-engine"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = [
    "shapely>=2.0",
    "pyproj>=3.5",
    "matplotlib>=3.7",
    "simplekml>=1.3",
    "ezdxf",
    "requests>=2.28",
    "boto3>=1.35",
    "psycopg2-binary>=2.9",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
]

[tool.pytest.ini_options]
testpaths = ["src/tests"]
pythonpath = ["src"]

[tool.ruff]
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I"]
ignore = ["E501"]
```

- [ ] **Step 2: Create `apps/layout-engine/package.json`**

```json
{
  "name": "layout-engine",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "lint": "cd apps/layout-engine && uv run ruff check src/",
    "test": "cd apps/layout-engine && uv run pytest",
    "typecheck": "echo 'no separate typecheck for layout-engine — ruff covers it'",
    "build": "echo 'no build step for layout-engine'"
  }
}
```

> **Note:** These scripts are run by turbo from the repo root, which is why they `cd apps/layout-engine` first. Turbo will pick up this package automatically via the `apps/*` workspace glob.

- [ ] **Step 3: Run `uv sync` to lock dependencies**

```bash
cd apps/layout-engine
uv sync
```

Expected: `uv.lock` created, all packages installed with no errors.

- [ ] **Step 4: Commit scaffold**

```bash
cd /path/to/repo/root
git add apps/layout-engine/pyproject.toml apps/layout-engine/package.json apps/layout-engine/uv.lock
git commit -m "feat(layout-engine): add pyproject.toml and package.json scaffold"
```

---

### Task 2: Copy source files from PVlayout_Advance

**Files:**
- Create: `apps/layout-engine/src/core/` (all .py files)
- Create: `apps/layout-engine/src/models/project.py`
- Create: `apps/layout-engine/src/utils/geo_utils.py`
- Create: `apps/layout-engine/src/models/__init__.py`
- Create: `apps/layout-engine/src/utils/__init__.py`
- Create: `apps/layout-engine/src/core/__init__.py`
- Create: `apps/layout-engine/src/tests/__init__.py`

- [ ] **Step 1: Copy source directories**

```bash
SRC=/Users/arunkpatra/codebase/PVlayout_Advance
DEST=/Users/arunkpatra/codebase/renewable_energy/apps/layout-engine/src

mkdir -p $DEST/core $DEST/models $DEST/utils $DEST/tests

# Copy core (all .py files, skip __pycache__)
cp $SRC/core/kmz_parser.py $DEST/core/
cp $SRC/core/layout_engine.py $DEST/core/
cp $SRC/core/spacing_calc.py $DEST/core/
cp $SRC/core/icr_placer.py $DEST/core/
cp $SRC/core/string_inverter_manager.py $DEST/core/
cp $SRC/core/la_manager.py $DEST/core/
cp $SRC/core/road_manager.py $DEST/core/
cp $SRC/core/energy_calculator.py $DEST/core/
cp $SRC/core/kmz_exporter.py $DEST/core/
cp $SRC/core/dxf_exporter.py $DEST/core/
cp $SRC/core/pdf_exporter.py $DEST/core/

# Copy models and utils
cp $SRC/models/project.py $DEST/models/
cp $SRC/utils/geo_utils.py $DEST/utils/

# Create __init__.py files
touch $DEST/core/__init__.py $DEST/models/__init__.py $DEST/utils/__init__.py $DEST/tests/__init__.py
```

- [ ] **Step 2: Add `matplotlib.use('Agg')` to `pdf_exporter.py`**

Open `apps/layout-engine/src/core/pdf_exporter.py`. Find:
```python
import matplotlib
import matplotlib.pyplot as plt
```
Replace with:
```python
import matplotlib
matplotlib.use('Agg')  # headless — no display required
import matplotlib.pyplot as plt
```

This line must appear before ANY other matplotlib import. It's the only core file that imports matplotlib.

- [ ] **Step 3: Run ruff to verify no violations**

```bash
cd apps/layout-engine
uv run ruff check src/core/ src/models/ src/utils/
```

Expected: zero violations (or only minor ones you can fix inline — `F401` unused imports are fine to ignore with `# noqa: F401` if ruff flags them).

- [ ] **Step 4: Commit copied source**

```bash
git add apps/layout-engine/src/
git commit -m "feat(layout-engine): copy core/models/utils from PVlayout_Advance"
```

---

### Task 3: Write health check server (TDD)

**Files:**
- Create: `apps/layout-engine/src/server.py`
- Create: `apps/layout-engine/src/tests/test_server.py`

- [ ] **Step 1: Write the failing test**

Create `apps/layout-engine/src/tests/test_server.py`:

```python
import json
import threading
from http.server import HTTPServer

import urllib.request
import urllib.error

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_server.py -v
```

Expected: `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 3: Write `server.py` (health check only)**

Create `apps/layout-engine/src/server.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_server.py -v
```

Expected:
```
test_server.py::test_health_returns_200_with_ok_body PASSED
test_server.py::test_unknown_route_returns_404 PASSED
```

- [ ] **Step 5: Manually verify server starts**

```bash
cd apps/layout-engine
PYTHONPATH=src uv run python src/server.py &
curl http://localhost:5000/health
kill %1
```

Expected output from curl: `{"status": "ok"}`

---

### Task 4: Spike 2a checkpoint — gates + commit

- [ ] **Step 1: Run all monorepo static gates**

```bash
cd /path/to/repo/root
bun run lint && bun run typecheck && bun run test && bun run build
```

All four must pass. If layout-engine's lint or test task fails, fix it before continuing.

- [ ] **Step 2: Commit Spike 2a**

```bash
git add apps/layout-engine/src/server.py apps/layout-engine/src/tests/test_server.py
git commit -m "feat(layout-engine): spike 2a complete — scaffold + health check server"
```

**Spike 2a acceptance criteria checklist (human verification):**
- [ ] `uv sync` runs cleanly from `apps/layout-engine`
- [ ] `curl http://localhost:5000/health` returns `{"status": "ok"}`
- [ ] `uv run python src/server.py` starts with no errors
- [ ] `uv run ruff check src/` passes with zero violations
- [ ] All monorepo gates pass

---

## ── SPIKE 2b: COMPUTE (LOCAL) ──

### Task 5: Write svg_exporter.py (TDD)

**Files:**
- Create: `apps/layout-engine/src/svg_exporter.py`
- Create: `apps/layout-engine/src/tests/test_svg_exporter.py`

- [ ] **Step 1: Write the failing test**

Create `apps/layout-engine/src/tests/test_svg_exporter.py`:

```python
import os
import tempfile
import xml.etree.ElementTree as ET

from shapely.geometry import Polygon

from models.project import LayoutResult
from svg_exporter import export_svg


def _minimal_result() -> LayoutResult:
    """A LayoutResult with just a boundary polygon — no tables placed."""
    result = LayoutResult()
    result.boundary_name = "Test Boundary"
    result.utm_epsg = 32643  # UTM zone 43N (covers 72°E longitude)
    result.boundary_wgs84 = [
        (72.000, 23.000),
        (72.002, 23.000),
        (72.002, 23.002),
        (72.000, 23.002),
        (72.000, 23.000),
    ]
    result.obstacle_polygons_wgs84 = []
    result.usable_polygon = Polygon([(0, 0), (200, 0), (200, 200), (0, 200)])
    return result


EXPECTED_GIDS = {
    "boundary",
    "obstacles",
    "tables",
    "icrs",
    "inverters",
    "dc-cables",
    "ac-cables",
    "la-footprints",
    "la-circles",
    "annotations",
}


def test_export_svg_creates_file():
    result = _minimal_result()
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        path = f.name
    try:
        export_svg([result], path)
        assert os.path.exists(path)
        assert os.path.getsize(path) > 0
    finally:
        os.unlink(path)


def test_export_svg_has_all_gid_groups():
    result = _minimal_result()
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        path = f.name
    try:
        export_svg([result], path)
        tree = ET.parse(path)
        root = tree.getroot()
        # Collect all id attributes anywhere in the SVG tree
        found_ids = {
            elem.get("id")
            for elem in root.iter()
            if elem.get("id") is not None
        }
        missing = EXPECTED_GIDS - found_ids
        assert not missing, f"Missing gid groups in SVG: {missing}"
    finally:
        os.unlink(path)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_svg_exporter.py -v
```

Expected: `ModuleNotFoundError: No module named 'svg_exporter'`

- [ ] **Step 3: Write `svg_exporter.py`**

Create `apps/layout-engine/src/svg_exporter.py`:

```python
"""
Headless SVG layout renderer.
Produces a single combined SVG for all layout boundaries with gid-tagged
layer groups so the frontend can toggle individual layers without re-fetching.

Groups (always present, even if empty):
  boundary, obstacles, tables, icrs, inverters,
  dc-cables, ac-cables, la-footprints, la-circles, annotations
"""
import matplotlib
matplotlib.use("Agg")  # headless — MUST be before any other matplotlib import

import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PatchCollection
from typing import List

from models.project import LayoutResult
from utils.geo_utils import wgs84_to_utm


def export_svg(results: List[LayoutResult], output_path: str) -> None:
    """Render all layout results to a single combined SVG file."""
    fig, ax = plt.subplots(figsize=(20, 16))
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_facecolor("#1a1a2e")
    fig.patch.set_facecolor("#1a1a2e")

    for result in results:
        _draw_result(ax, result)

    fig.savefig(output_path, format="svg", bbox_inches="tight")
    plt.close(fig)


def _draw_result(ax, result: LayoutResult) -> None:  # noqa: C901
    epsg = result.utm_epsg

    # ── Boundary ────────────────────────────────────────────────────────
    if result.boundary_wgs84 and epsg:
        utm_pts = wgs84_to_utm(result.boundary_wgs84, epsg)
        patch = mpatches.Polygon(
            utm_pts, closed=True,
            fill=False, edgecolor="#f0c040", linewidth=1.5,
        )
        patch.set_gid("boundary")
        ax.add_patch(patch)
    else:
        dummy = mpatches.Rectangle((0, 0), 0, 0, visible=False)
        dummy.set_gid("boundary")
        ax.add_patch(dummy)

    # ── Obstacles ────────────────────────────────────────────────────────
    obs_patches = []
    if epsg:
        for obs in result.obstacle_polygons_wgs84:
            utm_pts = wgs84_to_utm(obs, epsg)
            obs_patches.append(
                mpatches.Polygon(utm_pts, closed=True,
                                 facecolor="#cc3333", edgecolor="#ff6666",
                                 alpha=0.5, linewidth=1.0)
            )
    col = PatchCollection(obs_patches, match_original=True)
    col.set_gid("obstacles")
    ax.add_collection(col)

    # ── Tables ───────────────────────────────────────────────────────────
    table_patches = [
        mpatches.Rectangle((t.x, t.y), t.width, t.height,
                            facecolor="#3a6ea5", edgecolor="#5a9edf",
                            linewidth=0.3)
        for t in result.placed_tables
    ]
    col = PatchCollection(table_patches, match_original=True)
    col.set_gid("tables")
    ax.add_collection(col)

    # ── ICRs ─────────────────────────────────────────────────────────────
    icr_patches = [
        mpatches.Rectangle((icr.x, icr.y), icr.width, icr.height,
                            facecolor="#2a4a8a", edgecolor="#4a7adf",
                            linewidth=1.0)
        for icr in result.placed_icrs
    ]
    col = PatchCollection(icr_patches, match_original=True)
    col.set_gid("icrs")
    ax.add_collection(col)

    # ── String inverters ─────────────────────────────────────────────────
    inv_patches = [
        mpatches.Rectangle((inv.x, inv.y), inv.width, inv.height,
                            facecolor="#7fff00", edgecolor="#ffffff",
                            linewidth=0.5)
        for inv in result.placed_string_inverters
    ]
    col = PatchCollection(inv_patches, match_original=True)
    col.set_gid("inverters")
    ax.add_collection(col)

    # ── DC cables ────────────────────────────────────────────────────────
    dc_segs = [
        c.route_utm if c.route_utm else [c.start_utm, c.end_utm]
        for c in result.dc_cable_runs
    ]
    lc = LineCollection(dc_segs, colors="#ff8c00", linewidths=0.5, alpha=0.7)
    lc.set_gid("dc-cables")
    ax.add_collection(lc)

    # ── AC cables ────────────────────────────────────────────────────────
    ac_segs = [
        c.route_utm if c.route_utm else [c.start_utm, c.end_utm]
        for c in result.ac_cable_runs
    ]
    lc = LineCollection(ac_segs, colors="#cc00ff", linewidths=0.8, alpha=0.7)
    lc.set_gid("ac-cables")
    ax.add_collection(lc)

    # ── LA footprints ────────────────────────────────────────────────────
    la_patches = [
        mpatches.Rectangle((la.x, la.y), la.width, la.height,
                            facecolor="#8b0000", edgecolor="#ff4444",
                            linewidth=0.8)
        for la in result.placed_las
    ]
    col = PatchCollection(la_patches, match_original=True)
    col.set_gid("la-footprints")
    ax.add_collection(col)

    # ── LA protection circles ────────────────────────────────────────────
    circle_patches = [
        mpatches.Circle(
            (la.x + la.width / 2, la.y + la.height / 2), la.radius,
            fill=False, edgecolor="#ff4444",
            linewidth=0.5, linestyle="--", alpha=0.4,
        )
        for la in result.placed_las
    ]
    col = PatchCollection(circle_patches, match_original=True)
    col.set_gid("la-circles")
    ax.add_collection(col)

    # ── Annotations ──────────────────────────────────────────────────────
    ann = ax.text(0, 0, "", visible=False)
    ann.set_gid("annotations")

    ax.autoscale_view()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_svg_exporter.py -v
```

Expected:
```
test_svg_exporter.py::test_export_svg_creates_file PASSED
test_svg_exporter.py::test_export_svg_has_all_gid_groups PASSED
```

- [ ] **Step 5: Commit**

```bash
git add apps/layout-engine/src/svg_exporter.py apps/layout-engine/src/tests/test_svg_exporter.py
git commit -m "feat(layout-engine): add svg_exporter with gid-tagged layer groups"
```

---

### Task 6: Write handlers.py — Spike 2b local contract (TDD)

**Files:**
- Create: `apps/layout-engine/src/handlers.py`
- Create: `apps/layout-engine/src/tests/test_handlers_local.py`

> **Note:** The handler test runs the full compute pipeline on a synthetic KMZ. It may take 15–30 seconds for K-means + cable routing to complete. This is expected.

- [ ] **Step 1: Write the failing test**

Create `apps/layout-engine/src/tests/test_handlers_local.py`:

```python
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
            "tilt_angle": None,
            "row_spacing": None,
            "gcr": None,
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_handlers_local.py -v
```

Expected: `ModuleNotFoundError: No module named 'handlers'`

- [ ] **Step 3: Write `handlers.py` — Spike 2b version**

Create `apps/layout-engine/src/handlers.py`:

```python
"""
Layout engine handlers.
Spike 2b: handle_layout uses local file paths (no S3, no DB).
This module is rewritten in Spike 2c to use the production contract.
"""
import os
from typing import List

from core.dxf_exporter import export_dxf
from core.kmz_exporter import export_kmz
from core.kmz_parser import parse_kmz
from core.la_manager import place_lightning_arresters
from core.layout_engine import run_layout_multi
from core.string_inverter_manager import place_string_inverters
from models.project import (
    LayoutParameters,
    LayoutResult,
    ModuleSpec,
    Orientation,
    TableConfig,
)
from svg_exporter import export_svg


def _params_from_dict(p: dict) -> LayoutParameters:
    orientation = (
        Orientation.LANDSCAPE
        if str(p.get("orientation", "portrait")).lower() == "landscape"
        else Orientation.PORTRAIT
    )
    return LayoutParameters(
        tilt_angle=p.get("tilt_angle"),
        row_spacing=p.get("row_spacing"),
        gcr=p.get("gcr"),
        perimeter_road_width=float(p.get("perimeter_road_width", 6.0)),
        module=ModuleSpec(
            length=float(p.get("module_length", 2.38)),
            width=float(p.get("module_width", 1.13)),
            wattage=float(p.get("module_wattage", 580.0)),
        ),
        table=TableConfig(
            modules_in_row=int(p.get("modules_in_row", 28)),
            rows_per_table=int(p.get("rows_per_table", 2)),
            orientation=orientation,
        ),
        table_gap_ew=float(p.get("table_gap_ew", 1.0)),
        max_strings_per_inverter=int(p.get("max_strings_per_inverter", 20)),
    )


def _results_to_stats(results: List[LayoutResult]) -> dict:
    return {
        "total_tables": sum(len(r.placed_tables) for r in results),
        "total_modules": sum(r.total_modules for r in results),
        "total_capacity_mwp": round(sum(r.total_capacity_mwp for r in results), 3),
        "total_area_acres": round(sum(r.total_area_acres for r in results), 3),
        "num_icrs": sum(len(r.placed_icrs) for r in results),
        "num_string_inverters": sum(r.num_string_inverters for r in results),
        "total_dc_cable_m": round(sum(r.total_dc_cable_m for r in results), 1),
        "total_ac_cable_m": round(sum(r.total_ac_cable_m for r in results), 1),
        "num_las": sum(r.num_las for r in results),
    }


def handle_layout(payload: dict) -> dict:
    """
    Spike 2b contract (local testing — replaced by production contract in Spike 2c).

    payload keys:
      kmz_local_path: str   -- absolute path to local KMZ file
      output_dir: str       -- absolute path to write output artifacts
      parameters: dict      -- layout parameters

    Returns:
      { "stats": { total_tables, total_capacity_mwp, ... } }
    Writes to output_dir:
      layout.kmz, layout.svg, layout.dxf
    """
    kmz_path = payload["kmz_local_path"]
    output_dir = payload["output_dir"]
    params = _params_from_dict(payload.get("parameters", {}))

    parse_result = parse_kmz(kmz_path)
    results = run_layout_multi(
        parse_result.boundaries,
        params,
        parse_result.centroid_lat,
        parse_result.centroid_lon,
    )
    for r in results:
        place_string_inverters(r, params)
        place_lightning_arresters(r, params)

    export_kmz(results, params, os.path.join(output_dir, "layout.kmz"))
    export_svg(results, os.path.join(output_dir, "layout.svg"))
    export_dxf(results, params, os.path.join(output_dir, "layout.dxf"))

    return {"stats": _results_to_stats(results)}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_handlers_local.py -v
```

Expected (may take 15–30 seconds for compute):
```
test_handlers_local.py::test_handle_layout_local_creates_all_artifacts PASSED
```

- [ ] **Step 5: Commit**

```bash
git add apps/layout-engine/src/handlers.py apps/layout-engine/src/tests/test_handlers_local.py
git commit -m "feat(layout-engine): spike 2b handlers — full layout pipeline, local contract"
```

---

### Task 7: Add POST /layout to server.py (Spike 2b)

**Files:**
- Modify: `apps/layout-engine/src/server.py`
- Modify: `apps/layout-engine/src/tests/test_server.py`

- [ ] **Step 1: Write the failing test for POST /layout**

Add to `apps/layout-engine/src/tests/test_server.py`:

```python
import io
import json
import os
import threading
import urllib.request
import zipfile
from http.server import HTTPServer

from server import LayoutEngineHandler

# (existing tests above — add this below)

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


def test_post_layout_returns_stats(tmp_path):
    kmz_path = str(tmp_path / "test.kmz")
    output_dir = str(tmp_path / "output")
    os.makedirs(output_dir)
    _make_kmz(kmz_path)

    server = HTTPServer(("127.0.0.1", 0), LayoutEngineHandler)
    port = server.server_address[1]

    # Serve one request (POST /layout is synchronous in Spike 2b)
    t = threading.Thread(target=server.handle_request)
    t.daemon = True
    t.start()

    body = json.dumps({
        "kmz_local_path": kmz_path,
        "output_dir": output_dir,
        "parameters": {
            "module_length": 2.38, "module_width": 1.13,
            "module_wattage": 580.0, "orientation": "portrait",
            "modules_in_row": 28, "rows_per_table": 2,
            "table_gap_ew": 1.0, "perimeter_road_width": 6.0,
            "max_strings_per_inverter": 20,
        },
    }).encode()

    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/layout",
        data=body,
        headers={"Content-Type": "application/json", "Content-Length": str(len(body))},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        assert resp.status == 200
        data = json.loads(resp.read())
        assert "stats" in data
        assert data["stats"]["total_tables"] >= 0

    t.join(timeout=5)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_server.py::test_post_layout_returns_stats -v
```

Expected: FAIL (no `do_POST` method yet)

- [ ] **Step 3: Add `do_POST` to `server.py`**

In `apps/layout-engine/src/server.py`, add inside `LayoutEngineHandler` after `do_GET`:

```python
    def do_POST(self):
        if self.path == "/layout":
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))

            from handlers import handle_layout  # imported here to avoid circular at module load
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
```

- [ ] **Step 4: Run all server tests**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_server.py -v
```

Expected: all three tests PASS (health, 404, and POST /layout). The POST test may take 15–30 seconds.

- [ ] **Step 5: Manual end-to-end verification**

Start the server and test with a real KMZ file:

```bash
cd apps/layout-engine
PYTHONPATH=src uv run python src/server.py &

# Use a real KMZ file from the project
curl -s -X POST http://localhost:5000/layout \
  -H "Content-Type: application/json" \
  -d '{
    "kmz_local_path": "/absolute/path/to/real/site.kmz",
    "output_dir": "/tmp/layout_test",
    "parameters": {
      "module_length": 2.38, "module_width": 1.13, "module_wattage": 580.0,
      "orientation": "portrait", "modules_in_row": 28, "rows_per_table": 2,
      "table_gap_ew": 1.0, "perimeter_road_width": 6.0, "max_strings_per_inverter": 20
    }
  }' | python3 -m json.tool

kill %1
```

Then open `/tmp/layout_test/layout.svg` in a browser and use DevTools to inspect the DOM — verify these `<g>` elements exist: `boundary`, `obstacles`, `tables`, `icrs`, `inverters`, `dc-cables`, `ac-cables`, `la-footprints`, `la-circles`, `annotations`.

---

### Task 8: Spike 2b checkpoint — gates + commit

- [ ] **Step 1: Run all monorepo static gates**

```bash
cd /path/to/repo/root
bun run lint && bun run typecheck && bun run test && bun run build
```

- [ ] **Step 2: Commit Spike 2b**

```bash
git add apps/layout-engine/src/server.py apps/layout-engine/src/tests/test_server.py
git commit -m "feat(layout-engine): spike 2b complete — full layout compute, local contract"
```

**Spike 2b acceptance criteria checklist (human verification):**
- [ ] `POST /layout` with real KMZ path → artifacts appear in output dir
- [ ] `layout.svg` opened in browser — all 10 gid groups present in DOM inspector
- [ ] Stats JSON in response — values plausible for the site
- [ ] `matplotlib.use('Agg')` confirmed — no display errors in terminal
- [ ] `layout.dxf` opens correctly in a DXF viewer

---

## ── SPIKE 2c: S3 + DB INTEGRATION ──

### Task 9: Write s3_client.py (TDD)

**Files:**
- Create: `apps/layout-engine/src/s3_client.py`
- Create: `apps/layout-engine/src/tests/test_s3_client.py`

- [ ] **Step 1: Write the failing test**

Create `apps/layout-engine/src/tests/test_s3_client.py`:

```python
from unittest.mock import MagicMock, patch

from s3_client import download_from_s3, upload_to_s3


def test_download_from_s3_calls_boto3_correctly():
    mock_s3 = MagicMock()
    with patch("s3_client.boto3.client", return_value=mock_s3):
        download_from_s3(
            bucket="my-bucket",
            key="projects/p1/versions/v1/input.kmz",
            local_path="/tmp/input.kmz",
        )
    mock_s3.download_file.assert_called_once_with(
        "my-bucket",
        "projects/p1/versions/v1/input.kmz",
        "/tmp/input.kmz",
    )


def test_upload_to_s3_calls_boto3_correctly():
    mock_s3 = MagicMock()
    with patch("s3_client.boto3.client", return_value=mock_s3):
        upload_to_s3(
            bucket="my-bucket",
            local_path="/tmp/layout.svg",
            key="projects/p1/versions/v1/layout.svg",
        )
    mock_s3.upload_file.assert_called_once_with(
        "/tmp/layout.svg",
        "my-bucket",
        "projects/p1/versions/v1/layout.svg",
    )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_s3_client.py -v
```

Expected: `ModuleNotFoundError: No module named 's3_client'`

- [ ] **Step 3: Write `s3_client.py`**

Create `apps/layout-engine/src/s3_client.py`:

```python
"""
S3 helpers for the layout engine.
Downloads input KMZ from S3; uploads layout.kmz, layout.svg, layout.dxf.
"""
import os

import boto3


def _client():
    return boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION", "ap-south-1"),
    )


def download_from_s3(bucket: str, key: str, local_path: str) -> None:
    """Download an S3 object to a local file path."""
    _client().download_file(bucket, key, local_path)


def upload_to_s3(bucket: str, local_path: str, key: str) -> None:
    """Upload a local file to S3 at the given key."""
    _client().upload_file(local_path, bucket, key)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_s3_client.py -v
```

Expected:
```
test_s3_client.py::test_download_from_s3_calls_boto3_correctly PASSED
test_s3_client.py::test_upload_to_s3_calls_boto3_correctly PASSED
```

- [ ] **Step 5: Commit**

```bash
git add apps/layout-engine/src/s3_client.py apps/layout-engine/src/tests/test_s3_client.py
git commit -m "feat(layout-engine): add s3_client with download/upload helpers"
```

---

### Task 10: Write db_client.py (TDD)

**Files:**
- Create: `apps/layout-engine/src/db_client.py`
- Create: `apps/layout-engine/src/tests/test_db_client.py`

> **Note:** The DB client tests mock psycopg2 at the module level. They verify the correct SQL is executed and `commit()` is called, without requiring a live database. Human verification with a real DB happens in the Spike 2c acceptance criteria.

- [ ] **Step 1: Write the failing test**

Create `apps/layout-engine/src/tests/test_db_client.py`:

```python
import json
from unittest.mock import MagicMock, call, patch

from db_client import mark_layout_complete, mark_layout_failed, mark_layout_processing


def _mock_conn():
    conn = MagicMock()
    cursor_ctx = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor_ctx)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn, cursor_ctx


def test_mark_layout_processing_executes_two_updates():
    conn, cur = _mock_conn()
    with patch("db_client.psycopg2.connect", return_value=conn):
        mark_layout_processing("ver_abc123")

    assert cur.execute.call_count == 2
    # First call updates LayoutJob
    first_sql = cur.execute.call_args_list[0][0][0]
    assert "LayoutJob" in first_sql
    assert "PROCESSING" in first_sql
    # Second call updates Version
    second_sql = cur.execute.call_args_list[1][0][0]
    assert "Version" in second_sql
    conn.commit.assert_called_once()


def test_mark_layout_complete_sets_artifact_keys_and_stats():
    conn, cur = _mock_conn()
    stats = {"total_tables": 42, "total_capacity_mwp": 5.1}
    with patch("db_client.psycopg2.connect", return_value=conn):
        mark_layout_complete(
            version_id="ver_abc123",
            kmz_key="projects/p/versions/v/layout.kmz",
            svg_key="projects/p/versions/v/layout.svg",
            dxf_key="projects/p/versions/v/layout.dxf",
            stats=stats,
        )

    assert cur.execute.call_count == 2
    first_sql, first_args = cur.execute.call_args_list[0][0]
    assert "COMPLETE" in first_sql
    assert "kmzArtifactS3Key" in first_sql
    assert "svgArtifactS3Key" in first_sql
    assert "dxfArtifactS3Key" in first_sql
    assert "statsJson" in first_sql
    # Stats are JSON-serialised before passing to psycopg2
    assert json.loads(first_args[3]) == stats
    conn.commit.assert_called_once()


def test_mark_layout_failed_sets_error_detail():
    conn, cur = _mock_conn()
    with patch("db_client.psycopg2.connect", return_value=conn):
        mark_layout_failed("ver_abc123", "KMZ parse error: invalid coordinates")

    assert cur.execute.call_count == 2
    first_sql = cur.execute.call_args_list[0][0][0]
    assert "FAILED" in first_sql
    assert "errorDetail" in first_sql
    conn.commit.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_db_client.py -v
```

Expected: `ModuleNotFoundError: No module named 'db_client'`

- [ ] **Step 3: Write `db_client.py`**

Create `apps/layout-engine/src/db_client.py`:

```python
"""
Database client for the layout engine.
Uses raw psycopg2 — no ORM. Owns all LayoutJob and Version status transitions
after the initial QUEUED write (which Hono API owns).
"""
import json
import os

import psycopg2


def _connect():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def mark_layout_processing(version_id: str) -> None:
    """Transition LayoutJob and Version from QUEUED → PROCESSING."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE "LayoutJob"
                   SET status = 'PROCESSING', "startedAt" = NOW()
                   WHERE "versionId" = %s""",
                (version_id,),
            )
            cur.execute(
                """UPDATE "Version"
                   SET status = 'PROCESSING', "updatedAt" = NOW()
                   WHERE id = %s""",
                (version_id,),
            )
        conn.commit()


def mark_layout_complete(
    version_id: str,
    kmz_key: str,
    svg_key: str,
    dxf_key: str,
    stats: dict,
) -> None:
    """
    Transition LayoutJob PROCESSING → COMPLETE with artifact S3 keys and statsJson.
    Version remains PROCESSING — set to COMPLETE by energy job (or Spike 3 sets it
    COMPLETE directly if energy job not yet implemented).
    """
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE "LayoutJob"
                   SET status = 'COMPLETE',
                       "kmzArtifactS3Key" = %s,
                       "svgArtifactS3Key" = %s,
                       "dxfArtifactS3Key" = %s,
                       "statsJson" = %s,
                       "completedAt" = NOW()
                   WHERE "versionId" = %s""",
                (kmz_key, svg_key, dxf_key, json.dumps(stats), version_id),
            )
            # Version remains PROCESSING until energy job completes.
            # In local dev (no energy job yet), set COMPLETE directly.
            cur.execute(
                """UPDATE "Version"
                   SET status = 'COMPLETE', "updatedAt" = NOW()
                   WHERE id = %s""",
                (version_id,),
            )
        conn.commit()


def mark_layout_failed(version_id: str, error: str) -> None:
    """Transition LayoutJob and Version to FAILED with error detail."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE "LayoutJob"
                   SET status = 'FAILED',
                       "errorDetail" = %s,
                       "completedAt" = NOW()
                   WHERE "versionId" = %s""",
                (error[:500], version_id),
            )
            cur.execute(
                """UPDATE "Version"
                   SET status = 'FAILED', "updatedAt" = NOW()
                   WHERE id = %s""",
                (version_id,),
            )
        conn.commit()
```

> **Note on Version status in `mark_layout_complete`:** In the Spikes 2c + 3 scope (no energy job yet), the layout engine sets Version to COMPLETE after layout finishes. When Spike 8 adds the energy job, this will change to remain PROCESSING — energy job will set COMPLETE. Update the comment and the SQL at that time.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_db_client.py -v
```

Expected:
```
test_db_client.py::test_mark_layout_processing_executes_two_updates PASSED
test_db_client.py::test_mark_layout_complete_sets_artifact_keys_and_stats PASSED
test_db_client.py::test_mark_layout_failed_sets_error_detail PASSED
```

- [ ] **Step 5: Commit**

```bash
git add apps/layout-engine/src/db_client.py apps/layout-engine/src/tests/test_db_client.py
git commit -m "feat(layout-engine): add db_client with psycopg2 status transitions"
```

---

### Task 11: Rewrite handlers.py to production contract

**Files:**
- Modify: `apps/layout-engine/src/handlers.py`
- Modify: `apps/layout-engine/src/tests/test_handlers_local.py`

The Spike 2b contract is replaced entirely. The old test is removed and replaced with a new one that mocks S3 and DB (verifying the orchestration logic without needing real AWS or DB).

- [ ] **Step 1: Write the new failing test**

Replace `apps/layout-engine/src/tests/test_handlers_local.py` entirely with:

```python
"""
Unit tests for handlers.py — Spike 2c production contract.
S3 and DB are mocked; compute logic runs real (uses the synthetic KMZ).
"""
import io
import json
import os
import zipfile
from unittest.mock import MagicMock, call, patch

import pytest

from handlers import handle_layout

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


@pytest.fixture
def fake_kmz_bytes():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("doc.kml", MINIMAL_KML)
    return buf.getvalue()


def test_handle_layout_production_contract(fake_kmz_bytes, tmp_path):
    """
    handle_layout downloads KMZ from S3 (mocked), runs compute, uploads
    artifacts (mocked), and transitions DB state (mocked). Verify the
    orchestration calls are correct.
    """
    # Make download write our synthetic KMZ to the expected local path
    def fake_download(bucket, key, local_path):
        with open(local_path, "wb") as f:
            f.write(fake_kmz_bytes)

    mock_s3_download = MagicMock(side_effect=fake_download)
    mock_s3_upload = MagicMock()
    mock_processing = MagicMock()
    mock_complete = MagicMock()
    mock_failed = MagicMock()

    with (
        patch("handlers.download_from_s3", mock_s3_download),
        patch("handlers.upload_to_s3", mock_s3_upload),
        patch("handlers.mark_layout_processing", mock_processing),
        patch("handlers.mark_layout_complete", mock_complete),
        patch("handlers.mark_layout_failed", mock_failed),
        patch("handlers.BUCKET", "test-bucket"),
        patch("handlers.tempfile.mkdtemp", return_value=str(tmp_path)),
    ):
        handle_layout({
            "kmz_s3_key": "projects/p1/versions/v1/input.kmz",
            "version_id": "ver_test123",
            "parameters": {
                "module_length": 2.38, "module_width": 1.13,
                "module_wattage": 580.0, "orientation": "portrait",
                "modules_in_row": 28, "rows_per_table": 2,
                "table_gap_ew": 1.0, "perimeter_road_width": 6.0,
                "max_strings_per_inverter": 20,
            },
        })

    # DB transitions called in correct order
    mock_processing.assert_called_once_with("ver_test123")
    mock_failed.assert_not_called()
    mock_complete.assert_called_once()

    # Correct args to mark_layout_complete
    complete_args = mock_complete.call_args[1]  # kwargs
    assert complete_args["version_id"] == "ver_test123"
    assert complete_args["kmz_key"] == "projects/p1/versions/v1/layout.kmz"
    assert complete_args["svg_key"] == "projects/p1/versions/v1/layout.svg"
    assert complete_args["dxf_key"] == "projects/p1/versions/v1/layout.dxf"
    assert "total_tables" in complete_args["stats"]

    # S3 uploads: 3 artifacts
    assert mock_s3_upload.call_count == 3


def test_handle_layout_calls_mark_failed_on_error():
    """If compute fails, mark_layout_failed is called and the exception re-raises."""
    with (
        patch("handlers.download_from_s3", side_effect=Exception("S3 error")),
        patch("handlers.mark_layout_processing", MagicMock()),
        patch("handlers.mark_layout_complete", MagicMock()),
        patch("handlers.mark_layout_failed") as mock_failed,
        patch("handlers.BUCKET", "test-bucket"),
    ):
        with pytest.raises(Exception, match="S3 error"):
            handle_layout({
                "kmz_s3_key": "projects/p/versions/v/input.kmz",
                "version_id": "ver_fail",
                "parameters": {},
            })

    mock_failed.assert_called_once_with("ver_fail", "S3 error")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_handlers_local.py -v
```

Expected: `ImportError` or test failures (production contract not yet written).

- [ ] **Step 3: Rewrite `handlers.py` — production contract**

Replace `apps/layout-engine/src/handlers.py` entirely with:

```python
"""
Layout engine handlers — production contract (Spike 2c).

handle_layout:
  - Downloads input KMZ from S3
  - Runs full layout pipeline
  - Uploads KMZ + SVG + DXF artifacts to S3
  - Updates LayoutJob and Version in DB directly (Python owns all state)
  - Returns None; raises on fatal error (after writing FAILED to DB)

handle_energy: added in Spike 8.
"""
import os
import tempfile

from core.dxf_exporter import export_dxf
from core.kmz_exporter import export_kmz
from core.kmz_parser import parse_kmz
from core.la_manager import place_lightning_arresters
from core.layout_engine import run_layout_multi
from core.string_inverter_manager import place_string_inverters
from db_client import mark_layout_complete, mark_layout_failed, mark_layout_processing
from models.project import LayoutParameters, ModuleSpec, Orientation, TableConfig
from s3_client import download_from_s3, upload_to_s3
from svg_exporter import export_svg

BUCKET = os.environ.get("S3_BUCKET_NAME", "")


def _params_from_dict(p: dict) -> LayoutParameters:
    orientation = (
        Orientation.LANDSCAPE
        if str(p.get("orientation", "portrait")).lower() == "landscape"
        else Orientation.PORTRAIT
    )
    return LayoutParameters(
        tilt_angle=p.get("tilt_angle"),
        row_spacing=p.get("row_spacing"),
        gcr=p.get("gcr"),
        perimeter_road_width=float(p.get("perimeter_road_width", 6.0)),
        module=ModuleSpec(
            length=float(p.get("module_length", 2.38)),
            width=float(p.get("module_width", 1.13)),
            wattage=float(p.get("module_wattage", 580.0)),
        ),
        table=TableConfig(
            modules_in_row=int(p.get("modules_in_row", 28)),
            rows_per_table=int(p.get("rows_per_table", 2)),
            orientation=orientation,
        ),
        table_gap_ew=float(p.get("table_gap_ew", 1.0)),
        max_strings_per_inverter=int(p.get("max_strings_per_inverter", 20)),
    )


def _build_stats(results) -> dict:
    return {
        "total_tables": sum(len(r.placed_tables) for r in results),
        "total_modules": sum(r.total_modules for r in results),
        "total_capacity_mwp": round(sum(r.total_capacity_mwp for r in results), 3),
        "total_area_acres": round(sum(r.total_area_acres for r in results), 3),
        "num_icrs": sum(len(r.placed_icrs) for r in results),
        "num_string_inverters": sum(r.num_string_inverters for r in results),
        "total_dc_cable_m": round(sum(r.total_dc_cable_m for r in results), 1),
        "total_ac_cable_m": round(sum(r.total_ac_cable_m for r in results), 1),
        "num_las": sum(r.num_las for r in results),
    }


def handle_layout(payload: dict) -> None:
    """
    Production contract:
      kmz_s3_key: str    -- S3 key of input KMZ (uploaded by Hono on version submit)
      version_id: str    -- used to derive output S3 keys + DB record lookup
      parameters: dict   -- all layout parameters

    Returns: None
    Raises: exception on fatal error (after marking DB FAILED)
    """
    version_id = payload["version_id"]
    kmz_s3_key = payload["kmz_s3_key"]
    # Derive S3 key prefix from input key: "projects/p/versions/v/input.kmz"
    # → prefix: "projects/p/versions/v"
    key_prefix = kmz_s3_key.rsplit("/", 1)[0]

    try:
        mark_layout_processing(version_id)

        tmp_dir = tempfile.mkdtemp()
        local_kmz_in = os.path.join(tmp_dir, "input.kmz")
        local_kmz_out = os.path.join(tmp_dir, "layout.kmz")
        local_svg_out = os.path.join(tmp_dir, "layout.svg")
        local_dxf_out = os.path.join(tmp_dir, "layout.dxf")

        download_from_s3(BUCKET, kmz_s3_key, local_kmz_in)

        params = _params_from_dict(payload.get("parameters", {}))
        parse_result = parse_kmz(local_kmz_in)
        results = run_layout_multi(
            parse_result.boundaries,
            params,
            parse_result.centroid_lat,
            parse_result.centroid_lon,
        )
        for r in results:
            place_string_inverters(r, params)
            place_lightning_arresters(r, params)

        export_kmz(results, params, local_kmz_out)
        export_svg(results, local_svg_out)
        export_dxf(results, params, local_dxf_out)

        kmz_out_key = f"{key_prefix}/layout.kmz"
        svg_out_key = f"{key_prefix}/layout.svg"
        dxf_out_key = f"{key_prefix}/layout.dxf"

        upload_to_s3(BUCKET, local_kmz_out, kmz_out_key)
        upload_to_s3(BUCKET, local_svg_out, svg_out_key)
        upload_to_s3(BUCKET, local_dxf_out, dxf_out_key)

        mark_layout_complete(
            version_id=version_id,
            kmz_key=kmz_out_key,
            svg_key=svg_out_key,
            dxf_key=dxf_out_key,
            stats=_build_stats(results),
        )

    except Exception as exc:
        mark_layout_failed(version_id, str(exc))
        raise
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_handlers_local.py -v
```

Expected (may take 15–30 seconds for the compute):
```
test_handlers_local.py::test_handle_layout_production_contract PASSED
test_handlers_local.py::test_handle_layout_calls_mark_failed_on_error PASSED
```

- [ ] **Step 5: Commit**

```bash
git add apps/layout-engine/src/handlers.py apps/layout-engine/src/tests/test_handlers_local.py
git commit -m "feat(layout-engine): spike 2c handlers — production contract, S3+DB integration"
```

---

### Task 12: Update server.py to 202 fire-and-forget

**Files:**
- Modify: `apps/layout-engine/src/server.py`
- Modify: `apps/layout-engine/src/tests/test_server.py`

- [ ] **Step 1: Write the failing test for 202 behavior**

In `apps/layout-engine/src/tests/test_server.py`, replace `test_post_layout_returns_stats` with:

```python
def test_post_layout_returns_202_immediately():
    """
    POST /layout must return 202 before compute completes.
    handle_layout is mocked so the test doesn't run real compute.
    """
    import threading
    import urllib.request
    from http.server import HTTPServer
    from unittest.mock import MagicMock, patch

    mock_handle = MagicMock()  # does nothing — fast

    server = HTTPServer(("127.0.0.1", 0), LayoutEngineHandler)
    port = server.server_address[1]

    t = threading.Thread(target=server.handle_request)
    t.daemon = True
    t.start()

    body = json.dumps({
        "kmz_s3_key": "projects/p/versions/v/input.kmz",
        "version_id": "ver_test",
        "parameters": {},
    }).encode()

    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/layout",
        data=body,
        headers={"Content-Type": "application/json", "Content-Length": str(len(body))},
        method="POST",
    )

    with patch("server.handle_layout", mock_handle):
        with urllib.request.urlopen(req, timeout=5) as resp:
            assert resp.status == 202

    t.join(timeout=5)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_server.py::test_post_layout_returns_202_immediately -v
```

Expected: FAIL (server currently returns 200 synchronously)

- [ ] **Step 3: Rewrite `do_POST` in `server.py` for fire-and-forget**

Replace the `do_POST` method in `apps/layout-engine/src/server.py`:

```python
    def do_POST(self):
        if self.path == "/layout":
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))

            # Return 202 immediately — compute runs in background
            self.send_response(202)
            self.end_headers()

            threading.Thread(
                target=_run_layout_job,
                args=(payload,),
                daemon=True,
            ).start()
        else:
            self.send_response(404)
            self.end_headers()
```

Add the `threading` import and `_run_layout_job` function at the top of the file (after existing imports):

```python
import threading

from handlers import handle_layout


def _run_layout_job(payload: dict) -> None:
    """Background worker — exceptions are swallowed after DB FAILED write."""
    try:
        handle_layout(payload)
    except Exception as exc:
        print(f"[layout-engine] job failed for {payload.get('version_id')}: {exc}")
```

The full `server.py` at this point:

```python
"""
Layout engine HTTP server.
Spike 2c: POST /layout returns 202, compute runs in background thread.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from handlers import handle_layout


def _run_layout_job(payload: dict) -> None:
    """Background worker — exceptions are swallowed after DB FAILED write."""
    try:
        handle_layout(payload)
    except Exception as exc:
        print(f"[layout-engine] job failed for {payload.get('version_id')}: {exc}")


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

            self.send_response(202)
            self.end_headers()

            threading.Thread(
                target=_run_layout_job,
                args=(payload,),
                daemon=True,
            ).start()
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
```

- [ ] **Step 4: Run all server tests**

```bash
cd apps/layout-engine
uv run pytest src/tests/test_server.py -v
```

Expected:
```
test_server.py::test_health_returns_200_with_ok_body PASSED
test_server.py::test_unknown_route_returns_404 PASSED
test_server.py::test_post_layout_returns_202_immediately PASSED
```

- [ ] **Step 5: Commit**

```bash
git add apps/layout-engine/src/server.py apps/layout-engine/src/tests/test_server.py
git commit -m "feat(layout-engine): spike 2c server — 202 fire-and-forget, production contract"
```

---

### Task 13: Spike 2c checkpoint — full gates + human verification

- [ ] **Step 1: Run all monorepo static gates**

```bash
cd /path/to/repo/root
bun run lint && bun run typecheck && bun run test && bun run build
```

All four must pass with zero failures across all workspaces.

- [ ] **Step 2: Set required environment variables**

```bash
export AWS_REGION=ap-south-1
export AWS_ACCESS_KEY_ID=<your-key>
export AWS_SECRET_ACCESS_KEY=<your-secret>
export S3_BUCKET_NAME=renewable-energy-local-artifacts
export DATABASE_URL=postgresql://renewable:renewable@localhost:5432/renewable_energy
```

Ensure Postgres is running: `docker compose up -d`

- [ ] **Step 3: Start the layout engine**

```bash
cd apps/layout-engine
PYTHONPATH=src \
  AWS_REGION=$AWS_REGION \
  AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
  AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
  S3_BUCKET_NAME=$S3_BUCKET_NAME \
  DATABASE_URL=$DATABASE_URL \
  uv run python src/server.py
```

- [ ] **Step 4: Upload a test KMZ to S3 and insert a QUEUED Version + LayoutJob**

Upload your real site KMZ to S3:
```bash
aws s3 cp /path/to/real/site.kmz s3://renewable-energy-local-artifacts/projects/test-proj/versions/test-ver/input.kmz
```

Then insert test records via Prisma Studio (`bun run db:studio`) or psql:
```sql
INSERT INTO "Version" (id, "projectId", number, status, "kmzS3Key", "inputSnapshot", "createdAt", "updatedAt")
VALUES ('test-ver', 'test-proj', 1, 'QUEUED', 'projects/test-proj/versions/test-ver/input.kmz', '{}', NOW(), NOW());

INSERT INTO "LayoutJob" (id, "versionId", status, "createdAt", "updatedAt")
VALUES ('test-job', 'test-ver', 'QUEUED', NOW(), NOW());
```

- [ ] **Step 5: Send POST /layout and verify 202**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5000/layout \
  -H "Content-Type: application/json" \
  -d '{
    "kmz_s3_key": "projects/test-proj/versions/test-ver/input.kmz",
    "version_id": "test-ver",
    "parameters": {
      "module_length": 2.38, "module_width": 1.13, "module_wattage": 580.0,
      "orientation": "portrait", "modules_in_row": 28, "rows_per_table": 2,
      "table_gap_ew": 1.0, "perimeter_road_width": 6.0, "max_strings_per_inverter": 20
    }
  }'
```

Expected output: `202` (returned immediately before compute finishes)

- [ ] **Step 6: Verify DB transitions in Prisma Studio**

Open `bun run db:studio`. Refresh LayoutJob and Version records every 10–15 seconds. Confirm:
- `QUEUED → PROCESSING` (within a few seconds of sending POST)
- `PROCESSING → COMPLETE` (after compute finishes — may take 1–5 minutes for a real site)
- `statsJson` populated with non-null values
- `kmzArtifactS3Key`, `svgArtifactS3Key`, `dxfArtifactS3Key` all populated

- [ ] **Step 7: Verify artifacts in S3**

```bash
aws s3 ls s3://renewable-energy-local-artifacts/projects/test-proj/versions/test-ver/
```

Expected:
```
input.kmz
layout.kmz
layout.svg
layout.dxf
```

- [ ] **Step 8: Verify deliberate failure path**

Send a POST with a non-existent S3 key:
```bash
curl -s -X POST http://localhost:5000/layout \
  -H "Content-Type: application/json" \
  -d '{
    "kmz_s3_key": "projects/bad/versions/bad/input.kmz",
    "version_id": "test-ver-fail",
    "parameters": {}
  }'
```

(Insert a `test-ver-fail` Version + LayoutJob record first via Prisma Studio)

Confirm in Prisma Studio: `LayoutJob.status = FAILED`, `errorDetail` populated.

- [ ] **Step 9: Commit Spike 2c complete**

```bash
cd /path/to/repo/root
git add -A
git commit -m "feat(layout-engine): spike 2c complete — S3+DB integration, 202 fire-and-forget"
```

**Spike 2c acceptance criteria checklist (human verification):**
- [ ] POST /layout returns 202 immediately — curl confirms before compute finishes
- [ ] DB: LayoutJob QUEUED → PROCESSING → COMPLETE observed in Prisma Studio
- [ ] DB: Version QUEUED → PROCESSING → COMPLETE observed in Prisma Studio
- [ ] S3: layout.kmz, layout.svg, layout.dxf all present under correct keys
- [ ] `statsJson` populated correctly — spot-check one value
- [ ] Deliberate failure: LayoutJob status = FAILED, errorDetail populated
- [ ] All monorepo static gates pass
