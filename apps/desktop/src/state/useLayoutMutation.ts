/**
 * useLayoutMutation — TanStack Query mutation hook for POST /layout.
 *
 * On success, hydrates `useLayoutResultStore` with the response so the
 * SummaryPanel + MapCanvas (via memoised selectors) reflect the new
 * layout immediately.
 *
 * Why a mutation, not a query?
 *   - The user explicitly clicks "Generate". There's no auto-refetch
 *     story — params change too freely (every keystroke would hammer
 *     the sidecar).
 *   - Errors should surface inline at the trigger site (Generate button
 *     turns red / inspector shows toast), not silently retry in the
 *     background.
 *
 * Per ADR-0003: server cache lives in TanStack Query (this hook); the
 * cross-component snapshot of "current layout result" lives in the
 * Zustand `layoutResult` slice. The mutation onSuccess bridges them.
 */
import { useMutation, type UseMutationResult } from "@tanstack/react-query"
import type {
  LayoutParameters,
  LayoutResult,
  ParsedKMZ,
  SidecarClient,
  SidecarError,
} from "@solarlayout/sidecar-client"
import { useLayoutResultStore } from "./layoutResult"

export interface LayoutMutationVariables {
  parsedKmz: ParsedKMZ
  params: LayoutParameters
}

export function useLayoutMutation(
  sidecar: SidecarClient | null
): UseMutationResult<LayoutResult[], SidecarError, LayoutMutationVariables> {
  const setResult = useLayoutResultStore((s) => s.setResult)
  return useMutation<LayoutResult[], SidecarError, LayoutMutationVariables>({
    mutationFn: async ({ parsedKmz, params }) => {
      if (!sidecar) {
        throw new Error("Sidecar not ready") as SidecarError
      }
      return sidecar.runLayout(parsedKmz, params)
    },
    onSuccess: (results) => {
      setResult(results)
    },
  })
}
