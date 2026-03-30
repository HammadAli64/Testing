"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartMount } from "@/components/charts/ChartMount";

const BAR_COLORS = ["#8b5cf6", "#22d3ee", "#f43f5e", "#eab308"];

export function WeeklyBarsChart({
  data,
}: {
  data: { week: string; value: number }[];
}) {
  return (
    <div className="w-full">
      <ChartMount height={256}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-zinc-200 dark:stroke-zinc-800"
            vertical={false}
          />
          <XAxis
            dataKey="week"
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
            formatter={(value) => [`${value ?? 0}%`, "Progress"]}
          />
          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`${entry.week}-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
        </ResponsiveContainer>
      </ChartMount>
    </div>
  );
}
