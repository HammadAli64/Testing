"use client";

import { DailyCompletionChart } from "@/components/charts/DailyCompletionChart";
import { MonthlyCompletionChart } from "@/components/charts/MonthlyCompletionChart";
import { CompletionSplitPieChart } from "@/components/charts/CompletionSplitPieChart";
import { CategoryDistributionPieChart } from "@/components/charts/CategoryDistributionPieChart";
import { TopBar } from "@/components/layout/TopBar";
import { useAppState } from "@/context/AppStateProvider";
import { CATEGORY_LABELS, categoryAccent } from "@/lib/mock-data";
import { personalizeSummary } from "@/lib/personality";
import { cn } from "@/lib/utils";
import type { CategoryId } from "@/types";
import { useEffect, useMemo, useState } from "react";

export default function HistoryPage() {
  const { personality, progress, userId, dateKey } = useAppState();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "all">(
    "all",
  );
  const [days, setDays] = useState<
    {
      date: string;
      score: number;
      completed: { id: string; title: string; category: string }[];
      missed: { id: string; title: string; category: string }[];
      aiSummary?: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  type HistoryDayItem = {
    id: string;
    title: string;
    category: string;
  };
  type HistoryDay = {
    date: string;
    score: number;
    completed: HistoryDayItem[];
    missed: HistoryDayItem[];
    aiSummary?: string;
  };

  useEffect(() => {
    if (!userId) return;
    const baseUrl =
      process.env.NEXT_PUBLIC_COACH_API_BASE_URL ?? "http://localhost:8000";
    // Defer to avoid "setState in effect" lint rule.
    const t = window.setTimeout(() => {
      setLoading(true);
      setError("");
    }, 0);
    fetch(
      `${baseUrl}/api/coach/history?userId=${encodeURIComponent(userId)}&days=60&asOf=${encodeURIComponent(dateKey)}`,
    )
      .then((r) => r.json())
      .then((json: { ok: boolean; days?: HistoryDay[]; error?: string }) => {
        if (!json.ok) throw new Error(json.error || "Failed to load history");
        setDays(Array.isArray(json.days) ? json.days : []);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setDays([]);
      })
      .finally(() => setLoading(false));
    return () => window.clearTimeout(t);
  }, [userId, dateKey]);

  const filteredDays = useMemo(() => {
    let out = days;
    if (selectedDate) {
      out = out.filter((d) => d.date === selectedDate);
    }
    if (categoryFilter !== "all") {
      out = out
        .map((d) => ({
          ...d,
          completed: d.completed.filter((c) => c.category === categoryFilter),
          missed: d.missed.filter((c) => c.category === categoryFilter),
        }))
        .filter((d) => d.completed.length > 0 || d.missed.length > 0);
    }
    return out;
  }, [selectedDate, categoryFilter, days]);

  const selectedDay = useMemo(() => {
    if (!selectedDate) return null;
    return filteredDays.find((d) => d.date === selectedDate) ?? null;
  }, [filteredDays, selectedDate]);

  const completionSplit = useMemo(() => {
    const source = selectedDay ? [selectedDay] : filteredDays;
    return source.reduce(
      (acc, day) => {
        acc.completed += day.completed.length;
        acc.missed += day.missed.length;
        return acc;
      },
      { completed: 0, missed: 0 },
    );
  }, [filteredDays, selectedDay]);

  const categoryDistribution = useMemo(() => {
    const source = selectedDay ? [selectedDay] : filteredDays;
    const map = new Map<CategoryId, number>();

    source.forEach((day) => {
      day.completed.forEach((task) => {
        map.set(task.category, (map.get(task.category) ?? 0) + 1);
      });
      day.missed.forEach((task) => {
        map.set(task.category, (map.get(task.category) ?? 0) + 1);
      });
    });

    return (Object.keys(CATEGORY_LABELS) as CategoryId[]).map((id) => ({
      category: id,
      label: CATEGORY_LABELS[id],
      value: map.get(id) ?? 0,
    }));
  }, [filteredDays, selectedDay]);

  return (
    <>
      <TopBar
        title="History"
        subtitle="Past days from your stored completions"
      />
      <div className="space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        {loading ? (
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300">
            Loading history…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 p-5 text-sm text-rose-900 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        ) : null}
        {!loading && !error && filteredDays.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300">
            No history yet. Complete a few challenges and come back.
          </div>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-4">
          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Daily completion (14 days)
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Last 14 days (live).
            </p>
            <div className="mt-4">
              <DailyCompletionChart data={progress?.daily ?? []} />
            </div>
          </section>
          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Monthly overview
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Rolling monthly average completion % (live).
            </p>
            <div className="mt-4">
              <MonthlyCompletionChart data={progress?.monthly ?? []} />
            </div>
          </section>
          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Completion split
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {selectedDay
                ? `Selected day: ${selectedDay.date}`
                : "All visible days by current filters."}
            </p>
            <div className="mt-4">
              <CompletionSplitPieChart
                completed={completionSplit.completed}
                missed={completionSplit.missed}
              />
            </div>
          </section>
          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Category distribution
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {selectedDay
                ? `Category share for ${selectedDay.date}`
                : "Task counts across visible days."}
            </p>
            <div className="mt-4">
              <CategoryDistributionPieChart data={categoryDistribution} />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Day history
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select a date to view that day&apos;s completed and missed challenges
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="date-input-colorful w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base font-medium dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:w-auto"
            />
            <button
              type="button"
              onClick={() => setSelectedDate("")}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 sm:w-auto"
            >
              All dates
            </button>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as CategoryId | "all")
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:w-auto"
            >
              <option value="all">All categories</option>
              {(Object.keys(CATEGORY_LABELS) as CategoryId[]).map((id) => (
                <option key={id} value={id}>
                  {CATEGORY_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedDay ? (
          <section className="rounded-2xl border border-indigo-200/60 bg-indigo-50/50 p-5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              Selected day progress
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                {selectedDay.date}
              </p>
              <p className="text-emerald-700 dark:text-emerald-400">
                Completed: {selectedDay.completed.length}
              </p>
              <p className="text-rose-700 dark:text-rose-400">
                Missed: {selectedDay.missed.length}
              </p>
              <p className="text-zinc-700 dark:text-zinc-300">
                Score: {selectedDay.score}/100
              </p>
            </div>
          </section>
        ) : null}

        <div className="space-y-4">
          {filteredDays.map((day) => (
            <article
              key={day.date}
              className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {day.date}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Score:{" "}
                    <span className="tabular-nums">{day.score}</span>
                    <span className="text-sm font-normal text-zinc-500">
                      /100
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Completed ({day.completed.length})
                  </p>
                  <ul className="mt-2 space-y-2">
                    {day.completed.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start justify-between gap-2 rounded-xl bg-emerald-50/80 px-3 py-2 text-sm dark:bg-emerald-950/30"
                      >
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {c.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ring-1",
                            (categoryAccent as Record<string, { bg: string; text: string; ring: string }>)[
                              c.category
                            ]?.bg ?? "bg-zinc-500/10",
                            (categoryAccent as Record<string, { bg: string; text: string; ring: string }>)[
                              c.category
                            ]?.text ?? "text-zinc-700 dark:text-zinc-300",
                            (categoryAccent as Record<string, { bg: string; text: string; ring: string }>)[
                              c.category
                            ]?.ring ?? "ring-zinc-500/20",
                          )}
                        >
                          {(CATEGORY_LABELS as Record<string, string>)[c.category] ?? c.category}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium text-rose-700 dark:text-rose-400">
                    Missed ({day.missed.length})
                  </p>
                  <ul className="mt-2 space-y-2">
                    {day.missed.length === 0 ? (
                      <li className="text-sm text-zinc-500">None — clean day.</li>
                    ) : (
                      day.missed.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-start justify-between gap-2 rounded-xl bg-rose-50/80 px-3 py-2 text-sm dark:bg-rose-950/30"
                        >
                          <span className="text-zinc-800 dark:text-zinc-200">
                            {c.title}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ring-1",
                              (categoryAccent as Record<string, { bg: string; text: string; ring: string }>)[
                                c.category
                              ]?.bg ?? "bg-zinc-500/10",
                              (categoryAccent as Record<string, { bg: string; text: string; ring: string }>)[
                                c.category
                              ]?.text ?? "text-zinc-700 dark:text-zinc-300",
                              (categoryAccent as Record<string, { bg: string; text: string; ring: string }>)[
                                c.category
                              ]?.ring ?? "ring-zinc-500/20",
                            )}
                          >
                            {(CATEGORY_LABELS as Record<string, string>)[c.category] ?? c.category}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-violet-200/60 bg-violet-50/60 p-4 text-sm leading-relaxed text-zinc-800 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-zinc-200">
                <span className="font-semibold text-violet-900 dark:text-violet-300">
                  Coach summary:{" "}
                </span>
                {personalizeSummary(day.aiSummary, personality)}
              </div>
            </article>
          ))}
        </div>

        {filteredDays.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No days match these filters.
          </p>
        ) : null}
      </div>
    </>
  );
}
