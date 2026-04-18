import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@renewable-energy/ui/components/card"
import {
  BookOpenIcon,
  VideoIcon,
  FileTextIcon,
  ChatCircleIcon,
  ArrowRightIcon,
  GraduationCapIcon,
  NewspaperIcon,
  RocketLaunchIcon,
} from "@phosphor-icons/react/dist/ssr"

const resources = [
  {
    icon: BookOpenIcon,
    badge: "Docs",
    title: "Getting started guide",
    description:
      "Everything you need to set up your first project — from account creation and site import to your first layout export. Step-by-step with screenshots.",
    href: "#",
  },
  {
    icon: VideoIcon,
    badge: "Video",
    title: "Video tutorials",
    description:
      "Watch our engineers walk through real-world solar design workflows. Covers layout editing, yield simulation, shading analysis, and report generation.",
    href: "#",
  },
  {
    icon: GraduationCapIcon,
    badge: "Course",
    title: "SolarDesign Academy",
    description:
      "Structured learning paths for new users. Earn a certification to share with clients and demonstrate your proficiency with the platform.",
    href: "#",
  },
  {
    icon: FileTextIcon,
    badge: "Template",
    title: "Project templates",
    description:
      "Pre-configured templates for commercial rooftop, industrial flat-roof, and ground-mount utility projects. Start fast with best-practice defaults.",
    href: "#",
  },
  {
    icon: NewspaperIcon,
    badge: "Blog",
    title: "Engineering blog",
    description:
      "Deep dives into yield modelling, shading algorithms, and design best practices from the SolarDesign engineering team.",
    href: "#",
  },
  {
    icon: ChatCircleIcon,
    badge: "Community",
    title: "Community forum",
    description:
      "Ask questions, share designs, and learn from thousands of solar designers worldwide. Monitored daily by our support team.",
    href: "#",
  },
  {
    icon: RocketLaunchIcon,
    badge: "Webinar",
    title: "Live webinars",
    description:
      "Monthly live sessions on new features, industry trends, and advanced workflows. All recordings available on demand after the session.",
    href: "#",
  },
  {
    icon: FileTextIcon,
    badge: "API",
    title: "Developer docs",
    description:
      "REST API reference, webhooks, and integration guides for connecting SolarDesign to your own tools and project management systems.",
    href: "#",
  },
]

export default function ResourcesPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          Learn, build, and get support
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Guides, tutorials, templates, and community — everything you need to
          get the most out of SolarDesign.
        </p>
      </section>

      {/* Resources grid */}
      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-20 md:grid-cols-2">
        {resources.map((resource) => (
          <Card
            key={resource.title}
            className="transition-shadow hover:shadow-md"
          >
            <CardHeader>
              <div className="mb-1 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary/10">
                  <resource.icon
                    weight="duotone"
                    className="h-5 w-5 text-primary"
                  />
                </div>
                <Badge variant="secondary" className="text-xs">
                  {resource.badge}
                </Badge>
              </div>
              <CardTitle>{resource.title}</CardTitle>
              <CardDescription>{resource.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      {/* CTA */}
      <section className="border-t px-6 py-16 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Can&apos;t find what you need?
        </h2>
        <p className="mb-6 text-muted-foreground">
          Our support team is available via email and live chat on all paid
          plans.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link href="/dashboard">
              Get started free
              <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/contact">Contact us</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
