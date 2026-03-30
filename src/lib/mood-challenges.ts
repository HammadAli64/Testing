import type { Challenge, MoodId } from "@/types";

export const MOOD_OPTIONS: {
  id: MoodId;
  label: string;
  emoji: string;
  description: string;
}[] = [
  {
    id: "happy",
    label: "Happy",
    emoji: "🙂",
    description: "Positive state. Keep momentum with balanced challenge wins.",
  },
  {
    id: "tired",
    label: "Tired",
    emoji: "😴",
    description: "Low energy. Keep tasks lighter and more doable.",
  },
  {
    id: "energetic",
    label: "Energetic",
    emoji: "⚡",
    description: "High momentum. Push harder execution tasks.",
  },
  {
    id: "motivational",
    label: "Motivational",
    emoji: "🔥",
    description: "Need a drive boost. Stack quick wins that build confidence.",
  },
];

const MOOD_PRIORITY: Record<MoodId, Challenge["category"][]> = {
  happy: ["business", "money", "grooming", "freedom", "power", "motivation"],
  tired: ["motivation", "grooming", "freedom", "business", "money", "power"],
  energetic: ["power", "business", "money", "freedom", "motivation", "grooming"],
  motivational: ["motivation", "power", "business", "money", "freedom", "grooming"],
};

const MOOD_HINT: Record<MoodId, string> = {
  happy: "Momentum set: convert positive mood into meaningful progress.",
  tired: "Low-friction set: lighter tasks, still moving forward.",
  energetic: "High-drive set: attack harder tasks while energy is high.",
  motivational: "Ignition set: fast wins to build confidence and consistency.",
};

export function getMoodHint(mood: MoodId) {
  return MOOD_HINT[mood];
}

export function buildMoodChallenges(
  all: Challenge[],
  mood: MoodId,
  take = 6,
): Challenge[] {
  const priority = MOOD_PRIORITY[mood];
  const sorted = [...all].sort((a, b) => {
    const pa = priority.indexOf(a.category);
    const pb = priority.indexOf(b.category);
    if (pa !== pb) return pa - pb;

    // For tired/motivational: prefer easier tasks first.
    if (mood === "tired" || mood === "motivational") {
      const rank = { Easy: 0, Medium: 1, Hard: 2 } as const;
      return rank[a.difficulty] - rank[b.difficulty];
    }

    // For energetic/happy: prefer harder tasks first.
    if (mood === "energetic" || mood === "happy") {
      const rank = { Hard: 0, Medium: 1, Easy: 2 } as const;
      return rank[a.difficulty] - rank[b.difficulty];
    }

    return 0;
  });

  // Keep variety: no more than 2 tasks from same category.
  const bucket: Record<string, number> = {};
  const picked: Challenge[] = [];
  for (const c of sorted) {
    if (picked.length >= take) break;
    const count = bucket[c.category] ?? 0;
    if (count >= 2) continue;
    bucket[c.category] = count + 1;
    picked.push(c);
  }
  return picked;
}
