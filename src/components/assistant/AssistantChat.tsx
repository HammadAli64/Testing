"use client";

import { useAppState } from "@/context/AppStateProvider";
import { getCoachApiBaseUrl } from "@/lib/coach-api";
import { useEffect, useMemo, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; text: string };

export function AssistantChat() {
  const {
    personality,
    dateKey,
    mood,
    todayChallenges,
    completedIds,
    planLoading,
    planError,
    progress,
    bestCategory,
    lowCategory,
    todayPointsEarned,
    dailyProgressPercent,
  } = useAppState();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hi — I’m your coach. Tell me what you’re struggling with (sleep, focus, exercise, productivity) and I’ll suggest the next step.",
    },
  ]);

  const userId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const key = "mmls-user-id";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, id);
    return id;
  }, []);

  useEffect(() => {
    // Ensures we have a stable userId in browser.
    void userId;
  }, [userId]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");

    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);

    const baseUrl = getCoachApiBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/api/coach/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          date: dateKey,
          personality,
          frontendContext: {
            source: "assistant-chat",
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
          messages: [...messages.slice(-9), { role: "user", text }].map((m) => ({
            role: m.role,
            text: m.text,
          })),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { ok: boolean; reply?: string };
      const reply =
        json.ok && typeof json.reply === "string"
          ? json.reply
          : "Coach is busy right now. Try again.";
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "I can’t reach the coach right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-lg shadow-zinc-900/30 transition hover:bg-zinc-800 sm:bottom-5 sm:right-5 sm:h-14 sm:w-14 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        aria-label="Open assistant"
      >
        <ChatBubbleIcon className="h-6 w-6" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-end sm:p-8">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex h-[min(560px,85vh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Coach assistant
                </p>
                <p className="text-xs text-zinc-500">AI coaching replies</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((msg, i) => (
                <div
                  key={`${msg.role}-${i}`}
                  className={
                    msg.role === "user"
                      ? "ml-8 rounded-2xl rounded-br-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "mr-8 rounded-2xl rounded-bl-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                  }
                >
                  {msg.text}
                </div>
              ))}
            </div>
            <form
              className="border-t border-zinc-200 p-3 dark:border-zinc-800"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Try: “How do I improve sleep?”"
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-[#be9e4b]/40 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-[#be9e4b] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#c9ab62] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChatBubbleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
      />
    </svg>
  );
}
