"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"

export function useVersions(
  projectId: string,
  params?: { page?: number; pageSize?: number },
) {
  const { isLoaded, isSignedIn } = useAuth()
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.projects.versions.lists(projectId, params),
    queryFn: () => api.listVersions(projectId, params),
    enabled: isLoaded && !!isSignedIn && !!projectId,
  })
}
