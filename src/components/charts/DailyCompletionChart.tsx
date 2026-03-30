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
import { ChartMount } from "@/components/charts/ChartMount";

export function DailyCompletionChart({
  data,
}: {
  data: { date: string; rate: number }[];
}) {
  return (
    <div className="w-full">
      <ChartMount height={288}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="fillRate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-zinc-200 dark:stroke-zinc-800"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#111111" }}
            className="text-black"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-zinc-500"
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid rgb(228 228 231)",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#111111", fontWeight: 600 }}
            itemStyle={{ color: "#111111" }}
            formatter={(value) => [
              `${value ?? 0}%`,
              "Completion",
            ]}
          />
          <Area
            type="monotone"
            dataKey="rate"
            stroke="#7c3aed"
            strokeWidth={2}
            fill="url(#fillRate)"
          />
        </AreaChart>
        </ResponsiveContainer>
      </ChartMount>
    </div>
  );
}
