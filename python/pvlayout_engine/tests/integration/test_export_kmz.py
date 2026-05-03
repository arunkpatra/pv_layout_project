"""Sidecar /export-kmz route + byte-equivalence vs legacy (Row #12 of docs/PLAN.md).

Endpoint tests: smoke (HTTP contract + zip+KML sniff), empty-input 422.
Byte-equivalence: legacy ↔ new export_kmz on the same LayoutResult[]
produce identical inner KML XML. Sys.path bootstrap fixture mirrors
rows #6/#7/#8/#9/#10 patterns. The new app's kmz_exporter.py has no
diff against legacy (only import-prefix differs), so byte-equality is
the strongest claim — any drift would be either a port bug or
upstream simplekml nondeterminism.
"""

from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.adapters import result_from_core
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "row12-export-kmz-test-token-abcdefghij"
LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")
# KMZ fixtures moved to pvlayout_core per cloud-offload C2.
# parents[3] from this file = repo_root/python/.
KMZ_FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "pvlayout_core/tests/golden/kmz/phaseboundary2.kmz"
)


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+row12-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture(scope="module")
def core_layout_results() -> list:
    """Run parse_kmz + run_layout_multi on phaseboundary2.kmz; filter to
    valid (usable_polygon non-None) results."""
    from pvlayout_core.core.kmz_parser import parse_kmz
    from pvlayout_core.core.layout_engine import run_layout_multi
    from pvlayout_core.models.project import LayoutParameters

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
    return valid


@pytest.fixture(scope="module")
def export_request_body(core_layout_results) -> dict[str, Any]:
    """Wire-shape body for POST /export-kmz."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    wire_results = [result_from_core(r) for r in core_layout_results]
    return {
        "results": [r.model_dump(mode="json") for r in wire_results],
        "params": WireParams().model_dump(mode="json"),
    }


def _purge_legacy_modules() -> None:
    """Remove cached bare-namespace modules so legacy and new-app
    namespaces don't collide. Legacy's kmz_exporter imports from
    models.* and utils.*; layout_engine imports from core.*."""
    for m in list(sys.modules):
        if (
            m == "core" or m.startswith("core.")
            or m == "models" or m.startswith("models.")
            or m == "utils" or m.startswith("utils.")
        ):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_kmz():
    """Module-scoped sys.path bootstrap → yields legacy export_kmz +
    parse_kmz / run_layout_multi / project module so the byte-equivalence
    test can build a legacy LayoutResult[] of equivalent shape."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core.kmz_exporter import export_kmz as legacy_export
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


def _read_kml_from_kmz(kmz_path: Path) -> bytes:
    """KMZ is a zip; the main KML is conventionally the first .kml member
    (simplekml writes 'doc.kml' by default). Returns the raw KML XML bytes."""
    with zipfile.ZipFile(kmz_path, "r") as zf:
        kml_names = [n for n in zf.namelist() if n.endswith(".kml")]
        assert len(kml_names) == 1, f"expected exactly one .kml member, got {kml_names}"
        return zf.read(kml_names[0])


# simplekml assigns auto-incrementing numeric IDs (id="N") to every
# Document, Folder, Placemark, and Style. The counter is process-global,
# so legacy and new export_kmz starting from different counter offsets
# emit differently-numbered IDs (e.g., id="6490" vs id="12979"). The IDs
# are XML-internal and carry no semantic meaning; normalize them out
# before comparing inner KML bytes. Same pattern applies to <styleUrl>#N
# references which point to those auto-generated style IDs.
_KML_ID_PATTERN = re.compile(rb' id="\d+"')
_KML_STYLEURL_PATTERN = re.compile(rb"<styleUrl>#\d+</styleUrl>")


def _normalize_kml(kml: bytes) -> bytes:
    """Strip simplekml's auto-generated numeric element IDs and styleUrl
    references so byte comparison is robust to counter-offset
    nondeterminism. See module docstring fallback note."""
    kml = _KML_ID_PATTERN.sub(b' id=""', kml)
    kml = _KML_STYLEURL_PATTERN.sub(b"<styleUrl>#</styleUrl>", kml)
    return kml


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


def test_export_kmz_smoke(
    client: TestClient,
    export_request_body: dict[str, Any],
    tmp_path: Path,
) -> None:
    """POST /export-kmz returns a valid KMZ (zip with one .kml member)."""
    resp = client.post("/export-kmz", headers=auth(), json=export_request_body)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/vnd.google-earth.kmz"
    assert "layout.kmz" in resp.headers.get("content-disposition", "")
    # Zip magic bytes: PK\x03\x04
    assert resp.content.startswith(b"PK\x03\x04"), "missing zip magic header"

    # Write to tmp file and verify it parses as a zip with one .kml member
    out_path = tmp_path / "out.kmz"
    out_path.write_bytes(resp.content)
    kml_bytes = _read_kml_from_kmz(out_path)
    assert kml_bytes.startswith(b"<?xml"), "KML missing XML declaration"
    assert b"<kml" in kml_bytes[:200], "KML missing <kml> root tag near start"


def test_export_kmz_empty_results_returns_422(client: TestClient) -> None:
    """results=[] returns 422 with explicit message."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    body = {
        "results": [],
        "params": WireParams().model_dump(mode="json"),
    }
    resp = client.post("/export-kmz", headers=auth(), json=body)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "results must be non-empty"


# ---------------------------------------------------------------------------
# Legacy byte-equivalence — the row's acceptance bar
# ---------------------------------------------------------------------------


@pytest.mark.skip(
    reason=(
        "Spike 1 §2.2 — KMZ summary text was intentionally split into "
        "'AC cable BoM length' + 'AC cable trench length' siblings to "
        "make the EPC distinction explicit. This diverges textually from "
        "legacy 'AC cable total'; byte-equivalence is no longer the bar. "
        "Cable-numeric correctness is asserted by "
        "tests/integration/test_layout_s11_5_cables.py (BoM bit-identical "
        "+ trench length sourced from sum(ac_cable_runs[*].length_m))."
    )
)
def test_export_kmz_byte_equivalent_to_legacy(
    legacy_kmz, tmp_path: Path
) -> None:
    """Legacy ↔ new export_kmz produce byte-identical inner KML XML.

    The new app's pvlayout_core/core/kmz_exporter.py has no diff against
    legacy (only import-prefix differs). With identical input results +
    same simplekml version, the generated KML XML should match byte-for-byte.

    Fallback if simplekml is non-deterministic: normalize before
    comparing, e.g. `re.sub(rb"<TimeStamp>.*?</TimeStamp>", b"", kml)`.
    Default is strict equality; only loosen on observed drift.
    """
    legacy_export, legacy_parser, legacy_engine, legacy_project = legacy_kmz

    # --- Build legacy core LayoutResult[] from the same KMZ fixture ---
    legacy_parsed = legacy_parser.parse_kmz(str(KMZ_FIXTURE))
    legacy_params = legacy_project.LayoutParameters()
    legacy_results = legacy_engine.run_layout_multi(
        boundaries=legacy_parsed.boundaries,
        params=legacy_params,
        centroid_lat=legacy_parsed.centroid_lat,
        centroid_lon=legacy_parsed.centroid_lon,
    )
    legacy_valid = [r for r in legacy_results if r.usable_polygon is not None]

    # --- Build new core LayoutResult[] from the same fixture ---
    # pvlayout_core.* is a different namespace from bare `core.*`, so it
    # resolves cleanly even with LEGACY_REPO on sys.path.
    from pvlayout_core.core.kmz_parser import parse_kmz as new_parse_kmz
    from pvlayout_core.core.layout_engine import run_layout_multi as new_run_layout_multi
    from pvlayout_core.core.kmz_exporter import export_kmz as new_export
    from pvlayout_core.models.project import LayoutParameters as NewParams

    new_parsed = new_parse_kmz(str(KMZ_FIXTURE))
    new_params = NewParams()
    new_results = new_run_layout_multi(
        boundaries=new_parsed.boundaries,
        params=new_params,
        centroid_lat=new_parsed.centroid_lat,
        centroid_lon=new_parsed.centroid_lon,
    )
    new_valid = [r for r in new_results if r.usable_polygon is not None]

    assert len(legacy_valid) == len(new_valid), (
        f"valid-result count drift: legacy {len(legacy_valid)} vs new {len(new_valid)}"
    )

    # --- Write both KMZs ---
    legacy_kmz_path = tmp_path / "legacy.kmz"
    new_kmz_path = tmp_path / "new.kmz"

    legacy_export(legacy_valid, legacy_params, str(legacy_kmz_path))
    new_export(new_valid, new_params, str(new_kmz_path))

    # --- Extract inner KML and compare bytes ---
    # Normalize simplekml's auto-incrementing element IDs (id="N")
    # before comparing — they're process-counter offsets, not content.
    legacy_kml = _normalize_kml(_read_kml_from_kmz(legacy_kmz_path))
    new_kml = _normalize_kml(_read_kml_from_kmz(new_kmz_path))

    if legacy_kml != new_kml:
        # Helpful diagnostic on mismatch — find the first differing byte.
        n = min(len(legacy_kml), len(new_kml))
        for i in range(n):
            if legacy_kml[i] != new_kml[i]:
                ctx_start = max(0, i - 40)
                ctx_end = min(n, i + 40)
                pytest.fail(
                    f"inner KML diverges at byte {i} "
                    f"(legacy len {len(legacy_kml)} vs new len {len(new_kml)}). "
                    f"Legacy ctx: {legacy_kml[ctx_start:ctx_end]!r}; "
                    f"New ctx:    {new_kml[ctx_start:ctx_end]!r}"
                )
        pytest.fail(
            f"inner KML length drift: legacy {len(legacy_kml)} vs new {len(new_kml)} "
            f"(prefix-equal up to byte {n})"
        )
