"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"
import { useProject } from "@/hooks/use-project"
import { useVersions } from "@/hooks/use-versions"
import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
import { VersionStatusBadge } from "@/components/version-status-badge"
import { PaginationControls } from "@/components/pagination-controls"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { Layers } from "lucide-react"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function ProjectDetailInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setBreadcrumbs } = useBreadcrumbs()

  const projectId = params["projectId"] as string

  const rawPage = parseInt(searchParams.get("page") ?? "", 10)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
  const rawPageSize = parseInt(searchParams.get("pageSize") ?? "", 10)
  const pageSize =
    Number.isFinite(rawPageSize) ? Math.min(100, Math.max(5, rawPageSize)) : 10

  const { data: project } = useProject(projectId)
  const { data, isLoading, isError } = useVersions(projectId, { page, pageSize })

  React.useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/dashboard/projects" },
      { label: project?.name ?? "Project" },
    ])
  }, [setBreadcrumbs, project?.name])

  React.useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      const p = new URLSearchParams(searchParams.toString())
      p.set("page", String(data.totalPages))
      router.replace(`/dashboard/projects/${projectId}?${p.toString()}`)
    }
  }, [data, page, router, searchParams, projectId])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{project?.name ?? "Project"}</h1>
        <Button asChild size="sm">
          <Link href={`/dashboard/projects/${projectId}/new-version`}>
            New run
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load runs</p>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <Layers className="h-8 w-8 opacity-40" />
          <p className="text-sm">No runs yet. Start your first run.</p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/projects/${projectId}/new-version`}>
              Start first run
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {data.items.map((version) => (
              <Link
                key={version.id}
                href={`/dashboard/projects/${projectId}/versions/${version.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    Run #{version.number}
                    {version.label ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {version.label}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(version.createdAt)}
                  </span>
                </div>
                <VersionStatusBadge status={version.status} />
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

export default function ProjectDetailPage() {
  return (
    <Suspense>
      <ProjectDetailInner />
    </Suspense>
  )
}
