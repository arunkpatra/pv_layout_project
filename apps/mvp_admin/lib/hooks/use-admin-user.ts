import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import { MVP_API_URL, type UserListItem } from "../api"

export function useAdminUser(id: string) {
  const { getToken } = useAuth()
  return useQuery<UserListItem>({
    queryKey: ["admin-user", id],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to fetch user: ${res.status}`)
      const body = (await res.json()) as { success: boolean; data: UserListItem }
      return body.data
    },
    enabled: !!id,
  })
}
