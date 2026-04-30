import { describe, it, expect } from "bun:test"
import {
  getISOWeek,
  getPeriod,
  getCutoff,
  generatePeriods,
} from "./sales-utils.js"

describe("getISOWeek", () => {
  it("returns correct ISO week for a mid-year date", () => {
    // 2026-04-15 is Wednesday of week 16
    expect(getISOWeek(new Date("2026-04-15"))).toBe("2026-W16")
  })

  it("handles year boundary — Jan 1-3 2027 belong to 2026-W53", () => {
    // Jan 1 2027 is a Friday; ISO week 1 of 2027 starts Jan 4, so Jan 1-3 are in 2026-W53
    expect(getISOWeek(new Date("2027-01-01"))).toBe("2026-W53")
    expect(getISOWeek(new Date("2027-01-03"))).toBe("2026-W53")
  })

  it("handles year boundary — Jan 4 2027 is the start of 2027-W01", () => {
    // Monday Jan 4 2027 opens ISO week 1 of 2027
    expect(getISOWeek(new Date("2027-01-04"))).toBe("2027-W01")
  })
})

describe("getPeriod", () => {
  const date = new Date("2026-04-15T10:30:00Z")

  it("returns YYYY-MM-DD for daily", () => {
    expect(getPeriod("daily", date)).toBe("2026-04-15")
  })

  it("returns ISO week string for weekly", () => {
    expect(getPeriod("weekly", date)).toBe("2026-W16")
  })

  it("returns YYYY-MM for monthly", () => {
    expect(getPeriod("monthly", date)).toBe("2026-04")
  })
})

describe("getCutoff", () => {
  const now = new Date("2026-04-26T00:00:00Z")

  it("daily cutoff is 29 days before now (giving 30-day window inclusive)", () => {
    const cutoff = getCutoff("daily", now)
    const diffDays = Math.round(
      (now.getTime() - cutoff.getTime()) / 86400000,
    )
    expect(diffDays).toBe(29)
  })

  it("weekly cutoff is 11*7 days before now (12-week window)", () => {
    const cutoff = getCutoff("weekly", now)
    const diffDays = Math.round(
      (now.getTime() - cutoff.getTime()) / 86400000,
    )
    expect(diffDays).toBe(77)
  })

  it("monthly cutoff is 11 months before now (12-month window)", () => {
    const cutoff = getCutoff("monthly", now)
    expect(cutoff.getFullYear()).toBe(2025)
    expect(cutoff.getMonth()).toBe(4) // May (0-indexed)
  })
})

describe("generatePeriods", () => {
  const now = new Date("2026-04-26T00:00:00Z")

  it("daily returns 30 periods ending with today", () => {
    const periods = generatePeriods("daily", now)
    expect(periods).toHaveLength(30)
    expect(periods[29]).toBe("2026-04-26")
    expect(periods[0]).toBe("2026-03-28")
  })

  it("weekly returns 12 periods", () => {
    const periods = generatePeriods("weekly", now)
    expect(periods).toHaveLength(12)
  })

  it("monthly returns 12 periods ending with current month", () => {
    const periods = generatePeriods("monthly", now)
    expect(periods).toHaveLength(12)
    expect(periods[11]).toBe("2026-04")
    expect(periods[0]).toBe("2025-05")
  })
})
