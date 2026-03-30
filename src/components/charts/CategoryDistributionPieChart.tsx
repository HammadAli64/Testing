"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartMount } from "@/components/charts/ChartMount";
import type { CategoryId } from "@/types";

const CATEGORY_COLORS: Record<CategoryId, string> = {
  business: "#6366f1",
  motivation: "#f59e0b",
  power: "#f43f5e",
  freedom: "#06b6d4",
  money: "#10b981",
  grooming: "#d946ef",
};

export function CategoryDistributionPieChart({
  data,
}: {
  data: { category: CategoryId; label: string; value: number }[];
}) {
  const hasData = data.some((d) => d.value > 0);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const fallback: { category: CategoryId; label: string; value: number }[] = [
    { category: "business", label: "No data", value: 1 },
  ];
  const pieData = hasData ? data : fallback;

  return (
    <div className="w-full min-w-0">
      <ChartMount height={288}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={288}
        >
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={96}
              dataKey="value"
              stroke="none"
              paddingAngle={3}
            >
              {pieData.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={CATEGORY_COLORS[entry.category]}
                />
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
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {data.map((item) => (
          <span
            key={item.category}
            className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
            />
            {item.label}: <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Total tasks: {total}
      </p>
    </div>
  );
}
