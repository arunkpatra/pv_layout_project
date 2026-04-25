import type { Metadata } from "next"
import { Suspense } from "react"
import { UsagePageInner } from "./usage-inner"

export const metadata: Metadata = { title: "Usage" }

export default function UsagePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UsagePageInner />
    </Suspense>
  )
}
