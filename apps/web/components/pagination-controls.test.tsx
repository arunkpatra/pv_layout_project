import { test, expect } from "vitest"
import { getPageNumbers } from "./pagination-controls"

test("returns empty array when totalPages is 0", () => {
  expect(getPageNumbers(1, 0)).toEqual([])
})

test("returns [1] for single page", () => {
  expect(getPageNumbers(1, 1)).toEqual([1])
})

test("returns all pages when two pages total", () => {
  expect(getPageNumbers(1, 2)).toEqual([1, 2])
})

test("returns all pages when three pages and no gap", () => {
  expect(getPageNumbers(2, 3)).toEqual([1, 2, 3])
})

test("first page of 20 — ellipsis after page 2", () => {
  expect(getPageNumbers(1, 20)).toEqual([1, 2, "ellipsis", 20])
})

test("middle page of 20 — ellipsis on both sides", () => {
  expect(getPageNumbers(8, 20)).toEqual([1, "ellipsis", 7, 8, 9, "ellipsis", 20])
})

test("last page of 20 — ellipsis before page 19", () => {
  expect(getPageNumbers(20, 20)).toEqual([1, "ellipsis", 19, 20])
})

test("second-to-last page — ellipsis on left only", () => {
  expect(getPageNumbers(19, 20)).toEqual([1, "ellipsis", 18, 19, 20])
})
