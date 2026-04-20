"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"
import type { CreateVersionParams } from "@renewable-energy/api-client"

export function useCreateVersion() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: CreateVersionParams) => api.createVersion(params),
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.versions.all(params.projectId),
      })
    },
  })
}
