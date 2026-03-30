"use client";

import { ChallengeCard } from "@/components/dashboard/ChallengeCard";
import { TopBar } from "@/components/layout/TopBar";
import { useAppState } from "@/context/AppStateProvider";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  categoryAccent,
} from "@/lib/mock-data";
import { getUnlockPartByIndex } from "@/lib/skeleton-unlocks";
import type { CategoryId } from "@/types";
import { useMemo, useState } from "react";

export default function MockModePage() {
  const { todayChallenges, completedIds, dateKey, planLoading, planError } =
    useAppState();
  const [filter, setFilter] = useState<CategoryId | "all">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "incomplete"
  >("all");

  const filtered = useMemo(() => {
    let list = todayChallenges;
    if (filter !== "all") {
      list = list.filter((c) => c.category === filter);
    }
    if (statusFilter === "completed") {
      list = list.filter((c) => completedIds.has(c.id));
    } else if (statusFilter === "incomplete") {
      list = list.filter((c) => !completedIds.has(c.id));
    }
    return list;
  }, [todayChallenges, filter, statusFilter, completedIds]);
  const unlockPartByTaskId = useMemo(
    () =>
      Object.fromEntries(
        todayChallenges.map((c, i) => [c.id, c.bodyPart ?? getUnlockPartByIndex(i)]),
      ),
    [todayChallenges],
  );

  return (
    <>
      <TopBar
        title="Mock Mode"
        subtitle="Run today’s list with filters"
      />
      <div className="space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        {planLoading ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Generating today&apos;s AI challenges...
          </p>
        ) : null}
        {planError ? (
          <div className="rounded-xl border border-rose-300/50 bg-rose-500/10 p-3 text-sm text-rose-200">
            AI generation failed: {planError}
          </div>
        ) : null}
        <div className="space-y-4">
          <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">
            Filter mirrors the production category system. Completion state is
            shared with the dashboard (local demo persistence).
          </p>
          <div className="flex flex-wrap gap-2">
            <FilterPill
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="All"
            />
            {CATEGORY_ORDER.map((id) => {
              const a = categoryAccent[id];
              return (
                <FilterPill
                  key={id}
                  active={filter === id}
                  onClick={() => setFilter(id)}
                  label={CATEGORY_LABELS[id]}
                  className={`${a.bg} ${a.text} ${a.ring}`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterPill
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              label="All status"
              className="border-yellow-400/70 bg-yellow-300/20 text-yellow-800 ring-yellow-400/30 dark:text-yellow-300"
            />
            <FilterPill
              active={statusFilter === "completed"}
              onClick={() => setStatusFilter("completed")}
              label="Completed"
              className="border-green-500/70 bg-green-500/20 text-green-700 ring-green-500/30 dark:text-green-300"
            />
            <FilterPill
              active={statusFilter === "incomplete"}
              onClick={() => setStatusFilter("incomplete")}
              label="Incomplete"
              className="border-red-500/70 bg-red-500/20 text-red-700 ring-red-500/30 dark:text-red-300"
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              completed={completedIds.has(c.id)}
              unlockPartLabel={unlockPartByTaskId[c.id]}
              detailHref={`/challenge/${encodeURIComponent(c.id)}?date=${encodeURIComponent(dateKey)}`}
            />
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-500">
              {todayChallenges.length === 0
                ? "No challenges available for today."
                : "No tasks match the selected filters."}
            </p>
            {todayChallenges.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setStatusFilter("all");
                }}
                className="rounded-lg border border-zinc-300/60 bg-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/15"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-sm font-semibold tracking-normal transition hover:-translate-y-0.5 ${
        className
          ? active
            ? `ring-1 opacity-100 ${className}`
            : `opacity-100 hover:brightness-110 ${className}`
          : active
            ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );
}
