// apps/mvp_api/src/modules/admin/sales-utils.ts

export type Granularity = "daily" | "weekly" | "monthly"

export function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

export function getPeriod(granularity: Granularity, date: Date): string {
  if (granularity === "daily") return date.toISOString().slice(0, 10)
  if (granularity === "weekly") return getISOWeek(date)
  return date.toISOString().slice(0, 7)
}

export function getCutoff(granularity: Granularity, now: Date): Date {
  const d = new Date(now)
  if (granularity === "daily") d.setDate(d.getDate() - 29)
  else if (granularity === "weekly") d.setDate(d.getDate() - 11 * 7)
  else d.setMonth(d.getMonth() - 11)
  return d
}

export function generatePeriods(granularity: Granularity, now: Date): string[] {
  if (granularity === "daily") {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (29 - i))
      return d.toISOString().slice(0, 10)
    })
  }
  if (granularity === "weekly") {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (11 - i) * 7)
      return getISOWeek(d)
    })
  }
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - (11 - i))
    return d.toISOString().slice(0, 7)
  })
}
