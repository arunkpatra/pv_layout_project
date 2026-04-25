import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import { MVP_API_URL, type UserListItem } from "../../api"

type CreateUserInput = {
  name: string
  email: string
  roles: ("ADMIN" | "OPS")[]
}

export function useCreateAdminUser() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation<UserListItem, Error, CreateUserInput>({
    mutationFn: async (input) => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string
        }
        throw new Error(
          body.message ?? `Failed to create user: ${res.status}`
        )
      }
      const body = (await res.json()) as { data: UserListItem }
      return body.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
  })
}
