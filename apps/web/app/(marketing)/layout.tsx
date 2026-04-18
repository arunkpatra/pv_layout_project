import Link from "next/link"
import { MarketingNav } from "@/components/marketing/marketing-nav"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t px-6 py-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>© 2026 SolarDesign. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="#" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="#" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
