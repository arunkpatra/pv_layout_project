"use client"

import { useEffect, useRef, useState } from "react"

type Stat = {
  target: number
  suffix: string
  label: string
}

const stats: Stat[] = [
  { target: 500, suffix: " MW+", label: "Projects designed" },
  { target: 24,  suffix: " hrs", label: "Pre-bid to DPR" },
  { target: 100, suffix: "%",    label: "ALMM compliant outputs" },
  { target: 15,  suffix: "+",    label: "DISCOM formats supported" },
]

function useCountUp(target: number, duration = 1200, start = false) {
  const [value, setValue] = useState(0)
  const raf = useRef<number>(0)

  useEffect(() => {
    if (!start) return
    const startTime = performance.now()
    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration, start])

  return value
}

function StatItem({ stat, animate }: { stat: Stat; animate: boolean }) {
  const value = useCountUp(stat.target, 1400, animate)
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-2xl font-bold tabular-nums tracking-tight">
        {value}{stat.suffix}
      </span>
      <span className="text-xs text-muted-foreground">{stat.label}</span>
    </div>
  )
}

export function HeroStats() {
  const ref = useRef<HTMLDivElement>(null)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setAnimate(true); observer.disconnect() } },
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4"
    >
      {stats.map((s) => (
        <StatItem key={s.label} stat={s} animate={animate} />
      ))}
    </div>
  )
}
