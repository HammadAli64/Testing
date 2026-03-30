"use client";

import { AIFeedback } from "@/components/dashboard/AIFeedback";
import { CompletedCategoryPieChart } from "@/components/charts/CompletedCategoryPieChart";
import { DailyCompletionChart } from "@/components/charts/DailyCompletionChart";
import { WeeklyBarsChart } from "@/components/charts/WeeklyBarsChart";
import { ChallengeCard } from "@/components/dashboard/ChallengeCard";
import { SkeletonProgress } from "@/components/dashboard/SkeletonProgress";
import { CategoryScoreGrid, StatCards } from "@/components/dashboard/StatCards";
import { TopBar } from "@/components/layout/TopBar";
import { useAppState } from "@/context/AppStateProvider";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/mock-data";
import { PERSONALITY_LABELS } from "@/lib/personality";
import { getUnlockPartByIndex } from "@/lib/skeleton-unlocks";
import { useEffect, useMemo, useState } from "react";
import { MOOD_OPTIONS } from "@/lib/mood-challenges";
import type { MoodId } from "@/types";

export function DashboardHome() {
  const {
    todayChallenges,
    completedIds,
    dailyProgressPercent,
    todayPointsEarned,
    personality,
    dailyQuote,
    planLoading,
    planError,
    bestCategory,
    lowCategory,
    progress,
    advanceDay,
    mood,
    setMood,
    reloadChallenges,
    dateKey,
    simStreak,
  } = useAppState();
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "incomplete"
  >("incomplete");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    // Defer so we don't trip the "setState in effect" lint rule.
    const id = window.setTimeout(() => setStatusFilter("incomplete"), 0);
    return () => window.clearTimeout(id);
  }, [dateKey]);

  useEffect(() => {
    const id = window.setTimeout(() => setCategoryFilter("all"), 0);
    return () => window.clearTimeout(id);
  }, [dateKey]);

  const totalPointsDisplay = progress?.lifetimePoints ?? todayPointsEarned;
  const completedCount = useMemo(
    () => todayChallenges.filter((c) => completedIds.has(c.id)).length,
    [todayChallenges, completedIds],
  );
  const filteredChallenges = useMemo(() => {
    let items = todayChallenges;
    if (categoryFilter !== "all") {
      items = items.filter(
        (c) => (c.customCategory?.trim() || c.category) === categoryFilter,
      );
    }
    if (statusFilter === "completed") {
      return items.filter((c) => completedIds.has(c.id));
    }
    if (statusFilter === "incomplete") {
      return items.filter((c) => !completedIds.has(c.id));
    }
    return items;
  }, [todayChallenges, completedIds, statusFilter, categoryFilter]);
  const unlockPartByTaskId = useMemo(
    () =>
      Object.fromEntries(
        todayChallenges.map((c, i) => [c.id, c.bodyPart ?? getUnlockPartByIndex(i)]),
      ),
    [todayChallenges],
  );
  const taskUnlockParts = useMemo(
    () => todayChallenges.map((c) => unlockPartByTaskId[c.id]),
    [todayChallenges, unlockPartByTaskId],
  );
  const unlockedParts = useMemo(
    () =>
      todayChallenges
        .filter((c) => completedIds.has(c.id))
        .map((c) => unlockPartByTaskId[c.id]),
    [todayChallenges, completedIds, unlockPartByTaskId],
  );
  const completedCategoryData = useMemo(() => {
    const colorMap: Record<(typeof CATEGORY_ORDER)[number], string> = {
      business: "#4f46e5",
      motivation: "#f59e0b",
      power: "#f43f5e",
      freedom: "#06b6d4",
      money: "#10b981",
      grooming: "#a855f7",
    };
    const counts = new Map<(typeof CATEGORY_ORDER)[number], number>();
    todayChallenges.forEach((task) => {
      if (!completedIds.has(task.id)) return;
      counts.set(task.category, (counts.get(task.category) ?? 0) + 1);
    });
    const totalCompleted = Array.from(counts.values()).reduce(
      (sum, val) => sum + val,
      0,
    );
    return CATEGORY_ORDER.map((id) => {
      const value = counts.get(id) ?? 0;
      const percent =
        totalCompleted > 0 ? Math.round((value / totalCompleted) * 100) : 0;
      return {
        label: CATEGORY_LABELS[id],
        value,
        percent,
        color: colorMap[id],
      };
    });
  }, [todayChallenges, completedIds]);

  const categoryScores = useMemo(() => {
    if (!progress?.categoryScores) return [];
    return progress.categoryScores.map((c) => ({
      category: c.category,
      label: CATEGORY_LABELS[c.category],
      score: c.score,
    }));
  }, [progress]);
  const categoryFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [{ id: "all", label: "All categories" }];
    for (const id of CATEGORY_ORDER) {
      out.push({ id, label: CATEGORY_LABELS[id] });
      seen.add(id);
    }
    for (const c of todayChallenges) {
      const k = c.customCategory?.trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ id: k, label: k });
    }
    return out;
  }, [todayChallenges]);

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle={`${PERSONALITY_LABELS[personality]} mode`}
      />
      <div className="space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        <div className="rounded-2xl border border-cyan-300/35 bg-cyan-400/10 p-4 shadow-[0_0_20px_rgba(49,243,255,0.12)]">
          <p className="mb-3 text-sm font-medium leading-relaxed text-cyan-50">
            Select a mood to see challenges framed in that style—order and tone follow
            what you pick.
          </p>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-cyan-100">
              Mood (dominant)
            </span>
            <span className="text-xs text-cyan-200/80">Shapes today&apos;s challenge vibe</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((m) => {
              const active = mood === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMood(m.id as MoodId)}
                  className={
                    active
                      ? "rounded-full border border-cyan-200/80 bg-cyan-300/20 px-4 py-2 text-sm font-semibold text-cyan-50"
                      : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-[#111a32] dark:text-zinc-200 dark:hover:bg-[#1a274a]"
                  }
                  title={m.description}
                >
                  {m.emoji} {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={advanceDay}
            className="rounded-xl border border-cyan-300/35 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-[0_0_18px_rgba(49,243,255,0.18)] hover:bg-cyan-400/15"
          >
            Next day
          </button>
        </div>
        <AIFeedback quote={dailyQuote} />

        <StatCards
          dailyProgressPercent={dailyProgressPercent}
          categoryScores={categoryScores}
          totalPointsDisplay={totalPointsDisplay}
          bestCategory={bestCategory}
          lowCategory={lowCategory}
          streak={Math.max(progress?.streak ?? 0, simStreak)}
        />
        <section className="anim-fade-up anim-delay-1">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Luxury analytics
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Colorful trend charts for completion momentum and weekly pulse.
              </p>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <section className="hover-lift rounded-2xl border border-fuchsia-300/45 bg-gradient-to-br from-fuchsia-500/25 via-violet-500/20 to-cyan-400/20 p-5 shadow-[0_0_28px_rgba(217,70,239,0.24)] dark:border-fuchsia-400/35 dark:from-fuchsia-500/22 dark:via-violet-500/18 dark:to-cyan-300/16">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Daily completion flow
              </h3>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                Last 14 days completion curve.
              </p>
              <div className="mt-3">
                <DailyCompletionChart data={progress?.daily ?? []} />
              </div>
            </section>
            <section className="hover-lift rounded-2xl border border-cyan-300/45 bg-gradient-to-br from-cyan-400/24 via-violet-500/18 to-[#be9e4b]/16 p-5 shadow-[0_0_28px_rgba(49,243,255,0.2)] dark:border-cyan-300/35 dark:from-cyan-300/20 dark:via-violet-500/16 dark:to-[#be9e4b]/15">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Weekly consistency bars
              </h3>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                Mock weekly progress buckets with premium styling.
              </p>
              <div className="mt-3">
                <WeeklyBarsChart data={progress?.weekly ?? []} />
              </div>
            </section>
            <section className="hover-lift rounded-2xl border border-cyan-300/45 bg-gradient-to-br from-cyan-400/24 via-violet-500/18 to-[#be9e4b]/16 p-5 shadow-[0_0_28px_rgba(49,243,255,0.2)] dark:border-cyan-300/35 dark:from-cyan-300/20 dark:via-violet-500/16 dark:to-[#be9e4b]/15">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Completed by category
              </h3>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                Category completion share and percentage for today.
              </p>
              <div className="mt-3">
                <CompletedCategoryPieChart data={completedCategoryData} />
              </div>
            </section>
          </div>
        </section>
        <SkeletonProgress
          completedTasks={completedCount}
          totalTasks={todayChallenges.length}
          taskUnlockParts={taskUnlockParts}
          unlockedParts={unlockedParts}
          planError={planError}
        />

        <section className="anim-fade-up anim-delay-1">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Today&apos;s challenges
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {planLoading
                  ? "Generating today&apos;s AI challenges..."
                  : planError
                    ? `AI generation failed: ${planError}`
                    : `${todayChallenges.length} tasks · complete to build streak & points`}
              </p>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Earned today:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {todayPointsEarned} pts
              </span>
            </p>
          </div>
          <div className="mb-4">
            <button
              type="button"
              onClick={() => {
                void reloadChallenges();
              }}
              disabled={planLoading}
              className="rounded-lg border border-cyan-300/60 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-400/40 dark:text-cyan-200"
            >
              {planLoading ? "Reloading..." : "Reload challenges"}
            </button>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FilterDropdown
              label={
                categoryFilter === "all"
                  ? "All categories"
                  : (categoryFilterOptions.find((x) => x.id === categoryFilter)?.label ??
                    categoryFilter)
              }
              options={categoryFilterOptions}
              onSelect={(id) => setCategoryFilter(id)}
            />
            <FilterDropdown
              label={
                statusFilter === "all"
                  ? "All tasks"
                  : statusFilter === "completed"
                    ? "Completed"
                    : "Incomplete"
              }
              options={[
                { id: "all", label: "All tasks" },
                { id: "completed", label: "Completed" },
                { id: "incomplete", label: "Incomplete" },
              ]}
              onSelect={(id) =>
                setStatusFilter(id as "all" | "completed" | "incomplete")
              }
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredChallenges.map((c) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                completed={completedIds.has(c.id)}
                unlockPartLabel={unlockPartByTaskId[c.id]}
                detailHref={`/challenge/${encodeURIComponent(c.id)}?date=${encodeURIComponent(dateKey)}`}
              />
            ))}
          </div>
          {filteredChallenges.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              No challenges in this status.
            </p>
          ) : null}
        </section>

        <section className="anim-fade-up anim-delay-2">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Category scores
          </h2>
          <CategoryScoreGrid scores={categoryScores} />
        </section>
      </div>
    </>
  );
}

function FilterDropdown({
  label,
  options,
  onSelect,
}: {
  label: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-cyan-300/65 bg-cyan-400/15 px-3 py-2 text-sm font-semibold text-cyan-100 shadow-[0_0_16px_rgba(49,243,255,0.2)]"
      >
        <span>{label}</span>
        <span className="text-cyan-200">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-cyan-300/55 bg-[#06172d] shadow-[0_0_20px_rgba(49,243,255,0.22)]">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onSelect(opt.id);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-cyan-100 transition hover:bg-cyan-400/20"
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
