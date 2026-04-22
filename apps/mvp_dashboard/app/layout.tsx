import { Geist } from "next/font/google"
import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"

import "@renewable-energy/ui/globals.css"
import "./globals.css"

import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/components/query-provider"
import { TooltipProvider } from "@renewable-energy/ui/components/tooltip"
import { cn } from "@renewable-energy/ui/lib/utils"
import { Toaster } from "@renewable-energy/ui/components/sonner"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "SolarLayout Dashboard",
  description: "Download your SolarLayout software and manage your account.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html
        lang="en"
        suppressHydrationWarning
        className={cn("antialiased", fontSans.variable, "font-sans")}
      >
        <body>
          <ThemeProvider>
            <QueryProvider>
              <TooltipProvider>
                {children}
                <Toaster />
              </TooltipProvider>
            </QueryProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
