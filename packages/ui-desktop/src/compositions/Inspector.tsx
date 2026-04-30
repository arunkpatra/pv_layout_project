import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "../lib/cn"

export function InspectorRoot({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col", className)} {...props}>
      {children}
    </div>
  )
}

export function InspectorSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("px-[20px] py-[18px] border-b border-[var(--border-subtle)]", className)}>
      <h3 className="text-[11px] font-semibold tracking-[0.04em] uppercase text-[var(--text-muted)] mb-[12px]">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function PropertyRow({
  label,
  value,
  unit,
}: {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-[12px] py-[5px] text-[13px]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)] font-medium tabular-nums">
        {value}
        {unit && (
          <span className="ml-[5px] text-[var(--text-muted)] font-normal">{unit}</span>
        )}
      </span>
    </div>
  )
}

export function SummaryStat({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[16px] font-semibold text-[var(--text-primary)] tabular-nums leading-tight">
        {value}
      </span>
    </div>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-y-[14px] gap-x-[12px]">{children}</div>
}
