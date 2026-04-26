import { cn } from "@renewable-energy/ui/lib/utils"

interface SectionBandProps {
  children: React.ReactNode
  muted?: boolean
  className?: string
}

export function SectionBand({
  children,
  muted,
  className,
}: SectionBandProps) {
  return (
    <section
      className={cn(
        "border-b border-border py-[72px]",
        muted && "bg-[#FBFCFD]",
        className,
      )}
    >
      <div className="mx-auto max-w-[1200px] px-6">{children}</div>
    </section>
  )
}
