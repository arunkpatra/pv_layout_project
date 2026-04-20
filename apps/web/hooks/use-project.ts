"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"

export function useProject(projectId: string) {
  const { isLoaded, isSignedIn } = useAuth()
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => api.getProject(projectId),
    enabled: isLoaded && !!isSignedIn && !!projectId,
  })
}
