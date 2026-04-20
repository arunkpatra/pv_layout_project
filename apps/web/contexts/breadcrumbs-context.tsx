"use client"

import * as React from "react"

export interface Breadcrumb {
  label: string
  href?: string
}

interface BreadcrumbsContextValue {
  breadcrumbs: Breadcrumb[]
  setBreadcrumbs: (crumbs: Breadcrumb[]) => void
}

const BreadcrumbsContext = React.createContext<BreadcrumbsContextValue>({
  breadcrumbs: [],
  setBreadcrumbs: () => {},
})

export function BreadcrumbsProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = React.useState<Breadcrumb[]>([])
  return (
    <BreadcrumbsContext.Provider value={{ breadcrumbs, setBreadcrumbs }}>
      {children}
    </BreadcrumbsContext.Provider>
  )
}

export function useBreadcrumbs() {
  return React.useContext(BreadcrumbsContext)
}
