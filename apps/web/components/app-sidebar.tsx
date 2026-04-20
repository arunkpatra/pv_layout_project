"use client"

import * as React from "react"
import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@renewable-energy/ui/components/sidebar"
import {
  Sun,
  Map,
  BatteryCharging,
  Wind,
  TrendingUp,
  Settings,
  Home,
} from "lucide-react"
import { useUser } from "@clerk/nextjs"
import { useProjects } from "@/hooks/use-projects"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@renewable-energy/ui/components/sidebar"

const navMain = [
  {
    title: "Overview",
    url: "/dashboard",
    icon: <Home />,
    isActive: true,
    items: [],
  },
  {
    title: "Solar Layout",
    url: "#",
    icon: <Map />,
    items: [
      { title: "Site Setup", url: "#" },
      { title: "KMZ Upload", url: "#" },
      { title: "Panel Placement", url: "#" },
    ],
  },
  {
    title: "System Design",
    url: "#",
    icon: <Sun />,
    items: [
      { title: "Capacity Planning", url: "#" },
      { title: "Orientation & Tilt", url: "#" },
      { title: "Shading Analysis", url: "#" },
    ],
  },
  {
    title: "Battery Storage",
    url: "#",
    icon: <BatteryCharging />,
    items: [
      { title: "Storage Config", url: "#" },
      { title: "Load Profiles", url: "#" },
    ],
  },
  {
    title: "Wind Analysis",
    url: "#",
    icon: <Wind />,
    items: [
      { title: "Wind Resource", url: "#" },
      { title: "Turbine Layout", url: "#" },
    ],
  },
  {
    title: "Reports",
    url: "#",
    icon: <TrendingUp />,
    items: [
      { title: "Generation Estimate", url: "#" },
      { title: "Export Data", url: "#" },
    ],
  },
  {
    title: "Settings",
    url: "#",
    icon: <Settings />,
    items: [
      { title: "Project Settings", url: "#" },
      { title: "Units & Locale", url: "#" },
    ],
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isLoaded, user } = useUser()
  const { data, isLoading } = useProjects()

  const clerkUser = {
    name: user?.fullName ?? user?.username ?? "User",
    email: user?.primaryEmailAddress?.emailAddress ?? "",
    avatar: user?.imageUrl || undefined,
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          teams={[
            { name: "SolarDesign Pro", logo: <Sun />, plan: "Workspace" },
          ]}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavProjects
          projects={data?.items ?? []}
          isLoading={!isLoaded || isLoading}
        />
      </SidebarContent>
      <SidebarFooter>
        {!isLoaded || !user ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" disabled>
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="grid flex-1 gap-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-32" />
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          <NavUser user={clerkUser} />
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
