import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@renewable-energy/ui/components/tooltip"

export function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    )
  }
}
