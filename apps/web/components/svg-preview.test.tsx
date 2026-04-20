import { test, expect, vi, afterEach } from "vitest"
import React from "react"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createWrapper } from "@/tests/test-utils"

const mockResetTransform = vi.hoisted(() => vi.fn())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  mockResetTransform.mockClear()
})

vi.mock("react-zoom-pan-pinch", () => ({
  TransformWrapper: ({
    children,
    ref,
  }: {
    children: React.ReactNode
    ref?: React.MutableRefObject<{ resetTransform: () => void } | null>
  }) => {
    React.useEffect(() => {
      if (ref) ref.current = { resetTransform: mockResetTransform }
    }, [])
    return <>{children}</>
  },
  TransformComponent: ({
    children,
  }: {
    children: React.ReactNode
  }) => <>{children}</>,
}))

vi.mock("dompurify", () => ({
  default: {
    sanitize: vi.fn((raw: string) => raw),
  },
}))

import DOMPurify from "dompurify"
const mockSanitize = vi.mocked(DOMPurify.sanitize)

const SVG_TEXT = `<svg viewBox="0 0 800 600" width="800" height="600"><rect x="0" y="0" width="800" height="600"/></svg>`
const WIDE_SVG_TEXT = `<svg viewBox="0 0 1200 400" width="1200" height="400"><rect x="0" y="0" width="1200" height="400"/></svg>`
const LAYERED_SVG_TEXT = `<svg viewBox="0 0 800 600" width="800" height="600">
  <g id="ac-cables"><line x1="0" y1="0" x2="100" y2="100"/></g>
  <g id="dc-cables"><line x1="0" y1="0" x2="200" y2="200"/></g>
  <g id="la-footprints"><rect x="10" y="10" width="20" height="20"/></g>
  <g id="la-circles"><circle cx="50" cy="50" r="10"/></g>
</svg>`

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
  expect(wrapper).toHaveStyle(
    "transform: translate(-50%, -50%) rotate(90deg)",
  )

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(180deg)")

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle(
    "transform: translate(-50%, -50%) rotate(270deg)",
  )

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(0deg)")
})

test("wrapper geometry swaps at 90° and restores at 180°", async () => {
  mockSanitize.mockReturnValue(WIDE_SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(WIDE_SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => screen.getByTestId("svg-wrapper"))
  const wrapper = screen.getByTestId("svg-wrapper")
  const rotateBtn = screen.getByRole("button", { name: /rotate/i })

  // At 0°: non-transposed, uses inset:0 (no explicit width/height)
  expect(wrapper).not.toHaveStyle("top: 50%")

  // Rotate to 90°: transposed, wrapper uses w/h swapped percentages
  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("top: 50%")
  expect(wrapper).toHaveStyle("left: 50%")

  // Rotate to 180°: non-transposed again
  fireEvent.click(rotateBtn)
  expect(wrapper).not.toHaveStyle("top: 50%")
})

test("toolbar buttons disabled while loading, enabled when loaded", async () => {
  // Loading state: buttons present but disabled
  let resolve!: (value: Response) => void
  const pending = new Promise<Response>((r) => { resolve = r })
  vi.stubGlobal("fetch", vi.fn(() => pending))

  const { unmount } = render(
    <SvgPreview svgUrl="https://s3.example.com/layout.svg" />,
    { wrapper: createWrapper() },
  )
  expect(screen.getByRole("button", { name: /rotate/i })).toBeDisabled()
  expect(screen.getByRole("button", { name: /reset zoom/i })).toBeDisabled()
  unmount()

  // Loaded state: buttons enabled
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))
  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))
  expect(screen.getByRole("button", { name: /rotate/i })).not.toBeDisabled()
  expect(screen.getByRole("button", { name: /reset zoom/i })).not.toBeDisabled()
})

test("rotate button icon style reflects rotation state", async () => {
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))

  const rotateBtn = screen.getByRole("button", { name: /rotate/i })
  const icon = rotateBtn.querySelector("svg")!

  expect(icon).toHaveStyle("transform: rotate(0deg)")
  fireEvent.click(rotateBtn)
  expect(icon).toHaveStyle("transform: rotate(90deg)")
  fireEvent.click(rotateBtn)
  expect(icon).toHaveStyle("transform: rotate(180deg)")
})

test("reset zoom button calls resetTransform when clicked", async () => {
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))

  fireEvent.click(screen.getByRole("button", { name: /reset zoom/i }))
  expect(mockResetTransform).toHaveBeenCalledTimes(1)
})

test("layer switches render always, disabled while loading, enabled when loaded", async () => {
  // Loading state — switches present but disabled
  let resolve!: (value: Response) => void
  const pending = new Promise<Response>((r) => { resolve = r })
  vi.stubGlobal("fetch", vi.fn(() => pending))

  const { unmount } = render(
    <SvgPreview svgUrl="https://s3.example.com/layout.svg" />,
    { wrapper: createWrapper() },
  )
  expect(screen.getByText("AC Cables")).toBeInTheDocument()
  const switchesWhileLoading = screen.getAllByRole("switch")
  switchesWhileLoading.forEach((sw) => expect(sw).toBeDisabled())
  unmount()

  // Loaded state — switches enabled
  mockSanitize.mockReturnValue(LAYERED_SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(LAYERED_SVG_TEXT))
  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))
  const switchesWhenLoaded = screen.getAllByRole("switch")
  switchesWhenLoaded.forEach((sw) => expect(sw).not.toBeDisabled())
})

test("AC Cables toggle controls #ac-cables display", async () => {
  mockSanitize.mockReturnValue(LAYERED_SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(LAYERED_SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))

  const wrapper = screen.getByTestId("svg-wrapper")
  const acGroup = wrapper.querySelector("#ac-cables") as SVGGElement

  // Default: OFF → display is "none"
  await waitFor(() => {
    expect(acGroup.style.display).toBe("none")
  })

  // Toggle ON
  const acSwitch = screen
    .getAllByRole("switch")
    .find((el) => el.closest("label")?.textContent?.includes("AC Cables"))!
  await userEvent.click(acSwitch)
  // Verify the switch reflects the checked state
  expect(acSwitch).toHaveAttribute("aria-checked", "true")
  // Re-query to get fresh reference after re-render
  const acGroupAfter = screen.getByTestId("svg-wrapper").querySelector("#ac-cables") as SVGGElement
  await waitFor(() => expect(acGroupAfter.style.display).toBe(""))

  // Toggle OFF
  await userEvent.click(acSwitch)
  expect(acSwitch).toHaveAttribute("aria-checked", "false")
  const acGroupAfter2 = screen.getByTestId("svg-wrapper").querySelector("#ac-cables") as SVGGElement
  await waitFor(() => expect(acGroupAfter2.style.display).toBe("none"))
})

test("Lightning Arresters toggle controls both #la-footprints and #la-circles", async () => {
  mockSanitize.mockReturnValue(LAYERED_SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(LAYERED_SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))

  const wrapper = screen.getByTestId("svg-wrapper")

  await waitFor(() => {
    expect(
      (wrapper.querySelector("#la-footprints") as HTMLElement)?.style.display,
    ).toBe("none")
    expect(
      (wrapper.querySelector("#la-circles") as HTMLElement)?.style.display,
    ).toBe("none")
  })

  const laSwitch = screen
    .getAllByRole("switch")
    .find((el) => el.closest("label")?.textContent?.includes("Lightning"))!

  // Toggle ON — both groups visible
  await userEvent.click(laSwitch)
  await waitFor(() => {
    expect(
      (wrapper.querySelector("#la-footprints") as HTMLElement)?.style.display,
    ).toBe("")
    expect(
      (wrapper.querySelector("#la-circles") as HTMLElement)?.style.display,
    ).toBe("")
  })

  // Toggle OFF — both groups hidden again
  await userEvent.click(laSwitch)
  await waitFor(() => {
    expect(
      (wrapper.querySelector("#la-footprints") as HTMLElement)?.style.display,
    ).toBe("none")
    expect(
      (wrapper.querySelector("#la-circles") as HTMLElement)?.style.display,
    ).toBe("none")
  })
})
