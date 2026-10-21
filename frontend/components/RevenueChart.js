"use client";

import {
  Area,
  AreaChart,
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

export default function RevenueChart({ data = [] }) {
  const c = useChartColors();

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.line} stopOpacity={0.32} />
            <stop offset="100%" stopColor={c.line} stopOpacity={0.02} />
          </linearGradient>
        </defs>
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
          width={48}
          tick={{ fill: c.tick, fontSize: 11 }}
          tickFormatter={(v) => pesoWhole(v).replace(".00", "")}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ stroke: c.cursorStroke, strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={c.line}
          strokeWidth={2.5}
          fill="url(#revenueFill)"
          activeDot={{ r: 5, strokeWidth: 0, fill: c.line }}
          // Animation off: the container resizes while the API response lands,
          // which restarts the Recharts tween and leaves a half-drawn line.
          // Static geometry is always correct and renders instantly.
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
