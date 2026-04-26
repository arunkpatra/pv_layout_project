import Link from "next/link"
import { Eyebrow } from "./eyebrow"

interface SectionHeadProps {
  eyebrow: string
  title: string
  description?: string
  ctaHref?: string
  ctaLabel?: string
}

export function SectionHead({
  eyebrow,
  title,
  description,
  ctaHref,
  ctaLabel,
}: SectionHeadProps) {
  return (
    <div className="mb-9 flex items-end justify-between gap-6">
      <div className="max-w-[640px]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-1.5 text-[28px] font-semibold leading-[1.15] tracking-[-0.015em]">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="shrink-0 text-sm text-[#374151] transition-colors hover:text-primary"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
