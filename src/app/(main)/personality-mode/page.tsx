"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { useAppState } from "@/context/AppStateProvider";
import {
  COACH_PROFILES,
  getPersonalityDescription,
  PERSONALITY_LABELS,
  personalizeMotivation,
  personalizeSummary,
} from "@/lib/personality";
import { getCoachApiBaseUrl } from "@/lib/coach-api";
import { CATEGORY_LABELS } from "@/lib/mock-data";
import type { CoachPersonality } from "@/types";

const OPTIONS: CoachPersonality[] = [
  "strict",
  "friendly",
  "motivational",
  "minimalist",
];

export default function PersonalityModePage() {
  const {
    personality,
    setPersonality,
    todayChallenges,
    userId,
    dateKey,
    mood,
    completedIds,
    planLoading,
    planError,
    progress,
    bestCategory,
    lowCategory,
    todayPointsEarned,
    dailyProgressPercent,
  } = useAppState();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "coach"; text: string }[]
  >([]);

  const coach = COACH_PROFILES[personality];
  const previewTasks = useMemo(() => todayChallenges.slice(0, 4), [todayChallenges]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    const baseUrl = getCoachApiBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/coach/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          date: dateKey,
          mood,
          personality,
          frontendContext: {
            source: "personality-mode-chat",
            mood,
            dateKey,
            planLoading,
            planError,
            todayPointsEarned,
            dailyProgressPercent,
            bestCategory,
            lowCategory,
            progressTotals: progress?.totals ?? null,
            streak: progress?.streak ?? null,
            lifetimePoints: progress?.lifetimePoints ?? null,
            todayChallenges: todayChallenges.slice(0, 20).map((c) => ({
              id: c.id,
              title: c.title,
              category: c.category,
              difficulty: c.difficulty,
              points: c.points,
              completed: completedIds.has(c.id),
            })),
          },
          message: text,
          messages: [...messages.slice(-9), { role: "user", text }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { ok: boolean; reply?: string };
      const reply =
        json.ok && typeof json.reply === "string"
          ? json.reply
          : "Coach is thinking. Ask again.";
      setMessages((prev) => [...prev, { role: "coach", text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "coach", text: "I couldn’t reach the live coach. Try again." },
      ]);
    }
  }

  return (
    <>
      <TopBar
        title="Personality Mode"
        subtitle="Pick your coach, read their style, see tailored tasks, and chat live"
      />
      <div className="space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Choose your coach 🎯
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            This changes challenge tone, daily motivation, and coach-style
            feedback.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {OPTIONS.map((option) => {
              const active = option === personality;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPersonality(option)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-violet-300 bg-violet-50 ring-1 ring-violet-300/50 dark:border-violet-700 dark:bg-violet-950/30"
                      : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Image
                      src={COACH_PROFILES[option].imageUrl}
                      alt={COACH_PROFILES[option].imageAlt}
                      width={44}
                      height={44}
                      className="h-11 w-11 rounded-xl object-cover"
                    />
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                      {COACH_PROFILES[option].emoji} {PERSONALITY_LABELS[option]}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {getPersonalityDescription(option)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section
          className={`rounded-2xl border bg-gradient-to-br p-6 shadow-sm ${coach.colorClass}`}
        >
          <div className="flex flex-wrap items-center gap-4">
            <Image
              src={coach.imageUrl}
              alt={coach.imageAlt}
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-2xl object-cover shadow-md"
            />
            <div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {coach.name}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {coach.role}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {coach.intro}
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Motivation preview ✨
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {personalizeMotivation(
                "Small wins compound—today is about rhythm, not perfection.",
                personality,
              )}
            </p>
          </article>
          <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Feedback preview 📈
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {personalizeSummary(
                "You were strong on fitness and focus, but sleep consistency dipped.",
                personality,
              )}
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {coach.emoji} {coach.name}&apos;s tasks for today
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Personalized tone is applied after selecting this coach.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {previewTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-800/50"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {task.title}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {CATEGORY_LABELS[task.category]} • {task.timeEstimate} • +{task.points} pts
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Live talk with {coach.name} 💬
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Live AI chat that responds in your selected coach style.
          </p>
          <div className="mt-4 max-h-72 space-y-3 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
            {messages.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Start chatting. Try: &quot;How can I improve sleep?&quot;
              </p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={
                    m.role === "user"
                      ? "ml-8 rounded-2xl rounded-br-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "mr-8 rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  }
                >
                  {m.role === "coach" ? `${coach.emoji} ` : ""}
                  {m.text}
                </div>
              ))
            )}
          </div>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask ${coach.name}...`}
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500/40 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <button
              type="submit"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 sm:w-auto"
            >
              Send
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
