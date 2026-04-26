interface WindowFrameProps {
  title: string
  badge?: string
  caption?: string
  captionMeta?: string
  children: React.ReactNode
}

export function WindowFrame({
  title,
  badge,
  caption,
  captionMeta,
  children,
}: WindowFrameProps) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border bg-[#FAFBFC] px-3.5 py-2.5 font-mono text-xs text-muted-foreground">
        <div className="flex gap-[5px]">
          <span className="h-[9px] w-[9px] rounded-full bg-[#E5E7EB]" />
          <span className="h-[9px] w-[9px] rounded-full bg-[#E5E7EB]" />
          <span className="h-[9px] w-[9px] rounded-full bg-[#E5E7EB]" />
        </div>
        <span className="ml-2">{title}</span>
        {badge && (
          <span className="ml-auto rounded-full border border-[#cfe3d8] bg-secondary px-2 py-0.5 text-[11px] text-primary">
            {badge}
          </span>
        )}
      </div>
      <div className="bg-[#FAFBFC]">{children}</div>
      {caption && (
        <div className="flex items-center justify-between border-t border-border bg-white px-3.5 py-3">
          <span className="text-[13px] font-medium">{caption}</span>
          {captionMeta && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {captionMeta}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
