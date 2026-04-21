import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
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

test("shows toast on submit with valid data", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  const buttons = screen.getAllByRole("button", { name: "Download" })
  await user.click(buttons[0]!)

  await user.type(
    screen.getByPlaceholderText("Enter your full name"),
    "Test User"
  )
  await user.type(
    screen.getByPlaceholderText("you@company.com"),
    "test@example.com"
  )

  // Click the checkbox
  const checkbox = screen.getByRole("checkbox")
  await user.click(checkbox)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  expect(toast.info).toHaveBeenCalledWith(
    expect.stringContaining("PV Layout Basic")
  )
})
