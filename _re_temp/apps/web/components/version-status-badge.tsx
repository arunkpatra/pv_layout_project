"use client"

import { Badge } from "@renewable-energy/ui/components/badge"
import { cn } from "@renewable-energy/ui/lib/utils"
import type { VersionStatus } from "@renewable-energy/shared"

interface StatusConfig {
  label: string
  variant: "default" | "secondary" | "destructive" | "outline"
  className?: string
}

const STATUS_CONFIG: Record<VersionStatus, StatusConfig> = {
  QUEUED: { label: "Queued", variant: "secondary" },
  PROCESSING: {
    label: "Processing",
    variant: "default",
    className: "animate-pulse",
  },
  COMPLETE: {
    label: "Complete",
    variant: "outline",
    className:
      "border-green-600 text-green-700 dark:border-green-500 dark:text-green-400",
  },
  FAILED: { label: "Failed", variant: "destructive" },
}

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant={config.variant} className={cn(config.className)}>
      {config.label}
    </Badge>
  )
}
