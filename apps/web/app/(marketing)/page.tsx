import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Separator } from "@renewable-energy/ui/components/separator"
import {
  SolarPanelIcon,
  ChartLineUpIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  LightningIcon,
  BuildingsIcon,
} from "@phosphor-icons/react/dist/ssr"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Nav */}
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          <SolarPanelIcon weight="duotone" className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">SolarDesign</span>
        </div>
        <nav className="flex items-center gap-6">
          <Link
            href="#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </Link>
          <Link
            href="#pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
          <Button asChild size="sm">
            <Link href="/dashboard">Sign In</Link>
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
          <Badge variant="secondary" className="gap-1.5">
            <LightningIcon weight="fill" className="h-3 w-3" />
            Now in beta
          </Badge>
          <h1 className="max-w-3xl text-5xl font-bold tracking-tight">
            Design solar panel layouts
            <br />
            <span className="text-muted-foreground">in minutes, not days.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            The professional tool for renewable energy companies to plan, design,
            and optimise commercial solar installations — faster and with fewer
            errors.
          </p>
          <div className="flex items-center gap-3">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Get started
                <ArrowRightIcon className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="#features">See features</Link>
            </Button>
          </div>
        </section>

        <Separator />

        {/* Features */}
        <section
          id="features"
          className="grid gap-8 px-6 py-20 md:grid-cols-3 max-w-5xl mx-auto w-full"
        >
          <div className="flex flex-col gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <SolarPanelIcon
                weight="duotone"
                className="h-5 w-5 text-primary"
              />
            </div>
            <h3 className="font-semibold">Precision layout editor</h3>
            <p className="text-sm text-muted-foreground">
              Drag-and-drop panel placement on imported site plans. Snap-to-grid
              alignment with automatic setback and spacing rules.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ChartLineUpIcon
                weight="duotone"
                className="h-5 w-5 text-primary"
              />
            </div>
            <h3 className="font-semibold">Yield modelling</h3>
            <p className="text-sm text-muted-foreground">
              Real-time energy yield estimates based on location, tilt, shading
              analysis, and panel specifications. Export reports instantly.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BuildingsIcon
                weight="duotone"
                className="h-5 w-5 text-primary"
              />
            </div>
            <h3 className="font-semibold">Built for teams</h3>
            <p className="text-sm text-muted-foreground">
              Multi-user workspaces, role-based access, and version history.
              Share designs with clients and collaborators in one click.
            </p>
          </div>
        </section>

        <Separator />

        {/* CTA banner */}
        <section className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <ShieldCheckIcon
            weight="duotone"
            className="h-8 w-8 text-muted-foreground"
          />
          <h2 className="text-2xl font-bold tracking-tight">
            Ready to modernise your workflow?
          </h2>
          <p className="text-muted-foreground">
            Join renewable energy teams already using SolarDesign.
          </p>
          <Button asChild>
            <Link href="/dashboard">
              Start designing
              <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </section>
      </main>

      {/* Footer */}
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
