"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  startTransition,
  useState,
} from "react";
import { generateDailyChallenges } from "@/lib/ai-service";
import { personalizeChallenges } from "@/lib/personality";
import type { CategoryId, Challenge, CoachPersonality, Difficulty, MoodId } from "@/types";
import { buildMoodChallenges } from "@/lib/mood-challenges";
import { fetchCoach, getCoachApiBaseUrl } from "@/lib/coach-api";

const STORAGE_PREFIX = "mmls-completed";
const CUSTOM_TASKS_PREFIX = "mmls-custom";
const PERSONALITY_KEY = "mmls-personality";
const USER_ID_KEY = "mmls-user-id";
const MAX_CUSTOM_TASKS_PER_DAY = 2;
const SIM_DATE_KEY = "mmls-sim-date";
const MOOD_KEY = "mmls-mood";
const SIM_STREAK_KEY = "mmls-sim-streak";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number) {
  const [y, m, d] = dateIso.split("-").map((x) => Number(x));
  if (!y || !m || !d) return todayKey();
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function loadOrCreateUserId() {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(USER_ID_KEY, id);
  return id;
}

function defaultCustomCategoryForUser(userId: string): string {
  const hasUser = Boolean((userId || "").trim());
  return hasUser ? "Your Tasks" : "My Tasks";
}

function autoPointsByDifficulty(difficulty: Difficulty): number {
  if (difficulty === "Easy") return Math.floor(Math.random() * 3) + 1; // 1..3
  if (difficulty === "Medium") return Math.floor(Math.random() * 3) + 4; // 4..6
  return Math.floor(Math.random() * 3) + 7; // 7..9
}

function loadCompletedIds(dateKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  const raw = localStorage.getItem(`${STORAGE_PREFIX}-${dateKey}`);
  if (!raw) {
    return new Set();
  }
  try {
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function loadCustomTasks(dateKey: string): Challenge[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(`${CUSTOM_TASKS_PREFIX}-${dateKey}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Challenge[];
  } catch {
    return [];
  }
}

type AppStateContextValue = {
  userId: string;
  todayChallenges: Challenge[];
  completedIds: Set<string>;
  toggleComplete: (id: string) => void;
  advanceDay: () => void;
  simStreak: number;
  createStreakRestoreInvite: () => Promise<
    | { ok: true; code: string; breakDate: string; prevStreak: number }
    | { ok: false; error: string }
  >;
  acceptStreakRestoreInvite: (
    code: string,
  ) => Promise<
    | { ok: true; ownerUserId: string; breakDate: string; prevStreak: number }
    | { ok: false; error: string }
  >;
  mood: MoodId;
  setMood: (value: MoodId) => void;
  reloadChallenges: () => Promise<{ ok: true } | { ok: false; error: string }>;
  dateKey: string;
  dailyProgressPercent: number;
  todayPointsEarned: number;
  totalTodayPoints: number;
  personality: CoachPersonality;
  setPersonality: (value: CoachPersonality) => void;
  dailyQuote: string;
  planLoading: boolean;
  planError: string | null;
  bestCategory: CategoryId | null;
  lowCategory: CategoryId | null;
  progress: {
    daily: { date: string; rate: number }[];
    weekly: { week: string; value: number }[];
    monthly: { month: string; rate: number }[];
    categoryScores: { category: CategoryId; score: number }[];
    totals: { totalCompleted: number; totalMissed: number; totalPending: number };
    streak: number;
    lifetimePoints: number;
  } | null;
  customChallengesCount: number;
  maxCustomChallengesPerDay: number;
  addCustomChallenge: (input: {
    title: string;
    customCategory?: string;
    difficulty: Difficulty;
    timeEstimate?: string;
  }) => { ok: true; points: number } | { ok: false; reason: string };
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [customChallenges, setCustomChallenges] = useState<Challenge[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [dateKey, setDateKey] = useState<string>("");
  const [simStreak, setSimStreak] = useState<number>(1);
  const [mood, setMoodState] = useState<MoodId>("motivational");
  const [personality, setPersonalityState] =
    useState<CoachPersonality>("friendly");
  const [serverChallenges, setServerChallenges] = useState<Challenge[]>([]);
  const [planLoading, setPlanLoading] = useState<boolean>(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [bestCategory, setBestCategory] = useState<CategoryId | null>(null);
  const [lowCategory, setLowCategory] = useState<CategoryId | null>(null);
  const [progress, setProgress] = useState<AppStateContextValue["progress"]>(null);
  const [baseMotivation, setBaseMotivation] = useState<string>("");
  const [baseSummary, setBaseSummary] = useState<string>("");
  const [baseDailyQuote, setBaseDailyQuote] = useState<string>("");

  useEffect(() => {
    startTransition(() => {
      // Keep the same simulated day across reloads.
      // Day changes should happen only when user clicks "Next day".
      const prev = localStorage.getItem(SIM_DATE_KEY);
      const dk = prev || todayKey();
      localStorage.setItem(SIM_DATE_KEY, dk);
      setDateKey(dk);
      setCompletedIds(loadCompletedIds(dk));
      setCustomChallenges(loadCustomTasks(dk));
      setUserId(loadOrCreateUserId());
      const storedMood =
        (localStorage.getItem(MOOD_KEY) as MoodId | null) ?? "motivational";
      setMoodState(storedMood);
      const storedStreakRaw = localStorage.getItem(SIM_STREAK_KEY);
      const storedStreak = storedStreakRaw ? Number(storedStreakRaw) : 1;
      setSimStreak(Number.isFinite(storedStreak) && storedStreak > 0 ? storedStreak : 1);
      setHydrated(true);
    });
  }, []);

  const advanceDay = useCallback(() => {
    if (typeof window === "undefined") return;
    const prev = localStorage.getItem(SIM_DATE_KEY) ?? dateKey ?? todayKey();
    const next = addDays(prev, 1);
    localStorage.setItem(SIM_DATE_KEY, next);
    const nextStreak = (simStreak || 1) + 1;
    localStorage.setItem(SIM_STREAK_KEY, String(nextStreak));
    startTransition(() => {
      setDateKey(next);
      setSimStreak(nextStreak);
      setCompletedIds(new Set());
      setCustomChallenges([]);
      setServerChallenges([]);
      setBaseMotivation("");
      setBaseSummary("");
      setBaseDailyQuote("");
      setPlanError(null);
      setPlanLoading(true);
      setProgress(null);
      setBestCategory(null);
      setLowCategory(null);
    });
  }, [dateKey, simStreak]);

  const refreshProgress = useCallback(
    async (baseUrl: string, date: string) => {
      if (!userId) return;
      const pRes = await fetch(
        `${baseUrl}/api/coach/progress?userId=${encodeURIComponent(userId)}&days=14&weeks=4&months=6&asOf=${encodeURIComponent(date)}`,
      );
      if (!pRes.ok) return;
      const pJson = (await pRes.json()) as {
        ok: boolean;
        daily: { date: string; rate: number }[];
        weekly: { week: string; value: number }[];
        monthly: { month: string; rate: number }[];
        categoryScores: { category: CategoryId; score: number }[];
        totals?: { totalCompleted: number; totalMissed: number; totalPending: number };
        streak?: number;
        lifetimePoints?: number;
      };
      if (!pJson.ok) return;
      setProgress({
        daily: pJson.daily ?? [],
        weekly: pJson.weekly ?? [],
        monthly: pJson.monthly ?? [],
        categoryScores: pJson.categoryScores ?? [],
        totals: pJson.totals ?? {
          totalCompleted: 0,
          totalMissed: 0,
          totalPending: 0,
        },
        streak: pJson.streak ?? 0,
        lifetimePoints: pJson.lifetimePoints ?? 0,
      });
    },
    [userId],
  );

  const createStreakRestoreInvite = useCallback(async () => {
    const baseUrl = getCoachApiBaseUrl();
    const date = dateKey || todayKey();
    if (!userId) return { ok: false as const, error: "Missing userId" };
    try {
      const res = await fetch(`${baseUrl}/api/coach/streak/restore-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, date }),
      });
      const json = (await res.json()) as
        | { ok: true; invite: { code: string; breakDate: string; prevStreak: number } }
        | { ok: false; error: string };
      if (!res.ok || !json.ok) {
        return { ok: false as const, error: "error" in json ? json.error : "Failed" };
      }
      await refreshProgress(baseUrl, date);
      return { ok: true as const, ...json.invite };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  }, [dateKey, refreshProgress, userId]);

  const acceptStreakRestoreInvite = useCallback(
    async (code: string) => {
      const baseUrl = getCoachApiBaseUrl();
      const date = dateKey || todayKey();
      if (!userId) return { ok: false as const, error: "Missing userId" };
      try {
        const res = await fetch(`${baseUrl}/api/coach/streak/restore-accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, code }),
        });
        const json = (await res.json()) as
          | {
              ok: true;
              accepted: {
                ownerUserId: string;
                breakDate: string;
                prevStreak: number;
              };
            }
          | { ok: false; error: string };
        if (!res.ok || !json.ok) {
          return { ok: false as const, error: "error" in json ? json.error : "Failed" };
        }
        await refreshProgress(baseUrl, date);
        return { ok: true as const, ...json.accepted };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false as const, error: msg };
      }
    },
    [dateKey, refreshProgress, userId],
  );

  useEffect(() => {
    if (!hydrated) return;
    // Keep dateKey in sync with the simulated day key.
    const t = window.setInterval(() => {
      const next = localStorage.getItem(SIM_DATE_KEY) ?? todayKey();
      setDateKey((prev) => {
        if (prev === next) return prev;
        startTransition(() => {
          setCompletedIds(loadCompletedIds(next));
          setCustomChallenges(loadCustomTasks(next));
          setServerChallenges([]);
          setBaseMotivation("");
          setBaseSummary("");
          setBaseDailyQuote("");
          setPlanError(null);
          setPlanLoading(true);
        });
        return next;
      });
    }, 60_000);
    return () => window.clearInterval(t);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !dateKey) return;
    localStorage.setItem(
      `${STORAGE_PREFIX}-${dateKey}`,
      JSON.stringify([...completedIds]),
    );
  }, [completedIds, hydrated, dateKey]);

  useEffect(() => {
    if (!hydrated || !dateKey) return;
    localStorage.setItem(
      `${CUSTOM_TASKS_PREFIX}-${dateKey}`,
      JSON.stringify(customChallenges),
    );
  }, [customChallenges, hydrated, dateKey]);

  useEffect(() => {
    const stored = localStorage.getItem(PERSONALITY_KEY) as
      | CoachPersonality
      | null;
    if (!stored) return;
    startTransition(() => {
      setPersonalityState(stored);
    });
  }, []);

  const setPersonality = useCallback((value: CoachPersonality) => {
    setPersonalityState(value);
    localStorage.setItem(PERSONALITY_KEY, value);

    // Regenerate day meta (motivation/summary/quote) from backend for this coach style.
    const baseUrl = getCoachApiBaseUrl();
    const date = dateKey || todayKey();
    if (!userId) return;
    void fetch(`${baseUrl}/api/coach/day-meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        date,
        mood,
        personality: value,
      }),
    })
      .then((r) => r.json())
      .then((json: { ok: boolean; meta?: { motivation?: string; summary?: string; dailyQuote?: string }; error?: string }) => {
        if (!json.ok || !json.meta) return;
        startTransition(() => {
          setBaseMotivation(json.meta?.motivation ?? "");
          setBaseSummary(json.meta?.summary ?? "");
          setBaseDailyQuote(json.meta?.dailyQuote ?? "");
        });
      })
      .catch(() => {});
  }, [dateKey, mood, userId]);

  const setMood = useCallback((value: MoodId) => {
    setMoodState(value);
    if (typeof window !== "undefined") localStorage.setItem(MOOD_KEY, value);

    // Regenerate today's plan for the new mood if the user hasn't completed anything yet.
    if (!userId || !dateKey) return;
    if (completedIds.size > 0) return;
    const baseUrl = getCoachApiBaseUrl();
    startTransition(() => {
      setPlanLoading(true);
      setPlanError(null);
    });
    void fetchCoach("/api/coach/daily-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, date: dateKey, mood: value, force: true }),
    })
      .then((r) => r.json())
      .then((json: { ok: boolean; plan?: unknown; error?: string }) => {
        if (!json.ok || !json.plan) {
          setPlanError(json.error || "Failed to regenerate plan");
          setPlanLoading(false);
          return;
        }
        const plan = json.plan as {
          challenges: {
            id: string;
            title: string;
            category: CategoryId;
            difficulty: Difficulty;
            time: string;
            points: number;
            bodyPart?: string;
            details?: string;
            benefits?: string;
          }[];
          motivation: string;
          summary: string;
          dailyQuote?: string;
        };
        const mapped = plan.challenges.map((c) => ({
          id: c.id,
          title: c.title,
          category: c.category,
          difficulty: c.difficulty,
          timeEstimate: c.time,
          points: c.points,
          bodyPart: c.bodyPart,
          details: c.details,
          benefits: c.benefits,
        }));
        startTransition(() => {
          setServerChallenges(mapped);
          setBaseMotivation(plan.motivation);
          setBaseSummary(plan.summary);
          setBaseDailyQuote(plan.dailyQuote ?? "");
          setCompletedIds(new Set());
          setPlanLoading(false);
        });
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setPlanError(msg);
        setPlanLoading(false);
      });
  }, [completedIds.size, dateKey, userId]);

  const reloadChallenges = useCallback(async () => {
    const baseUrl = getCoachApiBaseUrl();
    const date = dateKey || todayKey();
    if (!userId) return { ok: false as const, error: "Missing userId" };
    try {
      startTransition(() => {
        setPlanLoading(true);
        setPlanError(null);
      });
      const res = await fetchCoach("/api/coach/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          date,
          mood,
          force: true,
          replace: true,
          fast: true,
          regenKey: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        }),
      });
      const json = (await res.json()) as { ok: boolean; plan?: unknown; error?: string };
      if (!res.ok || !json.ok || !json.plan) {
        const msg = json.error || "Failed to reload challenges";
        setPlanError(msg);
        setPlanLoading(false);
        return { ok: false as const, error: msg };
      }
      const plan = json.plan as {
        challenges: {
          id: string;
          title: string;
          category: CategoryId;
          difficulty: Difficulty;
          time: string;
          points: number;
          bodyPart?: string;
          details?: string;
          benefits?: string;
        }[];
        motivation: string;
        summary: string;
        dailyQuote?: string;
      };
      const mapped = plan.challenges.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        difficulty: c.difficulty,
        timeEstimate: c.time,
        points: c.points,
        bodyPart: c.bodyPart,
        details: c.details,
        benefits: c.benefits,
      }));
      startTransition(() => {
        setCustomChallenges([]);
        setServerChallenges(mapped);
        setCompletedIds(new Set());
        setBaseMotivation(plan.motivation);
        setBaseSummary(plan.summary);
        setBaseDailyQuote(plan.dailyQuote ?? "");
        setPlanLoading(false);
      });
      try {
        await refreshProgress(baseUrl, date);
      } catch {
        // Keep regenerated tasks even if progress refresh fails.
      }
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPlanError(msg);
      setPlanLoading(false);
      return { ok: false as const, error: msg };
    }
  }, [dateKey, mood, refreshProgress, userId]);

  useEffect(() => {
    if (!hydrated || !userId || !dateKey) return;
    const run = async () => {
      const date = dateKey;
      const isStale = () => {
        const current = localStorage.getItem(SIM_DATE_KEY) ?? todayKey();
        return current !== date;
      };
      setPlanLoading(true);
      setPlanError(null);

      const baseUrl = getCoachApiBaseUrl();

      // Hydrate from backend DB first (so clearing browser storage doesn't reset stats).
      const stateRes = await fetchCoach(
        `/api/coach/day-state?userId=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}&mood=${encodeURIComponent(mood)}`,
      );
      let hasDbPlan = false;
      if (stateRes.ok) {
        const stateJson = (await stateRes.json()) as {
          ok: boolean;
          date: string;
          challenges: {
            id: string;
            title: string;
            category: CategoryId;
            difficulty: Difficulty;
            time: string;
            points: number;
            bodyPart?: string | null;
            details?: string | null;
            benefits?: string | null;
            isCustom: boolean;
            status: "pending" | "completed" | "missed";
          }[];
          meta?: {
            motivation?: string;
            summary?: string;
            dailyQuote?: string;
          } | null;
        };
        hasDbPlan =
          Boolean(stateJson.ok) &&
          Array.isArray(stateJson.challenges) &&
          stateJson.challenges.length > 0;

        if (hasDbPlan) {
          if (isStale()) return;
          const custom = stateJson.challenges
            .filter((c) => c.isCustom)
            .map((c) => ({
              id: c.id,
              title: c.title,
              category: c.category,
              difficulty: c.difficulty,
              timeEstimate: c.time,
              points: c.points,
              bodyPart: c.bodyPart ?? undefined,
              isCustom: true as const,
            }));
          const server = stateJson.challenges
            .filter((c) => !c.isCustom)
            .map((c) => ({
              id: c.id,
              title: c.title,
              category: c.category,
              difficulty: c.difficulty,
              timeEstimate: c.time,
              points: c.points,
              bodyPart: c.bodyPart ?? undefined,
              details: c.details ?? undefined,
              benefits: c.benefits ?? undefined,
            }));
          setCustomChallenges(custom);
          setServerChallenges(server);
          setBaseMotivation(stateJson.meta?.motivation ?? "");
          setBaseSummary(stateJson.meta?.summary ?? "");
          setBaseDailyQuote(stateJson.meta?.dailyQuote ?? "");
          setCompletedIds(
            new Set(
              stateJson.challenges
                .filter((c) => c.status === "completed")
                .map((c) => c.id),
            ),
          );
          setPlanLoading(false);
        }
      }

      // If DB has no challenges for today, generate a new plan via Gemini.
      if (!hasDbPlan) {
        const plan = await generateDailyChallenges({ userId, date, mood });
        if (isStale()) return;

        const mapped = plan.challenges.map((c) => ({
          id: c.id,
          title: c.title,
          category: c.category,
          difficulty: c.difficulty,
          timeEstimate: c.time,
          points: c.points,
          bodyPart: c.bodyPart,
          details: c.details,
          benefits: c.benefits,
        }));

        if (mapped.length === 0) {
          setPlanError(
            "No challenges were returned. Confirm Django is on port 8000, OPENAI_API_KEY is set, and backend/read/ contains your documents.",
          );
          setPlanLoading(false);
          return;
        }

        setServerChallenges(mapped);
        setBaseMotivation(plan.motivation);
        setBaseSummary(plan.summary);
        setBaseDailyQuote(plan.dailyQuote ?? "");

        // Filter out stale completion IDs from previous plan generations.
        const idSet = new Set(mapped.map((c) => c.id));
        setCompletedIds((prev) =>
          new Set([...prev].filter((cid) => idSet.has(cid))),
        );
        setPlanLoading(false);
      }

      // Load best/low categories (from backend stats).
      try {
        const res = await fetch(
          `${baseUrl}/api/coach/stats?userId=${encodeURIComponent(userId)}`,
        );
        if (isStale()) return;
        if (res.ok) {
          const json = (await res.json()) as {
            ok: boolean;
            bestCategory?: CategoryId;
            lowCategory?: CategoryId;
          };
          if (json.ok) {
            setBestCategory(json.bestCategory ?? null);
            setLowCategory(json.lowCategory ?? null);
          }
        }
      } catch {
        // Keep current challenges if stats call fails.
      }

      // Load progress series for charts.
      try {
        await refreshProgress(baseUrl, date);
        if (isStale()) return;
      } catch {
        // Keep current challenges if progress call fails.
      }
    };

    void run().catch((err) => {
      setPlanLoading(false);
      const msg = err instanceof Error ? err.message : String(err);
      setPlanError(msg);
      // Preserve any already loaded challenges; only annotate the error.
    });
  }, [hydrated, userId, dateKey, mood, refreshProgress]);

  const toggleComplete = useCallback(
    (id: string) => {
      const baseUrl = getCoachApiBaseUrl();

      setCompletedIds((prev) => {
        const next = new Set(prev);
        const willBeCompleted = !next.has(id);
        if (willBeCompleted) next.add(id);
        else next.delete(id);

        const challenge =
          customChallenges.find((c) => c.id === id) ??
          serverChallenges.find((c) => c.id === id);
        if (userId && challenge) {
          const nextStatus = willBeCompleted ? "completed" : "pending";

          // Optimistic lifetime points update (backend refresh will confirm).
          const delta = willBeCompleted ? challenge.points : -challenge.points;
          setProgress((prevProgress) => {
            if (!prevProgress) return prevProgress;
            const nextLifetime = Math.max(
              0,
              (prevProgress.lifetimePoints ?? 0) + delta,
            );
            return { ...prevProgress, lifetimePoints: nextLifetime };
          });
          void fetch(`${baseUrl}/api/coach/challenge-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              date: dateKey || todayKey(),
              status: nextStatus,
              challenge: {
                id: challenge.id,
                category: challenge.category,
                title: challenge.title,
                difficulty: challenge.difficulty,
                timeEstimate: challenge.timeEstimate,
                points: challenge.points,
                bodyPart: challenge.bodyPart,
                isCustom: Boolean(challenge.isCustom),
              },
            }),
          }).catch(() => {
            // Ignore network errors in mock mode.
          });

          if (willBeCompleted) {
            // Generate a few new challenges in the same category and append them.
            void fetch(`${baseUrl}/api/coach/followup`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                  date: dateKey || todayKey(),
                category: challenge.category,
                count: 2,
              }),
            })
              .then(async (r) => {
                if (!r.ok) return null;
                return (await r.json()) as {
                  ok: boolean;
                  challenges?: {
                    id: string;
                    title: string;
                    category: CategoryId;
                    difficulty: Difficulty;
                    time: string;
                    points: number;
                    bodyPart?: string;
                  }[];
                };
              })
              .then((json) => {
                if (!json?.ok || !json.challenges?.length) return;
                setServerChallenges((prevChallenges) => {
                  const existing = new Set(prevChallenges.map((c) => c.id));
                  const mapped: Challenge[] = json.challenges!.map((c) => ({
                    id: c.id,
                    title: c.title,
                    category: c.category,
                    difficulty: c.difficulty,
                    timeEstimate: c.time,
                    points: c.points,
                    bodyPart: c.bodyPart,
                  }));
                  const merged = [...prevChallenges];
                  for (const c of mapped) {
                    if (!existing.has(c.id)) merged.push(c);
                  }
                  return merged;
                });
              })
              .catch(() => null);
          }

          // Refresh best/low categories after status change.
          void fetch(`${baseUrl}/api/coach/stats?userId=${encodeURIComponent(userId)}`)
            .then(async (r) =>
              r.ok
                ? ((await r.json()) as {
                    ok: boolean;
                    bestCategory?: CategoryId;
                    lowCategory?: CategoryId;
                  })
                : null,
            )
            .then((json) => {
              if (!json?.ok) return;
              setBestCategory((json.bestCategory as CategoryId) ?? null);
              setLowCategory((json.lowCategory as CategoryId) ?? null);
            })
            .catch(() => null);

          // Refresh progress series after status change.
          void fetch(
            `${baseUrl}/api/coach/progress?userId=${encodeURIComponent(userId)}&days=14&weeks=4&months=6&asOf=${encodeURIComponent(dateKey || todayKey())}`,
          )
            .then(async (r) =>
              r.ok
                ? ((await r.json()) as {
                    ok: boolean;
                    daily: { date: string; rate: number }[];
                    weekly: { week: string; value: number }[];
                    monthly: { month: string; rate: number }[];
                    categoryScores: { category: CategoryId; score: number }[];
                    totals?: {
                      totalCompleted: number;
                      totalMissed: number;
                      totalPending: number;
                    };
                    streak?: number;
                    lifetimePoints?: number;
                  })
                : null,
            )
            .then((pJson) => {
              if (!pJson?.ok) return;
              setProgress({
                daily: pJson.daily ?? [],
                weekly: pJson.weekly ?? [],
                monthly: pJson.monthly ?? [],
                categoryScores: pJson.categoryScores ?? [],
                totals: pJson.totals ?? {
                  totalCompleted: 0,
                  totalMissed: 0,
                  totalPending: 0,
                },
                streak: pJson.streak ?? 1,
                lifetimePoints: pJson.lifetimePoints ?? 0,
              });
            })
            .catch(() => null);
        }

        return next;
      });
    },
    [customChallenges, serverChallenges, userId, dateKey],
  );

  const addCustomChallenge = useCallback(
    (input: {
      title: string;
      customCategory?: string;
      difficulty: Difficulty;
      timeEstimate?: string;
    }) => {
      const title = input.title.trim();
      if (!title) return { ok: false as const, reason: "Title is required." };
      const customCategory =
        input.customCategory?.trim() || defaultCustomCategoryForUser(userId);
      if (customChallenges.length >= MAX_CUSTOM_TASKS_PER_DAY) {
        return {
          ok: false as const,
          reason: `You can only create ${MAX_CUSTOM_TASKS_PER_DAY} custom tasks per day.`,
        };
      }
      const autoPoints = autoPointsByDifficulty(input.difficulty);
      const task: Challenge = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        // Persist under a valid base category for backend stats; UI shows customCategory.
        category: "motivation",
        customCategory,
        difficulty: input.difficulty,
        timeEstimate: (input.timeEstimate || "").trim() || "20 min",
        points: autoPoints,
        isCustom: true,
      };
      setCustomChallenges((prev) => [task, ...prev]);
      if (userId) {
        const baseUrl =
          process.env.NEXT_PUBLIC_COACH_API_BASE_URL ??
          "http://localhost:8000";
        void fetch(`${baseUrl}/api/coach/custom-challenge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            date: dateKey || todayKey(),
            challenge: {
              id: task.id,
              category: task.category,
              customCategory: task.customCategory,
              title: task.title,
              difficulty: task.difficulty,
              timeEstimate: task.timeEstimate,
              points: task.points,
              bodyPart: task.bodyPart,
              isCustom: true,
            },
          }),
        }).catch(() => {
          // Ignore network errors in mock mode.
        });
      }
      return { ok: true as const, points: autoPoints };
    },
    [customChallenges.length, userId, dateKey],
  );

  const todayChallenges = useMemo(() => {
    const base = personalizeChallenges(serverChallenges, personality);
    const moodOrdered = buildMoodChallenges(base, mood, base.length);
    return [...customChallenges, ...moodOrdered];
  }, [customChallenges, personality, serverChallenges, mood]);

  const stats = useMemo(() => {
    const total = todayChallenges.reduce((s, c) => s + c.points, 0);
    let earned = 0;
    for (const c of todayChallenges) {
      if (completedIds.has(c.id)) earned += c.points;
    }
    const n = todayChallenges.length;
    const pct = n === 0 ? 0 : Math.round((completedIds.size / n) * 100);
    return {
      dailyProgressPercent: pct,
      todayPointsEarned: earned,
      totalTodayPoints: total,
    };
  }, [completedIds, todayChallenges]);

  const value = useMemo(
    () => ({
      userId,
      todayChallenges,
      completedIds,
      toggleComplete,
      advanceDay,
      simStreak,
      createStreakRestoreInvite,
      acceptStreakRestoreInvite,
      mood,
      setMood,
      reloadChallenges,
      dateKey,
      ...stats,
      personality,
      setPersonality,
      dailyQuote: baseDailyQuote || "Win the day before it wins you.",
      planLoading,
      planError,
      bestCategory,
      lowCategory,
      progress,
      customChallengesCount: customChallenges.length,
      maxCustomChallengesPerDay: MAX_CUSTOM_TASKS_PER_DAY,
      addCustomChallenge,
    }),
    [
      userId,
      todayChallenges,
      completedIds,
      toggleComplete,
      advanceDay,
      simStreak,
      createStreakRestoreInvite,
      acceptStreakRestoreInvite,
      mood,
      setMood,
      reloadChallenges,
      dateKey,
      stats,
      personality,
      setPersonality,
      customChallenges.length,
      addCustomChallenge,
      baseDailyQuote,
      planLoading,
      planError,
      bestCategory,
      lowCategory,
      progress,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
