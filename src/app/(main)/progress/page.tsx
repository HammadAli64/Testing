"use client";

import { DailyCompletionChart } from "@/components/charts/DailyCompletionChart";
import { WeeklyBarsChart } from "@/components/charts/WeeklyBarsChart";
import { TopBar } from "@/components/layout/TopBar";
import { CATEGORY_LABELS } from "@/lib/mock-data";
import { useAppState } from "@/context/AppStateProvider";
import { useEffect, useMemo, useState } from "react";
import { fetchCoach } from "@/lib/coach-api";

export default function ProgressPage() {
  const { progress, bestCategory, lowCategory, userId, dateKey, simStreak } = useAppState();
  const [historyCompleted, setHistoryCompleted] = useState<number>(0);

  useEffect(() => {
    if (!userId) return;
    fetchCoach(
      `/api/coach/history?userId=${encodeURIComponent(userId)}&days=120&asOf=${encodeURIComponent(dateKey)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { ok?: boolean; days?: { completed?: unknown[] }[] } | null) => {
        if (!json?.ok || !Array.isArray(json.days)) return;
        const total = json.days.reduce(
          (sum, d) => sum + (Array.isArray(d.completed) ? d.completed.length : 0),
          0,
        );
        setHistoryCompleted(total);
      })
      .catch(() => null);
  }, [userId, dateKey]);

  const totalCompleted = useMemo(() => {
    const fromProgress = progress?.totals.totalCompleted ?? 0;
    return Math.max(fromProgress, historyCompleted);
  }, [progress?.totals.totalCompleted, historyCompleted]);
  const streak = Math.max(progress?.streak ?? 0, simStreak);

  const consistencyScore = progress?.daily?.length
    ? Math.round(
        progress.daily.reduce((sum, d) => sum + (d.rate ?? 0), 0) /
          progress.daily.length,
      )
    : 0;

  const headline = bestCategory
    ? `Your momentum is in ${CATEGORY_LABELS[bestCategory]}`
    : "Building momentum from your history";
  const focusNext = lowCategory
    ? `Next, strengthen ${CATEGORY_LABELS[lowCategory]} with one repeatable habit.`
    : "Next, pick one repeatable habit and do it daily.";

  return (
    <>
      <TopBar
        title="Progress & analytics"
        subtitle="Rates, totals, and your coach insights (live)"
      />
      <div className="space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Total completed"
            value={totalCompleted.toLocaleString()}
            hint="From stored completed tasks"
          />
          <Stat
            label="Best category"
            value={bestCategory ? CATEGORY_LABELS[bestCategory] : "—"}
            hint="AI / history-based selection"
          />
          <Stat
            label="Consistency score"
            value={`${consistencyScore}%`}
            hint="Average completion rate (last 14 days)"
          />
          <Stat
            label="Streak (days)"
            value={`${streak}`}
            hint="Consecutive days with at least 1 completed task"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Daily completion rate
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Last 14 days (live)
            </p>
            <div className="mt-4">
              <DailyCompletionChart data={progress?.daily ?? []} />
            </div>
          </section>
          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Weekly progress
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Weekly buckets (live)
            </p>
            <div className="mt-4">
              <WeeklyBarsChart data={progress?.weekly ?? []} />
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-white to-zinc-50 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900/80">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Weekly report (bonus)
          </p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {headline}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Updated from your stored history.
          </p>
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
            {focusNext}
          </p>
          <div className="mt-5 rounded-xl border border-violet-200/60 bg-violet-50/60 p-4 text-sm dark:border-violet-900/40 dark:bg-violet-950/30">
            <span className="font-semibold text-violet-900 dark:text-violet-300">
              Focus:
            </span>{" "}
            {focusNext}
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">{hint}</p>
    </div>
  );
}
