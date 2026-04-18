import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@renewable-energy/ui/components/card"
import {
  Sun,
  ArrowRight,
  FileText,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react"

const values = [
  {
    icon: Wrench,
    title: "Built by practitioners",
    description:
      "SolarDesign was built by engineers who have worked on EPC projects, yield consulting, and grid connection submissions in India. The workflows in the platform reflect how utility-scale projects are actually executed — not how they are described in textbooks.",
  },
  {
    icon: FileText,
    title: "India regulatory standards throughout",
    description:
      "ALMM compliance, DISCOM-format SLDs, IS 732 and IS 1255 cable schedules, CEIG inspection requirements, and IREDA / PFC lender formats are built into the platform — not bolted on as exports.",
  },
  {
    icon: Users,
    title: "Designed with EPC and IPP teams",
    description:
      "We work directly with design engineers, BD engineers, and project managers at Indian EPC contractors and IPPs. Feature decisions come from live project workflows, not hypothetical requirements.",
  },
  {
    icon: ShieldCheck,
    title: "One file, all documents",
    description:
      "Design changes propagate automatically to SLD, cable schedule, BoM, BoQ, and DPR. No parallel spreadsheets, no re-entry between tools, no version mismatch between the layout and the bid package.",
  },
]

const team = [
  {
    name: "Arjun Sharma",
    role: "Co-founder & CEO",
    bio: "Former EPC project manager with 12 years on utility-scale solar projects across Rajasthan, Gujarat, and Andhra Pradesh. Built SolarDesign after managing three 100 MW projects using PVsyst, AutoCAD, and Excel in parallel.",
  },
  {
    name: "Kavitha Nair",
    role: "Co-founder & CTO",
    bio: "10 years in geospatial and simulation software. Led engineering at a utility-scale solar developer before co-founding SolarDesign.",
  },
  {
    name: "Rajesh Iyer",
    role: "Head of Product",
    bio: "Solar consultant for 8 years — yield assessments, lender technical due diligence, and DISCOM grid connectivity submissions. Joined SolarDesign to build the tool he needed on every project.",
  },
  {
    name: "Sunita Reddy",
    role: "Head of Customer Success",
    bio: "Previously led design engineering at a large EPC contractor. Works directly with customers to ensure the platform fits live project workflows.",
  },
]

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center bg-primary/10">
          <Sun className="h-6 w-6 text-primary" />
        </div>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          Built for India&apos;s utility-scale solar market
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          SolarDesign was founded by solar practitioners who ran EPC projects
          and yield assessments using PVsyst, AutoCAD, and Excel in parallel.
          The platform replaces that fragmented workflow with a single tool —
          from KMZ import to lender-ready DPR.
        </p>
      </section>

      {/* Context */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-20 text-center">
        <p className="text-muted-foreground">
          The platform is used by design engineers and EPC teams working on
          greenfield solar projects from 10 MW to 500 MW across India.
          Every feature — ALMM compliance, DISCOM SLD format, IS 732 / IS 1255
          cable sizing, IREDA / PFC export format — is specific to the Indian
          utility-scale market.
        </p>
      </section>

      {/* Values */}
      <section className="border-t px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold tracking-tight">
            How we build
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {values.map((value) => (
              <Card key={value.title}>
                <CardHeader>
                  <div className="mb-1 flex h-10 w-10 items-center justify-center bg-primary/10">
                    <value.icon
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
            The team
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {team.map((member) => (
              <Card key={member.name}>
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center bg-muted text-lg font-bold text-muted-foreground">
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

      {/* Contact */}
      <section className="border-t px-6 py-16 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Contact us
        </h2>
        <p className="mb-6 text-muted-foreground">
          For enterprise enquiries, integration requirements, or questions about
          the platform — reach out directly. We respond within one business day.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link href="/dashboard">
              Start free trial
              <ArrowRight className="ml-1.5 h-4 w-4" />
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
