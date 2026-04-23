"""
Capture golden-file baselines for the layout engine.

For each KMZ in ``tests/golden/kmz/``, runs the vendored domain logic
directly (no HTTP, no PyQt) with default ``LayoutParameters``, then
serialises the ``LayoutResult`` list as JSON under
``tests/golden/expected/<kmz-stem>.json``.

This is run:
  * ONCE at S3 authoring time — produces the reference output.
  * Whenever a reference KMZ is added/replaced.
  * Whenever a change is made to pvlayout_core that we've decided is
    intentional and the baseline should move.

NEVER auto-run in CI. The whole point is that these are human-approved
baselines; regenerating them on every test defeats the purpose.

Usage
-----
    uv run python scripts/capture_golden.py            # refresh all
    uv run python scripts/capture_golden.py <stem>...  # refresh selected stems
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.string_inverter_manager import place_string_inverters
from pvlayout_core.models.project import LayoutParameters

from pvlayout_engine.adapters import result_from_core


SCRIPT_DIR = Path(__file__).resolve().parent
GOLDEN_DIR = SCRIPT_DIR.parent / "tests" / "golden"
KMZ_DIR = GOLDEN_DIR / "kmz"
EXPECTED_DIR = GOLDEN_DIR / "expected"


def capture_for_kmz(kmz_path: Path) -> dict:
    """Run the full S3 pipeline on one KMZ and return a JSON-ready dict."""
    parsed = parse_kmz(str(kmz_path))
    params = LayoutParameters()  # defaults — matches the agreed baseline.

    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    for r in results:
        if r.usable_polygon is None:
            continue
        place_lightning_arresters(r, params)
        place_string_inverters(r, params)

    # Convert via the same adapter path /layout uses in production.
    wire = [result_from_core(r).model_dump(mode="json") for r in results]
    return {
        "kmz_file": kmz_path.name,
        "centroid_lat": parsed.centroid_lat,
        "centroid_lon": parsed.centroid_lon,
        "params": {
            "note": "Default LayoutParameters — no overrides.",
        },
        "results": wire,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "stems",
        nargs="*",
        help="Specific KMZ stems to refresh. If empty, refresh all.",
    )
    args = ap.parse_args()

    EXPECTED_DIR.mkdir(parents=True, exist_ok=True)

    kmzs = sorted(KMZ_DIR.glob("*.kmz")) + sorted(KMZ_DIR.glob("*.kml"))
    if args.stems:
        wanted = {s.lower() for s in args.stems}
        kmzs = [k for k in kmzs if k.stem.lower() in wanted]

    if not kmzs:
        print(f"No KMZ files found under {KMZ_DIR}", file=sys.stderr)
        return 1

    for kmz in kmzs:
        print(f"Capturing: {kmz.name}", file=sys.stderr)
        baseline = capture_for_kmz(kmz)
        out_path = EXPECTED_DIR / f"{kmz.stem}.json"
        out_path.write_text(json.dumps(baseline, indent=2, sort_keys=True))
        print(f"  -> {out_path.relative_to(GOLDEN_DIR.parent.parent)}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
