import { Mail, MapPin, LinkedinIcon, YoutubeIcon } from "lucide-react"

const contactDetails = [
  {
    icon: Mail,
    label: "Email",
    value: "support@solarlayout.in",
    href: "mailto:support@solarlayout.in",
  },
  {
    icon: MapPin,
    label: "Location",
    value: "Bangalore, India",
    href: null,
  },
]

const socialLinks = [
  {
    icon: LinkedinIcon,
    label: "LinkedIn",
    href: "https://linkedin.com",
  },
  {
    icon: YoutubeIcon,
    label: "YouTube",
    href: "https://youtube.com",
  },
]

export function ContactInfo() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">
        Get in Touch
      </h2>

      <div className="space-y-4">
        {contactDetails.map((detail) => (
          <div
            key={detail.label}
            className="flex items-start gap-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <detail.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {detail.label}
              </p>
              {detail.href ? (
                <a
                  href={detail.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {detail.value}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {detail.value}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Follow Us
        </h3>
        <div className="flex gap-3">
          {socialLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted"
            >
              <link.icon className="h-5 w-5 text-muted-foreground" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
