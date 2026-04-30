interface EyebrowProps {
  children: React.ReactNode
}

export function Eyebrow({ children }: EyebrowProps) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
      <span
        className="inline-block h-2 w-2 rounded-[1px] bg-accent"
        aria-hidden="true"
      />
      {children}
    </span>
  )
}
