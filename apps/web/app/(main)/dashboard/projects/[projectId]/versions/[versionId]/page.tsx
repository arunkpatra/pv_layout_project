"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
import { useProject } from "@/hooks/use-project"
import { useVersion } from "@/hooks/use-version"
import { VersionDetail } from "@/components/version-detail"

export default function VersionDetailPage() {
  const params = useParams()
  const projectId = params["projectId"] as string
  const versionId = params["versionId"] as string
  const { setBreadcrumbs } = useBreadcrumbs()
  const { data: project } = useProject(projectId)
  const { data: version } = useVersion(projectId, versionId)

  React.useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/dashboard/projects" },
      {
        label: project?.name ?? "Project",
        href: `/dashboard/projects/${projectId}`,
      },
      { label: version ? `Run #${version.number}` : "Run" },
    ])
  }, [setBreadcrumbs, project?.name, projectId, version])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">
        {version ? `Run #${version.number}` : "Run"}
      </h1>
      <VersionDetail projectId={projectId} versionId={versionId} />
    </div>
  )
}
