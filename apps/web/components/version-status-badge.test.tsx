import { test, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import { VersionStatusBadge } from "./version-status-badge"

afterEach(() => cleanup())

test("renders 'Queued' for QUEUED status", () => {
  render(<VersionStatusBadge status="QUEUED" />, { wrapper: createWrapper() })
  expect(screen.getByText("Queued")).toBeDefined()
})

test("renders 'Processing' for PROCESSING status", () => {
  render(<VersionStatusBadge status="PROCESSING" />, { wrapper: createWrapper() })
  expect(screen.getByText("Processing")).toBeDefined()
})

test("PROCESSING badge has animate-pulse class", () => {
  render(<VersionStatusBadge status="PROCESSING" />, { wrapper: createWrapper() })
  const badge = screen.getByText("Processing")
  expect(badge.className).toContain("animate-pulse")
})

test("renders 'Complete' for COMPLETE status", () => {
  render(<VersionStatusBadge status="COMPLETE" />, { wrapper: createWrapper() })
  expect(screen.getByText("Complete")).toBeDefined()
})

test("renders 'Failed' for FAILED status", () => {
  render(<VersionStatusBadge status="FAILED" />, { wrapper: createWrapper() })
  expect(screen.getByText("Failed")).toBeDefined()
})
