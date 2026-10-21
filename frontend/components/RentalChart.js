"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { peso, pesoWhole } from "@/lib/format";
import { useChartColors } from "@/lib/useChartColors";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-lg">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-900">{peso(payload[0].value)}</p>
    </div>
  );
}

/**
 * "Rental income · last 6 months" — solid green columns, light horizontal grid.
 * Same type/tooltip/grid treatment as the gym's revenue area chart so both
 * sides of the product read as one design system.
 */
export default function RentalChart({ data = [], height = 260 }) {
  const c = useChartColors();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: c.tick, fontSize: 12 }}
          dy={10}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          width={54}
          tick={{ fill: c.tick, fontSize: 11 }}
          tickFormatter={(v) => pesoWhole(v).replace(".00", "")}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: c.cursor }}
        />
        <Bar
          dataKey="amount"
          fill={c.line}
          radius={[5, 5, 0, 0]}
          maxBarSize={44}
          // Animation off: a container resize mid-tween leaves the bars
          // bunched at the old layout. Static geometry is always correct.
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
