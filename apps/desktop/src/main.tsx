import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider, TooltipProvider } from "@solarlayout/ui-desktop"
import { App } from "./App"
import "./main.css"

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error("root element not found")
}

/**
 * QueryClient — session-long cache, no persistence.
 *
 * Per ADR 0001 (online-required), there's no disk cache. The React-level
 * caching here is strictly intra-session deduping. We intentionally disable
 * background refetch / focus-refetch so the user sees a consistent view
 * and the /entitlements endpoint isn't hammered.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <App />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
