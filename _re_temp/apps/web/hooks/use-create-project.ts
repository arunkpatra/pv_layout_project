"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"

export function useCreateProject() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.createProject({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() })
    },
  })
}
