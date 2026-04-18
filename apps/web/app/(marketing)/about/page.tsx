import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@renewable-energy/ui/components/card"
import {
  SolarPanelIcon,
  ArrowRightIcon,
  HeartIcon,
  TreeIcon,
  UsersThreeIcon,
  GlobeIcon,
} from "@phosphor-icons/react/dist/ssr"

const values = [
  {
    icon: TreeIcon,
    title: "Built for the energy transition",
    description:
      "Every tool we build is designed to help solar installers and developers move faster. Less time on layouts means more solar in the ground.",
  },
  {
    icon: UsersThreeIcon,
    title: "Designed with practitioners",
    description:
      "We work directly with solar engineers and EPC contractors to understand real-world workflows. Our roadmap is shaped by the people who use the software daily.",
  },
  {
    icon: GlobeIcon,
    title: "Global from day one",
    description:
      "SolarDesign is used across 40+ countries. Our irradiance data, weather models, and export formats are built for international projects.",
  },
  {
    icon: HeartIcon,
    title: "Customer success is our metric",
    description:
      "We measure our success by your project outcomes — not vanity metrics. Every support interaction and feature request is taken seriously.",
  },
]

const team = [
  {
    name: "Priya Mehta",
    role: "Co-founder & CEO",
    bio: "Former solar EPC project manager. Built SolarDesign after spending years on manual layout workflows.",
  },
  {
    name: "Lukas Bauer",
    role: "Co-founder & CTO",
    bio: "10 years building geospatial and simulation software. Led engineering at a utility-scale solar developer.",
  },
  {
    name: "Amara Diallo",
    role: "Head of Product",
    bio: "Previously at a leading CAD software company. Passionate about tools that reduce friction in complex workflows.",
  },
  {
    name: "Tom Nakamura",
    role: "Head of Customer Success",
    bio: "Spent 8 years as a solar consultant. Joined SolarDesign to make sure every customer gets maximum value from the platform.",
  },
]

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <SolarPanelIcon weight="duotone" className="h-6 w-6 text-primary" />
        </div>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          We&apos;re on a mission to accelerate the solar industry
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          SolarDesign was founded in 2022 by a team of solar practitioners and
          engineers who were tired of designing layouts in spreadsheets and
          generic CAD tools.
        </p>
      </section>

      {/* Mission statement */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-20 text-center">
        <p className="text-muted-foreground">
          Today, teams in over 40 countries use SolarDesign to design, analyse,
          and deliver commercial and utility-scale solar projects. We believe
          that better software leads to more renewable energy — and we&apos;re
          building the tools to prove it.
        </p>
      </section>

      {/* Values */}
      <section className="border-t px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold tracking-tight">
            What we stand for
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {values.map((value) => (
              <Card key={value.title}>
                <CardHeader>
                  <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <value.icon
                      weight="duotone"
                      className="h-5 w-5 text-primary"
                    />
                  </div>
                  <CardTitle>{value.title}</CardTitle>
                  <CardDescription>{value.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="border-t px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold tracking-tight">
            Meet the team
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {team.map((member) => (
              <Card key={member.name}>
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground">
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <CardTitle className="text-base">{member.name}</CardTitle>
                  <p className="text-xs font-medium text-primary">
                    {member.role}
                  </p>
                  <CardDescription>{member.bio}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t px-6 py-16 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Want to work with us?
        </h2>
        <p className="mb-6 text-muted-foreground">
          We&apos;re hiring engineers, designers, and solar industry experts.
          Or just start using the product — it&apos;s free to get started.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link href="/dashboard">
              Try SolarDesign free
              <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
