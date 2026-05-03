"""Sidecar /export-dxf route + structure parity (Row #10 of docs/PLAN.md).

Endpoint tests: smoke, two toggle behaviors, empty-input 422.
Structure parity: legacy ↔ new export_dxf produce DXFs with
identical layer sets, identical per-layer entity-type counts, and
per-entity geometry within 1e-6 m. Sys.path bootstrap fixture mirrors
rows #6/#7/#8/#9 patterns.

A LayoutResult fixture is built once at module scope by running
parse_kmz + run_layout_multi on phaseboundary2.kmz. Cable runs and
LA placements are then synthetically injected so the LA / cables
toggle assertions can verify their layers are populated by default
and absent when disabled.
"""

from __future__ import annotations

import io
import math
import sys
from pathlib import Path
from typing import Any

import ezdxf
import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.adapters import result_from_core
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "row10-export-dxf-test-token-abcdefghij"
LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")
# KMZ fixtures moved to pvlayout_core per cloud-offload C2.
# parents[3] from this file = repo_root/python/.
KMZ_FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "pvlayout_core/tests/golden/kmz/phaseboundary2.kmz"
)
POS_TOL = 1e-6


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> TestClient:
    """A TestClient for the sidecar app."""
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+row10-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    """Bearer token header (matches existing detect-water test pattern)."""
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture(scope="module")
def core_layout_results() -> list:
    """Build a list of core LayoutResult once — used by both endpoint
    tests (round-tripped to wire) and the structure-parity test.

    Cable runs + LA placements are injected synthetically so the layer
    contents are non-trivial regardless of LayoutParameters defaults.
    """
    from pvlayout_core.core.kmz_parser import parse_kmz
    from pvlayout_core.core.layout_engine import run_layout_multi
    from pvlayout_core.models.project import (
        CableRun,
        LayoutParameters,
        PlacedLA,
    )

    parsed = parse_kmz(str(KMZ_FIXTURE))
    params = LayoutParameters()
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    valid = [r for r in results if r.usable_polygon is not None]
    assert valid, "expected at least one valid LayoutResult from phaseboundary2.kmz"

    # Inject one DC + one AC cable run + one LA per result so layer
    # contents are non-empty under default LayoutParameters.
    for r in valid:
        if r.placed_tables:
            t0 = r.placed_tables[0]
            t1 = r.placed_tables[-1]
            r.dc_cable_runs.append(
                CableRun(
                    start_utm=(t0.x, t0.y),
                    end_utm=(t1.x, t1.y),
                    route_utm=[(t0.x, t0.y), (t1.x, t1.y)],
                )
            )
            r.ac_cable_runs.append(
                CableRun(
                    start_utm=(t0.x, t0.y + 5),
                    end_utm=(t1.x, t1.y + 5),
                    route_utm=[(t0.x, t0.y + 5), (t1.x, t1.y + 5)],
                )
            )
        # Place an LA at the boundary centroid-ish (within usable bounds)
        minx, miny, maxx, maxy = r.usable_polygon.bounds
        cx = (minx + maxx) / 2
        cy = (miny + maxy) / 2
        r.placed_las.append(
            PlacedLA(
                x=cx - 1.0,
                y=cy - 1.0,
                width=2.0,
                height=2.0,
                radius=15.0,
                index=1,
            )
        )

    return valid


@pytest.fixture(scope="module")
def export_request_body(core_layout_results) -> dict[str, Any]:
    """Wire-shape request body for POST /export-dxf."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    wire_results = [result_from_core(r) for r in core_layout_results]
    return {
        "results": [r.model_dump(mode="json") for r in wire_results],
        "params": WireParams().model_dump(mode="json"),
        "include_la": True,
        "include_cables": True,
    }


def _purge_legacy_modules() -> None:
    """Remove cached bare-namespace modules so legacy and new-app
    namespaces don't collide. Legacy's dxf_exporter imports from
    models.* and utils.*; layout_engine imports from core.*."""
    for m in list(sys.modules):
        if (
            m == "core" or m.startswith("core.")
            or m == "models" or m.startswith("models.")
            or m == "utils" or m.startswith("utils.")
        ):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_dxf():
    """Module-scoped sys.path bootstrap → yields legacy export_dxf
    plus parse_kmz / run_layout_multi / project module so the parity
    test can build a legacy LayoutResult of equivalent shape."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core.dxf_exporter import export_dxf as legacy_export
        from core import kmz_parser as legacy_parser
        from core import layout_engine as legacy_engine
        from models import project as legacy_project
        yield (legacy_export, legacy_parser, legacy_engine, legacy_project)
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


def _read_dxf_from_response(content: bytes):
    """ezdxf 1.x: prefer readfile via tempfile for binary-safe handling."""
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        return ezdxf.readfile(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def test_export_dxf_smoke(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """POST /export-dxf returns a valid DXF with all expected layers."""
    resp = client.post("/export-dxf", headers=auth(), json=export_request_body)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/dxf"
    assert "layout.dxf" in resp.headers.get("content-disposition", "")

    doc = _read_dxf_from_response(resp.content)
    layer_names = {layer.dxf.name for layer in doc.layers}
    expected = {
        "BOUNDARY", "OBSTACLES", "TABLES", "ICR", "OBSTRUCTIONS",
        "INVERTERS", "ANNOTATIONS", "DC_CABLES", "AC_CABLE_TRENCH", "LA",
    }
    assert expected.issubset(layer_names), (
        f"missing layers: {expected - layer_names}"
    )

    # Modelspace should have at least the boundary polylines + tables + LA + cables.
    msp_entities = list(doc.modelspace())
    assert len(msp_entities) > 0, "modelspace is empty"


def test_export_dxf_excludes_la_when_toggled_off(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """include_la=False → LA layer absent and no entity references it."""
    body = dict(export_request_body)
    body["include_la"] = False
    resp = client.post("/export-dxf", headers=auth(), json=body)
    assert resp.status_code == 200, resp.text

    doc = _read_dxf_from_response(resp.content)
    layer_names = {layer.dxf.name for layer in doc.layers}
    assert "LA" not in layer_names

    for entity in doc.modelspace():
        assert entity.dxf.layer != "LA", (
            f"unexpected LA-layer entity {entity.dxftype()}"
        )


def test_export_dxf_excludes_cables_when_toggled_off(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """include_cables=False → DC_CABLES + AC_CABLE_TRENCH layers absent."""
    body = dict(export_request_body)
    body["include_cables"] = False
    resp = client.post("/export-dxf", headers=auth(), json=body)
    assert resp.status_code == 200, resp.text

    doc = _read_dxf_from_response(resp.content)
    layer_names = {layer.dxf.name for layer in doc.layers}
    assert "DC_CABLES" not in layer_names
    assert "AC_CABLE_TRENCH" not in layer_names

    for entity in doc.modelspace():
        assert entity.dxf.layer not in ("DC_CABLES", "AC_CABLE_TRENCH"), (
            f"unexpected cable-layer entity {entity.dxftype()} on {entity.dxf.layer}"
        )


def test_export_dxf_empty_results_returns_422(client: TestClient) -> None:
    """results=[] returns 422 with explicit message."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    body = {
        "results": [],
        "params": WireParams().model_dump(mode="json"),
        "include_la": True,
        "include_cables": True,
    }
    resp = client.post("/export-dxf", headers=auth(), json=body)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "results must be non-empty"


# ---------------------------------------------------------------------------
# Structure parity (legacy ↔ new) — the row's "parity DXF structure match"
# acceptance.
# ---------------------------------------------------------------------------


def _entity_sort_key(entity) -> tuple:
    """Stable sort key per (layer, type) group — primary coord(s)."""
    t = entity.dxftype()
    if t == "LWPOLYLINE":
        pts = list(entity.get_points("xy"))
        return (pts[0][0], pts[0][1]) if pts else (0.0, 0.0)
    if t == "CIRCLE":
        return (entity.dxf.center.x, entity.dxf.center.y)
    if t in ("TEXT", "MTEXT"):
        ins = entity.dxf.insert
        return (ins.x, ins.y)
    return (0.0, 0.0)


def _group_by_layer_type(doc) -> dict:
    """Group modelspace entities by (layer, dxftype()) and sort each group
    by a stable spatial key."""
    groups: dict[tuple[str, str], list] = {}
    for entity in doc.modelspace():
        key = (entity.dxf.layer, entity.dxftype())
        groups.setdefault(key, []).append(entity)
    for key, lst in groups.items():
        lst.sort(key=_entity_sort_key)
    return groups


def _assert_lwpolyline_eq(a, b, label: str) -> None:
    a_pts = list(a.get_points("xy"))
    b_pts = list(b.get_points("xy"))
    assert len(a_pts) == len(b_pts), (
        f"{label} LWPOLYLINE point-count drift: {len(a_pts)} vs {len(b_pts)}"
    )
    for i, ((ax, ay), (bx, by)) in enumerate(zip(a_pts, b_pts)):
        assert math.isclose(ax, bx, abs_tol=POS_TOL), f"{label}[{i}].x"
        assert math.isclose(ay, by, abs_tol=POS_TOL), f"{label}[{i}].y"
    assert bool(a.closed) == bool(b.closed), f"{label} closed flag drift"


def _assert_circle_eq(a, b, label: str) -> None:
    assert math.isclose(a.dxf.center.x, b.dxf.center.x, abs_tol=POS_TOL), f"{label}.cx"
    assert math.isclose(a.dxf.center.y, b.dxf.center.y, abs_tol=POS_TOL), f"{label}.cy"
    assert math.isclose(a.dxf.radius, b.dxf.radius, abs_tol=POS_TOL), f"{label}.radius"


def _assert_text_eq(a, b, label: str) -> None:
    assert a.dxf.text == b.dxf.text, f"{label} text drift"
    assert math.isclose(a.dxf.insert.x, b.dxf.insert.x, abs_tol=POS_TOL), f"{label}.x"
    assert math.isclose(a.dxf.insert.y, b.dxf.insert.y, abs_tol=POS_TOL), f"{label}.y"
    assert math.isclose(a.dxf.height, b.dxf.height, abs_tol=POS_TOL), f"{label}.height"


def test_export_dxf_structure_parity_with_legacy(
    legacy_dxf, core_layout_results, tmp_path: Path
) -> None:
    """Legacy ↔ new export_dxf produce structurally-equivalent DXFs.

    Builds a legacy LayoutResult for the same boundary fixture (re-running
    parse_kmz + run_layout_multi on the legacy side), injects matching
    cable / LA content, then writes both DXFs and compares layer sets,
    per-(layer, type) entity counts, and per-entity geometry.
    """
    legacy_export, legacy_parser, legacy_engine, legacy_project = legacy_dxf

    # --- Build legacy core LayoutResult with the same injected fixture ---
    legacy_parsed = legacy_parser.parse_kmz(str(KMZ_FIXTURE))
    legacy_params = legacy_project.LayoutParameters()
    legacy_results = legacy_engine.run_layout_multi(
        boundaries=legacy_parsed.boundaries,
        params=legacy_params,
        centroid_lat=legacy_parsed.centroid_lat,
        centroid_lon=legacy_parsed.centroid_lon,
    )
    legacy_valid = [r for r in legacy_results if r.usable_polygon is not None]
    assert len(legacy_valid) == len(core_layout_results), (
        "legacy/new valid-result count drift — fixture build mismatch"
    )

    # Mirror the cable + LA injections (same coords, same fields).
    for legacy_r, new_r in zip(legacy_valid, core_layout_results):
        for c in new_r.dc_cable_runs:
            legacy_r.dc_cable_runs.append(
                legacy_project.CableRun(
                    start_utm=c.start_utm,
                    end_utm=c.end_utm,
                    route_utm=list(c.route_utm),
                )
            )
        for c in new_r.ac_cable_runs:
            legacy_r.ac_cable_runs.append(
                legacy_project.CableRun(
                    start_utm=c.start_utm,
                    end_utm=c.end_utm,
                    route_utm=list(c.route_utm),
                )
            )
        for la in new_r.placed_las:
            legacy_r.placed_las.append(
                legacy_project.PlacedLA(
                    x=la.x, y=la.y, width=la.width, height=la.height,
                    radius=la.radius, index=la.index,
                )
            )

    # --- Write both DXFs ---
    legacy_path = tmp_path / "legacy.dxf"
    new_path = tmp_path / "new.dxf"

    legacy_export(
        legacy_valid, legacy_params, str(legacy_path),
        include_la=True, include_cables=True,
    )

    from pvlayout_core.core.dxf_exporter import export_dxf as new_export
    from pvlayout_core.models.project import LayoutParameters as NewParams
    new_export(
        core_layout_results, NewParams(), str(new_path),
        include_la=True, include_cables=True,
    )

    # --- Parse + compare ---
    legacy_doc = ezdxf.readfile(str(legacy_path))
    new_doc = ezdxf.readfile(str(new_path))

    legacy_layers = {l.dxf.name for l in legacy_doc.layers}
    new_layers = {l.dxf.name for l in new_doc.layers}
    # Spike 1 §2.2 — the AC layer was renamed AC_CABLES → AC_CABLE_TRENCH
    # to make the EPC distinction explicit (trench corridor vs per-inverter
    # copper BoM). Normalize legacy → new for the parity comparison so the
    # rest of the structure (everything else identical) stays asserted.
    legacy_layers = {
        ("AC_CABLE_TRENCH" if l == "AC_CABLES" else l) for l in legacy_layers
    }
    common = {
        "BOUNDARY", "OBSTACLES", "TABLES", "ICR", "OBSTRUCTIONS",
        "INVERTERS", "ANNOTATIONS", "DC_CABLES", "AC_CABLE_TRENCH", "LA",
    }
    assert common.issubset(legacy_layers), (
        f"legacy missing layers: {common - legacy_layers}"
    )
    assert common.issubset(new_layers), (
        f"new missing layers: {common - new_layers}"
    )
    extra_legacy = legacy_layers - common
    extra_new = new_layers - common
    assert extra_legacy == extra_new, (
        f"system-layer drift: legacy {extra_legacy} vs new {extra_new}"
    )

    legacy_groups = _group_by_layer_type(legacy_doc)
    new_groups = _group_by_layer_type(new_doc)

    # Spike 1 §2.2 — normalize the AC layer rename when grouping too,
    # mirroring the layer-name normalization above. Same intent: assert
    # structural parity (same groups, same counts), accept the deliberate
    # rename.
    legacy_groups = {
        (("AC_CABLE_TRENCH" if layer == "AC_CABLES" else layer), dxftype): v
        for (layer, dxftype), v in legacy_groups.items()
    }

    assert set(legacy_groups) == set(new_groups), (
        f"(layer, type) group key drift: "
        f"only legacy {set(legacy_groups) - set(new_groups)}, "
        f"only new {set(new_groups) - set(legacy_groups)}"
    )

    for key in sorted(legacy_groups):
        layer, dxftype = key
        legacy_list = legacy_groups[key]
        new_list = new_groups[key]
        assert len(legacy_list) == len(new_list), (
            f"({layer}, {dxftype}) count drift: "
            f"legacy {len(legacy_list)} vs new {len(new_list)}"
        )
        for i, (la, na) in enumerate(zip(legacy_list, new_list)):
            label = f"({layer}, {dxftype})[{i}]"
            if dxftype == "LWPOLYLINE":
                _assert_lwpolyline_eq(la, na, label)
            elif dxftype == "CIRCLE":
                _assert_circle_eq(la, na, label)
            elif dxftype in ("TEXT", "MTEXT"):
                _assert_text_eq(la, na, label)
            # Other types (POINT, LINE, etc.) — count parity is enough.
