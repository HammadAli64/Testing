import type { CategoryId, Difficulty, MoodId } from "@/types";
import { fetchCoach } from "@/lib/coach-api";

/** Shape returned by OpenAI structured output in production. */
export type GeneratedDailyPlan = {
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

/**
 * Calls the Django coach API to generate a daily plan.
 * Falls back to mock payloads if the backend is not available.
 */
export type GenerateDailyPlanRequest = {
  userId: string;
  date?: string; // ISO YYYY-MM-DD (UTC)
  mood?: MoodId;
};

export async function generateDailyChallenges(
  userData: GenerateDailyPlanRequest,
  options?: { _didIngestRetry?: boolean },
): Promise<GeneratedDailyPlan> {
  const requestPlan = async (): Promise<GeneratedDailyPlan> => {
    const res = await fetchCoach(`/api/coach/daily-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const errJson = (await res.json()) as { error?: string };
        detail = errJson?.error ? `: ${errJson.error}` : "";
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(`HTTP ${res.status} from coach API${detail}`);
    }

    const json = (await res.json()) as { ok: boolean; plan: unknown };
    if (!json?.ok || typeof json.plan !== "object" || json.plan === null) {
      throw new Error("Invalid coach API response");
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
      }[];
      motivation: string;
      summary: string;
      dailyQuote?: string;
    };

    if (!Array.isArray(plan.challenges) || plan.challenges.length === 0) {
      throw new Error("Coach API returned no challenges for today");
    }

    return plan;
  };

  try {
    return await requestPlan();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const looksLikeNoRag =
      msg.includes("NO_RAG") ||
      msg.includes("no challenges") ||
      msg.includes("No supported files");
    if (!options?._didIngestRetry && looksLikeNoRag && userData.userId) {
      try {
        await fetchCoach(`/api/coach/read-folder/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: userData.userId }),
        });
      } catch {
        // ignore; requestPlan will surface the real error
      }
      return generateDailyChallenges(userData, { _didIngestRetry: true });
    }
    throw new Error(msg || "Coach backend unavailable (no demo fallback)");
  }
}
