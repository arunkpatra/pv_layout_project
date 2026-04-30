interface PageHeaderProps {
  breadcrumb: string[]
  title: string
  description: string
  children?: React.ReactNode
}

export function PageHeader({
  breadcrumb,
  title,
  description,
  children,
}: PageHeaderProps) {
  return (
    <div className="border-b border-border bg-[#FBFCFD] pb-10 pt-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <div
          className={
            children
              ? "grid items-end gap-12 lg:grid-cols-[1.2fr_1fr]"
              : undefined
          }
        >
          <div>
            <div className="mb-3.5 flex gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {breadcrumb.map((segment, i) => (
                <span key={segment}>
                  {i > 0 && (
                    <span className="mr-1.5 text-[#9CA3AF]">/</span>
                  )}
                  {segment}
                </span>
              ))}
            </div>
            <h1 className="text-[40px] font-bold leading-[1.1] tracking-[-0.02em]">
              {title}
            </h1>
            <p className="mt-3.5 max-w-[60ch] text-lg text-[#374151]">
              {description}
            </p>
          </div>
          {children && <div className="pb-1.5">{children}</div>}
        </div>
      </div>
    </div>
  )
}
