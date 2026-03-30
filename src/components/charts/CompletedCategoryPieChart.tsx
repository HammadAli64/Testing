"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartMount } from "@/components/charts/ChartMount";

type Item = {
  label: string;
  value: number;
  percent: number;
  color: string;
};

export function CompletedCategoryPieChart({ data }: { data: Item[] }) {
  const hasData = data.some((d) => d.value > 0);
  const visible = hasData ? data.filter((d) => d.value > 0) : data.slice(0, 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="w-full min-w-0">
      <ChartMount height={288}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288}>
          <PieChart>
            <Pie
              data={visible}
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={102}
              dataKey="value"
              stroke="none"
              paddingAngle={4}
            >
              {visible.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={hasData ? entry.color : "#71717a"}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid rgb(228 228 231)",
                fontSize: "12px",
              }}
              formatter={(value, name, item) => {
                const pct = (item?.payload?.percent ?? 0) as number;
                return [`${value ?? 0} (${pct}%)`, `${name}`];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </ChartMount>
      <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:text-sm">
        {data.map((item) => (
          <p
            key={item.label}
            className="flex min-w-0 items-center justify-between gap-2 text-zinc-700 dark:text-zinc-300"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="shrink-0 font-semibold">
              {item.percent}% ({item.value})
            </span>
          </p>
        ))}
      </div>
      <p className="mt-2 text-center text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        Total completed: {total}
      </p>
    </div>
  );
}
