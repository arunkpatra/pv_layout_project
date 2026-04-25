export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Separator } from "@renewable-energy/ui/components/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@renewable-energy/ui/components/sidebar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { sessionClaims } = await auth()
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined
  const roles = Array.isArray(meta?.["roles"])
    ? (meta!["roles"] as string[])
    : []
  const hasAccess = roles.includes("ADMIN") || roles.includes("OPS")
  const primaryRole: "ADMIN" | "OPS" = roles.includes("ADMIN") ? "ADMIN" : "OPS"

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-foreground">Access Denied</p>
          <p className="text-sm text-muted-foreground">
            ADMIN or OPS role required. Contact your administrator.
          </p>
        </div>
      </main>
    )
  }

  return (
    <SidebarProvider>
      <AdminSidebar role={primaryRole} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
