"use client"

import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export type EntitlementState = "ACTIVE" | "EXHAUSTED" | "DEACTIVATED"

export type EntitlementItem = {
  id: string
  product: string
  productName: string
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
  purchasedAt: string
  deactivatedAt: string | null
  state: EntitlementState
}

export type EntitlementsData = {
  entitlements: EntitlementItem[]
  licenseKey: string | null
}

export type UsageRecord = {
  featureKey: string
  productName: string
  createdAt: string
}

export type UsagePagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type UsageData = {
  data: UsageRecord[]
  pagination: UsagePagination
}

export function useEntitlements() {
  const { getToken } = useAuth()
  return useQuery<EntitlementsData, Error>({
    queryKey: ["entitlements"],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/billing/entitlements`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch entitlements: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: EntitlementsData
      }
      return body.data
    },
  })
}

export function useUserUsage(page: number, pageSize: number) {
  const { getToken } = useAuth()
  return useQuery<UsageData, Error>({
    queryKey: ["user-usage", page, pageSize],
    queryFn: async () => {
      const token = await getToken()
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      const res = await fetch(`${MVP_API_URL}/billing/usage?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to fetch usage: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: UsageData
      }
      return body.data
    },
  })
}
