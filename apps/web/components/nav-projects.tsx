"use client"

import * as React from "react"
import Link from "next/link"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@renewable-energy/ui/components/sidebar"
import { LayoutGrid, Plus } from "lucide-react"
import type { ProjectSummary } from "@renewable-energy/shared"

export function NavProjects({
  projects,
  isLoading,
}: {
  projects: ProjectSummary[]
  isLoading: boolean
}) {
  // SidebarMenuSkeleton uses Math.random() in its useState initializer.
  // Rendering it on the server produces a different value than the client,
  // causing a hydration mismatch. Gate skeleton rendering to client-only.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        {mounted && isLoading ? (
          <>
            <SidebarMenuSkeleton />
            <SidebarMenuSkeleton />
          </>
        ) : !isLoading ? (
          projects.slice(0, 5).map((project) => (
            <SidebarMenuItem key={project.id}>
              <SidebarMenuButton asChild>
                <Link href={`/dashboard/projects/${project.id}`}>
                  <LayoutGrid />
                  <span>{project.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))
        ) : null}
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <Link href="/dashboard/projects">
              <Plus />
              <span>All projects</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
