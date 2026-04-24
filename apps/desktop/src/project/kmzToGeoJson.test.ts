// Regression suite for kmzToGeoJson.
//
// This is the function that almost shipped the S8 bug: a too-strict
// `>= 4` length filter combined with a `closeRing` helper made it easy
// to silently drop boundaries. None of those failure modes recurred in
// the final S8 fix, but they're easy to break again if the function is
// refactored. These tests pin the contract.

import { describe, it, expect } from "vitest"
import type { ParsedKMZ } from "@solarlayout/sidecar-client"
import { kmzToGeoJson, countKmzFeatures } from "./kmzToGeoJson"

const square = (offset = 0): [number, number][] => [
  [0 + offset, 0],
  [1 + offset, 0],
  [1 + offset, 1],
  [0 + offset, 1],
]

const closedSquare = (offset = 0): [number, number][] => [
  ...square(offset),
  [0 + offset, 0], // first === last, KML convention
]

const baseKmz = (overrides: Partial<ParsedKMZ["boundaries"][0]> = {}) => ({
  boundaries: [
    {
      name: "Plant 1",
      coords: closedSquare(),
      obstacles: [],
      line_obstructions: [],
      ...overrides,
    },
  ],
  centroid_lat: 0.5,
  centroid_lon: 0.5,
})

describe("kmzToGeoJson", () => {
  it("converts a single closed boundary to one Polygon feature", () => {
    const out = kmzToGeoJson(baseKmz())
    expect(out.boundaries.features).toHaveLength(1)
    const f = out.boundaries.features[0]!
    expect(f.geometry.type).toBe("Polygon")
    expect(f.geometry.coordinates[0]).toHaveLength(5) // already closed, length preserved
    expect(f.geometry.coordinates[0]![0]).toEqual(
      f.geometry.coordinates[0]![f.geometry.coordinates[0]!.length - 1]
    )
  })

  it("closes an unclosed ring (adds first point to the end)", () => {
    const out = kmzToGeoJson(baseKmz({ coords: square() })) // 4 unique points, not closed
    expect(out.boundaries.features).toHaveLength(1)
    const ring = out.boundaries.features[0]!.geometry.coordinates[0]!
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it("preserves boundary name in feature properties", () => {
    const out = kmzToGeoJson(baseKmz({ name: "Phase 2 (acres)" }))
    expect(out.boundaries.features[0]!.properties).toEqual({
      boundary: "Phase 2 (acres)",
    })
  })

  it("emits 0 features for a degenerate ring (<3 unique points)", () => {
    // Two-point "ring" — kmzToGeoJson must NOT emit a feature.
    const degenerate = baseKmz({
      coords: [
        [0, 0],
        [1, 1],
      ],
    })
    const out = kmzToGeoJson(degenerate)
    expect(out.boundaries.features).toHaveLength(0)
  })

  it("converts obstacles to separate Polygon features per boundary", () => {
    const withObstacles = baseKmz({
      obstacles: [closedSquare(2), closedSquare(4)],
    })
    const out = kmzToGeoJson(withObstacles)
    expect(out.obstacles.features).toHaveLength(2)
    expect(out.obstacles.features[0]!.properties).toMatchObject({
      boundary: "Plant 1",
      index: 0,
    })
    expect(out.obstacles.features[1]!.properties).toMatchObject({
      boundary: "Plant 1",
      index: 1,
    })
  })

  it("converts line obstructions to LineString features", () => {
    const withLines = baseKmz({
      line_obstructions: [
        [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      ],
    })
    const out = kmzToGeoJson(withLines)
    expect(out.lineObstructions.features).toHaveLength(1)
    expect(out.lineObstructions.features[0]!.geometry.type).toBe("LineString")
    expect(out.lineObstructions.features[0]!.geometry.coordinates).toHaveLength(3)
  })

  it("handles multiple boundaries (each becomes its own feature)", () => {
    const multi: ParsedKMZ = {
      boundaries: [
        {
          name: "P1",
          coords: closedSquare(),
          obstacles: [],
          line_obstructions: [],
        },
        {
          name: "P2",
          coords: closedSquare(10),
          obstacles: [],
          line_obstructions: [],
        },
      ],
      centroid_lat: 0,
      centroid_lon: 0,
    }
    const out = kmzToGeoJson(multi)
    expect(out.boundaries.features).toHaveLength(2)
    expect(out.boundaries.features.map((f) => f.properties!.boundary)).toEqual([
      "P1",
      "P2",
    ])
  })

  it("emits empty FeatureCollections for an empty input", () => {
    const empty: ParsedKMZ = {
      boundaries: [],
      centroid_lat: 0,
      centroid_lon: 0,
    }
    const out = kmzToGeoJson(empty)
    expect(out.boundaries.features).toHaveLength(0)
    expect(out.obstacles.features).toHaveLength(0)
    expect(out.lineObstructions.features).toHaveLength(0)
  })
})

describe("countKmzFeatures", () => {
  it("counts boundaries, obstacles, and line obstructions across all boundaries", () => {
    const kmz: ParsedKMZ = {
      boundaries: [
        {
          name: "P1",
          coords: closedSquare(),
          obstacles: [closedSquare(2)],
          line_obstructions: [],
        },
        {
          name: "P2",
          coords: closedSquare(10),
          obstacles: [closedSquare(11), closedSquare(12)],
          line_obstructions: [
            [
              [0, 0],
              [1, 1],
            ],
          ],
        },
      ],
      centroid_lat: 0,
      centroid_lon: 0,
    }
    expect(countKmzFeatures(kmz)).toEqual({
      boundaries: 2,
      obstacles: 3,
      lines: 1,
    })
  })

  it("counts boundaries even if their rings are too short to be valid polygons (status-bar accuracy)", () => {
    // The S8 bug surfaced because the status-bar count uses parsed.boundaries.length
    // directly, while kmzToGeoJson filters degenerate rings. This test pins
    // that asymmetry — the count is INTENTIONALLY upstream of the polygon
    // validity check; engineers want to know "the sidecar reported 1
    // boundary" even if it later fails to render.
    const degenerate: ParsedKMZ = {
      boundaries: [
        {
          name: "broken",
          coords: [
            [0, 0],
            [1, 1],
          ],
          obstacles: [],
          line_obstructions: [],
        },
      ],
      centroid_lat: 0,
      centroid_lon: 0,
    }
    expect(countKmzFeatures(degenerate).boundaries).toBe(1)
    // …and confirm the conversion drops it as expected:
    expect(kmzToGeoJson(degenerate).boundaries.features).toHaveLength(0)
  })
})
