"use client"

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@solarlayout/ui/components/chart"
import type { DashboardTrendPoint } from "@/lib/api"

const chartConfig = {
  calculations: {
    label: "Calculations",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

export function CalculationTrendChart({
  data,
}: {
  data: DashboardTrendPoint[]
}) {
  return (
    <ChartContainer config={chartConfig} className="h-48 w-full">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="calculations"
          orientation="left"
          tickFormatter={(v: number) => String(Math.round(v))}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          yAxisId="calculations"
          dataKey="calculations"
          fill="var(--color-calculations)"
          radius={[2, 2, 0, 0]}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
