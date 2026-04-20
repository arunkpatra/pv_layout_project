"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
import { useProject } from "@/hooks/use-project"
import { NewVersionForm } from "@/components/new-version-form"

export default function NewVersionPage() {
  const params = useParams()
  const projectId = params["projectId"] as string
  const { setBreadcrumbs } = useBreadcrumbs()
  const { data: project } = useProject(projectId)

  React.useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/dashboard/projects" },
      {
        label: project?.name ?? "Project",
        href: `/dashboard/projects/${projectId}`,
      },
      { label: "New run" },
    ])
  }, [setBreadcrumbs, project?.name, projectId])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">New run</h1>
      <NewVersionForm projectId={projectId} />
    </div>
  )
}
