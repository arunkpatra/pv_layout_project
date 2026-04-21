"use client"

import { useState } from "react"
import { Monitor } from "lucide-react"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@renewable-energy/ui/components/dialog"

const screenshots = [
  {
    id: 1,
    caption: "Plant boundary import and visualization",
  },
  {
    id: 2,
    caption: "MMS table placement with exclusion zones",
  },
  {
    id: 3,
    caption: "Cable routing and quantity measurements",
  },
  {
    id: 4,
    caption: "Energy yield analysis and generation report",
  },
]

export function ScreenshotsSection() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = screenshots.find((s) => s.id === selectedId)

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            See It in Action
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Screenshots from the SolarLayout desktop application.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {screenshots.map((screenshot) => (
            <Dialog
              key={screenshot.id}
              open={selectedId === screenshot.id}
              onOpenChange={(open) =>
                setSelectedId(open ? screenshot.id : null)
              }
            >
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
                >
                  <div className="flex aspect-video items-center justify-center bg-muted">
                    <div className="text-center">
                      <Monitor className="mx-auto h-10 w-10 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                      <span className="mt-2 block text-xs text-muted-foreground">
                        Screenshot coming soon
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-muted-foreground">
                      {screenshot.caption}
                    </p>
                  </div>
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{screenshot.caption}</DialogTitle>
                </DialogHeader>
                <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                  <div className="text-center">
                    <Monitor className="mx-auto h-16 w-16 text-muted-foreground/50" />
                    <span className="mt-3 block text-sm text-muted-foreground">
                      Screenshot coming soon
                    </span>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ))}
        </div>
      </div>
    </section>
  )
}
