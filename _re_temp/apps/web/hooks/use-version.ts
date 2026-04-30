"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"
import type { VersionStatus } from "@renewable-energy/shared"

export function getVersionRefetchInterval(
  status: VersionStatus | undefined,
): number | false {
  if (!status || status === "COMPLETE" || status === "FAILED") return false
  return 3000
}

export function useVersion(projectId: string, versionId: string) {
  const { isLoaded, isSignedIn } = useAuth()
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.projects.versions.detail(projectId, versionId),
    queryFn: () => api.getVersion(projectId, versionId),
    enabled: isLoaded && !!isSignedIn && !!projectId && !!versionId,
    refetchInterval: (query) =>
      getVersionRefetchInterval(query.state.data?.status),
    staleTime: (query) => {
      const s = query.state.data?.status
      return s === "COMPLETE" || s === "FAILED" ? 120_000 : 1_000
    },
  })
}
