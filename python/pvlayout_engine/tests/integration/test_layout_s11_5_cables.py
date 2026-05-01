"""
S11.5 integration test — cables-on run on the real phaseboundary2 fixture.

Runs ``/parse-kmz`` → ``/layout`` with ``enable_cable_calc=True`` and
asserts:

* Wall-clock ≤ 45 s (post-S11.5 target is ≤ 30 s; 15 s headroom for
  machine-to-machine variance in CI).
* Bit-identical table / inverter / LA / capacity counts with the
  pre-S11.5 headless measurement of ``phaseboundary2.kmz``.
* DC + AC cable length totals within ±1 % of the pre-S11.5 numbers
  (acceptance per spec §6.2).
* Zero ``boundary_violation`` cables — a stricter assertion than the
  spec's 5 % remediation trigger; catches regressions before they
  reach the gate.
* Additive per-ICR + per-inverter AC subtotals present and consistent
  with ``total_ac_cable_m``.

This test is skipped in CI by default when
``PVLAYOUT_SKIP_SLOW_CABLES=1`` is set (defensive — the headless
script and this integration test are the O(seconds) artefacts after
S11.5, but keeping the escape hatch while machine variance is
unverified across dev shells).
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "s11-5-cables-test-token-abcdefghij"
KMZ_PATH = (
    Path(__file__).resolve().parents[1]
    / "golden"
    / "kmz"
    / "phaseboundary2.kmz"
)


# Pre-S11.5 headless baseline (captured 2026-04-24, spec §1.3).
# Acceptance bands are ±1 % per spec §6.2 / §7.2.
# DC cable count + total updated in P0 Task 6 when per-cable DC loop was
# replaced by _bundle_dc_cables() (row collectors + trunks per legacy
# baseline-v1-20260429). AC total is unchanged; per-inverter count still 62.
EXPECTED_INVERTERS = 62
EXPECTED_TABLES_POST_LA = 611
EXPECTED_LAS = 22
EXPECTED_CAPACITY_KWP = 19_845.28  # post-LA (LA-placement reduced 715 tables to 611)
# P0 Task 6 baseline: bundled DC routing (604 runs, not 611 per-table).
EXPECTED_DC_CABLE_RUNS = 604
EXPECTED_DC_TOTAL_M = 37_380.3
# Post-Pattern-V baseline. Pre-V this was 14,474.8 m, but those numbers
# included the outside-polygon detour portions of 15 boundary-violating
# Pattern F routes. Pattern V reroutes those 15 cables inside the plant
# boundary (via visibility graph + Dijkstra on the contiguous
# boundary-minus-ICR polygon), giving shorter, physically installable
# routes. 14,474.8 → 12,361.0 m, a 14.6 % decrease, reflects correct
# routing on previously-unbuildable cable.
EXPECTED_AC_TOTAL_M = 12_361.0
LENGTH_TOLERANCE = 0.01  # ±1 %
WALL_CLOCK_CAP_S = 45.0   # spec acceptance 30 s + 15 s variance headroom

# S11.5 (ADR 0007 amendment): Pattern V + contiguous route polygon
# guarantee all cables stay inside the plant boundary on phaseboundary2.
EXPECTED_BOUNDARY_VIOLATIONS = 0


pytestmark = pytest.mark.skipif(
    os.environ.get("PVLAYOUT_SKIP_SLOW_CABLES") == "1",
    reason="PVLAYOUT_SKIP_SLOW_CABLES=1 set; skipping cables-on integration",
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+s11-5-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


def test_cables_on_phaseboundary2(client: TestClient) -> None:
    assert KMZ_PATH.exists(), KMZ_PATH

    # ---- Parse ----
    with KMZ_PATH.open("rb") as fh:
        parse = client.post(
            "/parse-kmz",
            headers=auth(),
            files={"file": (KMZ_PATH.name, fh, "application/vnd.google-earth.kmz")},
        )
    assert parse.status_code == 200, parse.text
    parsed = parse.json()

    # ---- Layout with cables ON ----
    t0 = time.perf_counter()
    layout = client.post(
        "/layout",
        headers=auth(),
        json={
            "parsed_kmz": parsed,
            "params": {"enable_cable_calc": True},
        },
    )
    wall_clock = time.perf_counter() - t0
    assert layout.status_code == 200, layout.text

    assert wall_clock <= WALL_CLOCK_CAP_S, (
        f"cables-on wall-clock {wall_clock:.1f}s exceeds {WALL_CLOCK_CAP_S:.0f}s "
        f"(pre-S11.5: ~460 s; S11.5 target: ≤ 30 s; this cap includes variance)"
    )

    results = layout.json()["results"]
    assert len(results) == 1
    r = results[0]

    # ---- Bit-identical invariants ----
    assert len(r["placed_tables"]) == EXPECTED_TABLES_POST_LA
    assert len(r["placed_string_inverters"]) == EXPECTED_INVERTERS
    assert len(r["placed_las"]) == EXPECTED_LAS
    assert abs(r["total_capacity_kwp"] - EXPECTED_CAPACITY_KWP) < 0.1, (
        r["total_capacity_kwp"], EXPECTED_CAPACITY_KWP
    )

    # ---- Cable count invariants ----
    # DC: bundled row collectors + trunks (P0 parity); not 1-per-table.
    # AC: MST visual runs; 1 edge per inverter (star topology on phaseboundary2).
    assert len(r["dc_cable_runs"]) == EXPECTED_DC_CABLE_RUNS
    assert len(r["ac_cable_runs"]) == EXPECTED_INVERTERS

    # ---- Cable total deltas within ±1 % ----
    dc_delta = abs(r["total_dc_cable_m"] - EXPECTED_DC_TOTAL_M) / EXPECTED_DC_TOTAL_M
    ac_delta = abs(r["total_ac_cable_m"] - EXPECTED_AC_TOTAL_M) / EXPECTED_AC_TOTAL_M
    assert dc_delta <= LENGTH_TOLERANCE, (
        f"DC total {r['total_dc_cable_m']} m vs baseline {EXPECTED_DC_TOTAL_M} m "
        f"(Δ {dc_delta*100:.2f} % > {LENGTH_TOLERANCE*100:.0f} %)"
    )
    assert ac_delta <= LENGTH_TOLERANCE, (
        f"AC total {r['total_ac_cable_m']} m vs baseline {EXPECTED_AC_TOTAL_M} m "
        f"(Δ {ac_delta*100:.2f} % > {LENGTH_TOLERANCE*100:.0f} %)"
    )

    # ---- AC cable trench length (Spike 1 Phase 3) ----
    # New top-level scalar surfaced from the MST sum that was previously
    # discarded. Must equal sum(ac_cable_runs[*].length_m) — they share
    # the same source. And must be ≤ total_ac_cable_m (BoM): trench is
    # shared corridor; BoM is per-inverter copper. PRD §2.2.
    trench_m = r["total_ac_cable_trench_m"]
    runs_sum = sum(c["length_m"] for c in r["ac_cable_runs"])
    assert abs(trench_m - runs_sum) <= 0.5, (
        f"total_ac_cable_trench_m {trench_m} m disagrees with "
        f"sum(ac_cable_runs[*].length_m) {runs_sum:.1f} m "
        "(should match within rounding)"
    )
    assert trench_m > 0, (
        f"total_ac_cable_trench_m={trench_m}; expected non-zero on a "
        "cabled run with multiple inverters (the MST geometry exists, "
        "so its sum must be positive)"
    )
    assert trench_m <= r["total_ac_cable_m"], (
        f"trench length {trench_m} m exceeds BoM {r['total_ac_cable_m']} m; "
        "EPC invariant violated (trench is shared corridor, BoM is "
        "per-inverter dedicated copper)"
    )

    # ---- Zero boundary violations (Pattern V keeps all cables inside) ----
    # Post-ADR-0007-amendment: Pattern V's visibility graph on the
    # boundary-minus-ICR polygon resolves all cables that previously fell
    # to Pattern F with boundary violations. Any regression that re-adds
    # them forces a deliberate baseline update here.
    dc_violations = [c for c in r["dc_cable_runs"] if c.get("route_quality") == "boundary_violation"]
    ac_violations = [c for c in r["ac_cable_runs"] if c.get("route_quality") == "boundary_violation"]
    total_violations = len(dc_violations) + len(ac_violations)
    assert total_violations == EXPECTED_BOUNDARY_VIOLATIONS, (
        f"boundary_violation count is {total_violations} "
        f"(DC={len(dc_violations)}, AC={len(ac_violations)}); "
        f"expected {EXPECTED_BOUNDARY_VIOLATIONS}. "
        "Pattern V (visibility-graph fallback) should resolve all cases on "
        "phaseboundary2; any regression here likely means _build_route_polygon "
        "is returning None or the visibility graph is disconnecting components"
    )

    # Pattern V acceptance — at least some AC cables should route via V
    # on phaseboundary2 (the 15 that previously fell to F). If V=0 it
    # means Pattern V isn't firing even though the plant needs it.
    v_routed_ac = [c for c in r["ac_cable_runs"] if c.get("route_quality") == "ok" and len(c.get("route_utm", [])) >= 2]
    assert len(v_routed_ac) == EXPECTED_INVERTERS, (
        f"{len(v_routed_ac)} AC cables tagged route_quality=ok, "
        f"expected {EXPECTED_INVERTERS} (all inverters)"
    )

    # ---- Per-inverter + per-ICR AC subtotals are present + consistent ----
    per_inv = r.get("ac_cable_m_per_inverter", {})
    per_icr = r.get("ac_cable_m_per_icr", {})
    assert per_inv, "ac_cable_m_per_inverter empty; expected 62 entries"
    assert per_icr, "ac_cable_m_per_icr empty; expected 2 entries (phaseboundary2 has 2 ICRs)"
    assert len(per_inv) == EXPECTED_INVERTERS
    assert len(per_icr) == 2
    sum_per_inv = sum(per_inv.values())
    sum_per_icr = sum(per_icr.values())
    assert abs(sum_per_inv - r["total_ac_cable_m"]) <= 0.5, (
        f"sum(ac_cable_m_per_inverter) = {sum_per_inv:.1f} m, "
        f"total_ac_cable_m = {r['total_ac_cable_m']:.1f} m"
    )
    assert abs(sum_per_icr - r["total_ac_cable_m"]) <= 0.5, (
        f"sum(ac_cable_m_per_icr) = {sum_per_icr:.1f} m, "
        f"total_ac_cable_m = {r['total_ac_cable_m']:.1f} m"
    )
