import { describe, expect, test } from "bun:test"
import { products } from "./products.js"

describe("products seed data", () => {
  test("contains exactly the four MVP products", () => {
    const slugs = products.map((p) => p.slug).sort()
    expect(slugs).toEqual([
      "pv-layout-basic",
      "pv-layout-free",
      "pv-layout-pro",
      "pv-layout-pro-plus",
    ])
  })

  test("projectQuota is 3 / 5 / 10 / 15 across Free / Basic / Pro / Pro Plus", () => {
    const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]))
    expect(bySlug["pv-layout-free"]?.projectQuota).toBe(3)
    expect(bySlug["pv-layout-basic"]?.projectQuota).toBe(5)
    expect(bySlug["pv-layout-pro"]?.projectQuota).toBe(10)
    expect(bySlug["pv-layout-pro-plus"]?.projectQuota).toBe(15)
  })

  test("existing pricing + calculation values are preserved", () => {
    const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]))
    expect(bySlug["pv-layout-free"]?.priceAmount).toBe(0)
    expect(bySlug["pv-layout-free"]?.calculations).toBe(5)
    expect(bySlug["pv-layout-basic"]?.priceAmount).toBe(199)
    expect(bySlug["pv-layout-basic"]?.calculations).toBe(5)
    expect(bySlug["pv-layout-pro"]?.priceAmount).toBe(499)
    expect(bySlug["pv-layout-pro"]?.calculations).toBe(10)
    expect(bySlug["pv-layout-pro-plus"]?.priceAmount).toBe(1499)
    expect(bySlug["pv-layout-pro-plus"]?.calculations).toBe(50)
  })
})
