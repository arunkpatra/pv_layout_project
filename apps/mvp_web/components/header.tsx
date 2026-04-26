"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sun, Menu, Download } from "lucide-react"
import { SignedIn, SignedOut } from "@clerk/nextjs"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
} from "@renewable-energy/ui/components/sheet"
import { cn } from "@renewable-energy/ui/lib/utils"

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/faq", label: "FAQ" },
]

export function Header() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/85 backdrop-blur-md backdrop-saturate-[1.4]">
      <div className="mx-auto flex max-w-[1200px] items-center gap-8 px-6 py-3.5">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary">
            <Sun className="h-4 w-4 text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            SolarLayout
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors hover:bg-secondary hover:text-primary",
                pathname === link.href
                  ? "font-medium text-primary"
                  : "text-[#374151]"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA + Auth */}
        <div className="hidden items-center gap-2 md:flex">
          <SignedOut>
            <Button asChild variant="outline">
              <Link href="/sign-in">Sign In</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button asChild variant="outline">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </SignedIn>
          <Button asChild className="gap-2">
            <Link href="/products">
              Download
              <Download className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <div className="flex items-center gap-2.5 pt-2 pb-6">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-primary">
                <Sun className="h-4 w-4 text-white" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-foreground">
                SolarLayout
              </span>
            </div>
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm transition-colors hover:bg-secondary hover:text-primary",
                    pathname === link.href
                      ? "font-medium text-primary"
                      : "text-[#374151]"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-6 flex flex-col gap-2">
              <SignedOut>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/sign-in" onClick={() => setOpen(false)}>
                    Sign In
                  </Link>
                </Button>
              </SignedOut>
              <SignedIn>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/dashboard" onClick={() => setOpen(false)}>
                    Dashboard
                  </Link>
                </Button>
              </SignedIn>
              <Button asChild className="w-full gap-2">
                <Link href="/products" onClick={() => setOpen(false)}>
                  Download
                  <Download className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
