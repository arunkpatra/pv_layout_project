"""Run the new app's full layout pipeline on the cable-correctness
fixtures with pattern stats enabled, report dispatch counts.

Originated as /tmp/pattern_stats_probe.py during CR1 (2026-05-02). Used
to empirically verify that:
  - Pattern A family handles the majority of AC routes (industry-correct
    inter-row aisle routing).
  - Pattern V intercepts in concave-region cases (geometric correctness
    fallback over `route_poly = fence - ICRs`).
  - Pattern F's least-violation fallback is rare; ``boundary_violation``
    cables are vanishingly rare in the new app (compare to legacy's
    7.9% off-fence on complex-plant-layout).

Numbers reported by this script feed §3.3 of
docs/post-parity/PRD-cable-routing-correctness.md and the unified
compliance PDF at docs/post-parity/findings/cable-routing-compliance-report.pdf.

Usage:

    cd python/pvlayout_engine
    PVLAYOUT_PATTERN_STATS=1 \\
        uv run python scripts/parity/probe_pattern_stats.py

Output goes to stdout (per-boundary tables) + stderr (per-call pattern
stats lines from the existing `_emit_pattern_stats` infrastructure).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# The pattern-stats infrastructure is gated by an env-var read at module
# import time. Set it before any pvlayout_core imports so the gating
# evaluates True in `string_inverter_manager`'s module init.
os.environ.setdefault("PVLAYOUT_PATTERN_STATS", "1")

# scripts/parity/probe_pattern_stats.py — parents[0] = parity,
# [1] = scripts, [2] = pvlayout_engine. Insert that on sys.path so
# `import pvlayout_core.*` resolves.
SCRIPT_PATH = Path(__file__).resolve()
PVLE_ROOT = SCRIPT_PATH.parents[2]
if str(PVLE_ROOT) not in sys.path:
    sys.path.insert(0, str(PVLE_ROOT))

from pvlayout_core.core.kmz_parser import parse_kmz  # noqa: E402
from pvlayout_core.core.la_manager import (  # noqa: E402
    place_lightning_arresters,
)
from pvlayout_core.core.layout_engine import run_layout_multi  # noqa: E402
from pvlayout_core.core.string_inverter_manager import (  # noqa: E402
    place_string_inverters,
)
from pvlayout_core.models.project import LayoutParameters  # noqa: E402

KMZ_DIR = PVLE_ROOT / "tests" / "golden" / "kmz"

PLANTS = [
    ("phaseboundary2", KMZ_DIR / "phaseboundary2.kmz"),
    ("complex-plant-layout", KMZ_DIR / "complex-plant-layout.kmz"),
]


def _build_params() -> LayoutParameters:
    p = LayoutParameters()
    p.enable_cable_calc = True
    return p


def run_one(name: str, kmz: Path) -> None:
    print(f"\n=== {name} ===", flush=True)
    parsed = parse_kmz(str(kmz))
    params = _build_params()
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    for i, r in enumerate(results):
        if not r.placed_tables:
            print(
                f"  boundary {i} ({r.boundary_name}): no tables, skipping",
                flush=True,
            )
            continue
        # LAs first, then string inverters + cables — matches the sidecar's
        # /layout pipeline order.
        place_lightning_arresters(r, params)
        place_string_inverters(r, params)
        n_dc = len(r.dc_cable_runs)
        n_ac = len(r.ac_cable_runs)
        bv_dc = sum(
            1 for c in r.dc_cable_runs if c.route_quality == "boundary_violation"
        )
        bv_ac = sum(
            1 for c in r.ac_cable_runs if c.route_quality == "boundary_violation"
        )
        be_dc = sum(
            1 for c in r.dc_cable_runs if c.route_quality == "best_effort"
        )
        be_ac = sum(
            1 for c in r.ac_cable_runs if c.route_quality == "best_effort"
        )
        print(
            f"  boundary {i}: dc={n_dc} (bv={bv_dc} be={be_dc}) "
            f"ac={n_ac} (bv={bv_ac} be={be_ac}) "
            f"total_dc_m={r.total_dc_cable_m:.1f} "
            f"total_ac_m={r.total_ac_cable_m:.1f}",
            flush=True,
        )


def main() -> int:
    for name, kmz in PLANTS:
        if not kmz.exists():
            print(f"[skip] {name}: KMZ missing at {kmz}", flush=True)
            continue
        try:
            run_one(name, kmz)
        except Exception as e:
            print(f"[error] {name}: {type(e).__name__}: {e}", flush=True)
            import traceback

            traceback.print_exc()
    return 0


if __name__ == "__main__":
    sys.exit(main())
