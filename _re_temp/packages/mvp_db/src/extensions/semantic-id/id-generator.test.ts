import { describe, expect, test } from "bun:test"
import { generateSemanticId } from "./id-generator.js"

describe("generateSemanticId", () => {
  test("produces exactly 40 characters", () => {
    expect(generateSemanticId("drg").length).toBe(40)
  })

  test("starts with the given prefix and underscore", () => {
    const id = generateSemanticId("drg")
    expect(id.startsWith("drg_")).toBe(true)
  })

  test("suffix is alphanumeric only (base62)", () => {
    const id = generateSemanticId("drg")
    const suffix = id.slice("drg_".length)
    expect(/^[A-Za-z0-9]+$/.test(suffix)).toBe(true)
  })

  test("generates unique IDs", () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => generateSemanticId("drg"))
    )
    expect(ids.size).toBe(100)
  })

  test("works for all registered prefixes", () => {
    const prefixes = ["drg"]
    for (const prefix of prefixes) {
      const id = generateSemanticId(prefix)
      expect(id.length).toBe(40)
      expect(id.startsWith(`${prefix}_`)).toBe(true)
    }
  })

  test("throws when prefix is too long", () => {
    const tooLong = "a".repeat(40)
    expect(() => generateSemanticId(tooLong)).toThrow()
  })
})
