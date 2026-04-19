"use client"

import { useQuery } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"

export function useCurrentUser() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.identity.me(),
    queryFn: () => api.getMe(),
  })
}
