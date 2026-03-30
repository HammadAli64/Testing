"use client";

import { useState } from "react";
import { useAppState } from "@/context/AppStateProvider";
import type { Difficulty } from "@/types";

export function CreateTaskForm({ onCreated }: { onCreated?: () => void }) {
  const {
    addCustomChallenge,
    customChallengesCount,
    maxCustomChallengesPerDay,
  } = useAppState();
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [feedback, setFeedback] = useState<string>("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const result = addCustomChallenge({
      title,
      difficulty,
    });
    if (!result.ok) {
      setFeedback(result.reason);
      return;
    }
    setFeedback(`Task added with auto points: +${result.points}`);
    setTitle("");
    onCreated?.();
  }

  return (
    <section className="cyber-surface rounded-2xl p-5">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Create your own task
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        Add custom tasks to personalize your day and take full ownership of your
        routine.
      </p>
      <p className="mt-1 text-xs font-medium text-cyan-700 dark:text-cyan-300">
        Auto points: random from 1 to 9 • Daily limit: {customChallengesCount}/
        {maxCustomChallengesPerDay} custom tasks
      </p>

      <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Task title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 30 minutes reading"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-[#be9e4b]/35 focus:ring-2 dark:border-zinc-700 dark:bg-[#111a32] dark:text-zinc-100"
            required
          />
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Difficulty
          </span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#111a32] dark:text-zinc-100"
          >
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={customChallengesCount >= maxCustomChallengesPerDay}
            className="inline-flex items-center justify-center rounded-xl bg-[#be9e4b] px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-[#c9ab62] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add task
          </button>
          {feedback ? (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              {feedback}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
