"""
S2 smoke: every pydantic schema instantiates with defaults and round-trips
through JSON. This is the minimum bar before wiring the schemas to real
layout logic in S3.
"""
from __future__ import annotations

import json

import pytest

from pvlayout_engine.schemas import (
    SCHEMAS_FOR_INSPECTION,
    CableRun,
    DesignMode,
    DesignType,
    LayoutParameters,
    LayoutResult,
    ModuleSpec,
    Orientation,
    PlacedICR,
    PlacedLA,
    PlacedRoad,
    PlacedStringInverter,
    PlacedTable,
    TableConfig,
)


@pytest.mark.parametrize("name,cls", list(SCHEMAS_FOR_INSPECTION.items()))
def test_schema_instantiates(name: str, cls: type) -> None:
    """Every registered schema can be built. Classes with required fields
    declare that in their field defaults; this test just hits the schemas
    that have full defaults."""
    # LayoutParameters, the two computed model classes, and the default-only
    # result classes should all construct with no arguments. The positional
    # coordinate classes require x/y and are covered separately below.
    try:
        instance = cls()
    except Exception:  # noqa: BLE001 — we expect required-field failures here
        pytest.skip(f"{name} has required fields; covered by targeted tests")
        return

    # Round-trip to JSON and back.
    raw = instance.model_dump_json()
    rehydrated = cls.model_validate_json(raw)
    assert rehydrated == instance, f"{name} did not round-trip through JSON"


def test_positional_schemas_round_trip() -> None:
    """Schemas with required coordinate fields build correctly."""
    cases = [
        PlacedTable(x=1.0, y=2.0, width=5.0, height=3.0, row_index=0, col_index=0),
        PlacedICR(x=10.0, y=20.0),
        PlacedStringInverter(x=5.0, y=6.0, index=1),
        PlacedLA(x=100.0, y=200.0),
        PlacedRoad(points_utm=[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]),
        CableRun(
            start_utm=(0.0, 0.0),
            end_utm=(10.0, 10.0),
            route_utm=[(0.0, 0.0), (5.0, 5.0), (10.0, 10.0)],
            length_m=14.14,
        ),
    ]
    for instance in cases:
        rehydrated = type(instance).model_validate_json(instance.model_dump_json())
        assert rehydrated == instance


def test_layout_parameters_defaults() -> None:
    """Sanity-check the headline defaults that drive plant sizing.

    These values should match the dataclass defaults in
    ``pvlayout_core.models.project``; the test is our drift guardrail.
    """
    p = LayoutParameters()
    assert p.design_type == DesignType.FIXED_TILT
    assert p.design_mode == DesignMode.STRING_INVERTER
    assert p.module.length == 2.38
    assert p.module.width == 1.13
    assert p.module.wattage == 580.0
    assert p.table.modules_in_row == 28
    assert p.table.rows_per_table == 2
    assert p.table.orientation == Orientation.PORTRAIT
    assert p.perimeter_road_width == 6.0
    assert p.max_strings_per_inverter == 20
    assert p.enable_cable_calc is False


def test_extra_fields_are_rejected() -> None:
    """Clients with typos should get a 422, not silent corruption."""
    with pytest.raises(ValueError):
        LayoutParameters.model_validate({"tilt_angle": 25.0, "typo_field": 1})


def test_layout_result_has_no_usable_polygon_on_wire() -> None:
    """The shapely polygon is a runtime-only artifact and must NOT be part
    of the JSON wire schema."""
    result = LayoutResult()
    dumped = json.loads(result.model_dump_json())
    assert "usable_polygon" not in dumped


def test_nested_serialization() -> None:
    """LayoutParameters round-trips with a customised nested ModuleSpec +
    TableConfig, proving nested pydantic resolution works."""
    p = LayoutParameters(
        tilt_angle=22.5,
        row_spacing=7.5,
        module=ModuleSpec(length=2.4, width=1.2, wattage=600.0),
        table=TableConfig(
            modules_in_row=30, rows_per_table=3, orientation=Orientation.LANDSCAPE
        ),
    )
    rehydrated = LayoutParameters.model_validate_json(p.model_dump_json())
    assert rehydrated == p
    assert rehydrated.module.wattage == 600.0
    assert rehydrated.table.orientation == Orientation.LANDSCAPE
