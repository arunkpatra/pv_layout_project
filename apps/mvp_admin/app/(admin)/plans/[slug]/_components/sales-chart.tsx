"use client"

import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@solarlayout/ui/components/chart"

import type { SalesDataPoint } from "@/lib/api"

const chartConfig = {
  revenueUsd: {
    label: "Revenue (USD)",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function SalesChart({ data }: { data: SalesDataPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="revenue"
          orientation="left"
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          yAxisId="revenue"
          dataKey="revenueUsd"
          fill="var(--color-revenueUsd)"
          radius={[2, 2, 0, 0]}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
