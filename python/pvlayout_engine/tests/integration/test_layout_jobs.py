"""
Integration tests for the async layout-jobs endpoints.

POST /layout/jobs returns a ``{job_id}`` immediately; the actual
compute runs in a background thread. ``GET /layout/jobs/<id>`` returns
the current state; ``DELETE /layout/jobs/<id>`` requests cooperative
cancellation.

Coverage:
  * Round-trip happy path on a single-plot KMZ (sequential path, fast)
  * 404 on unknown job_id (both GET and DELETE)
  * Empty parsed_kmz still rejects with 422 like the blocking endpoint
  * Cancel marks the job CANCELLED and returns plots_done

Multi-plot parallel-path coverage lives in scripts/smoke_parallel.sh
(bundle smoke), not here — pytest can't afford to wait minutes on the
real multi-plot fixture.
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "integration-test-token-abcdefghijklmnop"
KMZ_PATH = Path(__file__).resolve().parents[1] / "golden" / "kmz" / "phaseboundary2.kmz"

# How long to wait for the background runner to finish on the small
# fixture. phaseboundary2 layout (no cables) is ~3 s; bump for CI variance.
JOB_DEADLINE_S = 60.0


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=54322,
        token=TEST_TOKEN,
        version="0.0.0+test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


def _parse(client: TestClient) -> dict:
    assert KMZ_PATH.exists(), KMZ_PATH
    with KMZ_PATH.open("rb") as fh:
        resp = client.post(
            "/parse-kmz",
            headers=auth(),
            files={"file": (KMZ_PATH.name, fh, "application/vnd.google-earth.kmz")},
        )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _start_job(client: TestClient, parsed: dict, **params) -> str:
    resp = client.post(
        "/layout/jobs",
        headers=auth(),
        json={"parsed_kmz": parsed, "params": params},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "job_id" in body
    return body["job_id"]


def _poll_until_terminal(
    client: TestClient, job_id: str, deadline_s: float = JOB_DEADLINE_S
) -> dict:
    deadline = time.monotonic() + deadline_s
    while time.monotonic() < deadline:
        resp = client.get(f"/layout/jobs/{job_id}", headers=auth())
        assert resp.status_code == 200, resp.text
        state = resp.json()
        if state["status"] in ("done", "failed", "cancelled"):
            return state
        time.sleep(0.1)
    pytest.fail(f"Job {job_id} did not reach terminal state in {deadline_s}s")


def test_round_trip_single_plot(client: TestClient) -> None:
    """Happy path: start a job, poll until done, verify result shape."""
    parsed = _parse(client)
    assert len(parsed["boundaries"]) == 1, (
        "phaseboundary2 must remain single-plot for this test"
    )

    job_id = _start_job(client, parsed)

    # First snapshot — the runner may not have started yet (plot can be
    # queued or running depending on thread scheduling).
    initial = client.get(f"/layout/jobs/{job_id}", headers=auth()).json()
    assert initial["job_id"] == job_id
    assert initial["status"] in ("queued", "running", "done")
    assert initial["plots_total"] == 1
    assert len(initial["plots"]) == 1
    assert initial["plots"][0]["index"] == 0
    assert initial["plots"][0]["name"]  # boundary has a name

    final = _poll_until_terminal(client, job_id)
    assert final["status"] == "done", final
    assert final["plots_done"] == 1
    assert final["plots_failed"] == 0
    assert final["plots"][0]["status"] == "done"
    # Per-plot timing is populated.
    assert final["plots"][0]["started_at"] is not None
    assert final["plots"][0]["ended_at"] is not None
    assert final["plots"][0]["ended_at"] >= final["plots"][0]["started_at"]
    # Result is the LayoutResponse shape.
    assert final["result"] is not None
    assert "results" in final["result"]
    assert len(final["result"]["results"]) == 1


def test_get_unknown_job_is_404(client: TestClient) -> None:
    resp = client.get("/layout/jobs/no-such-job", headers=auth())
    assert resp.status_code == 404


def test_delete_unknown_job_is_404(client: TestClient) -> None:
    resp = client.delete("/layout/jobs/no-such-job", headers=auth())
    assert resp.status_code == 404


def test_empty_boundaries_returns_422(client: TestClient) -> None:
    resp = client.post(
        "/layout/jobs",
        headers=auth(),
        json={
            "parsed_kmz": {
                "boundaries": [],
                "centroid_lat": 0.0,
                "centroid_lon": 0.0,
            },
            "params": {},
        },
    )
    assert resp.status_code == 422


def test_cancel_returns_cancelled_state(client: TestClient) -> None:
    """Cancel a job; the cancel response shape is correct and the job
    state reflects the cancel. We don't assert that the cancel landed
    *before* the work completed (single-plot is fast); we only assert
    that the cancel call itself returns the documented shape and the
    job's terminal state is consistent.
    """
    parsed = _parse(client)
    job_id = _start_job(client, parsed)

    resp = client.delete(f"/layout/jobs/{job_id}", headers=auth())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "cancelled"
    assert isinstance(body["plots_done"], int)
    assert body["plots_done"] >= 0

    final = _poll_until_terminal(client, job_id)
    # Single-plot is fast enough that the cancel may arrive after the
    # plot already completed — both outcomes are acceptable terminal
    # states. The contract is: cancel call returns cancelled-shape, job
    # reaches a terminal state without hanging.
    assert final["status"] in ("cancelled", "done"), final
