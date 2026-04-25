"use client"

import {
  ComposedChart,
  Bar,
  Line,
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
} from "@renewable-energy/ui/components/chart"
import type { SalesDataPoint } from "@/lib/api"

const chartConfig = {
  revenueUsd: {
    label: "Revenue (USD)",
    color: "hsl(var(--chart-1))",
  },
  purchaseCount: {
    label: "Purchases",
    color: "hsl(var(--chart-2))",
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
        <YAxis
          yAxisId="count"
          orientation="right"
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
        <Line
          yAxisId="count"
          type="monotone"
          dataKey="purchaseCount"
          stroke="var(--color-purchaseCount)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
