import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import {
  MVP_API_URL,
  type AdminCustomersResponse,
  type CustomerDetail,
} from "../api"

export function useAdminCustomers(params: { page: number; pageSize: number }) {
  const { getToken } = useAuth()
  return useQuery<AdminCustomersResponse>({
    queryKey: ["admin-customers", params],
    queryFn: async () => {
      const token = await getToken()
      const qs = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })
      const res = await fetch(`${MVP_API_URL}/admin/customers?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch customers: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: AdminCustomersResponse
      }
      return body.data
    },
  })
}

export function useAdminCustomer(id: string, filter: "active" | "all") {
  const { getToken } = useAuth()
  return useQuery<CustomerDetail>({
    queryKey: ["admin-customer", id, filter],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/customers/${id}?filter=${filter}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok)
        throw new Error(`Failed to fetch customer: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: CustomerDetail
      }
      return body.data
    },
    enabled: !!id,
  })
}

export function useUpdateEntitlementStatus() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation<
    void,
    Error,
    { entitlementId: string; status: "ACTIVE" | "INACTIVE"; customerId: string }
  >({
    mutationFn: async ({ entitlementId, status }) => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/entitlements/${entitlementId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      )
      if (!res.ok)
        throw new Error(`Failed to update entitlement status: ${res.status}`)
    },
    onSuccess: (_data, { customerId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-customer", customerId],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-customers"],
      })
    },
  })
}
