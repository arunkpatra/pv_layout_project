import { Geist, JetBrains_Mono } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"

import "@renewable-energy/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@renewable-energy/ui/components/tooltip"
import { cn } from "@renewable-energy/ui/lib/utils";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'})

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
        className={cn("antialiased", fontSans.variable, "font-mono", jetbrainsMono.variable)}
      >
        <body>
          <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
