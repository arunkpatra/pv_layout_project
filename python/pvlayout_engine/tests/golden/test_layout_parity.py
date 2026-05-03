"""
Golden-file parity tests for /parse-kmz + /layout.

For every KMZ under ``tests/golden/kmz/``, upload it to the sidecar, run
/layout with default parameters, and compare the response against the
canonical baseline at ``tests/golden/expected/<stem>.json`` captured by
``scripts/capture_golden.py``.

Tolerances (per SPIKE_PLAN S3 Human Gate #2):
  * Counts (tables, ICRs, inverters, LAs) must match exactly.
  * Positions (x, y) must match within 0.01 m.
  * Capacities and areas match within 1e-6 relative.
  * Boundary names and integer indices must match exactly.

A regression here means the layout engine produced different output than
the frozen baseline. Either a bug was introduced OR the baseline should
move (intentional change). In the latter case, re-run
``uv run python scripts/capture_golden.py`` and commit the refreshed
``expected/`` JSONs alongside the change that caused the shift.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


POSITION_TOL_M = 0.01
RELATIVE_FLOAT_TOL = 1e-6

GOLDEN_DIR = Path(__file__).resolve().parent
EXPECTED_DIR = GOLDEN_DIR / "expected"
# KMZ fixtures moved to pvlayout_core (their natural home) per cloud-offload C2.
# parents[3] from this file = repo_root/python/.
KMZ_DIR = (
    Path(__file__).resolve().parents[3]
    / "pvlayout_core/tests/golden/kmz"
)

TEST_TOKEN = "golden-test-token-abcdefghijklmnop"


def _kmz_stems() -> list[str]:
    """Sorted list of KMZ file stems under tests/golden/kmz/."""
    return sorted(p.stem for p in KMZ_DIR.glob("*.kmz"))


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+golden-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


# ---------------------------------------------------------------------------
# Parity test per KMZ
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("stem", _kmz_stems())
def test_layout_matches_baseline(client: TestClient, stem: str) -> None:
    kmz_path = KMZ_DIR / f"{stem}.kmz"
    expected_path = EXPECTED_DIR / f"{stem}.json"

    assert kmz_path.exists(), f"Missing KMZ: {kmz_path}"
    assert expected_path.exists(), (
        f"Missing baseline: {expected_path}. "
        "Run `uv run python scripts/capture_golden.py` to generate."
    )

    expected = json.loads(expected_path.read_text())

    # Upload KMZ → /parse-kmz
    with kmz_path.open("rb") as fh:
        parse_resp = client.post(
            "/parse-kmz",
            headers=auth(),
            files={"file": (kmz_path.name, fh, "application/vnd.google-earth.kmz")},
        )
    assert parse_resp.status_code == 200, parse_resp.text
    parsed = parse_resp.json()

    # /layout with default params
    layout_resp = client.post(
        "/layout",
        headers=auth(),
        json={"parsed_kmz": parsed, "params": {}},
    )
    assert layout_resp.status_code == 200, layout_resp.text
    actual = layout_resp.json()["results"]

    compare_results(actual, expected["results"], label=stem)


# ---------------------------------------------------------------------------
# Comparison helpers
# ---------------------------------------------------------------------------


def compare_results(actual: list[dict], expected: list[dict], *, label: str) -> None:
    assert len(actual) == len(expected), (
        f"[{label}] boundary count mismatch: expected {len(expected)}, got {len(actual)}"
    )
    for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
        compare_result(a, e, label=f"{label}/result[{i}]")


def compare_result(a: dict, e: dict, *, label: str) -> None:
    # --- Boundary identity ------------------------------------------------
    assert a["boundary_name"] == e["boundary_name"], f"[{label}] boundary_name"
    assert a["utm_epsg"] == e["utm_epsg"], f"[{label}] utm_epsg"

    # --- Counts (exact) ---------------------------------------------------
    for field in [
        "total_modules",
        "num_string_inverters",
        "num_las",
        "num_central_inverters",
    ]:
        assert a[field] == e[field], f"[{label}] {field}: {a[field]} != {e[field]}"

    # --- Scalar floats (capacities, ratios, areas) -----------------------
    for field in [
        "total_capacity_kwp",
        "total_capacity_mwp",
        "total_area_m2",
        "total_area_acres",
        "net_layout_area_m2",
        "gcr_achieved",
        "row_pitch_m",
        "tilt_angle_deg",
        "total_dc_cable_m",
        "total_ac_cable_m",
        "string_kwp",
        "inverter_capacity_kwp",
        "inverters_per_icr",
        "central_inverter_capacity_kwp",
        "plant_ac_capacity_mw",
        "dc_ac_ratio",
    ]:
        assert_close(a[field], e[field], field=f"{label}.{field}")

    # --- Lists (count + element-wise position check) --------------------
    compare_placed_list(
        a["placed_tables"], e["placed_tables"], POSITION_TOL_M, label=f"{label}.placed_tables",
    )
    compare_placed_list(
        a["placed_icrs"], e["placed_icrs"], POSITION_TOL_M, label=f"{label}.placed_icrs",
    )
    compare_placed_list(
        a["placed_string_inverters"],
        e["placed_string_inverters"],
        POSITION_TOL_M,
        label=f"{label}.placed_string_inverters",
    )
    compare_placed_list(
        a["placed_las"], e["placed_las"], POSITION_TOL_M, label=f"{label}.placed_las",
    )
    compare_placed_list(
        a["tables_pre_icr"], e["tables_pre_icr"], POSITION_TOL_M, label=f"{label}.tables_pre_icr",
    )

    # Cables: count + per-run length + endpoints (within position tol).
    assert len(a["dc_cable_runs"]) == len(e["dc_cable_runs"]), f"[{label}] dc_cable_runs count"
    assert len(a["ac_cable_runs"]) == len(e["ac_cable_runs"]), f"[{label}] ac_cable_runs count"
    for i, (ac, ec) in enumerate(zip(a["dc_cable_runs"], e["dc_cable_runs"], strict=True)):
        compare_cable(ac, ec, label=f"{label}.dc_cable_runs[{i}]")
    for i, (ac, ec) in enumerate(zip(a["ac_cable_runs"], e["ac_cable_runs"], strict=True)):
        compare_cable(ac, ec, label=f"{label}.ac_cable_runs[{i}]")


def compare_placed_list(
    actual: list[dict], expected: list[dict], pos_tol: float, *, label: str
) -> None:
    assert len(actual) == len(expected), (
        f"[{label}] count mismatch: expected {len(expected)}, got {len(actual)}"
    )
    for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
        for coord in ("x", "y"):
            if coord in e:
                diff = abs(a[coord] - e[coord])
                assert diff <= pos_tol, (
                    f"[{label}[{i}].{coord}] position drift {diff:.4f} > {pos_tol}"
                )
        # Exact-match discrete fields
        for field in ("index", "row_index", "col_index"):
            if field in e:
                assert a[field] == e[field], f"[{label}[{i}].{field}]"
        # Float fields that also matter
        for field in ("width", "height", "radius", "capacity_kwp"):
            if field in e:
                assert_close(a[field], e[field], field=f"{label}[{i}].{field}")


def compare_cable(a: dict, e: dict, *, label: str) -> None:
    assert a["index"] == e["index"], f"[{label}] index"
    assert a["cable_type"] == e["cable_type"], f"[{label}] cable_type"
    assert_close(a["length_m"], e["length_m"], field=f"{label}.length_m")
    for k in ("start_utm", "end_utm"):
        for coord_i in range(2):
            diff = abs(a[k][coord_i] - e[k][coord_i])
            assert diff <= POSITION_TOL_M, (
                f"[{label}.{k}[{coord_i}]] position drift {diff:.4f} > {POSITION_TOL_M}"
            )
    assert len(a["route_utm"]) == len(e["route_utm"]), f"[{label}] route_utm length"


def assert_close(a: Any, e: Any, *, field: str) -> None:
    """Tolerance float compare. Exact match for int and non-float types."""
    if a == e:
        return
    if isinstance(a, (int, float)) and isinstance(e, (int, float)):
        denom = max(abs(a), abs(e), 1.0)
        diff = abs(a - e)
        assert diff / denom <= RELATIVE_FLOAT_TOL, (
            f"[{field}] {a} vs {e} (diff={diff:.6g}, tol rel={RELATIVE_FLOAT_TOL})"
        )
        return
    raise AssertionError(f"[{field}] {a!r} != {e!r}")


# ---------------------------------------------------------------------------
# Sanity: we actually have reference KMZs on disk
# ---------------------------------------------------------------------------


def test_reference_kmzs_are_committed() -> None:
    stems = _kmz_stems()
    assert len(stems) >= 3, (
        f"Expected at least 3 reference KMZs under tests/golden/kmz/, got {len(stems)}"
    )


def test_baselines_exist_for_every_kmz() -> None:
    missing = [s for s in _kmz_stems() if not (EXPECTED_DIR / f"{s}.json").exists()]
    assert not missing, (
        f"Missing baselines: {missing}. Run `uv run python scripts/capture_golden.py`."
    )
