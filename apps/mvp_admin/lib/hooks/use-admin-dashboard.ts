import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import {
  MVP_API_URL,
  type DashboardSummary,
  type DashboardTrends,
  type DashboardTrendPoint,
} from "../api"

export function useAdminDashboardSummary() {
  const { getToken } = useAuth()
  return useQuery<DashboardSummary>({
    queryKey: ["admin-dashboard-summary"],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/dashboard/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch dashboard summary: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: DashboardSummary
      }
      return body.data
    },
  })
}

export function useAdminDashboardTrends(
  granularity: "daily" | "weekly" | "monthly",
) {
  const { getToken } = useAuth()
  return useQuery<DashboardTrends>({
    queryKey: ["admin-dashboard-trends", granularity],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/dashboard/trends?granularity=${granularity}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok)
        throw new Error(`Failed to fetch dashboard trends: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: DashboardTrendPoint[]
      }
      return body.data
    },
  })
}
