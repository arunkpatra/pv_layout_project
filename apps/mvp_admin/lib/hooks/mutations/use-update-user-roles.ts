import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import { MVP_API_URL } from "../../api"

type UpdateRolesInput = {
  userId: string
  role: "ADMIN" | "OPS"
  action: "add" | "remove"
}

export function useUpdateUserRoles() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation<void, Error, UpdateRolesInput>({
    mutationFn: async ({ userId, role, action }) => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/users/${userId}/roles`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role, action }),
      })
      if (!res.ok) throw new Error(`Failed to update roles: ${res.status}`)
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] })
      queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
  })
}
