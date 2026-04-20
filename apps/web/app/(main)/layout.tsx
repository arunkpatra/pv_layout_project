import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@renewable-energy/ui/components/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@renewable-energy/ui/components/sidebar"
import { BreadcrumbsProvider } from "@/contexts/breadcrumbs-context"
import { DynamicBreadcrumbs } from "@/components/dynamic-breadcrumbs"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <BreadcrumbsProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <DynamicBreadcrumbs />
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </BreadcrumbsProvider>
  )
}
