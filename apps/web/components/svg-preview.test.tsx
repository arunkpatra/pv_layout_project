import { test, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

vi.mock("dompurify", () => ({
  default: {
    sanitize: vi.fn((raw: string) => raw),
  },
}))

import DOMPurify from "dompurify"
const mockSanitize = vi.mocked(DOMPurify.sanitize)

const SVG_TEXT = `<svg viewBox="0 0 800 600" width="800" height="600"><rect x="0" y="0" width="800" height="600"/></svg>`

function makeFetch(body: string, ok = true) {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 404,
      text: () => Promise.resolve(body),
    } as Response),
  )
}

import { SvgPreview } from "./svg-preview"

test("shows spinner and loading text while fetching", async () => {
  let resolve!: (value: Response) => void
  const pending = new Promise<Response>((r) => { resolve = r })
  vi.stubGlobal("fetch", vi.fn(() => pending))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  expect(screen.getByText(/loading preview/i)).toBeInTheDocument()
  expect(document.querySelector(".animate-spin")).toBeInTheDocument()
  resolve({ ok: true, status: 200, text: () => Promise.resolve(SVG_TEXT) } as Response)
})

test("renders sanitized SVG when fetch succeeds", async () => {
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => {
    expect(screen.getByTestId("svg-wrapper")).toBeInTheDocument()
  })
  expect(screen.queryByText(/loading preview/i)).not.toBeInTheDocument()
})

test("shows error state when fetch fails (network error)", async () => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network error"))))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => {
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument()
  })
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
})

test("shows error state when fetch returns non-ok response", async () => {
  vi.stubGlobal("fetch", makeFetch("Not Found", false))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => {
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument()
  })
})

test("shows error state when DOMPurify returns empty string", async () => {
  mockSanitize.mockReturnValue("")
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => {
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument()
  })
})

test("retry button re-triggers fetch", async () => {
  const fetchMock = vi.fn()
    .mockRejectedValueOnce(new Error("fail"))
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(SVG_TEXT),
    } as Response)
  vi.stubGlobal("fetch", fetchMock)
  mockSanitize.mockReturnValue(SVG_TEXT)

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => screen.getByRole("button", { name: /retry/i }))
  fireEvent.click(screen.getByRole("button", { name: /retry/i }))

  await waitFor(() => {
    expect(screen.getByTestId("svg-wrapper")).toBeInTheDocument()
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test("rotate button cycles rotation: 0 → 90 → 180 → 270 → 0", async () => {
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => screen.getByTestId("svg-wrapper"))

  const wrapper = screen.getByTestId("svg-wrapper")
  const rotateBtn = screen.getByRole("button", { name: /rotate/i })

  expect(wrapper).toHaveStyle("transform: rotate(0deg)")

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(90deg)")

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(180deg)")

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(270deg)")

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(0deg)")
})
