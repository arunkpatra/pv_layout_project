"""
/layout/jobs/* — async, polled-result variant of POST /layout.

Same compute as routes/layout.py POST /layout, but the request returns
immediately with a ``job_id``. The compute runs in a background thread
that updates an in-process job table. Clients poll
``GET /layout/jobs/<id>`` every few seconds until ``status`` is terminal
(done / failed / cancelled), then read the final ``LayoutResponse``
from ``result``.

Why
---
Multi-plot KMZs with cable-calc enabled can take several minutes. The
blocking ``POST /layout`` freezes the desktop UI for the duration with
no progress feedback and risks Tauri-plugin-http timing out on the long
TCP idle. The job-table pattern fixes both: every HTTP call returns in
ms, and the desktop renders a live per-plot progress list by polling.

Spike 2 reuses this exact wire shape with Postgres-backed storage and
SQS-dispatched Lambda workers. Same polling code on the desktop drives
both — only the URL changes.

Lifecycle
---------
* ``POST /layout/jobs`` → creates a Job + N PlotState rows (queued),
  starts a background thread, returns ``{job_id}``.
* Background thread runs the same pipeline as the blocking handler
  (``run_layout_multi`` then per-plot LA + string-inverter passes),
  parallel via ProcessPoolExecutor when the conditions in
  ``routes/layout.py`` apply, sequential otherwise. As each plot
  starts/finishes/fails, the corresponding ``PlotState`` is updated.
* ``GET /layout/jobs/<id>`` returns a snapshot of the current state.
* ``DELETE /layout/jobs/<id>`` flips ``cancelled = True``. The
  background thread checks this between submits — pending plots are
  skipped (``PlotStatus.CANCELLED``); already-running workers complete
  on their own (cooperative cancel — no clean abort signal across
  process boundaries). Whatever finished is preserved as a partial
  ``result``.

Per-plot exception handling
---------------------------
Each plot's ``_run_per_plot_pipeline`` call is wrapped in try/except.
A single plot crashing does not abort the job — the failure is
recorded on that PlotState (``status=FAILED``, ``error="..."``) and
the other plots continue. The client renders a partial layout for the
successful plots and surfaces the failed plot in the per-plot list.

Job retention
-------------
Jobs live in memory for the sidecar's lifetime. There is no explicit
TTL — multi-plot runs are minutes long; a sidecar restart is rare and
acceptable as a "kick it off again" event. Memory cost per job is
small (a few KB of state plus the result). If we ever see leaks, add
a lazy GC sweep on access.
"""
from __future__ import annotations

import concurrent.futures
import logging
import multiprocessing
import os
import threading
import time
import uuid

from fastapi import APIRouter, HTTPException, status

from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.string_inverter_manager import place_string_inverters

from pvlayout_engine import adapters
from pvlayout_engine.routes.layout import _boundaries_to_core, _run_per_plot_pipeline
from pvlayout_engine.schemas import (
    JobStatus,
    LayoutJobCancelResponse,
    LayoutJobStartResponse,
    LayoutJobState,
    LayoutRequest,
    LayoutResponse,
    PlotState,
    PlotStatus,
)


router = APIRouter()
log = logging.getLogger("pvlayout_engine")


# ---------------------------------------------------------------------------
# In-process job table.
# ---------------------------------------------------------------------------


class _Job:
    """Module-internal mutable container for one async layout job.

    Each ``_Job`` carries its own lock so the polling handler
    (FastAPI thread) and the background runner (a worker thread) can
    safely share the state. Reads in the polling handler must take the
    lock to get a coherent snapshot of plots[*].status / started_at /
    ended_at, since those fields are mutated as plots transition.
    """

    __slots__ = ("job_id", "status", "plots", "result", "cancelled", "lock")

    def __init__(self, job_id: str, plots: list[PlotState]) -> None:
        self.job_id = job_id
        self.status: JobStatus = JobStatus.QUEUED
        self.plots: list[PlotState] = plots
        self.result: LayoutResponse | None = None
        self.cancelled: bool = False
        self.lock = threading.Lock()

    def snapshot(self) -> LayoutJobState:
        """Build a wire-safe snapshot under the job's lock."""
        with self.lock:
            plots_snapshot = [p.model_copy() for p in self.plots]
            return LayoutJobState(
                job_id=self.job_id,
                status=self.status,
                plots_total=len(plots_snapshot),
                plots_done=sum(
                    1 for p in plots_snapshot if p.status == PlotStatus.DONE
                ),
                plots_failed=sum(
                    1 for p in plots_snapshot if p.status == PlotStatus.FAILED
                ),
                plots=plots_snapshot,
                result=self.result,
            )


# Module-level table. One global lock guards membership (insert/delete);
# per-job lock guards individual job state. This split lets polling read
# one job without serializing on the membership lock.
_JOBS: dict[str, _Job] = {}
_JOBS_LOCK = threading.Lock()


def _get_job(job_id: str) -> _Job:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job not found: {job_id}",
        )
    return job


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/layout/jobs",
    response_model=LayoutJobStartResponse,
    summary="Start an async layout job; returns a job_id to poll",
)
def start_layout_job(request: LayoutRequest) -> LayoutJobStartResponse:
    """Create a Job, kick off the background runner, return the job_id.

    The synchronous part is intentionally minimal: validate the request
    shape, project boundaries to core domain, snapshot per-plot names so
    the polling client can render a stable list immediately. The
    background thread does the heavy lifting (run_layout_multi + LA +
    cable passes).
    """
    if not request.parsed_kmz.boundaries:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="parsed_kmz contains no boundaries",
        )

    # Build the per-plot stub list now so the polling client can render
    # a complete progress list on the first GET, even before any plot
    # has started.
    plots = [
        PlotState(index=i, name=b.name, status=PlotStatus.QUEUED)
        for i, b in enumerate(request.parsed_kmz.boundaries)
    ]
    job_id = uuid.uuid4().hex
    job = _Job(job_id=job_id, plots=plots)

    with _JOBS_LOCK:
        _JOBS[job_id] = job

    # Daemon so a sidecar shutdown doesn't hang on stranded threads.
    # ProcessPoolExecutor inside this thread cleans up its workers via
    # its own context manager.
    threading.Thread(
        target=_run_job_safely, args=(job, request), daemon=True
    ).start()

    return LayoutJobStartResponse(job_id=job_id)


@router.get(
    "/layout/jobs/{job_id}",
    response_model=LayoutJobState,
    summary="Poll the current state of an async layout job",
)
def get_layout_job(job_id: str) -> LayoutJobState:
    return _get_job(job_id).snapshot()


@router.delete(
    "/layout/jobs/{job_id}",
    response_model=LayoutJobCancelResponse,
    summary="Request cooperative cancellation of an async layout job",
)
def cancel_layout_job(job_id: str) -> LayoutJobCancelResponse:
    """Mark the job as cancelled. Already-running plots complete on
    their own; pending plots are skipped. The partial result is
    preserved so the desktop can render whatever finished.
    """
    job = _get_job(job_id)
    with job.lock:
        job.cancelled = True
        # Don't override status if the runner already completed it
        # (e.g. cancel arrived just after the last plot landed).
        if job.status in (JobStatus.QUEUED, JobStatus.RUNNING):
            job.status = JobStatus.CANCELLED
        plots_done = sum(1 for p in job.plots if p.status == PlotStatus.DONE)
    return LayoutJobCancelResponse(status="cancelled", plots_done=plots_done)


# ---------------------------------------------------------------------------
# Background runner.
# ---------------------------------------------------------------------------


def _run_job_safely(job: _Job, request: LayoutRequest) -> None:
    """Top-level wrapper that ensures any uncaught exception flips the
    job to FAILED rather than silently leaving it stuck in RUNNING."""
    try:
        _run_job(job, request)
    except Exception as exc:  # noqa: BLE001 — last-resort guard
        log.exception("Layout job %s failed at top level", job.job_id)
        with job.lock:
            if job.status not in (JobStatus.DONE, JobStatus.CANCELLED):
                job.status = JobStatus.FAILED


def _run_job(job: _Job, request: LayoutRequest) -> None:
    core_boundaries = _boundaries_to_core(request.parsed_kmz.boundaries)
    core_params = adapters.params_to_core(request.params)

    with job.lock:
        if job.cancelled:
            return
        job.status = JobStatus.RUNNING

    # Initial layout pass — places tables, ICRs, roads. Cheap relative
    # to the LA + cable passes; runs single-process.
    core_results = run_layout_multi(
        boundaries=core_boundaries,
        params=core_params,
        centroid_lat=request.parsed_kmz.centroid_lat,
        centroid_lon=request.parsed_kmz.centroid_lon,
    )

    # Decide whether to dispatch parallel. Same logic as routes/layout.py
    # POST /layout: parallel only when multiple plots AND cable_calc on,
    # so we don't pay process-pool startup on small/cheap jobs.
    use_parallel = (
        len(core_results) > 1
        and core_params.enable_cable_calc
        and os.environ.get("PVLAYOUT_DISABLE_PARALLEL") != "1"
    )

    if use_parallel:
        _run_parallel(job, core_results, core_params)
    else:
        _run_sequential(job, core_results, core_params)

    # Build the response from whatever core_results we have. Plots that
    # were skipped (cancelled) keep their pre-LA/cable state — the
    # adapter renders zero counts for missing fields.
    response = LayoutResponse(
        results=[adapters.result_from_core(r) for r in core_results]
    )
    with job.lock:
        job.result = response
        # Don't override CANCELLED if the user pulled the plug.
        if job.status == JobStatus.RUNNING:
            job.status = JobStatus.DONE


def _run_sequential(job: _Job, core_results, core_params) -> None:
    for i, r in enumerate(core_results):
        with job.lock:
            if job.cancelled:
                # Skip remaining plots — mark them cancelled.
                for j in range(i, len(core_results)):
                    p = job.plots[j]
                    if p.status == PlotStatus.QUEUED:
                        p.status = PlotStatus.CANCELLED
                return
            job.plots[i].status = PlotStatus.RUNNING
            job.plots[i].started_at = time.time()

        try:
            if r.usable_polygon is not None:
                place_lightning_arresters(r, core_params)
                place_string_inverters(r, core_params)
            with job.lock:
                job.plots[i].status = PlotStatus.DONE
                job.plots[i].ended_at = time.time()
        except Exception as exc:  # noqa: BLE001 — per-plot resilience
            log.warning(
                "Plot %d (%s) failed in job %s: %s",
                i, job.plots[i].name, job.job_id, exc,
            )
            with job.lock:
                job.plots[i].status = PlotStatus.FAILED
                job.plots[i].ended_at = time.time()
                job.plots[i].error = _short_error(exc)


def _run_parallel(job: _Job, core_results, core_params) -> None:
    max_workers = min(len(core_results), os.cpu_count() or 4)
    spawn_ctx = multiprocessing.get_context("spawn")

    # Map future → plot index so as_completed() callbacks can update
    # the right PlotState.
    with concurrent.futures.ProcessPoolExecutor(
        max_workers=max_workers, mp_context=spawn_ctx
    ) as ex:
        future_to_index: dict[concurrent.futures.Future, int] = {}
        for i, r in enumerate(core_results):
            with job.lock:
                if job.cancelled:
                    # Skip remaining submissions.
                    for j in range(i, len(core_results)):
                        p = job.plots[j]
                        if p.status == PlotStatus.QUEUED:
                            p.status = PlotStatus.CANCELLED
                    break
                job.plots[i].status = PlotStatus.RUNNING
                job.plots[i].started_at = time.time()
            future = ex.submit(_run_per_plot_pipeline, (r, core_params))
            future_to_index[future] = i

        # Drain completed futures — update the corresponding PlotState
        # as each one lands. Order is non-deterministic (whichever
        # finishes first); the per-plot index keeps the bookkeeping
        # straight.
        for future in concurrent.futures.as_completed(future_to_index):
            i = future_to_index[future]
            try:
                core_results[i] = future.result()
                with job.lock:
                    job.plots[i].status = PlotStatus.DONE
                    job.plots[i].ended_at = time.time()
            except Exception as exc:  # noqa: BLE001 — per-plot resilience
                log.warning(
                    "Plot %d (%s) failed in job %s: %s",
                    i, job.plots[i].name, job.job_id, exc,
                )
                with job.lock:
                    job.plots[i].status = PlotStatus.FAILED
                    job.plots[i].ended_at = time.time()
                    job.plots[i].error = _short_error(exc)


def _short_error(exc: BaseException) -> str:
    """Single-line error string for the wire. The full traceback stays
    in sidecar logs (the warning above)."""
    msg = f"{type(exc).__name__}: {exc}"
    # Avoid pathological multi-line dumps in the wire payload.
    return msg.replace("\n", " ").strip()[:500]
