import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import { MVP_API_URL } from "../api"

export interface UserSearchResult {
  id: string
  email: string
  name: string | null
}

export function useAdminUserSearch(emailQuery: string) {
  const { getToken } = useAuth()
  return useQuery<UserSearchResult[]>({
    queryKey: ["admin-user-search", emailQuery],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/users/search?email=${encodeURIComponent(emailQuery)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: { users: UserSearchResult[] }
      }
      return body.data.users
    },
    enabled: emailQuery.length >= 2,
    staleTime: 30_000,
  })
}
