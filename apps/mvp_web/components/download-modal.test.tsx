import { test, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

import { DownloadModal } from "./download-modal"
import { toast } from "sonner"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

/** Helper: open the dialog and fill in the required fields. */
async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides?: { name?: string; email?: string }
) {
  const buttons = screen.getAllByRole("button", { name: "Download" })
  await user.click(buttons[0]!)

  await user.type(
    screen.getByPlaceholderText("Enter your full name"),
    overrides?.name ?? "Test User"
  )
  await user.type(
    screen.getByPlaceholderText("you@company.com"),
    overrides?.email ?? "test@example.com"
  )

  const checkbox = screen.getByRole("checkbox")
  await user.click(checkbox)
}

test("renders trigger button", () => {
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )
  const buttons = screen.getAllByRole("button", { name: "Download" })
  expect(buttons.length).toBeGreaterThanOrEqual(1)
})

test("opens dialog on trigger click", async () => {
  const user = userEvent.setup()
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  const buttons = screen.getAllByRole("button", { name: "Download" })
  await user.click(buttons[0]!)
  expect(
    screen.getByText("Enter your details to download")
  ).toBeInTheDocument()
})

test("successful submit calls fetch with correct payload", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { downloadUrl: "https://s3.example.com/file.exe" },
      }),
  })

  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  await fillForm(user)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/download-register"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: "test@example.com",
          product: "PV Layout Basic",
        }),
      })
    )
  })

  expect(toast.info).toHaveBeenCalledWith("Download started")
})

test("failed API response shows error toast", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })

  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: () =>
      Promise.resolve({
        success: false,
        error: { code: "VALIDATION", message: "Invalid email" },
      }),
  })

  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  await fillForm(user)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith("Invalid email")
  })
})

test("network error shows generic error toast", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })

  mockFetch.mockRejectedValueOnce(new Error("Network error"))

  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  await fillForm(user)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith(
      "Download failed. Please try again."
    )
  })
})

test("form shows loading state while submitting", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })

  // Never resolve — keeps the component in submitting state
  mockFetch.mockReturnValueOnce(new Promise(() => {}))

  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  await fillForm(user)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  await waitFor(() => {
    const submitBtn = screen.getByRole("button", {
      name: /Submitting/i,
    })
    expect(submitBtn).toBeDisabled()
  })
})
