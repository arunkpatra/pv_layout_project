"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@renewable-energy/ui/components/sheet"
import { SolarPanelIcon, ListIcon, XIcon } from "@phosphor-icons/react"

const navLinks = [
  { href: "#solutions", label: "Solutions" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#resources", label: "Resources" },
  { href: "#about", label: "About" },
]

export function MarketingNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border/50 bg-background/80 px-6 backdrop-blur-md">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2">
        <SolarPanelIcon weight="duotone" className="h-5 w-5 text-primary" />
        <span className="font-semibold tracking-tight">SolarDesign</span>
      </Link>

      {/* Desktop nav */}
      <nav className="hidden items-center gap-6 md:flex">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Desktop CTA */}
      <div className="hidden md:flex">
        <Button asChild size="sm">
          <Link href="/dashboard">Sign In</Link>
        </Button>
      </div>

      {/* Mobile: hamburger */}
      <div className="flex md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <ListIcon className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 pt-10">
            <SheetClose className="absolute right-4 top-4" asChild>
              <Button variant="ghost" size="icon" aria-label="Close menu">
                <XIcon className="h-4 w-4" />
              </Button>
            </SheetClose>
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <SheetClose key={link.href} asChild>
                  <Link
                    href={link.href}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </SheetClose>
              ))}
            </nav>
            <div className="mt-6 px-3">
              <Button asChild className="w-full">
                <Link href="/dashboard" onClick={() => setOpen(false)}>
                  Sign In
                </Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
