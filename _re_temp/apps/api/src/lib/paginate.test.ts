import { describe, test, expect } from "bun:test"
import { paginationArgs, paginationMeta } from "./paginate.js"

describe("paginationArgs", () => {
  test("defaults to page 1, pageSize 20", () => {
    const args = paginationArgs({})
    expect(args.skip).toBe(0)
    expect(args.take).toBe(20)
  })

  test("calculates skip correctly for page 2", () => {
    const args = paginationArgs({ page: 2, pageSize: 10 })
    expect(args.skip).toBe(10)
    expect(args.take).toBe(10)
  })

  test("clamps pageSize to max 100", () => {
    const args = paginationArgs({ pageSize: 200 })
    expect(args.take).toBe(100)
  })

  test("clamps page minimum to 1", () => {
    const args = paginationArgs({ page: 0 })
    expect(args.skip).toBe(0)
  })
})

describe("paginationMeta", () => {
  test("computes totalPages correctly", () => {
    const meta = paginationMeta({ total: 25, page: 1, pageSize: 10 })
    expect(meta.totalPages).toBe(3)
    expect(meta.total).toBe(25)
    expect(meta.page).toBe(1)
    expect(meta.pageSize).toBe(10)
  })

  test("rounds totalPages up", () => {
    const meta = paginationMeta({ total: 21, page: 1, pageSize: 10 })
    expect(meta.totalPages).toBe(3)
  })

  test("totalPages is 0 when total is 0", () => {
    const meta = paginationMeta({ total: 0, page: 1, pageSize: 20 })
    expect(meta.totalPages).toBe(0)
  })
})
