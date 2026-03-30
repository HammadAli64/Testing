import type {
  BadgeDef,
  CategoryId,
  Challenge,
  DayHistory,
  LeaderboardEntry,
  WeeklyReport,
} from "@/types";

/** Human-readable labels for sidebar and filters. */
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  business: "Business",
  motivation: "Motivation",
  power: "Power",
  freedom: "Freedom",
  money: "Money",
  grooming: "Grooming",
};

export const CATEGORY_ORDER: CategoryId[] = [
  "business",
  "motivation",
  "power",
  "freedom",
  "money",
  "grooming",
];

/** Tailwind accent classes per category (borders, badges). */
export const categoryAccent: Record<
  CategoryId,
  { bg: string; text: string; ring: string }
> = {
  business: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-700 dark:text-indigo-300",
    ring: "ring-indigo-500/35",
  },
  motivation: {
    bg: "bg-amber-400/20",
    text: "text-amber-800 dark:text-amber-300",
    ring: "ring-amber-400/35",
  },
  power: {
    bg: "bg-rose-500/15",
    text: "text-rose-700 dark:text-rose-300",
    ring: "ring-rose-500/35",
  },
  freedom: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-700 dark:text-cyan-300",
    ring: "ring-cyan-500/35",
  },
  money: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/35",
  },
  grooming: {
    bg: "bg-fuchsia-500/15",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    ring: "ring-fuchsia-500/35",
  },
};

/** Simulated AI output for dashboard (matches requested JSON shape). */
export const MOCK_AI_PAYLOAD = {
  challenges: [
    {
      title: "20-minute zone-2 walk + mobility finisher",
      category: "fitness" as const,
      difficulty: "Medium" as const,
      time: "25 min",
      points: 15,
    },
    {
      title: "Wind-down: screens off 60m before bed",
      category: "sleep" as const,
      difficulty: "Easy" as const,
      time: "10 min",
      points: 10,
    },
    {
      title: "Single-task block: 25m Pomodoro, no inbox",
      category: "mind" as const,
      difficulty: "Medium" as const,
      time: "25 min",
      points: 12,
    },
    {
      title: "Inbox zero for one context (work or personal)",
      category: "productivity" as const,
      difficulty: "Hard" as const,
      time: "40 min",
      points: 20,
    },
    {
      title: "Protein-forward lunch + 500ml water before noon",
      category: "nutrition" as const,
      difficulty: "Easy" as const,
      time: "15 min",
      points: 10,
    },
    {
      title: "Micro-game: 5-min pattern memory (3 rounds)",
      category: "games" as const,
      difficulty: "Easy" as const,
      time: "5 min",
      points: 8,
    },
    {
      title: "Stretch + posture reset every 90 minutes",
      category: "fitness" as const,
      difficulty: "Easy" as const,
      time: "12 min",
      points: 10,
    },
    {
      title: "Weekly review: 3 wins + 1 constraint to fix",
      category: "productivity" as const,
      difficulty: "Medium" as const,
      time: "20 min",
      points: 15,
    },
  ],
  motivation:
    "Small wins compound—today is about rhythm, not perfection. Finish one hard task early; the rest gets easier.",
  summary:
    "Yesterday you were strong on fitness and focus, but sleep consistency dipped. Prioritize wind-down cues tonight to protect tomorrow's energy.",
};

function buildTodayChallenges(): Challenge[] {
  const today = new Date().toISOString().slice(0, 10);
  return MOCK_AI_PAYLOAD.challenges.map((c, i) => ({
    id: `today-${today}-${i}`,
    title: c.title,
    category: c.category,
    difficulty: c.difficulty,
    timeEstimate: c.time,
    points: c.points,
  }));
}

export const TODAY_CHALLENGES: Challenge[] = buildTodayChallenges();

/** Category scores for radar / bars (demo). */
export const CATEGORY_SCORES = CATEGORY_ORDER.map((category) => ({
  category,
  label: CATEGORY_LABELS[category],
  score:
    category === "fitness"
      ? 82
      : category === "sleep"
        ? 64
        : category === "mind"
          ? 78
          : category === "productivity"
            ? 71
            : category === "nutrition"
              ? 69
              : 75,
}));

export const MOCK_STREAK = 24;

export const MOCK_TOTAL_POINTS = 4280;

export const MOCK_BEST_CATEGORY: CategoryId = "fitness";

export const MOCK_CONSISTENCY_SCORE = 78;

/** Last 14 days completion rate for charts (%). */
export const DAILY_COMPLETION_SERIES: { date: string; rate: number }[] = [
  { date: "Mar 10", rate: 62 },
  { date: "Mar 11", rate: 71 },
  { date: "Mar 12", rate: 58 },
  { date: "Mar 13", rate: 80 },
  { date: "Mar 14", rate: 75 },
  { date: "Mar 15", rate: 69 },
  { date: "Mar 16", rate: 85 },
  { date: "Mar 17", rate: 72 },
  { date: "Mar 18", rate: 88 },
  { date: "Mar 19", rate: 66 },
  { date: "Mar 20", rate: 79 },
  { date: "Mar 21", rate: 91 },
  { date: "Mar 22", rate: 77 },
  { date: "Mar 23", rate: 84 },
];

export const WEEKLY_PROGRESS_BARS: { week: string; value: number }[] = [
  { week: "W1", value: 68 },
  { week: "W2", value: 74 },
  { week: "W3", value: 71 },
  { week: "W4", value: 82 },
];

/** Monthly aggregate completion % (demo). */
export const MONTHLY_COMPLETION: { month: string; rate: number }[] = [
  { month: "Oct", rate: 58 },
  { month: "Nov", rate: 63 },
  { month: "Dec", rate: 67 },
  { month: "Jan", rate: 70 },
  { month: "Feb", rate: 74 },
  { month: "Mar", rate: 79 },
];

function sampleChallenge(
  id: string,
  partial: Partial<Challenge> & Pick<Challenge, "title" | "category">,
): Challenge {
  return {
    id,
    difficulty: partial.difficulty ?? "Medium",
    timeEstimate: partial.timeEstimate ?? "20 min",
    points: partial.points ?? 12,
    title: partial.title,
    category: partial.category,
  };
}

/** Past days for history page (demo). */
export const HISTORY_DAYS: DayHistory[] = [
  {
    date: "2026-03-23",
    score: 76,
    completed: [
      sampleChallenge("h1", {
        title: "Morning mobility + 8k steps",
        category: "fitness",
        difficulty: "Medium",
        timeEstimate: "35 min",
        points: 15,
      }),
      sampleChallenge("h2", {
        title: "No caffeine after 2pm",
        category: "sleep",
        difficulty: "Easy",
        timeEstimate: "—",
        points: 8,
      }),
      sampleChallenge("h3", {
        title: "Deep work: 2×45m blocks",
        category: "mind",
        difficulty: "Hard",
        timeEstimate: "90 min",
        points: 22,
      }),
    ],
    missed: [
      sampleChallenge("m1", {
        title: "Meal prep: 2 balanced meals",
        category: "nutrition",
        difficulty: "Medium",
        timeEstimate: "45 min",
        points: 15,
      }),
    ],
    aiSummary:
      "Strong execution on movement and focus; nutrition slipped when the afternoon ran long. Batch prep Sunday to remove weekday friction.",
  },
  {
    date: "2026-03-22",
    score: 88,
    completed: [
      sampleChallenge("h4", {
        title: "Strength: push + pull superset",
        category: "fitness",
        difficulty: "Hard",
        timeEstimate: "50 min",
        points: 20,
      }),
      sampleChallenge("h5", {
        title: "Sleep routine checklist",
        category: "sleep",
        difficulty: "Easy",
        timeEstimate: "15 min",
        points: 10,
      }),
      sampleChallenge("h6", {
        title: "Inbox to zero",
        category: "productivity",
        difficulty: "Medium",
        timeEstimate: "30 min",
        points: 14,
      }),
      sampleChallenge("h7", {
        title: "Hydration game: hit 2L",
        category: "nutrition",
        difficulty: "Easy",
        timeEstimate: "—",
        points: 8,
      }),
    ],
    missed: [],
    aiSummary:
      "Excellent balance across categories—this is your template for a high-score day. Keep one anchor habit when travel hits.",
  },
  {
    date: "2026-03-21",
    score: 61,
    completed: [
      sampleChallenge("h8", {
        title: "Quick HIIT 12 min",
        category: "fitness",
        difficulty: "Medium",
        timeEstimate: "15 min",
        points: 12,
      }),
      sampleChallenge("h9", {
        title: "Reaction-time mini game ×5",
        category: "games",
        difficulty: "Easy",
        timeEstimate: "8 min",
        points: 6,
      }),
    ],
    missed: [
      sampleChallenge("m2", {
        title: "Plan tomorrow in 10 minutes",
        category: "productivity",
        difficulty: "Easy",
        timeEstimate: "10 min",
        points: 8,
      }),
      sampleChallenge("m3", {
        title: "Digital sunset 45m before bed",
        category: "sleep",
        difficulty: "Medium",
        timeEstimate: "—",
        points: 10,
      }),
    ],
    aiSummary:
      "You performed well in fitness but need improvement in sleep and planning. Tighten the evening shutdown to recover your score.",
  },
];

export const LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, name: "A. Rivers", points: 5120, streak: 41 },
  { rank: 2, name: "M. Okonkwo", points: 4892, streak: 35 },
  { rank: 3, name: "You (demo)", points: MOCK_TOTAL_POINTS, streak: MOCK_STREAK },
  { rank: 4, name: "K. Patel", points: 4011, streak: 19 },
  { rank: 5, name: "J. Silva", points: 3880, streak: 22 },
];

export const BADGES: BadgeDef[] = [
  {
    id: "first-week",
    name: "First Week",
    description: "Completed 5+ tasks in a single week.",
    unlocked: true,
  },
  {
    id: "streak-7",
    name: "Week of Fire",
    description: "7-day activity streak.",
    unlocked: true,
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Touched every category in one day.",
    unlocked: false,
  },
  {
    id: "deep-focus",
    name: "Deep Focus",
    description: "3 hard Mind tasks in a week.",
    unlocked: true,
  },
];

export const WEEKLY_AI_REPORT: WeeklyReport = {
  weekLabel: "Mar 17 – Mar 23, 2026",
  headline: "Momentum is building—protect sleep to unlock the next tier.",
  highlights: [
    "Completion rate up 9% vs prior week; best day was Mar 21 for consistency.",
    "Fitness and Mind scores are leading; Sleep is the main drag on recovery.",
    "You’re taking on harder Productivity tasks—keep batching shallow work.",
  ],
  focusNextWeek:
    "Pick one non-negotiable wind-down action (same time nightly) and stack it with your existing walk habit.",
};

/** Mock assistant replies for demo chat. */
export const MOCK_CHAT_REPLIES: Record<string, string> = {
  default:
    "I’m a demo assistant. In production, this would use your history to suggest the next best challenge or reschedule your day.",
  streak:
    "Your streak is a signal of identity, not perfection—protect it with tiny wins on busy days.",
  sleep:
    "For sleep, try: fixed wake time, light exposure in the morning, and a hard stop on late work blocks.",
};
