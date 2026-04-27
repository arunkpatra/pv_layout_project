import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import {
  MVP_API_URL,
  type TransactionListItem,
  type PaymentMethod,
  type TransactionSource,
} from "../api"

export interface TransactionFilters {
  source?: TransactionSource | "ALL"
  email?: string
  productSlug?: string
  from?: string
  to?: string
}

export type TransactionPage = {
  transactions: TransactionListItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export function useAdminTransactions(
  filters: TransactionFilters,
  page: number,
  pageSize = 20,
) {
  const { getToken } = useAuth()
  return useQuery<TransactionPage>({
    queryKey: ["admin-transactions", filters, page, pageSize],
    queryFn: async () => {
      const token = await getToken()
      const params = new URLSearchParams()
      if (filters.source && filters.source !== "ALL")
        params.set("source", filters.source)
      if (filters.email) params.set("email", filters.email)
      if (filters.productSlug) params.set("productSlug", filters.productSlug)
      if (filters.from) params.set("from", filters.from)
      if (filters.to) params.set("to", filters.to)
      params.set("page", String(page))
      params.set("pageSize", String(pageSize))
      const res = await fetch(
        `${MVP_API_URL}/admin/transactions?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok)
        throw new Error(`Failed to fetch transactions: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: TransactionPage
      }
      return body.data
    },
    staleTime: 10_000,
  })
}

export function useAdminTransaction(id: string) {
  const { getToken } = useAuth()
  return useQuery<TransactionListItem>({
    queryKey: ["admin-transaction", id],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/transactions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch transaction: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: TransactionListItem
      }
      return body.data
    },
    enabled: !!id,
  })
}

export interface CreateManualTransactionInput {
  userId: string
  productSlug: string
  paymentMethod: PaymentMethod
  externalReference?: string
  notes?: string
  purchasedAt?: string
}

export type CreateManualTransactionResult = {
  transactionId: string
  entitlementId: string
}

export function useCreateManualTransaction() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation<
    CreateManualTransactionResult,
    Error,
    CreateManualTransactionInput
  >({
    mutationFn: async (input) => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      const body = (await res.json()) as {
        success: boolean
        data: CreateManualTransactionResult
      }
      return body.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-transactions"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-customers"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-customer"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-dashboard"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-customer-transactions"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["admin-products"],
      })
    },
  })
}

export function useCustomerTransactions(userId: string, limit = 10) {
  const { getToken } = useAuth()
  return useQuery<TransactionListItem[]>({
    queryKey: ["admin-customer-transactions", userId, limit],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/customers/${userId}/transactions?limit=${limit}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok)
        throw new Error(`Failed to fetch customer transactions: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: { transactions: TransactionListItem[] }
      }
      return body.data.transactions
    },
    enabled: !!userId,
  })
}
