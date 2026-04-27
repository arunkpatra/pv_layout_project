import Link from "next/link"

const contactItems = [
  {
    label: "Email",
    value: (
      <a
        href="mailto:support@solarlayout.in"
        className="text-primary underline underline-offset-[3px]"
      >
        support@solarlayout.in
      </a>
    ),
  },
  { label: "Location", value: "Bangalore, Karnataka, India" },
  {
    label: "LinkedIn",
    value: (
      <a
        href="https://www.linkedin.com/company/solarlayout"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-[3px]"
      >
        linkedin.com/company/solarlayout
      </a>
    ),
  },
  {
    label: "YouTube",
    value: (
      <a
        href="https://www.youtube.com/@SolarLayout"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-[3px]"
      >
        youtube.com/@solarlayout
      </a>
    ),
  },
  {
    label: "Grievance officer",
    value: (
      <>
        As required under the IT Act 2000 and DPDP Act 2023, the contact for
        data grievances is published in the{" "}
        <Link
          href="/privacy"
          className="text-primary underline underline-offset-[3px]"
        >
          Privacy Policy
        </Link>
        .
      </>
    ),
  },
]

export function ContactInfo() {
  return (
    <div>
      {contactItems.map((item, i) => (
        <div
          key={item.label}
          className={`py-[18px] ${i < contactItems.length - 1 ? "border-b border-border" : ""}`}
        >
          <div className="mb-1.5 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
            {item.label}
          </div>
          <div className="text-[15px]">{item.value}</div>
        </div>
      ))}
    </div>
  )
}
