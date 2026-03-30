import type { Challenge, CoachPersonality } from "@/types";

export const PERSONALITY_LABELS: Record<CoachPersonality, string> = {
  strict: "Strict",
  friendly: "Friendly",
  motivational: "Motivational",
  minimalist: "Minimalist",
};

const personalityDescription: Record<CoachPersonality, string> = {
  strict: "Direct, disciplined, accountability-first coaching.",
  friendly: "Supportive, warm, and encouraging tone.",
  motivational: "High-energy push with momentum framing.",
  minimalist: "Short, clear guidance with no extra noise.",
};

export function getPersonalityDescription(personality: CoachPersonality) {
  return personalityDescription[personality];
}

export function toneChallengeTitle(
  title: string,
  personality: CoachPersonality,
): string {
  // Keep the original challenge title stable.
  // We only personalize motivation/summary tone, not task titles.
  void personality;
  return title;
}

export function personalizeChallenges(
  challenges: Challenge[],
  personality: CoachPersonality,
): Challenge[] {
  return challenges.map((c) => ({
    ...c,
    title: toneChallengeTitle(c.title, personality),
  }));
}

export function personalizeMotivation(
  baseMessage: string,
  personality: CoachPersonality,
): string {
  switch (personality) {
    case "strict":
      return `No excuses today. ${baseMessage} Finish your hardest task before noon.`;
    case "friendly":
      return `You’re doing great. ${baseMessage} One challenge at a time, and you’ll feel proud tonight.`;
    case "motivational":
      return `You are in growth mode. ${baseMessage} Win this day and build unstoppable momentum.`;
    case "minimalist":
      return `Today: complete key tasks. ${baseMessage}`;
    default:
      return baseMessage;
  }
}

export function personalizeSummary(
  baseSummary: string,
  personality: CoachPersonality,
): string {
  switch (personality) {
    case "strict":
      return `Performance review: ${baseSummary} Tighten execution where you slipped.`;
    case "friendly":
      return `Quick reflection: ${baseSummary} Keep your wins, and gently improve the weak spots.`;
    case "motivational":
      return `Momentum check: ${baseSummary} You are closer than you think—keep pushing.`;
    case "minimalist":
      return `Summary: ${baseSummary}`;
    default:
      return baseSummary;
  }
}

export type CoachProfile = {
  name: string;
  emoji: string;
  role: string;
  intro: string;
  colorClass: string;
  imageUrl: string;
  imageAlt: string;
};

export const COACH_PROFILES: Record<CoachPersonality, CoachProfile> = {
  strict: {
    name: "Coach Blade",
    emoji: "🧠",
    role: "Discipline Specialist",
    intro:
      "I hold you accountable. We focus on execution, consistency, and measurable progress.",
    colorClass:
      "from-rose-500/20 to-orange-500/10 border-rose-300/60 dark:border-rose-800/50",
    imageUrl:
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=500&q=80",
    imageAlt: "Portrait of strict coach",
  },
  friendly: {
    name: "Coach Sunny",
    emoji: "😊",
    role: "Supportive Habit Coach",
    intro:
      "I help you build better routines with calm support and positive reinforcement.",
    colorClass:
      "from-emerald-500/20 to-teal-500/10 border-emerald-300/60 dark:border-emerald-800/50",
    imageUrl:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=500&q=80",
    imageAlt: "Portrait of friendly coach",
  },
  motivational: {
    name: "Coach Spark",
    emoji: "🔥",
    role: "Momentum Builder",
    intro:
      "I push your energy upward and turn small wins into unstoppable momentum.",
    colorClass:
      "from-violet-500/20 to-fuchsia-500/10 border-violet-300/60 dark:border-violet-800/50",
    imageUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=500&q=80",
    imageAlt: "Portrait of motivational coach",
  },
  minimalist: {
    name: "Coach Mono",
    emoji: "⚡",
    role: "Clarity Coach",
    intro: "I give concise direction. Less noise, clearer priorities, faster action.",
    colorClass:
      "from-zinc-500/20 to-zinc-400/10 border-zinc-300/70 dark:border-zinc-700/70",
    imageUrl:
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=500&q=80",
    imageAlt: "Portrait of minimalist coach",
  },
};

export function getCoachReply(
  personality: CoachPersonality,
  userMessage: string,
): string {
  const q = userMessage.toLowerCase();
  const topic = q.includes("sleep")
    ? "sleep"
    : q.includes("focus") || q.includes("mind")
      ? "focus"
      : q.includes("food") || q.includes("nutrition")
        ? "nutrition"
        : q.includes("productivity")
          ? "productivity"
          : "general";

  if (personality === "strict") {
    if (topic === "sleep") return "Hard cutoff: no screens 60 min before bed. Do it tonight.";
    if (topic === "focus") return "Run one 45-min deep-work block now. Zero notifications.";
    return "Pick one hard task and finish it before anything else.";
  }
  if (personality === "friendly") {
    if (topic === "sleep") return "Let’s make tonight easy: dim lights early and keep a short wind-down routine.";
    if (topic === "focus") return "You’ve got this. Try one distraction-free block, then take a short reset.";
    return "Great question. Start small, stay consistent, and celebrate the next win.";
  }
  if (personality === "motivational") {
    if (topic === "sleep") return "Protect your recovery and tomorrow becomes a power day. Commit now!";
    if (topic === "focus") return "Lock in for one focused sprint. This is how momentum is built!";
    return "You’re one action away from a breakthrough. Execute now.";
  }
  if (topic === "sleep") return "Sleep plan: fixed wake time + 60m wind-down.";
  if (topic === "focus") return "Focus plan: one deep-work block, no interruptions.";
  return "Next step: complete one high-impact task now.";
}
