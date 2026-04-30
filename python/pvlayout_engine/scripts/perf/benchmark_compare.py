"""
Benchmark comparison report — reads the JSON files produced by
``benchmark_cable_calc.py`` and prints a side-by-side table.

Usage:
    uv run python scripts/perf/benchmark_compare.py \\
        --result label1=/tmp/bench-baseline-pb2.json \\
        --result label2=/tmp/bench-after-A-pb2.json \\
        [--result ...]

Each ``--result`` arg is ``<label>=<path>``. The label in the arg
overrides whatever is recorded in the JSON ``label`` field — useful when
you forgot to set ``--label`` at capture time.

Columns in the output table:
    fixture | label | repeats | completed | median(s) | min(s) | max(s) | speedup-vs-first

Speedup is relative to the first ``--result`` passed (so order matters).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def _fmt_s(v: Optional[float]) -> str:
    if v is None:
        return "  --  "
    return f"{v:7.2f}"


def _row(cols: List[str], widths: List[int]) -> str:
    return "  ".join(c.ljust(w) for c, w in zip(cols, widths))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--result",
        action="append",
        required=True,
        help="format: label=<path-to-bench-json>",
    )
    args = ap.parse_args()

    rows: List[Tuple[str, str, Dict]] = []
    for spec in args.result:
        if "=" not in spec:
            print(f"[error] bad --result {spec!r} (need label=path)", file=sys.stderr)
            return 2
        label, path = spec.split("=", 1)
        p = Path(path)
        if not p.exists():
            print(f"[error] result file not found: {p}", file=sys.stderr)
            return 2
        data = json.loads(p.read_text())
        rows.append((label, data.get("kmz_stem", "?"), data))

    # Speedup baseline: first row's median.
    baseline_med = rows[0][2].get("median_total_s")

    headers = [
        "fixture",
        "label",
        "reps",
        "ok",
        "to",
        "median(s)",
        "min(s)",
        "max(s)",
        "speedup",
    ]
    widths = [22, 18, 4, 3, 3, 9, 7, 7, 8]
    print(_row(headers, widths))
    print(_row(["-" * w for w in widths], widths))

    for label, fixture, data in rows:
        med = data.get("median_total_s")
        mn = data.get("min_total_s")
        mx = data.get("max_total_s")
        if baseline_med and med:
            speedup = f"{baseline_med / med:5.2f}x"
        else:
            speedup = "  --  "
        print(
            _row(
                [
                    fixture,
                    label,
                    str(data.get("repeats", "?")),
                    str(data.get("completed_repeats", "?")),
                    str(data.get("timed_out_repeats", "?")),
                    _fmt_s(med),
                    _fmt_s(mn),
                    _fmt_s(mx),
                    speedup,
                ],
                widths,
            )
        )

    # Per-fixture stage breakdown for the most recent (last) result.
    last_label, last_fixture, last_data = rows[-1]
    print()
    print(f"--- per-stage breakdown ({last_label}, {last_fixture}, repeat 1) ---")
    if last_data.get("per_repeat"):
        rr = last_data["per_repeat"][0]
        for s in rr.get("stages", []):
            print(f"  {s['name']:28s}  {s['seconds']:7.2f}s   {s.get('notes', '')}")
        print(f"  {'TOTAL':28s}  {rr.get('total_seconds', 0):7.2f}s")
        print()
        print(
            f"--- per-boundary breakdown ({last_label}, {last_fixture}, repeat 1) ---"
        )
        b_headers = ["#", "name", "tabls", "MWp", "icrs", "la(s)", "cab(s)", "inv", "dc#", "ac#", "dc_m", "ac_m"]
        b_widths = [3, 28, 5, 6, 4, 7, 8, 4, 4, 4, 8, 8]
        print(_row(b_headers, b_widths))
        print(_row(["-" * w for w in b_widths], b_widths))
        for b in rr.get("boundaries", []):
            la = b.get("la_seconds", -1.0)
            cb = b.get("cable_seconds", -1.0)
            print(
                _row(
                    [
                        str(b.get("index", "?")),
                        str(b.get("name", "?"))[:28],
                        str(b.get("tables", "?")),
                        f"{b.get('capacity_kwp', 0)/1000.0:.2f}",
                        str(b.get("icrs", "?")),
                        f"{la:.2f}" if la >= 0 else "  -- ",
                        f"{cb:.2f}" if cb >= 0 else "  --  ",
                        str(b.get("num_inverters", "?")),
                        str(b.get("num_dc_cables", "?")),
                        str(b.get("num_ac_cables", "?")),
                        f"{b.get('total_dc_m', 0):,.0f}",
                        f"{b.get('total_ac_m', 0):,.0f}",
                    ],
                    b_widths,
                )
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
