import { describe, test, expect } from "vitest"
import { parsedKmzFromWire } from "./parsedKmzFromWire"

describe("parsedKmzFromWire", () => {
  test("converts a single-boundary wire payload", () => {
    const wire = {
      boundaries: [
        {
          name: "boundary-1",
          coords: [
            [78.0, 12.0],
            [78.1, 12.0],
            [78.1, 12.1],
            [78.0, 12.1],
            [78.0, 12.0],
          ] as [number, number][],
          obstacles: [],
          water_obstacles: [],
          line_obstructions: [],
        },
      ],
      centroid_lat: 12.05,
      centroid_lon: 78.05,
    }
    const out = parsedKmzFromWire(wire)
    expect(out.boundaries).toHaveLength(1)
    expect(out.boundaries[0]!.name).toBe("boundary-1")
    expect(out.boundaries[0]!.coords).toHaveLength(5)
    expect(out.centroid_lat).toBeCloseTo(12.05)
    expect(out.centroid_lon).toBeCloseTo(78.05)
  })

  test("preserves obstacles + water_obstacles + line_obstructions", () => {
    const wire = {
      boundaries: [
        {
          name: "with-overlays",
          coords: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ] as [number, number][],
          obstacles: [
            [
              [0.1, 0.1],
              [0.2, 0.1],
              [0.2, 0.2],
              [0.1, 0.1],
            ],
          ] as [number, number][][],
          water_obstacles: [
            [
              [0.3, 0.3],
              [0.4, 0.3],
              [0.4, 0.4],
              [0.3, 0.3],
            ],
          ] as [number, number][][],
          line_obstructions: [
            [
              [0.5, 0.5],
              [0.6, 0.5],
            ],
          ] as [number, number][][],
        },
      ],
      centroid_lat: 0,
      centroid_lon: 0,
    }
    const out = parsedKmzFromWire(wire)
    expect(out.boundaries[0]!.obstacles).toHaveLength(1)
    expect(out.boundaries[0]!.water_obstacles).toHaveLength(1)
    expect(out.boundaries[0]!.line_obstructions).toHaveLength(1)
    // Coord tuples preserved as (lon, lat).
    expect(out.boundaries[0]!.obstacles[0]![0]).toEqual([0.1, 0.1])
    expect(out.boundaries[0]!.water_obstacles[0]![0]).toEqual([0.3, 0.3])
    expect(out.boundaries[0]!.line_obstructions[0]![0]).toEqual([0.5, 0.5])
  })

  test("handles a multi-boundary payload", () => {
    const wire = {
      boundaries: [
        {
          name: "site-a",
          coords: [
            [10, 20],
            [11, 20],
            [11, 21],
            [10, 20],
          ] as [number, number][],
          obstacles: [],
          water_obstacles: [],
          line_obstructions: [],
        },
        {
          name: "site-b",
          coords: [
            [30, 40],
            [31, 40],
            [31, 41],
            [30, 40],
          ] as [number, number][],
          obstacles: [],
          water_obstacles: [],
          line_obstructions: [],
        },
      ],
      centroid_lat: 30,
      centroid_lon: 20,
    }
    const out = parsedKmzFromWire(wire)
    expect(out.boundaries.map((b) => b.name)).toEqual(["site-a", "site-b"])
  })
})
