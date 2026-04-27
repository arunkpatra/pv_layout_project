"use client"

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@renewable-energy/ui/components/chart"
import type { DashboardTrendPoint } from "@/lib/api"

const chartConfig = {
  purchases: {
    label: "Purchases",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

export function PurchaseTrendChart({ data }: { data: DashboardTrendPoint[] }) {
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
          yAxisId="purchases"
          orientation="left"
          tickFormatter={(v: number) => String(Math.round(v))}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          yAxisId="purchases"
          dataKey="purchases"
          fill="var(--color-purchases)"
          radius={[2, 2, 0, 0]}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
