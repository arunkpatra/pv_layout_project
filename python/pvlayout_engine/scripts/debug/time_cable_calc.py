"""
Headless timing of cable calc — S11.5 debug aid.

Reproduces what POST /layout does with ``enable_cable_calc=True``,
without sidecar/HTTP/UI in the loop, so we can isolate algorithm
wall-clock from plumbing. Prints one line per major stage and per
boundary so any hang localises to a specific step.

Usage:
    uv run python scripts/debug/time_cable_calc.py [stem=phaseboundary2]

The KMZ is resolved relative to ``tests/golden/kmz/<stem>.kmz``.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.string_inverter_manager import place_string_inverters
from pvlayout_core.models.project import LayoutParameters


SCRIPT_DIR = Path(__file__).resolve().parent
# KMZ fixtures moved to pvlayout_core per cloud-offload C2.
# SCRIPT_DIR.parent.parent = python/pvlayout_engine/.
KMZ_DIR = (
    SCRIPT_DIR.parent.parent.parent / "pvlayout_core" / "tests" / "golden" / "kmz"
)


def _t(dt: float) -> str:
    return f"{dt:7.2f}s"


def _log(tag: str, msg: str) -> None:
    print(f"[{tag}] {msg}", flush=True)


def main() -> int:
    stem = sys.argv[1] if len(sys.argv) > 1 else "phaseboundary2"
    kmz_path = KMZ_DIR / f"{stem}.kmz"
    if not kmz_path.exists():
        _log("error", f"KMZ not found: {kmz_path}")
        return 1

    _log("start", f"KMZ: {kmz_path}")
    total_start = time.perf_counter()

    _log("parse", "start parse_kmz")
    t = time.perf_counter()
    parsed = parse_kmz(str(kmz_path))
    _log(
        "parse",
        f"done {_t(time.perf_counter() - t)} — "
        f"{len(parsed.boundaries)} boundaries, centroid=({parsed.centroid_lat:.4f}, {parsed.centroid_lon:.4f})",
    )

    params = LayoutParameters()
    params.enable_cable_calc = True
    _log(
        "param",
        f"enable_cable_calc={params.enable_cable_calc}, "
        f"design_mode={params.design_mode!r}, "
        f"max_strings_per_inverter={params.max_strings_per_inverter}",
    )

    _log("layout", "start run_layout_multi")
    t = time.perf_counter()
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    _log("layout", f"done {_t(time.perf_counter() - t)} — {len(results)} result(s)")

    for i, r in enumerate(results):
        tag = f"bnd{i:02d}"
        name = getattr(r, "boundary_name", f"<{i}>")
        _log(
            tag,
            f"name={name!r} tables={len(r.placed_tables)} "
            f"capacity_kwp={r.total_capacity_kwp:.1f} "
            f"icrs={len(r.placed_icrs)} "
            f"usable_polygon={'ok' if r.usable_polygon is not None else 'None'}",
        )
        if r.usable_polygon is None:
            _log(tag, "usable_polygon is None — skipping")
            continue

        _log(tag, "LA placement: start")
        t = time.perf_counter()
        place_lightning_arresters(r, params)
        _log(
            tag,
            f"LA placement: done {_t(time.perf_counter() - t)} — "
            f"{len(r.placed_las)} LAs, {len(r.placed_tables)} tables after",
        )

        _log(tag, "string-inverter + cables: start")
        t = time.perf_counter()
        place_string_inverters(r, params)
        dt = time.perf_counter() - t
        _log(
            tag,
            f"string-inverter + cables: done {_t(dt)} — "
            f"{len(r.placed_string_inverters)} inv, "
            f"{len(r.dc_cable_runs)} dc, {len(r.ac_cable_runs)} ac, "
            f"total_dc={r.total_dc_cable_m}m, total_ac={r.total_ac_cable_m}m",
        )

    _log("done", f"total wall-clock: {_t(time.perf_counter() - total_start)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
