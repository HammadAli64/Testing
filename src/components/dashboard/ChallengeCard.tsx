"use client";

import Link from "next/link";
import { categoryAccent, CATEGORY_LABELS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { Challenge } from "@/types";

type Props = {
  challenge: Challenge;
  completed: boolean;
  unlockPartLabel?: string;
  detailHref?: string;
};

export function ChallengeCard({
  challenge,
  completed,
  unlockPartLabel,
  detailHref,
}: Props) {
  const accent = categoryAccent[challenge.category];
  const displayTitle = formatCardTaskTitle(challenge.title);
  const categoryLabel = challenge.customCategory?.trim() || CATEGORY_LABELS[challenge.category];

  return (
    <div
      className={cn(
        "anim-fade-up hover-lift group relative flex flex-col rounded-2xl border bg-[#f2f7ff] p-5 shadow-sm transition hover:shadow-md dark:bg-[#132343]/90",
        completed
          ? "border-emerald-200/80 shadow-[0_0_0_1px_rgba(16,185,129,0.15),0_0_18px_rgba(16,185,129,0.2)] dark:border-emerald-700/50 dark:shadow-[0_0_0_1px_rgba(16,185,129,0.28),0_0_22px_rgba(16,185,129,0.25)]"
          : "border-zinc-200/80 shadow-[0_0_0_1px_rgba(6,182,212,0.08),0_0_14px_rgba(6,182,212,0.12)] dark:border-cyan-900/40 dark:shadow-[0_0_0_1px_rgba(6,182,212,0.25),0_0_18px_rgba(6,182,212,0.2)]",
      )}
    >
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1 rounded-l-2xl opacity-85",
          completed ? "bg-emerald-500" : "bg-[#be9e4b]",
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1",
                accent.bg,
                accent.text,
                accent.ring,
              )}
            >
              {categoryLabel}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold",
                completed
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
              )}
            >
              {completed ? "Completed" : "Incomplete"}
            </span>
            {challenge.isCustom ? (
              <span className="inline-flex items-center rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                Custom
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 whitespace-pre-line text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            {displayTitle}
          </h3>
        </div>
        <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-[#111a32] dark:text-zinc-200">
          +{challenge.points} pts
        </span>
      </div>
      <div className="mt-4 flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          {challenge.difficulty}
        </span>
      </div>
      {unlockPartLabel ? (
        <p className="mt-2 text-xs font-medium text-cyan-700 dark:text-cyan-300">
          {completed ? "Unlocked body part:" : "Unlocks body part:"}{" "}
          <span className="font-semibold">{unlockPartLabel}</span>
        </p>
      ) : null}

      <div className="mt-3">
        {detailHref ? (
          <Link
            href={detailHref}
            className="inline-flex items-center rounded-lg border border-[#e7d089] bg-[#be9e4b] px-3 py-1.5 text-xs font-semibold text-zinc-950 shadow-[0_0_16px_rgba(190,158,75,0.35)] transition hover:bg-[#ccb067] dark:border-[#e7d089]/70 dark:bg-[#be9e4b] dark:text-zinc-950"
          >
            View details
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function formatCardTaskTitle(rawTitle: string): string {
  const lines = (rawTitle || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  if (lines.length >= 2) {
    let task = lines[1];
    task = task.replace(/^action:\s*/i, "");
    task = task.replace(/^move:\s*/i, "");
    task = task.replace(/^complete this challenge:\s*/i, "");
    return task || lines[1];
  }
  let oneLine = lines[0];
  oneLine = oneLine.replace(/^outcome:\s*/i, "");
  oneLine = oneLine.replace(/^purpose:\s*/i, "");
  return oneLine;
}
