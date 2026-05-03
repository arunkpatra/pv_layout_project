"""
Unit tests for S11.5 Pattern V primitives.

Covers the visibility graph + Dijkstra + ``_route_visibility`` path in
isolation, on synthetic polygons whose expected routing outcome is
obvious by construction. Lets future refactors of these primitives
fail a fast test instead of needing a full phaseboundary2 integration
run to notice a regression.

The full end-to-end correctness (0 boundary violations on
phaseboundary2, AC total within ±1 %) is covered by
``test_layout_s11_5_cables.py``.
"""
from __future__ import annotations

from shapely.geometry import Polygon, MultiPolygon

import pvlayout_core.core.string_inverter_manager as sim


# ---------------------------------------------------------------------------
# Visibility graph on synthetic polygons
# ---------------------------------------------------------------------------


def _square() -> Polygon:
    return Polygon([(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)])


def _L_shape() -> Polygon:
    # A unit-10 square with a 6×6 notch cut from the top-right corner:
    #
    #   +-----+
    #   |     |
    #   |     +-----+
    #   |           |
    #   +-----------+
    #
    # Boundary vertices (ccw): (0,0) (10,0) (10,4) (4,4) (4,10) (0,10).
    # The "inner corner" at (4,4) is the key pivot for concave routing.
    return Polygon([(0, 0), (10, 0), (10, 4), (4, 4), (4, 10), (0, 10), (0, 0)])


def _two_rooms() -> MultiPolygon:
    # Two squares connected by a narrow corridor. Simulates the
    # phaseboundary2 situation where the usable polygon is disjoint.
    left = Polygon([(0, 0), (5, 0), (5, 5), (0, 5), (0, 0)])
    right = Polygon([(7, 0), (12, 0), (12, 5), (7, 5), (7, 0)])
    return MultiPolygon([left, right])


# ---------------------------------------------------------------------------
# _build_boundary_vis_graph
# ---------------------------------------------------------------------------


def test_vis_graph_square_is_fully_connected() -> None:
    """Convex polygon: every pair of boundary vertices is mutually visible."""
    sim._reset_vis_cache()
    sim._build_boundary_vis_graph(_square())
    n = len(sim._vis_cache_nodes)
    assert n == 4  # 4 corners (closing vertex dedup'd)
    # Each vertex should see all 3 others.
    for i, nbrs in enumerate(sim._vis_cache_adj):
        assert len(nbrs) == 3, f"vertex {i} has {len(nbrs)} neighbours, expected 3"


def test_vis_graph_L_shape_blocks_cross_notch_visibility() -> None:
    """Concave polygon: diagonally opposite vertices across the notch are NOT visible."""
    sim._reset_vis_cache()
    sim._build_boundary_vis_graph(_L_shape())
    nodes = sim._vis_cache_nodes
    # Find indices for (10, 0) and (4, 10) — the two corners that bracket
    # the notch diagonally. A line between them exits the polygon.
    idx_10_0 = nodes.index((10.0, 0.0))
    idx_4_10 = nodes.index((4.0, 10.0))
    nbrs_of_10_0 = {j for j, _ in sim._vis_cache_adj[idx_10_0]}
    assert idx_4_10 not in nbrs_of_10_0, (
        "line (10, 0) → (4, 10) should exit the L-shape polygon"
    )
    # (0, 0) to (4, 4) SHOULD be visible (interior diagonal of the L's stem)
    idx_0_0 = nodes.index((0.0, 0.0))
    idx_4_4 = nodes.index((4.0, 4.0))
    assert idx_4_4 in {j for j, _ in sim._vis_cache_adj[idx_0_0]}


def test_vis_graph_multipolygon_components_disjoint() -> None:
    """MultiPolygon with two disjoint components: no cross-component edges."""
    sim._reset_vis_cache()
    sim._build_boundary_vis_graph(_two_rooms())
    nodes = sim._vis_cache_nodes
    # Left square vertices all have x ≤ 5; right-square all have x ≥ 7.
    for i, (x_i, _) in enumerate(nodes):
        for j, _w in sim._vis_cache_adj[i]:
            x_j, _ = nodes[j]
            # Edge between a left vertex (x ≤ 5) and a right vertex (x ≥ 7)
            # must NOT exist — the line would cross the 5<x<7 gap which
            # is outside both components.
            assert not ((x_i <= 5.0 and x_j >= 7.0) or (x_i >= 7.0 and x_j <= 5.0)), (
                f"cross-component edge {nodes[i]} → {nodes[j]} exists"
            )


# ---------------------------------------------------------------------------
# _dijkstra
# ---------------------------------------------------------------------------


def test_dijkstra_trivial_triangle() -> None:
    """Triangle with edges 1, 1, 3 — shortest path of length 2 via the third node."""
    # Nodes 0-1-2, edges 0↔1 (cost 1), 1↔2 (cost 1), 0↔2 (cost 3).
    adj = [
        [(1, 1.0), (2, 3.0)],  # 0
        [(0, 1.0), (2, 1.0)],  # 1
        [(1, 1.0), (0, 3.0)],  # 2
    ]
    assert sim._dijkstra(adj, 0, 2) == [0, 1, 2]


def test_dijkstra_unreachable() -> None:
    """Two disconnected components return None for cross-component path."""
    adj = [
        [(1, 1.0)],
        [(0, 1.0)],
        [(3, 1.0)],
        [(2, 1.0)],
    ]
    assert sim._dijkstra(adj, 0, 3) is None


def test_dijkstra_single_node() -> None:
    """Same start and end — trivial path of length 1."""
    adj: list[list[tuple[int, float]]] = [[]]
    assert sim._dijkstra(adj, 0, 0) == [0]


# ---------------------------------------------------------------------------
# _route_visibility
# ---------------------------------------------------------------------------


def test_route_visibility_square_direct() -> None:
    """Convex polygon: route is the direct straight line, 2 points."""
    sim._reset_vis_cache()
    path = sim._route_visibility((1, 1), (9, 9), _square())
    assert path is not None
    assert path == [(1, 1), (9, 9)]


def test_route_visibility_L_shape_routes_via_inner_corner() -> None:
    """Concave polygon: route from stem to arm passes through the inner corner."""
    sim._reset_vis_cache()
    # From (0.5, 9.5) in the top-left of the stem to (9.5, 0.5) in the
    # bottom-right of the arm. Direct line crosses the notch (outside).
    path = sim._route_visibility((0.5, 9.5), (9.5, 0.5), _L_shape())
    assert path is not None
    assert len(path) >= 3, "expected at least one intermediate node (the inner corner)"
    # The inner corner (4, 4) must be one of the intermediate points on
    # any valid inside-polygon route between these endpoints.
    assert (4.0, 4.0) in path, f"route {path} should include inner corner (4,4)"


def test_route_visibility_multipolygon_cross_components_unreachable() -> None:
    """Disjoint MultiPolygon: no inside path exists between components."""
    sim._reset_vis_cache()
    # Start in left room, end in right room — no connection.
    path = sim._route_visibility((1, 1), (11, 4), _two_rooms())
    assert path is None, (
        "route across disjoint MultiPolygon components should be unreachable; "
        f"got {path}"
    )
