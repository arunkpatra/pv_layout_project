import { describe, test, expect } from "bun:test"
import { renderRoot } from "./root.html"

describe("renderRoot", () => {
  test("renders service name and subtitle", () => {
    const html = renderRoot({
      database: "ok",
      timestamp: "2024-01-01T00:00:00.000Z",
      environment: "production",
    })
    expect(html).toContain("Renewable Energy API")
    expect(html).toContain("backend service")
  })

  test("renders ok badge for database", () => {
    const html = renderRoot({
      database: "ok",
      timestamp: "2024-01-01T00:00:00.000Z",
      environment: "production",
    })
    expect(html).toContain("#d1fae5")
  })

  test("renders error badge for database", () => {
    const html = renderRoot({
      database: "error",
      timestamp: "2024-01-01T00:00:00.000Z",
      environment: "development",
    })
    expect(html).toContain("#fee2e2")
  })

  test("renders environment and timestamp", () => {
    const html = renderRoot({
      database: "ok",
      timestamp: "2024-01-01T00:00:00.000Z",
      environment: "staging",
    })
    expect(html).toContain("staging")
    expect(html).toContain("2024-01-01T00:00:00.000Z")
  })
})
