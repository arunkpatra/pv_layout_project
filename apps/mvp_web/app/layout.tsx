import { Geist } from "next/font/google"
import type { Metadata } from "next"

import "@renewable-energy/ui/globals.css"
import "./globals.css"

import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { MvpToaster } from "@/components/mvp-toaster"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
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
    <html lang="en" className={`${fontSans.variable} font-sans antialiased`}>
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <MvpToaster />
      </body>
    </html>
  )
}
