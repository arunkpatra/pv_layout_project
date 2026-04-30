"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"

export function useProjects(params?: { page?: number; pageSize?: number }) {
  const { isLoaded, isSignedIn } = useAuth()
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.projects.lists(params),
    queryFn: () => api.listProjects(params),
    enabled: isLoaded && !!isSignedIn,
  })
}
