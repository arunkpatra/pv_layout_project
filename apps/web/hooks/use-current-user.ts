"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"

export function useCurrentUser() {
  const { isLoaded, isSignedIn } = useAuth()
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.identity.me(),
    queryFn: () => api.getMe(),
    // Don't fire until Clerk has resolved auth state and confirmed sign-in.
    // Without this guard, the query fires with a null token on cold load,
    // producing a 401 and a wasted retry before Clerk is ready.
    enabled: isLoaded && !!isSignedIn,
  })
}
