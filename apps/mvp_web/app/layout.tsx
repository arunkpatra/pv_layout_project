import { Geist, Geist_Mono } from "next/font/google"
import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"

import "@renewable-energy/ui/globals.css"
import "./globals.css"

import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/components/query-provider"
import { TooltipProvider } from "@renewable-energy/ui/components/tooltip"
import { Toaster } from "@renewable-energy/ui/components/sonner"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "SolarLayout — PV Layout Design Solutions",
    template: "%s | SolarLayout",
  },
  description:
    "Automated PV plant layout design solutions for solar professionals. Upload KMZ, generate layouts, export results.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      <html
        lang="en"
        suppressHydrationWarning
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
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
