"""
Consolidated wide-format review table — reads benchmark JSON files and
produces one row per (fixture, variant) with all relevant outputs.

Usage:
    uv run python scripts/perf/benchmark_consolidated.py \\
        --result baseline=/tmp/cable-perf-poc/pb2-baseline.json \\
        --result after-A=/tmp/cable-perf-poc/pb2-after-A.json \\
        ...

Output columns:
    fixture | variant | reps | wall(s) | speedup | plots | tables | inv |
    dc# | ac# | dc_m | ac_m | mwp | tests | notes

The first ``--result`` is the speedup baseline. Per-result speedup is
computed against it.

Two output modes:
    --md    GitHub-flavored markdown table (default; copy-pastable)
    --csv   tab-separated for spreadsheet paste
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List


def _load(path: str) -> Dict:
    return json.loads(Path(path).read_text())


def _row(d: Dict) -> Dict:
    rr = d["per_repeat"][0]
    bs = rr["boundaries"]
    return dict(
        fixture=d.get("kmz_stem", "?"),
        variant=d.get("label", "?"),
        reps=d.get("repeats", "?"),
        wall_s=d.get("median_total_s", 0.0),
        plots=len(bs),
        tables=sum(b["tables"] for b in bs),
        inv=sum(b["num_inverters"] for b in bs),
        dc_count=sum(b["num_dc_cables"] for b in bs),
        ac_count=sum(b["num_ac_cables"] for b in bs),
        dc_m=sum(b["total_dc_m"] for b in bs),
        ac_m=sum(b["total_ac_m"] for b in bs),
        mwp=round(sum(b["capacity_kwp"] for b in bs) / 1000.0, 2),
    )


def _md_row(cells: List[str]) -> str:
    return "| " + " | ".join(cells) + " |"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--result", action="append", required=True, help="label=path.json"
    )
    ap.add_argument(
        "--note",
        action="append",
        default=[],
        help="label=notes-text (per row, optional)",
    )
    ap.add_argument(
        "--baseline-label",
        default=None,
        help="speedup baseline label (default: first result)",
    )
    ap.add_argument(
        "--csv", action="store_true", help="emit TSV instead of markdown"
    )
    args = ap.parse_args()

    notes: Dict[str, str] = {}
    for n in args.note:
        if "=" in n:
            k, v = n.split("=", 1)
            notes[k] = v

    rows: List[Dict] = []
    for spec in args.result:
        if "=" not in spec:
            print(f"[error] bad --result {spec}", file=sys.stderr)
            return 2
        label, path = spec.split("=", 1)
        d = _load(path)
        d["label"] = label  # arg label overrides JSON
        rows.append(_row(d))

    baseline_label = args.baseline_label or rows[0]["variant"]
    base_by_fixture: Dict[str, float] = {}
    for r in rows:
        if r["variant"] == baseline_label:
            base_by_fixture[r["fixture"]] = r["wall_s"]

    headers = [
        "fixture",
        "variant",
        "reps",
        "wall (s)",
        "speedup",
        "plots",
        "tables",
        "inv",
        "DC #",
        "AC #",
        "DC m",
        "AC m",
        "AC Δ",
        "MWp",
        "notes",
    ]

    # MD-format
    if not args.csv:
        print(_md_row(headers))
        print(_md_row(["---"] * len(headers)))

    # Track AC baseline per fixture for AC delta
    ac_base: Dict[str, float] = {}
    for r in rows:
        if r["variant"] == baseline_label:
            ac_base[r["fixture"]] = r["ac_m"]

    for r in rows:
        base = base_by_fixture.get(r["fixture"])
        speedup = f"{base / r['wall_s']:.2f}x" if base and r["wall_s"] else "—"
        ac_b = ac_base.get(r["fixture"])
        if ac_b and r["ac_m"] is not None:
            delta = (r["ac_m"] - ac_b) / ac_b
            ac_delta = f"{delta * 100:+.1f}%"
        else:
            ac_delta = "—"
        cells = [
            r["fixture"],
            r["variant"],
            str(r["reps"]),
            f"{r['wall_s']:.2f}",
            speedup,
            str(r["plots"]),
            f"{r['tables']:,}",
            str(r["inv"]),
            f"{r['dc_count']:,}",
            f"{r['ac_count']:,}",
            f"{r['dc_m']:,.0f}",
            f"{r['ac_m']:,.0f}",
            ac_delta,
            f"{r['mwp']:.2f}",
            notes.get(r["variant"], ""),
        ]
        if args.csv:
            print("\t".join(cells))
        else:
            print(_md_row(cells))

    return 0


if __name__ == "__main__":
    sys.exit(main())
