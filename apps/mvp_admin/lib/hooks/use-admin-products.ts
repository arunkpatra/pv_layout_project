import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import {
  MVP_API_URL,
  type AdminProductsResponse,
  type ProductListItem,
  type ProductSalesResponse,
  type ProductsSummary,
} from "../api"

export function useAdminProducts(params: { page: number; pageSize: number }) {
  const { getToken } = useAuth()
  return useQuery<AdminProductsResponse>({
    queryKey: ["admin-products", params],
    queryFn: async () => {
      const token = await getToken()
      const qs = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })
      const res = await fetch(`${MVP_API_URL}/admin/products?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch products: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: AdminProductsResponse
      }
      return body.data
    },
  })
}

export function useAdminProduct(slug: string) {
  const { getToken } = useAuth()
  return useQuery<ProductListItem>({
    queryKey: ["admin-product", slug],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/products/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch product: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: ProductListItem
      }
      return body.data
    },
    enabled: !!slug,
  })
}

export function useAdminProductSales(
  slug: string,
  granularity: "daily" | "weekly" | "monthly",
) {
  const { getToken } = useAuth()
  return useQuery<ProductSalesResponse>({
    queryKey: ["admin-product-sales", slug, granularity],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/products/${slug}/sales?granularity=${granularity}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok)
        throw new Error(`Failed to fetch product sales: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: ProductSalesResponse
      }
      return body.data
    },
    enabled: !!slug,
  })
}

export function useAdminProductsSummary() {
  const { getToken } = useAuth()
  return useQuery<ProductsSummary>({
    queryKey: ["admin-products-summary"],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/products/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch products summary: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: ProductsSummary
      }
      return body.data
    },
  })
}

export type StripePriceItem = {
  slug: string
  name: string
  stripePriceId: string
  isFree: boolean
}

export function useStripePrices() {
  const { getToken } = useAuth()
  return useQuery<StripePriceItem[]>({
    queryKey: ["admin-stripe-prices"],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/products/stripe-prices`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch stripe prices: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: StripePriceItem[]
      }
      return body.data
    },
  })
}

export function useUpdateStripePrice() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation<
    { slug: string; stripePriceId: string },
    Error,
    { slug: string; stripePriceId: string }
  >({
    mutationFn: async ({ slug, stripePriceId }) => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/products/${slug}/stripe-price`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stripePriceId }),
        },
      )
      if (!res.ok)
        throw new Error(`Failed to update stripe price: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: { slug: string; stripePriceId: string }
      }
      return body.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stripe-prices"] })
    },
  })
}
