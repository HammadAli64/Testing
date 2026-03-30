"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  /** Default seconds e.g. 25 * 60 for Pomodoro */
  initialSeconds?: number;
};

export function TaskTimer({ initialSeconds = 25 * 60 }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const label = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [secondsLeft]);

  return (
    <div className="anim-fade-up hover-lift rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        Optional focus timer
      </p>
      <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
        {label}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (secondsLeft === 0 && !running) {
              setSecondsLeft(initialSeconds);
              setRunning(true);
              return;
            }
            setRunning((r) => !r);
          }}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-base font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {running ? "Pause" : secondsLeft === 0 ? "Restart" : "Start"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            setSecondsLeft(initialSeconds);
          }}
          className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-base font-semibold text-zinc-800 transition-transform hover:-translate-y-0.5 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Reset
        </button>
      </div>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Demo timer only — no persistence.
      </p>
    </div>
  );
}
