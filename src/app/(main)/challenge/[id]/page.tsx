"use client";

import { TopBar } from "@/components/layout/TopBar";
import { useAppState } from "@/context/AppStateProvider";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CATEGORY_LABELS } from "@/lib/mock-data";
import { getCoachApiBaseUrl } from "@/lib/coach-api";

type DetailPayload = {
  ok: boolean;
  challenge?: {
    id: string;
    title: string;
    category: keyof typeof CATEGORY_LABELS;
    difficulty: string;
    time: string;
    points: number;
    isCustom?: boolean;
  };
  detail?: {
    explanation: string;
    approaches: string[];
    benefits: string[];
    quickStart: string;
    titleMeaning?: string;
    taskDescription?: string;
    doneCriteria?: string;
  };
  error?: string;
};

type DayStatePayload = {
  ok: boolean;
  challenges?: Array<{
    id: string;
    title: string;
    category: keyof typeof CATEGORY_LABELS;
    difficulty: string;
    time: string;
    points: number;
    details?: string;
    benefits?: string;
    status?: "pending" | "completed" | "missed";
    completionNote?: string | null;
    bodyPart?: string | null;
    isCustom?: boolean;
  }>;
};

export default function ChallengeDetailPage() {
  const { userId, dateKey, mood, personality } = useAppState();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const challengeId = params?.id || "";
  const date = search.get("date") || dateKey;
  const idDateMatch = String(challengeId).match(/^plan-(\d{4}-\d{2}-\d{2})-/);
  const idDate = idDateMatch ? idDateMatch[1] : "";

  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const ensureThree = (items: string[], fallback: string[]): string[] => {
    const out = items.filter((x) => x.trim());
    for (const f of fallback) {
      if (out.length >= 3) break;
      out.push(f);
    }
    return out.slice(0, 3);
  };

  useEffect(() => {
    if (!userId || !challengeId || !date) return;
    const baseUrl = getCoachApiBaseUrl();
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      setLoading(true);
      setError("");
    }, 0);

    const load = async () => {
      try {
        const candidateDates = Array.from(new Set([date, idDate].filter(Boolean)));
        let loaded = false;
        for (const d of candidateDates) {
          const detailUrl =
            `${baseUrl}/api/coach/challenge-detail?` +
            `userId=${encodeURIComponent(userId)}` +
            `&date=${encodeURIComponent(d)}` +
            `&challengeId=${encodeURIComponent(challengeId)}` +
            `&mood=${encodeURIComponent(mood)}` +
            `&personality=${encodeURIComponent(personality)}`;
          const res = await fetch(detailUrl, { signal: controller.signal });
          if (!res.ok) continue;
          const json = (await res.json()) as DetailPayload;
          if (!json.ok || !json.challenge || !json.detail) continue;
          json.detail.approaches = ensureThree(json.detail.approaches || [], [
            "Set a 15-minute timer and complete only the first small step.",
            "Write 3 short steps, then finish step 1 and step 2 now.",
            "Do one draft and save it. Improve it once after a short break.",
          ]);
          json.detail.benefits = ensureThree(json.detail.benefits || [], [
            "You finish one useful task today.",
            "You feel more confident because you completed it.",
            "You build a daily habit of action.",
          ]);
          setData(json);
          loaded = true;
          break;
        }
        if (!loaded) throw new Error("Challenge detail not found");
      } catch {
        // Fallback: load stored challenge fields from day-state so page stays usable.
        try {
          const candidateDates = Array.from(new Set([date, idDate].filter(Boolean)));
          let target:
            | {
                id: string;
                title: string;
                category: keyof typeof CATEGORY_LABELS;
                difficulty: string;
                time: string;
                points: number;
                details?: string;
                benefits?: string;
                status?: "pending" | "completed" | "missed";
                completionNote?: string | null;
                bodyPart?: string | null;
                isCustom?: boolean;
              }
            | undefined;
          for (const d of candidateDates) {
            const dayStateUrl =
              `${baseUrl}/api/coach/day-state?` +
              `userId=${encodeURIComponent(userId)}` +
              `&date=${encodeURIComponent(d)}`;
            const dayRes = await fetch(dayStateUrl, { signal: controller.signal });
            if (!dayRes.ok) continue;
            const dayJson = (await dayRes.json()) as DayStatePayload;
            target = (dayJson.challenges || []).find((c) => c.id === challengeId);
            if (target) break;
          }
          if (!target) throw new Error("Challenge not found for selected day");
          setData({
            ok: true,
            challenge: {
              id: target.id,
              title: target.title,
              category: target.category,
              difficulty: target.difficulty,
              time: target.time,
              points: target.points,
            },
            detail: {
              explanation:
                target.details?.trim() ||
                "This challenge is designed to create measurable progress with one focused action.",
              approaches: [
                "Start with a 5-minute version of the task.",
                "Set a timer and complete one clear output.",
                "If energy is low, do the easiest first step now.",
              ],
              benefits: ensureThree(
                target.benefits ? [target.benefits] : [],
                [
                  "Builds consistency through simple action.",
                  "Improves focus and confidence with clear tasks.",
                  "Creates daily momentum you can feel.",
                ],
              ),
              quickStart:
                "Set a 5-minute timer and complete the first visible step right now.",
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(
            `Could not load challenge detail. Check backend connection and try again. (${msg})`,
          );
        }
      } finally {
        try {
          const candidateDates = Array.from(new Set([date, idDate].filter(Boolean)));
          for (const d of candidateDates) {
            const dayStateUrl =
              `${baseUrl}/api/coach/day-state?` +
              `userId=${encodeURIComponent(userId)}` +
              `&date=${encodeURIComponent(d)}`;
            const dayRes = await fetch(dayStateUrl, { signal: controller.signal });
            if (dayRes.ok) {
              const dayJson = (await dayRes.json()) as DayStatePayload;
              const target = (dayJson.challenges || []).find((c) => c.id === challengeId);
              if (target) {
                setIsCompleted(target.status === "completed");
                if (target.completionNote) setReply(target.completionNote);
                break;
              }
            }
          }
        } catch {
          // non-blocking
        }
        setLoading(false);
      }
    };

    void load();
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [userId, challengeId, date, mood, personality]);

  const submitCompletion = async () => {
    if (!userId || !date || !data?.challenge) return;
    const note = reply.trim();
    if (!note) {
      setSubmitError("Your message is required before completing this challenge.");
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    try {
      const baseUrl = getCoachApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/coach/challenge-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          date,
          status: "completed",
          completionNote: note,
          challenge: {
            id: data.challenge.id,
            category: data.challenge.category,
            title: data.challenge.title,
            difficulty: data.challenge.difficulty,
            time: data.challenge.time,
            points: data.challenge.points,
            isCustom: Boolean(data.challenge.isCustom),
          },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setIsCompleted(true);
      // Force full dashboard re-hydration so lifetime points/charts refresh immediately.
      window.location.href = "/";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSubmitError(msg || "Failed to complete challenge");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TopBar title="Challenge details" subtitle="Clear explanation, plans, and outcomes" />
      <div className="space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading detail...</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : data?.challenge && data?.detail ? (
          <>
            <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {data.detail.taskDescription || data.challenge.title}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {CATEGORY_LABELS[data.challenge.category]} • {data.challenge.difficulty} • +{data.challenge.points} pts
              </p>
              <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
                {data.detail.titleMeaning || data.detail.explanation}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-violet-300/40 bg-violet-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-200">
                    What this means
                  </p>
                  <p className="mt-1 text-sm text-zinc-100">
                    {data.detail.titleMeaning || "A focused action tied to your current category."}
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                    What to do
                  </p>
                  <p className="mt-1 text-sm text-zinc-100">
                    {data.detail.taskDescription || data.challenge.title}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                    Done when
                  </p>
                  <p className="mt-1 text-sm text-zinc-100">
                    {data.detail.doneCriteria || "You save one visible proof of completion."}
                  </p>
                </div>
              </div>
              <p className="mt-4 rounded-xl border border-cyan-300/40 bg-cyan-400/10 p-3 text-sm text-cyan-100">
                <span className="font-semibold">Quick start: </span>
                {data.detail.quickStart}
              </p>
            </section>

            <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                6 easy examples to complete this
              </h3>
              <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                <div className="grid grid-cols-[64px_1fr] border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
                  <div className="px-3 py-2">No.</div>
                  <div className="px-3 py-2">Simple way</div>
                </div>
                <ul className="text-sm text-zinc-800 dark:text-zinc-200">
                {data.detail.approaches.slice(0, 3).map((a, i) => (
                  <li
                    key={`approach-${i}`}
                    className="grid grid-cols-[64px_1fr] border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                  >
                    <span className="px-3 py-3 font-semibold text-cyan-700 dark:text-cyan-300">
                      {i + 1}
                    </span>
                    <span className="px-3 py-3">{a}</span>
                  </li>
                ))}
                </ul>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                3 real-life benefits
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {data.detail.benefits.slice(0, 3).map((b, i) => (
                  <div
                    key={`benefit-${i}`}
                    className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-300"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      Benefit {i + 1}
                    </p>
                    <p className="mt-1">{b}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Your completion message (required)
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Write briefly how you completed this challenge. Without this reply, completion is blocked.
              </p>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Example: I finished step 1 and sent one outreach message with proof in notes."
                className="mt-3 min-h-28 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-cyan-300 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              {submitError ? (
                <p className="mt-2 text-sm text-rose-600">{submitError}</p>
              ) : null}
              <button
                type="button"
                disabled={submitting || isCompleted}
                onClick={submitCompletion}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#be9e4b] px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-[#c9ab62] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCompleted ? "Completed with your message" : submitting ? "Saving..." : "Submit message and complete"}
              </button>
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}

