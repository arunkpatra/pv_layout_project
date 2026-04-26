import Link from "next/link"

const productLinks = [
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/products", label: "Download" },
]

const companyLinks = [
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
]

const legalLinks = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
]

function LinkColumn({
  heading,
  links,
}: {
  heading: string
  links: { href: string; label: string }[]
}) {
  return (
    <div>
      <h3 className="mb-3.5 font-mono text-[11px] font-medium tracking-[0.1em] text-[#9CA3AF] uppercase">
        {heading}
      </h3>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-[#D1D5DB] transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-[#1F2A30] bg-[#0F1418]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white">SolarLayout</span>
            </div>
            <p className="text-sm text-[#9CA3AF]">
              Utility-scale PV layout, cabling, and yield — built by solar
              industry veterans for the Indian and global solar market.
            </p>
            <div className="flex gap-2.5">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#1F2A30] text-[#9CA3AF] transition-colors hover:border-[#374151] hover:text-white"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.22 8h4.56v15.5H.22V8zM7.7 8h4.36v2.13h.07c.61-1.16 2.1-2.38 4.32-2.38 4.62 0 5.47 3.04 5.47 7v8.75h-4.56v-7.76c0-1.85-.03-4.23-2.58-4.23-2.58 0-2.97 2.02-2.97 4.1v7.89H7.7V8z" />
                </svg>
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#1F2A30] text-[#9CA3AF] transition-colors hover:border-[#374151] hover:text-white"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M23.5 6.2c-.3-1-1-1.7-2-2C19.6 3.7 12 3.7 12 3.7s-7.6 0-9.5.5c-1 .3-1.7 1-2 2C0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1 1 1.7 2 2 1.9.5 9.5.5 9.5.5s7.6 0 9.5-.5c1-.3 1.7-1 2-2 .5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.4 3.6-6.4 3.6z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Product */}
          <LinkColumn heading="Product" links={productLinks} />

          {/* Company */}
          <LinkColumn heading="Company" links={companyLinks} />

          {/* Legal */}
          <LinkColumn heading="Legal" links={legalLinks} />
        </div>

        {/* Legal bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[#1F2A30] pt-6 font-mono text-[12.5px] text-[#9CA3AF] sm:flex-row">
          <span>
            &copy; {new Date().getFullYear()} &nbsp; SolarLayout &middot;
            Bangalore, India &middot; All rights reserved.
          </span>
          <a
            href="mailto:support@solarlayout.in"
            className="transition-colors hover:text-white"
          >
            support@solarlayout.in
          </a>
        </div>
      </div>
    </footer>
  )
}
