"use client"

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
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        {isLoading ? (
          <>
            <SidebarMenuSkeleton />
            <SidebarMenuSkeleton />
          </>
        ) : (
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
        )}
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
