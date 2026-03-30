"use client";

import { CATEGORY_LABELS } from "@/lib/mock-data";
import type { CategoryId, CategoryScore } from "@/types";
import { cn } from "@/lib/utils";

export function StatCards({
  dailyProgressPercent,
  categoryScores,
  totalPointsDisplay,
  bestCategory,
  lowCategory,
  streak,
}: {
  dailyProgressPercent: number;
  categoryScores: CategoryScore[];
  totalPointsDisplay: number;
  bestCategory: CategoryId | null;
  lowCategory: CategoryId | null;
  streak: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="anim-fade-up hover-lift rounded-2xl border border-cyan-300/28 bg-gradient-to-br from-[#061b2a]/96 via-[#081a31]/95 to-[#1a1434]/94 p-5 shadow-[0_0_20px_rgba(49,243,255,0.16)] dark:border-cyan-300/30 dark:from-[#061724]/96 dark:via-[#0a1a32]/95 dark:to-[#171332]/94">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Today&apos;s progress
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
          {dailyProgressPercent}%
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#be9e4b] to-cyan-400 transition-[width] duration-500 dark:shadow-[0_0_12px_rgba(49,243,255,0.35)]"
            style={{ width: `${dailyProgressPercent}%` }}
          />
        </div>
      </div>
      <div className="anim-fade-up anim-delay-1 hover-lift rounded-2xl border border-violet-300/28 bg-gradient-to-br from-[#1a0f2f]/96 via-[#1b1336]/95 to-[#101b30]/94 p-5 shadow-[0_0_20px_rgba(168,85,247,0.16)] dark:border-violet-300/30 dark:from-[#170f2b]/96 dark:via-[#1a1234]/95 dark:to-[#0f1a2f]/94">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Streak
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
          {streak}{" "}
          <span className="text-lg font-medium text-zinc-500">days</span>
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Generated from your completion history.
        </p>
      </div>
      <div className="anim-fade-up anim-delay-2 hover-lift rounded-2xl border border-[#be9e4b]/36 bg-gradient-to-br from-[#2a1f0d]/96 via-[#241c12]/95 to-[#2f150f]/94 p-5 shadow-[0_0_20px_rgba(190,158,75,0.2)] dark:border-[#be9e4b]/40 dark:from-[#281f10]/96 dark:via-[#231b12]/95 dark:to-[#2e160f]/94">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Lifetime points
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
          {totalPointsDisplay.toLocaleString()}
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Total points earned from all completed tasks.
        </p>
      </div>
      <div className="anim-fade-up anim-delay-3 hover-lift rounded-2xl border border-emerald-300/28 bg-gradient-to-br from-[#0f2a1f]/96 via-[#0f2530]/95 to-[#1a1433]/94 p-5 shadow-[0_0_20px_rgba(16,185,129,0.16)] dark:border-emerald-300/30 dark:from-[#0e261d]/96 dark:via-[#102330]/95 dark:to-[#181333]/94 sm:col-span-2 xl:col-span-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Category pulse
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-500/15 px-2 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300">
            Best:{" "}
            {bestCategory ? CATEGORY_LABELS[bestCategory] : "—"}
          </span>
          <span className="rounded-full bg-rose-500/15 px-2 py-1 font-semibold text-rose-700 ring-1 ring-rose-500/25 dark:text-rose-300">
            Low:{" "}
            {lowCategory ? CATEGORY_LABELS[lowCategory] : "—"}
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {categoryScores.slice(0, 3).map((c) => (
            <li
              key={c.category}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="truncate text-zinc-600 dark:text-zinc-300">
                {CATEGORY_LABELS[c.category]}
              </span>
              <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-50">
                {c.score}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CategoryScoreGrid({ scores }: { scores: CategoryScore[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {scores.map((c) => (
        <div
          key={c.category}
          className="anim-fade-up hover-lift rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/80"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {c.label}
            </p>
            <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {c.score}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={cn(
                "h-full rounded-full bg-[#be9e4b]",
              )}
              style={{ width: `${c.score}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
