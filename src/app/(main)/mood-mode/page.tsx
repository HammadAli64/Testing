"use client";

import { useMemo, useState } from "react";
import { ChallengeCard } from "@/components/dashboard/ChallengeCard";
import { TopBar } from "@/components/layout/TopBar";
import { useAppState } from "@/context/AppStateProvider";
import {
  buildMoodChallenges,
  getMoodHint,
  MOOD_OPTIONS,
} from "@/lib/mood-challenges";
import type { MoodId } from "@/types";

export default function MoodModePage() {
  const { todayChallenges, completedIds, dateKey } = useAppState();
  const [mood, setMood] = useState<MoodId>("motivational");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "incomplete"
  >("all");

  const moodChallenges = useMemo(
    () => buildMoodChallenges(todayChallenges, mood, 6),
    [todayChallenges, mood],
  );

  const visibleChallenges = useMemo(() => {
    if (statusFilter === "all") return moodChallenges;
    if (statusFilter === "completed") {
      return moodChallenges.filter((c) => completedIds.has(c.id));
    }
    return moodChallenges.filter((c) => !completedIds.has(c.id));
  }, [statusFilter, moodChallenges, completedIds]);

  const completedCount = moodChallenges.filter((c) =>
    completedIds.has(c.id),
  ).length;

  return (
    <>
      <TopBar
        title="Mood Mode"
        subtitle="Select current mood and get responsive challenge suggestions"
      />
      <div className="space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        <section className="cyber-surface rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            How it works
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Pick how you feel right now. Challenges adapt to your current state:
            low-energy moods prioritize lighter recovery tasks, while
            high-energy moods prioritize harder fitness/productivity actions.
          </p>
          <p className="mt-2 text-sm font-medium text-cyan-700 dark:text-cyan-300">
            {getMoodHint(mood)}
          </p>
        </section>

        <section>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Select current mood
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MOOD_OPTIONS.map((m) => {
              const active = m.id === mood;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMood(m.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-cyan-300/60 bg-cyan-50/80 dark:border-cyan-400/50 dark:bg-cyan-950/25"
                      : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-[#0f1830]/70 dark:hover:bg-[#162449]"
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {m.emoji} {m.label}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    {m.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Suggested tasks:{" "}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {moodChallenges.length}
            </span>{" "}
            • Completed:{" "}
            <span className="font-semibold text-emerald-600 dark:text-emerald-300">
              {completedCount}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusPill
              label="All"
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              tone="yellow"
            />
            <StatusPill
              label="Completed"
              active={statusFilter === "completed"}
              onClick={() => setStatusFilter("completed")}
              tone="green"
            />
            <StatusPill
              label="Incomplete"
              active={statusFilter === "incomplete"}
              onClick={() => setStatusFilter("incomplete")}
              tone="red"
            />
          </div>
        </section>

        <section>
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleChallenges.map((c) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                completed={completedIds.has(c.id)}
                detailHref={`/challenge/${encodeURIComponent(c.id)}?date=${encodeURIComponent(dateKey)}`}
              />
            ))}
          </div>
          {visibleChallenges.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              No tasks match this status filter.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

function StatusPill({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "yellow" | "green" | "red";
}) {
  const activeToneClass =
    tone === "green"
      ? "border-green-500/70 bg-green-500/20 text-green-700 dark:text-green-300"
      : tone === "red"
        ? "border-red-500/70 bg-red-500/20 text-red-700 dark:text-red-300"
        : "border-yellow-400/70 bg-yellow-300/20 text-yellow-800 dark:text-yellow-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? activeToneClass
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-[#111a32] dark:text-zinc-200 dark:hover:bg-[#1a274a]"
      }`}
    >
      {label}
    </button>
  );
}
