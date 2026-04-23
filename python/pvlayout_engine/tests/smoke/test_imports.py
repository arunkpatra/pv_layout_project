"""
S1 smoke test.

Verifies that every module vendored from PVlayout_Advance into
pvlayout_core/ imports cleanly, and that the public dataclasses in
models.project can be instantiated without error.

This is the minimum bar for S1: if this passes, the vendored code
is installable and importable under the new package name.

S3 will add golden-file tests that exercise actual layout generation.
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# Import every pvlayout_core module — failure here means a copy / rewrite bug.
# ---------------------------------------------------------------------------

def test_import_core_modules():
    """All 16 domain modules in pvlayout_core.core import without error."""
    from pvlayout_core.core import (  # noqa: F401
        dxf_exporter,
        edition,
        energy_calculator,
        icr_placer,
        kmz_exporter,
        kmz_parser,
        la_manager,
        layout_engine,
        ond_parser,
        pan_parser,
        pdf_exporter,
        pvgis_file_parser,
        road_manager,
        solar_transposition,
        spacing_calc,
        string_inverter_manager,
    )


def test_import_models():
    """pvlayout_core.models.project imports and exposes the expected names."""
    from pvlayout_core.models import project

    # Spot-check the dataclass surface we'll serialize via pydantic in S2.
    expected = [
        "LayoutParameters",
        "LayoutResult",
        "PlacedTable",
        "PlacedICR",
        "PlacedLA",
        "CableRun",
        "PlacedRoad",
    ]
    missing = [name for name in expected if not hasattr(project, name)]
    assert not missing, f"Missing dataclasses in pvlayout_core.models.project: {missing}"


def test_import_utils():
    """pvlayout_core.utils.geo_utils imports and exposes UTM helpers."""
    from pvlayout_core.utils import geo_utils

    for name in ("wgs84_to_utm", "utm_to_wgs84", "get_utm_epsg"):
        assert hasattr(geo_utils, name), f"geo_utils missing {name}"


# ---------------------------------------------------------------------------
# Public API spot checks — functions we'll wire to FastAPI in S2/S3.
# ---------------------------------------------------------------------------

def test_public_layout_api_is_importable():
    """The top-level layout entry points are importable by their documented names."""
    from pvlayout_core.core.layout_engine import run_layout_multi  # noqa: F401
    from pvlayout_core.core.kmz_parser import parse_kmz  # noqa: F401
    from pvlayout_core.core.icr_placer import place_icrs  # noqa: F401
    from pvlayout_core.core.string_inverter_manager import place_string_inverters  # noqa: F401
    from pvlayout_core.core.la_manager import place_lightning_arresters  # noqa: F401
    from pvlayout_core.core.road_manager import recompute_tables  # noqa: F401
    from pvlayout_core.core.spacing_calc import auto_spacing  # noqa: F401
    from pvlayout_core.core.energy_calculator import calculate_energy  # noqa: F401


def test_exporters_are_importable():
    from pvlayout_core.core.kmz_exporter import export_kmz  # noqa: F401
    from pvlayout_core.core.dxf_exporter import export_dxf  # noqa: F401
    # pdf_exporter is imported by module to avoid binding every internal symbol.
    import pvlayout_core.core.pdf_exporter  # noqa: F401


def test_edition_flags_have_expected_shape():
    from pvlayout_core.core.edition import (
        Edition,
        has_cables,
        has_dxf,
        has_energy,
        has_obstructions,
        has_icr_drag,
        has_ac_dc_ratio,
    )

    assert Edition.BASIC.value == "basic"
    assert Edition.PRO.value == "pro"
    assert Edition.PRO_PLUS.value == "pro_plus"

    # Sanity: only PRO_PLUS has DXF/energy; PRO has cables/obstructions/drag; BASIC has none of these.
    assert has_dxf(Edition.PRO_PLUS) and not has_dxf(Edition.PRO) and not has_dxf(Edition.BASIC)
    assert has_energy(Edition.PRO_PLUS) and not has_energy(Edition.PRO)
    assert has_cables(Edition.PRO) and has_cables(Edition.PRO_PLUS) and not has_cables(Edition.BASIC)
    assert has_obstructions(Edition.PRO) and not has_obstructions(Edition.BASIC)
    assert has_icr_drag(Edition.PRO) and not has_icr_drag(Edition.BASIC)
    assert has_ac_dc_ratio(Edition.PRO_PLUS) and not has_ac_dc_ratio(Edition.PRO)


# ---------------------------------------------------------------------------
# No PyQt / PySide anywhere in the sidecar deps.
# ---------------------------------------------------------------------------

def test_no_pyqt_in_environment():
    """PyQt / PySide should not be installable under the sidecar venv."""
    import importlib.util

    for mod in ("PyQt5", "PyQt6", "PySide2", "PySide6"):
        assert importlib.util.find_spec(mod) is None, f"{mod} must not be in the sidecar environment"


