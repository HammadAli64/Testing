"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartMount } from "@/components/charts/ChartMount";

export function CompletionSplitPieChart({
  completed,
  missed,
}: {
  completed: number;
  missed: number;
}) {
  const total = completed + missed;
  const data = [
    { name: "Completed", value: completed, color: "#10b981" },
    { name: "Missed", value: missed, color: "#f43f5e" },
  ];

  return (
    <div className="w-full min-w-0">
      <ChartMount height={288}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={96}
            dataKey="value"
            stroke="none"
            paddingAngle={4}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid rgb(228 228 231)",
              fontSize: "12px",
            }}
            formatter={(value, name) => [`${value ?? 0}`, `${name}`]}
          />
        </PieChart>
        </ResponsiveContainer>
      </ChartMount>
      <div className="mt-2 flex items-center justify-center gap-5 text-sm">
        <span className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Completed: <strong>{completed}</strong>
        </span>
        <span className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
          Missed: <strong>{missed}</strong>
        </span>
      </div>
      <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Total tasks: {total}
      </p>
    </div>
  );
}
