"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartMount } from "@/components/charts/ChartMount";

export function MonthlyCompletionChart({
  data,
}: {
  data: { month: string; rate: number }[];
}) {
  return (
    <div className="w-full min-w-0">
      <ChartMount height={288}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-zinc-200 dark:stroke-zinc-800"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-zinc-500"
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
            formatter={(value) => [`${value ?? 0}%`, "Avg completion"]}
          />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
        </ResponsiveContainer>
      </ChartMount>
    </div>
  );
}
