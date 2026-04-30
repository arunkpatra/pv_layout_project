import { Geist } from "next/font/google"
import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import "@renewable-energy/ui/globals.css"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/components/query-provider"
import { TooltipProvider } from "@renewable-energy/ui/components/tooltip"
import { Toaster } from "@renewable-energy/ui/components/sonner"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: {
    default: "SolarLayout Admin",
    template: "%s | SolarLayout Admin",
  },
  description: "Internal admin and ops dashboard for SolarLayout.",
  icons: {
    icon: [
      {
        url: "/images/solar_layout_favicon_light.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/images/solar_layout_favicon_dark.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/favicon.ico",
        // Fallback for browsers that don't support media queries
      },
    ],
    apple: [
      {
        url: "/images/solar_layout_favicon_light.png",
        // Apple devices will use this
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html
        lang="en"
        suppressHydrationWarning
        className={`${fontSans.variable} font-sans antialiased`}
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
