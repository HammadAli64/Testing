/** Domain types for Mock Mode Life System (demo / frontend-only). */

export type CategoryId =
  | "business"
  | "motivation"
  | "power"
  | "freedom"
  | "money"
  | "grooming";

export type Difficulty = "Easy" | "Medium" | "Hard";
export type CoachPersonality =
  | "strict"
  | "friendly"
  | "motivational"
  | "minimalist";

export type MoodId =
  | "happy"
  | "tired"
  | "energetic"
  | "motivational";

export interface Challenge {
  id: string;
  title: string;
  category: CategoryId;
  customCategory?: string;
  difficulty: Difficulty;
  timeEstimate: string;
  points: number;
  bodyPart?: string;
  details?: string;
  benefits?: string;
  isCustom?: boolean;
}

export interface ChallengeWithStatus extends Challenge {
  status: "pending" | "completed" | "missed";
}

export interface DayHistory {
  date: string; // ISO date YYYY-MM-DD
  score: number; // 0–100
  completed: Challenge[];
  missed: Challenge[];
  aiSummary: string;
}

export interface CategoryScore {
  category: CategoryId;
  label: string;
  score: number; // 0–100
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  points: number;
  streak: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
}

export interface WeeklyReport {
  weekLabel: string;
  headline: string;
  highlights: string[];
  focusNextWeek: string;
}
