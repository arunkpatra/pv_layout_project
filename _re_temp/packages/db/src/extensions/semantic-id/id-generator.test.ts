import { describe, expect, test } from "bun:test"
import { generateSemanticId } from "./id-generator.js"

describe("generateSemanticId", () => {
  test("produces exactly 40 characters", () => {
    expect(generateSemanticId("usr").length).toBe(40)
  })

  test("starts with the given prefix and underscore", () => {
    const id = generateSemanticId("usr")
    expect(id.startsWith("usr_")).toBe(true)
  })

  test("suffix is alphanumeric only (base62)", () => {
    const id = generateSemanticId("usr")
    const suffix = id.slice("usr_".length)
    expect(/^[A-Za-z0-9]+$/.test(suffix)).toBe(true)
  })

  test("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSemanticId("usr")))
    expect(ids.size).toBe(100)
  })

  test("works for all registered prefixes", () => {
    const prefixes = ["usr"]
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
