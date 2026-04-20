"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { useProjects } from "@/hooks/use-projects"
import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
import { CreateProjectDialog } from "@/components/create-project-dialog"
import { PaginationControls } from "@/components/pagination-controls"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { LayoutGrid } from "lucide-react"
import type { Project } from "@renewable-energy/shared"

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const map: Record<
    string,
    {
      label: string
      variant: "default" | "secondary" | "destructive" | "outline"
    }
  > = {
    QUEUED: { label: "Queued", variant: "secondary" },
    PROCESSING: { label: "Processing", variant: "default" },
    COMPLETE: { label: "Complete", variant: "default" },
    FAILED: { label: "Failed", variant: "destructive" },
  }
  const cfg = map[status] ?? { label: status, variant: "outline" as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

function ProjectsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setBreadcrumbs } = useBreadcrumbs()

  const rawPage = parseInt(searchParams.get("page") ?? "", 10)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
  const rawPageSize = parseInt(searchParams.get("pageSize") ?? "", 10)
  const pageSize =
    Number.isFinite(rawPageSize) ? Math.min(100, Math.max(5, rawPageSize)) : 10

  const { data, isLoading } = useProjects({ page, pageSize })

  React.useEffect(() => {
    setBreadcrumbs([{ label: "Projects" }])
  }, [setBreadcrumbs])

  const searchParamsString = searchParams.toString()
  React.useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      const p = new URLSearchParams(searchParamsString)
      p.set("page", String(data.totalPages))
      router.replace(`/dashboard/projects?${p.toString()}`)
    }
  }, [data, page, router, searchParamsString])

  function handleCreated(project: Project) {
    router.push(`/dashboard/projects/${project.id}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Projects</h1>
        <CreateProjectDialog onCreated={handleCreated} />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <LayoutGrid className="h-8 w-8 opacity-40" />
          <p className="text-sm">
            No projects yet. Create your first project to get started.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {data.items.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {project.versionCount}{" "}
                    {project.versionCount === 1 ? "version" : "versions"}
                  </span>
                </div>
                <StatusBadge status={project.latestVersionStatus} />
              </Link>
            ))}
          </div>
          <PaginationControls
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
          />
        </>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsPageInner />
    </Suspense>
  )
}
