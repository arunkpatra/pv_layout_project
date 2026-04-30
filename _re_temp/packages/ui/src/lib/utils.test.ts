import { describe, it, expect } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("merges multiple class names into one string", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("last conflicting tailwind class wins", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500")
  })

  it("filters out falsy values", () => {
    const condition = false
    expect(cn("base", condition && "extra", undefined, null)).toBe("base")
  })

  it("handles array inputs", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar")
  })

  it("returns empty string when no arguments given", () => {
    expect(cn()).toBe("")
  })
})
