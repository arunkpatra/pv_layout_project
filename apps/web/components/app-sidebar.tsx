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
  SunIcon,
  MapTrifoldIcon,
  BatteryChargingIcon,
  WindIcon,
  ChartLineIcon,
  GearIcon,
  UploadSimpleIcon,
  SquaresFourIcon,
  HouseIcon,
  FolderIcon,
} from "@phosphor-icons/react"

const data = {
  user: {
    name: "Arun Patra",
    email: "arun@example.com",
    avatar: "",
  },
  teams: [
    {
      name: "SolarDesign Pro",
      logo: <SunIcon />,
      plan: "Workspace",
    },
  ],
  navMain: [
    {
      title: "Overview",
      url: "/",
      icon: <HouseIcon />,
      isActive: true,
      items: [],
    },
    {
      title: "Solar Layout",
      url: "#",
      icon: <MapTrifoldIcon />,
      items: [
        { title: "Site Setup", url: "#" },
        { title: "KMZ Upload", url: "#" },
        { title: "Panel Placement", url: "#" },
      ],
    },
    {
      title: "System Design",
      url: "#",
      icon: <SunIcon />,
      items: [
        { title: "Capacity Planning", url: "#" },
        { title: "Orientation & Tilt", url: "#" },
        { title: "Shading Analysis", url: "#" },
      ],
    },
    {
      title: "Battery Storage",
      url: "#",
      icon: <BatteryChargingIcon />,
      items: [
        { title: "Storage Config", url: "#" },
        { title: "Load Profiles", url: "#" },
      ],
    },
    {
      title: "Wind Analysis",
      url: "#",
      icon: <WindIcon />,
      items: [
        { title: "Wind Resource", url: "#" },
        { title: "Turbine Layout", url: "#" },
      ],
    },
    {
      title: "Reports",
      url: "#",
      icon: <ChartLineIcon />,
      items: [
        { title: "Generation Estimate", url: "#" },
        { title: "Export Data", url: "#" },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: <GearIcon />,
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
      icon: <SquaresFourIcon />,
    },
    {
      name: "Site Beta — Gujarat",
      url: "#",
      icon: <SquaresFourIcon />,
    },
    {
      name: "Imports",
      url: "#",
      icon: <UploadSimpleIcon />,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
