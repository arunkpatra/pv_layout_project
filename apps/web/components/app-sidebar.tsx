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
  Upload,
  LayoutGrid,
  Home,
} from "lucide-react"
import { useUser } from "@clerk/nextjs"

const data = {
  teams: [
    {
      name: "SolarDesign Pro",
      logo: <Sun />,
      plan: "Workspace",
    },
  ],
  navMain: [
    {
      title: "Overview",
      url: "/",
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
  ],
  projects: [
    {
      name: "Site Alpha — Rajasthan",
      url: "#",
      icon: <LayoutGrid />,
    },
    {
      name: "Site Beta — Gujarat",
      url: "#",
      icon: <LayoutGrid />,
    },
    {
      name: "Imports",
      url: "#",
      icon: <Upload />,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useUser()
  const clerkUser = {
    name: user?.fullName ?? user?.username ?? "User",
    email: user?.primaryEmailAddress?.emailAddress ?? "",
    avatar: user?.imageUrl || undefined,
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={clerkUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
