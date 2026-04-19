"use client"

import { useMemo } from "react"
import { useAuth } from "@clerk/nextjs"
import { createApiClient, createWebClient } from "@renewable-energy/api-client"

const API_BASE =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001"

export function useApi() {
  const { getToken } = useAuth()
  return useMemo(
    // Arrow wrapper `() => getToken()` defers resolution to call time so
    // the client always uses the current token rather than a captured value.
    () => createWebClient(createApiClient(API_BASE, () => getToken())),
    [getToken],
  )
}
