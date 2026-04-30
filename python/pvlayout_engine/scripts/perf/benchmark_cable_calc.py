"""
Repeatable cable-calc wall-clock benchmark.

Drives the same code path that the FastAPI ``POST /layout`` endpoint
executes (parse_kmz -> run_layout_multi -> per-plot
place_lightning_arresters + place_string_inverters) but without HTTP /
sidecar / UI. Designed for before/after performance measurement.

Usage:
    uv run python scripts/perf/benchmark_cable_calc.py \\
        --kmz phaseboundary2 \\
        --repeats 3 \\
        --timeout-s 600 \\
        --out /tmp/bench-baseline-pb2.json

Reads ``tests/golden/kmz/<stem>.kmz``. Writes a JSON record per repeat,
plus a summary, to ``--out``. Prints a one-line stage summary per repeat
to stdout (so you can watch progress live).

Exit status:
    0  - all repeats completed within --timeout-s
    1  - one or more repeats timed out (file is still written with
         whatever did complete; the timed-out repeat has ``"timed_out":
         true`` and partial stage timings)
    2  - argparse / fixture / parse error before any repeat ran

Caller convention: pass ``--label baseline`` / ``--label after-A`` etc.
so the JSON has a self-identifying tag.
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.string_inverter_manager import place_string_inverters
from pvlayout_core.models.project import LayoutParameters


SCRIPT_DIR = Path(__file__).resolve().parent
KMZ_DIR = SCRIPT_DIR.parent.parent / "tests" / "golden" / "kmz"


@dataclass
class StageTiming:
    name: str
    seconds: float
    notes: str = ""


@dataclass
class BoundaryTiming:
    index: int
    name: str
    tables: int
    capacity_kwp: float
    icrs: int
    la_seconds: float
    cable_seconds: float
    num_inverters: int
    num_dc_cables: int
    num_ac_cables: int
    total_dc_m: float
    total_ac_m: float


@dataclass
class RepeatResult:
    repeat: int
    timed_out: bool
    total_seconds: float
    stages: List[StageTiming]
    boundaries: List[BoundaryTiming]
    error: Optional[str] = None


@dataclass
class BenchSummary:
    label: str
    kmz_stem: str
    timeout_s: float
    repeats: int
    completed_repeats: int
    timed_out_repeats: int
    median_total_s: Optional[float]
    min_total_s: Optional[float]
    max_total_s: Optional[float]
    per_repeat: List[RepeatResult] = field(default_factory=list)
    env: Dict[str, str] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Timeout via SIGALRM (POSIX only — fine for macOS/Linux dev boxes)
# ---------------------------------------------------------------------------

class _Timeout(Exception):
    pass


def _timeout_handler(signum, frame):  # noqa: ARG001
    raise _Timeout()


def _arm_timeout(seconds: float) -> None:
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.setitimer(signal.ITIMER_REAL, seconds)


def _disarm_timeout() -> None:
    signal.setitimer(signal.ITIMER_REAL, 0)
    signal.signal(signal.SIGALRM, signal.SIG_DFL)


# ---------------------------------------------------------------------------
# One repeat
# ---------------------------------------------------------------------------

def _run_one(
    kmz_path: Path,
    timeout_s: float,
    repeat: int,
    *,
    enable_cable_calc: bool = True,
) -> RepeatResult:
    stages: List[StageTiming] = []
    boundaries: List[BoundaryTiming] = []
    t_start = time.perf_counter()
    timed_out = False
    error: Optional[str] = None

    try:
        _arm_timeout(timeout_s)

        t = time.perf_counter()
        parsed = parse_kmz(str(kmz_path))
        stages.append(
            StageTiming(
                name="parse_kmz",
                seconds=time.perf_counter() - t,
                notes=f"{len(parsed.boundaries)} boundary(ies)",
            )
        )

        params = LayoutParameters()
        params.enable_cable_calc = enable_cable_calc

        t = time.perf_counter()
        results = run_layout_multi(
            boundaries=parsed.boundaries,
            params=params,
            centroid_lat=parsed.centroid_lat,
            centroid_lon=parsed.centroid_lon,
        )
        stages.append(
            StageTiming(
                name="run_layout_multi",
                seconds=time.perf_counter() - t,
                notes=f"{len(results)} result(s)",
            )
        )

        # NOTE: we time the per-boundary chain inline here because the
        # current routes/layout.py drives this loop sequentially. After
        # Change B (parallel per-plot) lands, this loop will be
        # parallelized — at that point this benchmark needs to mirror the
        # parallel dispatch to give a representative wall-clock. We
        # handle that by checking the env var ``PVLAYOUT_BENCH_PARALLEL``
        # below, which is set by Change B's deploy.
        t_pp = time.perf_counter()
        if os.environ.get("PVLAYOUT_BENCH_PARALLEL") == "1" and len(results) > 1:
            results = _run_per_plot_parallel(results, params)
        else:
            for r in results:
                if r.usable_polygon is None:
                    continue
                t_la = time.perf_counter()
                place_lightning_arresters(r, params)
                la_s = time.perf_counter() - t_la

                t_c = time.perf_counter()
                place_string_inverters(r, params)
                cable_s = time.perf_counter() - t_c

                boundaries.append(
                    BoundaryTiming(
                        index=len(boundaries),
                        name=getattr(r, "boundary_name", f"<{len(boundaries)}>"),
                        tables=len(r.placed_tables),
                        capacity_kwp=round(r.total_capacity_kwp, 2),
                        icrs=len(r.placed_icrs),
                        la_seconds=la_s,
                        cable_seconds=cable_s,
                        num_inverters=len(r.placed_string_inverters),
                        num_dc_cables=len(r.dc_cable_runs),
                        num_ac_cables=len(r.ac_cable_runs),
                        total_dc_m=r.total_dc_cable_m,
                        total_ac_m=r.total_ac_cable_m,
                    )
                )
        stages.append(
            StageTiming(
                name="per_plot_la_and_cables",
                seconds=time.perf_counter() - t_pp,
                notes=f"{len(boundaries)} boundary(ies) timed",
            )
        )

        # In parallel mode, fill in boundaries[] from the results post-hoc
        # (we lost per-stage la/cable split inside the workers; record what
        # we can).
        if not boundaries and results:
            for i, r in enumerate(results):
                boundaries.append(
                    BoundaryTiming(
                        index=i,
                        name=getattr(r, "boundary_name", f"<{i}>"),
                        tables=len(r.placed_tables),
                        capacity_kwp=round(r.total_capacity_kwp, 2),
                        icrs=len(r.placed_icrs),
                        la_seconds=-1.0,
                        cable_seconds=-1.0,
                        num_inverters=len(r.placed_string_inverters),
                        num_dc_cables=len(r.dc_cable_runs),
                        num_ac_cables=len(r.ac_cable_runs),
                        total_dc_m=r.total_dc_cable_m,
                        total_ac_m=r.total_ac_cable_m,
                    )
                )

    except _Timeout:
        timed_out = True
        error = f"timeout after {timeout_s}s"
    except Exception as e:  # noqa: BLE001
        error = f"{type(e).__name__}: {e}"
    finally:
        _disarm_timeout()

    total_s = time.perf_counter() - t_start
    return RepeatResult(
        repeat=repeat,
        timed_out=timed_out,
        total_seconds=total_s,
        stages=stages,
        boundaries=boundaries,
        error=error,
    )


def _bench_worker(args):
    """Top-level (picklable) worker that mirrors routes/layout.py's
    _run_per_plot_pipeline. Module-level so spawn-mode workers can
    import it.
    """
    from pvlayout_core.core.la_manager import (
        place_lightning_arresters as _la,
    )
    from pvlayout_core.core.string_inverter_manager import (
        place_string_inverters as _si,
    )

    r, p = args
    if r.usable_polygon is None:
        return r
    _la(r, p)
    _si(r, p)
    return r


def _run_per_plot_parallel(results, params):
    """Parallel dispatch matching routes/layout.py."""
    import concurrent.futures

    max_workers = min(len(results), os.cpu_count() or 4)
    args_list = [(r, params) for r in results]
    with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as ex:
        return list(ex.map(_bench_worker, args_list))


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--kmz",
        default="phaseboundary2",
        help="KMZ stem (file is tests/golden/kmz/<stem>.kmz)",
    )
    ap.add_argument(
        "--repeats", type=int, default=1, help="number of repeats (median over)"
    )
    ap.add_argument(
        "--timeout-s",
        type=float,
        default=600.0,
        help="per-repeat wall-clock cap (sec)",
    )
    ap.add_argument(
        "--label",
        default="bench",
        help="tag stored in JSON output (e.g. baseline, after-A, after-AB)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        help="write JSON result here (else stdout)",
    )
    ap.add_argument(
        "--no-cable-calc",
        action="store_true",
        help="set params.enable_cable_calc=False (sanity timing without cables)",
    )
    args = ap.parse_args()

    kmz_path = KMZ_DIR / f"{args.kmz}.kmz"
    if not kmz_path.exists():
        print(f"[error] KMZ not found: {kmz_path}", file=sys.stderr)
        return 2

    print(f"[bench] label={args.label} kmz={kmz_path.name} repeats={args.repeats} timeout_s={args.timeout_s}", flush=True)

    repeats: List[RepeatResult] = []
    for i in range(1, args.repeats + 1):
        print(f"[bench] repeat {i}/{args.repeats} ...", flush=True)
        rr = _run_one(
            kmz_path=kmz_path,
            timeout_s=args.timeout_s,
            repeat=i,
            enable_cable_calc=not args.no_cable_calc,
        )
        if rr.timed_out:
            print(
                f"[bench] repeat {i}: TIMED OUT at {rr.total_seconds:.1f}s",
                flush=True,
            )
        elif rr.error:
            print(
                f"[bench] repeat {i}: ERROR ({rr.error}) at {rr.total_seconds:.1f}s",
                flush=True,
            )
        else:
            print(
                f"[bench] repeat {i}: ok in {rr.total_seconds:.1f}s "
                f"({len(rr.boundaries)} boundary(ies))",
                flush=True,
            )
        repeats.append(rr)

    completed = [r for r in repeats if not r.timed_out and r.error is None]
    timed_out = [r for r in repeats if r.timed_out]

    times = sorted(r.total_seconds for r in completed)
    if times:
        median_s = times[len(times) // 2]
        min_s = times[0]
        max_s = times[-1]
    else:
        median_s = min_s = max_s = None

    summary = BenchSummary(
        label=args.label,
        kmz_stem=args.kmz,
        timeout_s=args.timeout_s,
        repeats=args.repeats,
        completed_repeats=len(completed),
        timed_out_repeats=len(timed_out),
        median_total_s=median_s,
        min_total_s=min_s,
        max_total_s=max_s,
        per_repeat=repeats,
        env={
            "PVLAYOUT_PATTERN_STATS": os.environ.get("PVLAYOUT_PATTERN_STATS", ""),
            "PVLAYOUT_BENCH_PARALLEL": os.environ.get("PVLAYOUT_BENCH_PARALLEL", ""),
            "PVLAYOUT_SKIP_INDIVIDUAL_AC": os.environ.get(
                "PVLAYOUT_SKIP_INDIVIDUAL_AC", ""
            ),
        },
    )

    payload = json.dumps(asdict(summary), indent=2, default=str)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload)
        print(f"[bench] wrote {args.out}", flush=True)
    else:
        print(payload)

    if timed_out:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
