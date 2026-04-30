import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { MvpToaster } from "@/components/mvp-toaster"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <MvpToaster />
    </div>
  )
}
