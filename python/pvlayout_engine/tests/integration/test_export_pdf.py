"""Sidecar /export-pdf route + filter / column tweaks (Row #11 of docs/PLAN.md).

PDFs aren't equivalently introspectable to DXFs without a heavy parser dep,
so the tests verify what's reliably checkable:
  - HTTP contract (smoke + 422 cases)
  - Filter behavior via byte-size delta (filtered vs unfiltered runs)
  - GCR column removal via direct _build_summary_figure inspection of the
    rendered matplotlib Table object

Manual visual parity (the row's "manual visual parity" acceptance) is the
user's bar — see the row #11 commit message for the recipe.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")  # headless — must precede any pyplot/figure import
import matplotlib.pyplot as plt
from matplotlib.table import Table

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.adapters import result_from_core
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "row11-export-pdf-test-token-abcdefghij"
KMZ_FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "tests/golden/kmz/phaseboundary2.kmz"
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
        version="0.0.0+row11-test",
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
    """Wire-shape body for POST /export-pdf with energy_params=None
    (summary-only PDF)."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    wire_results = [result_from_core(r) for r in core_layout_results]
    return {
        "results": [r.model_dump(mode="json") for r in wire_results],
        "params": WireParams().model_dump(mode="json"),
        "energy_params": None,
        "edition": "pro_plus",
    }


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


def test_export_pdf_smoke(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """POST /export-pdf returns 200 + valid PDF magic bytes."""
    resp = client.post("/export-pdf", headers=auth(), json=export_request_body)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert "layout.pdf" in resp.headers.get("content-disposition", "")
    # PDF magic bytes: %PDF at start, %%EOF near end
    assert resp.content.startswith(b"%PDF"), "missing PDF magic header"
    assert b"%%EOF" in resp.content[-128:], "missing %%EOF terminator near end"


def test_export_pdf_empty_results_returns_422(client: TestClient) -> None:
    """results=[] returns 422 with explicit message."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    body = {
        "results": [],
        "params": WireParams().model_dump(mode="json"),
        "energy_params": None,
        "edition": "pro_plus",
    }
    resp = client.post("/export-pdf", headers=auth(), json=body)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "results must be non-empty"


def test_export_pdf_invalid_edition_returns_422(
    client: TestClient, export_request_body: dict[str, Any]
) -> None:
    """edition='enterprise' returns 422 with the expected-list message."""
    body = dict(export_request_body)
    body["edition"] = "enterprise"
    resp = client.post("/export-pdf", headers=auth(), json=body)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert "invalid edition 'enterprise'" in detail
    assert "basic" in detail and "pro" in detail and "pro_plus" in detail


# ---------------------------------------------------------------------------
# Direct (non-route) tests of the legacy diff items
# ---------------------------------------------------------------------------


def test_export_pdf_filters_water_and_empty_results(
    core_layout_results, tmp_path: Path
) -> None:
    """Filter at top of export_pdf drops water / empty / failed results.

    Verifies via byte-size delta: PDF generated from [valid] should be
    nearly byte-identical to PDF from [valid, empty_stub, failed_stub].
    If the filter were absent, the unfiltered PDF's summary table would
    have extra rows and grow noticeably.
    """
    from pvlayout_core.core.edition import Edition
    from pvlayout_core.core.pdf_exporter import export_pdf
    from pvlayout_core.models.project import LayoutParameters, LayoutResult

    valid = core_layout_results[0]
    empty_stub = LayoutResult()       # default — no placed_tables, utm_epsg=0
    failed_stub = LayoutResult(boundary_name="Failed-1")  # also no placed_tables

    params = LayoutParameters()

    path_a = tmp_path / "a.pdf"
    path_b = tmp_path / "b.pdf"

    export_pdf(
        [valid], params, str(path_a),
        layout_figure=None, energy_params=None, edition=Edition.PRO_PLUS,
    )
    export_pdf(
        [valid, empty_stub, failed_stub], params, str(path_b),
        layout_figure=None, energy_params=None, edition=Edition.PRO_PLUS,
    )

    bytes_a = path_a.read_bytes()
    bytes_b = path_b.read_bytes()

    assert len(bytes_a) > 0, "PDF A is empty"
    assert len(bytes_b) > 0, "PDF B is empty"

    # If the filter works, the two PDFs are nearly byte-identical (same
    # set of summary rows after filtering). Allow up to 5% delta to
    # accommodate matplotlib's stable-but-not-byte-identical PDF backend
    # (timestamps, handle counters).
    larger = max(len(bytes_a), len(bytes_b))
    delta = abs(len(bytes_a) - len(bytes_b))
    assert delta < larger * 0.05, (
        f"PDF size delta {delta} bytes exceeds 5% of larger ({larger}). "
        f"Filter likely failed — extra results leaking into the summary table."
    )


def test_export_pdf_summary_drops_gcr_column(core_layout_results) -> None:
    """_build_summary_figure renders the summary table without a GCR column.

    Direct unit test of the column-header change. Builds a fresh matplotlib
    Figure, invokes _build_summary_figure, walks the figure's axes for
    Table objects, and reads the header-row cell texts.
    """
    from pvlayout_core.core.edition import Edition
    from pvlayout_core.core.pdf_exporter import _build_summary_figure
    from pvlayout_core.models.project import LayoutParameters

    params = LayoutParameters()

    # _build_summary_figure(results, params, edition) → returns a fresh Figure
    fig = _build_summary_figure(
        core_layout_results,
        params,
        edition=Edition.PRO_PLUS,
    )

    # Walk the figure's axes for Table objects
    headers: list[str] = []
    for ax in fig.axes:
        for child in ax.get_children():
            if isinstance(child, Table):
                # Table._cells is a dict keyed by (row, col) tuples;
                # row 0 is the header row.
                col_idx = 0
                while (0, col_idx) in child._cells:
                    headers.append(child._cells[(0, col_idx)].get_text().get_text())
                    col_idx += 1
                # Only the summary table — break after first table found
                break
        if headers:
            break

    assert headers, "no Table found in summary figure"

    # The whole point of the row-#11 tweak: GCR column is gone.
    assert not any("GCR" in h for h in headers), (
        f"GCR column still present in summary: {headers}"
    )
    # Sanity: adjacent columns should still be there.
    assert any("Pitch" in h for h in headers), f"Pitch column missing: {headers}"
    assert any("ICR" == h.strip() for h in headers), f"ICR column missing: {headers}"

    plt.close(fig)
