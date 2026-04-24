/**
 * Unit tests for canvas/coords.ts.
 */
import { describe, it, expect } from "vitest"
import {
  haversineMetres,
  rectRingFromCorners,
  ringCentroid,
  type LngLat,
} from "./coords"

describe("haversineMetres", () => {
  it("returns 0 for identical points", () => {
    const p: LngLat = [77.614, 12.934]
    expect(haversineMetres(p, p)).toBe(0)
  })

  it("is symmetric", () => {
    const a: LngLat = [77.614, 12.934]
    const b: LngLat = [77.615, 12.935]
    expect(haversineMetres(a, b)).toBeCloseTo(haversineMetres(b, a), 9)
  })

  it("matches 10m east-west at India lat", () => {
    // 10m east at 12.934°N: dLng ≈ 10 / (111319.9 * cos(lat_rad))
    const a: LngLat = [77.614, 12.934]
    const dLng = 10 / (Math.cos((12.934 * Math.PI) / 180) * 111319.9)
    const b: LngLat = [77.614 + dLng, 12.934]
    expect(haversineMetres(a, b)).toBeCloseTo(10, 1)
  })

  it("matches ~10m north-south at India lat", () => {
    const a: LngLat = [77.614, 12.934]
    const dLat = 10 / 111132
    const b: LngLat = [77.614, 12.934 + dLat]
    expect(haversineMetres(a, b)).toBeGreaterThan(9)
    expect(haversineMetres(a, b)).toBeLessThan(11)
  })

  it("handles antimeridian-adjacent lngs without blowing up", () => {
    // -179.999 to 179.999 is ~220m apart, not ~40,000 km.
    const a: LngLat = [-179.999, 0]
    const b: LngLat = [179.999, 0]
    expect(haversineMetres(a, b)).toBeLessThan(250)
  })
})

describe("rectRingFromCorners", () => {
  it("builds a closed 5-point ring regardless of drag direction", () => {
    const tl: LngLat = [77.6, 12.94]
    const br: LngLat = [77.62, 12.92]
    const ring = rectRingFromCorners(tl, br)
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
  })

  it("normalises so dragging down-left == up-right", () => {
    const corners = [
      [77.6, 12.92] as LngLat,
      [77.62, 12.94] as LngLat,
    ] as const
    const up = rectRingFromCorners(corners[0], corners[1])
    const down = rectRingFromCorners(corners[1], corners[0])
    expect(up).toEqual(down)
  })

  it("places corners at axis-aligned min/max extents", () => {
    const ring = rectRingFromCorners([77.6, 12.92], [77.62, 12.94])
    const lngs = ring.map((p) => p[0])
    const lats = ring.map((p) => p[1])
    expect(Math.min(...lngs)).toBeCloseTo(77.6)
    expect(Math.max(...lngs)).toBeCloseTo(77.62)
    expect(Math.min(...lats)).toBeCloseTo(12.92)
    expect(Math.max(...lats)).toBeCloseTo(12.94)
  })
})

describe("ringCentroid", () => {
  it("averages the 4 corners of a closed rectangular ring", () => {
    const ring: LngLat[] = [
      [77.6, 12.9],
      [77.62, 12.9],
      [77.62, 12.94],
      [77.6, 12.94],
      [77.6, 12.9],
    ]
    const c = ringCentroid(ring)
    expect(c[0]).toBeCloseTo(77.61)
    expect(c[1]).toBeCloseTo(12.92)
  })

  it("handles open (non-closed) rings too", () => {
    const ring: LngLat[] = [
      [77.6, 12.9],
      [77.62, 12.9],
      [77.62, 12.94],
      [77.6, 12.94],
    ]
    const c = ringCentroid(ring)
    expect(c[0]).toBeCloseTo(77.61)
    expect(c[1]).toBeCloseTo(12.92)
  })
})
