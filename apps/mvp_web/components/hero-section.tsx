import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { ChevronRight } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-primary px-4 py-20 text-primary-foreground sm:px-6 sm:py-28 lg:px-8 lg:py-36">
      {/* Decorative background grid */}
      <div className="absolute inset-0 opacity-10">
        <div className="h-full w-full bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </div>

      <div className="relative mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Design Smarter. Deploy Faster.{" "}
          <span className="text-accent">Power the Future.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-primary-foreground/80 sm:text-xl">
          Automated PV plant layout design from KMZ boundary files. Place
          MMS tables, route cables, estimate energy yield — in minutes,
          not days.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="bg-accent text-white [a]:hover:bg-accent/80"
          >
            <Link href="/products">
              Explore Products
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="border-2 border-white bg-transparent text-white [a]:hover:bg-white [a]:hover:text-primary"
          >
            <Link href="/pricing">See Pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
