"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { SKELETON_PARTS } from "@/lib/skeleton-unlocks";
import { CreateTaskForm } from "@/components/dashboard/CreateTaskForm";

type Props = {
  completedTasks: number;
  totalTasks: number;
  taskUnlockParts: string[];
  unlockedParts: string[];
  planError?: string | null;
};

type Hotspot = {
  kind: "ellipse" | "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  ry?: number;
};

const FIG_W = 180;
const FIG_H = 320;

const HOTSPOTS: Hotspot[] = [
  { kind: "ellipse", x: 72, y: 6, w: 36, h: 38 }, // Skull
  { kind: "rect", x: 84, y: 38, w: 12, h: 18, rx: 6, ry: 6 }, // Neck
  { kind: "rect", x: 54, y: 54, w: 72, h: 14, rx: 7, ry: 7 }, // Shoulders
  { kind: "ellipse", x: 62, y: 66, w: 54, h: 56 }, // Rib Cage
  { kind: "rect", x: 83, y: 76, w: 14, h: 58, rx: 7, ry: 7 }, // Spine
  { kind: "ellipse", x: 34, y: 66, w: 28, h: 88 }, // Left Arm (full upper+forearm)
  { kind: "ellipse", x: 118, y: 66, w: 28, h: 88 }, // Right Arm (full upper+forearm)
  { kind: "ellipse", x: 64, y: 112, w: 52, h: 30 }, // Pelvis
  { kind: "ellipse", x: 22, y: 132, w: 24, h: 30 }, // Left Hand
  { kind: "ellipse", x: 136, y: 132, w: 24, h: 30 }, // Right Hand
  { kind: "ellipse", x: 66, y: 140, w: 22, h: 104 }, // Left Leg
  { kind: "ellipse", x: 92, y: 140, w: 22, h: 104 }, // Right Leg
  { kind: "ellipse", x: 56, y: 236, w: 66, h: 24 }, // Feet
];

export function SkeletonProgress({
  completedTasks,
  totalTasks,
  taskUnlockParts,
  unlockedParts,
  planError,
}: Props) {
  const [showCreateTaskForm, setShowCreateTaskForm] = useState(false);
  if (totalTasks === 0) {
    return (
      <section className="cyber-surface rounded-2xl p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Body progress
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {planError
                ? `AI generation failed: ${planError}`
                : `Waiting for today&apos;s AI plan...`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
              0/0 tasks
            </p>
            <button
              type="button"
              onClick={() => setShowCreateTaskForm((v) => !v)}
              className="rounded-lg border border-[#e7d089] bg-[#be9e4b] px-3 py-1.5 text-xs font-semibold text-zinc-950 shadow-[0_0_14px_rgba(190,158,75,0.32)] transition hover:bg-[#ccb067]"
            >
              {showCreateTaskForm ? "Hide form" : "Create your task"}
            </button>
          </div>
        </div>
        {showCreateTaskForm ? (
          <div className="mt-4">
            <CreateTaskForm onCreated={() => setShowCreateTaskForm(false)} />
          </div>
        ) : null}
      </section>
    );
  }

  const unlockableParts = taskUnlockParts.slice(0, HOTSPOTS.length);
  const unlockedSet = new Set(unlockedParts);
  const isComplete = totalTasks > 0 && completedTasks >= totalTasks;
  const nextPart = unlockableParts.find((p) => !unlockedSet.has(p)) ?? "All unlocked";
  const holes = unlockableParts.filter((p) => unlockedSet.has(p));

  return (
    <section className="cyber-surface rounded-2xl p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Body progress
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Complete 1 task = unlock 1 realistic skeleton segment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "text-sm font-semibold",
              isComplete
                ? "text-emerald-600 dark:text-emerald-300"
                : "text-zinc-600 dark:text-zinc-300",
            )}
          >
            {completedTasks}/{totalTasks} tasks completed
          </p>
          <button
            type="button"
            onClick={() => setShowCreateTaskForm((v) => !v)}
            className="rounded-lg border border-[#e7d089] bg-[#be9e4b] px-3 py-1.5 text-xs font-semibold text-zinc-950 shadow-[0_0_14px_rgba(190,158,75,0.32)] transition hover:bg-[#ccb067]"
          >
            {showCreateTaskForm ? "Hide form" : "Create your task"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-cyan-700 dark:text-cyan-300">
        Next unlock: {nextPart}
      </p>

      <div className="mt-4 flex justify-center">
        <div className="relative h-[320px] w-[180px] rounded-lg bg-black/40">
          <Image
            src="/skeleton-realistic.png"
            alt="Realistic human skeleton"
            width={FIG_W}
            height={FIG_H}
            className="h-full w-full object-cover"
          />
          {!isComplete ? (
            <svg
              viewBox={`0 0 ${FIG_W} ${FIG_H}`}
              className="absolute inset-0 h-full w-full"
              aria-hidden
            >
              <defs>
                <mask id="skeleton-reveal-mask">
                  {/* White = keep black overlay, Black = cut transparent hole */}
                  <rect width={FIG_W} height={FIG_H} fill="white" />
                  {holes.map((part, mapIdx) => {
                    const partIdx = SKELETON_PARTS.indexOf(
                      part as (typeof SKELETON_PARTS)[number],
                    );
                    if (partIdx < 0) return null;
                    const spot = HOTSPOTS[partIdx];
                    if (!spot) return null;
                    return spot.kind === "ellipse" ? (
                      <ellipse
                        key={`hole-${part}-${mapIdx}`}
                        cx={spot.x + spot.w / 2}
                        cy={spot.y + spot.h / 2}
                        rx={spot.w / 2}
                        ry={spot.h / 2}
                        fill="black"
                      />
                    ) : (
                      <rect
                        key={`hole-${part}-${mapIdx}`}
                        x={spot.x}
                        y={spot.y}
                        width={spot.w}
                        height={spot.h}
                        rx={spot.rx ?? 0}
                        ry={spot.ry ?? 0}
                        fill="black"
                      />
                    );
                  })}
                </mask>
              </defs>
              <rect
                width={FIG_W}
                height={FIG_H}
                fill="rgba(0,0,0,0.96)"
                mask="url(#skeleton-reveal-mask)"
              />
            </svg>
          ) : null}
          {isComplete ? (
            <div className="absolute inset-0 rounded-[40%] border border-emerald-300/70 shadow-[0_0_26px_rgba(125,255,179,0.55)]" />
          ) : null}
        </div>
      </div>
      {showCreateTaskForm ? (
        <div className="mt-4">
          <CreateTaskForm onCreated={() => setShowCreateTaskForm(false)} />
        </div>
      ) : null}
    </section>
  );
}
