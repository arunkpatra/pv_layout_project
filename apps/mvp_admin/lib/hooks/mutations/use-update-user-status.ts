import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import { MVP_API_URL } from "../../api"

type UpdateStatusInput = { userId: string; status: "ACTIVE" | "INACTIVE" }

export function useUpdateUserStatus() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation<void, Error, UpdateStatusInput>({
    mutationFn: async ({ userId, status }) => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(`Failed to update status: ${res.status}`)
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] })
      queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
  })
}
