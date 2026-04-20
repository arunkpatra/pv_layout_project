import { test, expect } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { BreadcrumbsProvider, useBreadcrumbs } from "./breadcrumbs-context"

function TestConsumer({ crumbs }: { crumbs: Array<{ label: string; href?: string }> }) {
  const { setBreadcrumbs } = useBreadcrumbs()
  React.useEffect(() => {
    setBreadcrumbs(crumbs)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function TestDisplay() {
  const { breadcrumbs } = useBreadcrumbs()
  return (
    <ul>
      {breadcrumbs.map((c) => (
        <li key={c.label}>{c.label}</li>
      ))}
    </ul>
  )
}

test("children can set and read breadcrumbs", async () => {
  render(
    <BreadcrumbsProvider>
      <TestConsumer crumbs={[{ label: "Projects", href: "/dashboard/projects" }]} />
      <TestDisplay />
    </BreadcrumbsProvider>,
  )
  await waitFor(() => expect(screen.getByText("Projects")).toBeDefined())
})
