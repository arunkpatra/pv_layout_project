import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import { MVP_API_URL, type AdminUsersResponse } from "../api"

export function useAdminUsers(params: { page: number; pageSize: number }) {
  const { getToken } = useAuth()
  return useQuery<AdminUsersResponse>({
    queryKey: ["admin-users", params],
    queryFn: async () => {
      const token = await getToken()
      const qs = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })
      const res = await fetch(`${MVP_API_URL}/admin/users?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: AdminUsersResponse
      }
      return body.data
    },
  })
}
