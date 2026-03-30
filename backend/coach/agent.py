from __future__ import annotations

import hashlib
import json
import os
import re
import random
from pathlib import Path
from typing import Literal

from agents import Agent, Runner
from pydantic import BaseModel, Field, ValidationError
from dotenv import load_dotenv

from .store import (
    ALLOWED_CATEGORIES,
    rag_all_chunks,
    recent_plan_titles,
    recent_user_mindset_signals,
)
from .rag import ensure_rag_chunks_if_empty, retrieve

_DOC_MINDSET_CACHE: dict[str, tuple[str, str]] = {}


Difficulty = Literal["Easy", "Medium", "Hard"]
Category = Literal[
    "business",
    "motivation",
    "power",
    "freedom",
    "money",
    "grooming",
]

SKELETON_PARTS = [
    "Skull",
    "Neck",
    "Shoulders",
    "Rib Cage",
    "Spine",
    "Left Arm",
    "Right Arm",
    "Pelvis",
    "Left Hand",
    "Right Hand",
    "Left Leg",
    "Right Leg",
    "Feet",
]


class ChallengeOut(BaseModel):
    title: str = Field(min_length=8, max_length=520)
    category: Category
    difficulty: Difficulty
    time: str = Field(min_length=1)  # e.g. "15 min"
    points: int = Field(ge=1, le=9)
    body_part: str = Field(min_length=2)
    details: str = Field(min_length=10)
    benefits: str = Field(min_length=10)


class DailyPlanOut(BaseModel):
    challenges: list[ChallengeOut] = Field(min_length=1)
    motivation: str
    summary: str
    dailyQuote: str = Field(min_length=5)


class CategoryChoiceOut(BaseModel):
    bestCategory: Category
    lowCategory: Category
    bestReason: str
    lowReason: str


class ChatOut(BaseModel):
    reply: str


class DayMetaOut(BaseModel):
    motivation: str
    summary: str
    dailyQuote: str = Field(min_length=5)


class DailyQuoteOut(BaseModel):
    dailyQuote: str = Field(min_length=8, max_length=280)


class ChallengeDetailOut(BaseModel):
    explanation: str = Field(min_length=30)
    approaches: list[str] = Field(min_length=3, max_length=3)
    benefits: list[str] = Field(min_length=3, max_length=3)
    quickStart: str = Field(min_length=10)


def _ensure_backend_env_loaded() -> None:
    """
    Load backend/.env into this process on-demand.
    This lets Gemini work even if the server started before .env edits.
    """
    backend_root = Path(__file__).resolve().parents[1]
    dotenv_path = backend_root / ".env"
    load_dotenv(dotenv_path=dotenv_path, override=False)


def _local_category_choice(stats: dict) -> CategoryChoiceOut:
    """
    Fallback: choose categories based on *completed count* (not completion_rate).
    If there is no history at all, return a stable default pair.
    """
    completed_by_cat: dict[Category, int] = {}
    missed_by_cat: dict[Category, int] = {}
    attempts_by_cat: dict[Category, int] = {}

    total_attempts_all = 0
    for cat in ALLOWED_CATEGORIES:
        cat_stats = stats.get(cat, {}) if isinstance(stats, dict) else {}
        completed = int(cat_stats.get("completed", 0) or 0)
        missed = int(cat_stats.get("missed", 0) or 0)
        attempts = completed + missed
        total_attempts_all += attempts

        completed_by_cat[cat] = completed
        missed_by_cat[cat] = missed
        attempts_by_cat[cat] = attempts

    # No history: stable defaults.
    if total_attempts_all == 0:
        best_default: Category = ALLOWED_CATEGORIES[0]
        low_default: Category = ALLOWED_CATEGORIES[1] if len(ALLOWED_CATEGORIES) > 1 else ALLOWED_CATEGORIES[0]
        return CategoryChoiceOut(
            bestCategory=best_default,
            lowCategory=low_default,
            bestReason="No history yet — using a stable default best category.",
            lowReason="No history yet — using a stable default low category.",
        )

    # Best: most completed, tie-break by attempts (more signal), then name for stability.
    best = max(
        ALLOWED_CATEGORIES,
        key=lambda c: (completed_by_cat[c], attempts_by_cat[c], c),
    )

    # Low: least completed, tie-break by attempts (more signal), then name for stability.
    low = min(
        ALLOWED_CATEGORIES,
        key=lambda c: (completed_by_cat[c], -attempts_by_cat[c], c),
    )

    best_reason = (
        f"You completed the most tasks in `{best}` "
        f"({completed_by_cat[best]} completed, {missed_by_cat[best]} missed)."
    )
    low_reason = (
        f"You completed the fewest tasks in `{low}` "
        f"({completed_by_cat[low]} completed, {missed_by_cat[low]} missed)."
    )
    return CategoryChoiceOut(bestCategory=best, lowCategory=low, bestReason=best_reason, lowReason=low_reason)


def choose_best_and_low_category_ai(stats: dict) -> CategoryChoiceOut:
    """
    Uses OpenAI Agents SDK; falls back to local math on failure.
    """
    if not _env_flag("MONK_USE_AGENT_CATEGORY_CHOOSER"):
        return _local_category_choice(stats)

    try:
        _ensure_backend_env_loaded()
        categories_list = ", ".join(ALLOWED_CATEGORIES)
        prompt = f"""
Stats JSON (completion based):
{json.dumps(stats, ensure_ascii=False, indent=2)}

Categories: {categories_list}

Pick `bestCategory` as the category with the MOST `completed` tasks (tie-break by more total attempts).
Pick `lowCategory` as the category with the FEWEST `completed` tasks (tie-break by more total attempts).

Return ONLY JSON in this shape:
{{
  "bestCategory": "<one of categories>",
  "lowCategory": "<one of categories>",
  "bestReason": "<short reason>",
  "lowReason": "<short reason>"
}}
""".strip()
        agent = Agent(
            name="Monk Coach Category Chooser",
            instructions=(
                "Choose the user's best and lowest categories based on the provided stats. "
                "Return ONLY valid JSON for CategoryChoiceOut."
            ),
            model=(os.environ.get("OPENAI_AGENTS_MODEL") or None),
        )
        result = Runner.run_sync(agent, prompt)
        raw_text = getattr(result, "final_output", None) or str(result)

        match = re.search(r"\{[\\s\\S]*\}", raw_text)
        if not match:
            raise ValueError("No JSON object found")
        payload = json.loads(match.group(0))
        return CategoryChoiceOut.model_validate(payload)
    except Exception as exc:
        print(f"[coach] AI category chooser failed, fallback to local: {exc}")
        return _local_category_choice(stats)


def generate_chat_reply(
    *,
    user_id: str,
    date: str,
    personality: str,
    message: str,
    history: list[dict],
    stats: dict,
    bestCategory: str,
    lowCategory: str,
    recent_custom_titles: dict,
    today_challenges: list[dict] | None = None,
    frontend_context: dict | None = None,
) -> ChatOut:
    """
    Coach chat via OpenAI Agents SDK; falls back to deterministic local reply.
    """

    def local_reply() -> ChatOut:
        msg_lower = message.lower().strip()
        today = today_challenges or []
        pending = [c for c in today if str(c.get("status")) != "completed"]
        top_pending = pending[:3]
        last_user_msgs = [
            str(h.get("text") or "")
            for h in history[-8:]
            if str(h.get("role") or "").lower() == "user"
        ]
        last_topic = last_user_msgs[-2] if len(last_user_msgs) >= 2 else ""

        def _best_low_line() -> str:
            return f"Your best category is `{bestCategory}` and your lowest is `{lowCategory}`."

        def _coach_voice(text: str) -> str:
            p = (personality or "").lower()
            if p == "strict":
                return f"Non-negotiable: {text}"
            if p == "motivational":
                return f"Momentum mode: {text}"
            if p == "minimalist":
                return f"{text}"
            return f"Coach: {text}"

        def _pending_block() -> str:
            if not top_pending:
                return "- No pending challenge found. Ask me to build a 15-minute plan from your weakest category."
            lines = []
            for i, c in enumerate(top_pending, start=1):
                lines.append(f"- {i}. {c.get('title','Task')} ({c.get('category','general')})")
            return "\n".join(lines)

        if "progress" in msg_lower or "analytics" in msg_lower or "history" in msg_lower:
            reply = (
                f"{_coach_voice('Here is your progress command center.')}\n"
                "- Open Progress: streak, totals, and daily/weekly trend.\n"
                "- Open History: category-level completion behavior.\n"
                "- Open Dashboard: today completion %, pending tasks, and next actions.\n\n"
                f"{_best_low_line()}"
            )
            return ChatOut(reply=reply)

        if "leader" in msg_lower or "leaderboard" in msg_lower or "top" in msg_lower or "rank" in msg_lower:
            reply = (
                "To earn points and climb:\n"
                "- **Complete challenges** (tap **Mark complete**) — each challenge awards the points shown on the card.\n"
                "- Points are generated by the backend when your daily plan/followups are created (currently **random 1–9**).\n"
                "- Your completed points accumulate as you complete more tasks.\n\n"
                "Note: the **Leaderboard** page is still mostly a demo UI; your real progress is tracked from your stored completions.\n\n"
                f"{_best_low_line()}"
            )
            return ChatOut(reply=reply)

        if "point" in msg_lower or "pts" in msg_lower:
            reply = (
                f"{_coach_voice('Points are earned only through completed execution.')}\n"
                "- Each challenge card shows points; completion adds them.\n"
                "- Fastest growth: complete 6+ tasks/day and keep streak alive.\n"
                "- Use low-friction tasks first, then one deeper task.\n\n"
                f"{_best_low_line()}"
            )
            return ChatOut(reply=reply)

        reply = (
            f"{_coach_voice('I can help like a real assistant, step by step.')}\n"
            "Your pending focus list:\n"
            f"{_pending_block()}\n\n"
            "Action plan now:\n"
            "- Pick 1 task from the list.\n"
            "- I will break it into 3 micro-steps.\n"
            "- You execute step 1 in 5 minutes, then report back.\n\n"
            + (f"Previous topic to continue: {last_topic}\n\n" if last_topic else "")
            + f"{_best_low_line()}\n"
            "Reply with: `start task 1` or paste a challenge title."
        )
        return ChatOut(reply=reply)

    try:
        _ensure_backend_env_loaded()
        rag_chunks = retrieve(user_id=user_id, query=message, k=6)
        rag_context = "\n\n".join([f"[{c.source}#{c.chunk_id}]\n{c.content}" for c in rag_chunks])

        today = today_challenges or []
        ui_ctx = frontend_context or {}
        prompt = f"""
You are the Monk app coach assistant. Your job is to help the user COMPLETE challenges.

Rules:
- Prefer the user's CURRENT day challenges when giving advice.
- If the user asks "how to do it" or is stuck, give:
  1) the smallest 2–5 minute starter step,
  2) a simple checklist (3–6 bullets),
  3) a fallback option if they have low energy,
  4) what benefit they’ll get if they finish.
- Use the RAG context below to ground your ideas (pull language, tactics, and principles from it).
- Ask at most 1 short clarifying question if needed.
- Style: sharp, direct, tactical. No fluff, no generic motivation speech.
- Think conversationally across turns like a strong assistant (ChatGPT-style): continue context, answer directly, then guide next action.
- Format: direct answer first, then practical plan/checklist, then one follow-up question.
- If user asks for challenge ideas, propose 2 options aligned to today's pending tasks.

Selected coach personality: {personality}
Personality style rules:
- strict: direct accountability, zero-excuse phrasing, clear standards.
- friendly: warm, supportive, human, encouraging but still practical.
- motivational: high energy, momentum language, challenge-forward.
- minimalist: concise, low-noise, short practical instructions.

UserId: {user_id}
Date: {date}

BestCategory: {bestCategory}
LowCategory: {lowCategory}

Stats JSON (completion based):
{json.dumps(stats, ensure_ascii=False)}

Recent custom task titles (by category):
{json.dumps(recent_custom_titles, ensure_ascii=False)}

Today's challenges (with status):
{json.dumps(today, ensure_ascii=False)}

Frontend app state snapshot (UI data user is seeing right now):
{json.dumps(ui_ctx, ensure_ascii=False)}

RAG context (from the user's uploaded file):
{rag_context}

Conversation history (most recent last):
{json.dumps(history[-10:], ensure_ascii=False)}

User message:
{message}

Return ONLY JSON:
{{
  "reply": "..."
}}
""".strip()
        agent = Agent(
            name="Monk Coach Chat",
            instructions=(
                "You are a sharp execution coach and full conversational assistant. "
                "Speak directly, precisely, and with tactical clarity. "
                "No filler, no vague advice. "
                "Adopt the selected coach personality exactly. "
                "Maintain memory from chat history and continue the same thread naturally. "
                "Ground every suggestion in today's challenges and provided RAG context. "
                "Answer first, then provide a practical step-by-step plan, then ask one focused follow-up."
            ),
            model=(os.environ.get("OPENAI_AGENTS_MODEL") or None),
        )
        result = Runner.run_sync(agent, prompt)
        raw_text = getattr(result, "final_output", None) or str(result)

        match = re.search(r"\{[\\s\\S]*\}", raw_text)
        if not match:
            raise ValueError("No JSON object found")
        payload = json.loads(match.group(0))
        return ChatOut.model_validate(payload)
    except Exception as exc:
        print(f"[coach] chat agent failed, using local fallback: {exc}")
        return local_reply()


def generate_followup_challenges(
    *,
    user_id: str,
    date: str,
    stats: dict,
    focus_category: str,
    count: int = 2,
) -> list[ChallengeOut]:
    """
    Generate a few new challenges after a completion event.
    Uses OpenAI Agents SDK; falls back to local templates.
    """

    count = max(1, min(int(count), 4))
    if focus_category not in ALLOWED_CATEGORIES:
        focus_category = "business"

    templates: dict[str, list[str]] = {
        "business": [
            "Write a 5-line offer pitch for one customer type",
            "List 10 leads and message 1 (short + specific)",
            "Define 1 KPI for today and track it once",
        ],
        "motivation": [
            "Write one sentence: why today matters (keep it honest)",
            "Do a 2-minute countdown start: begin the task before you feel ready",
            "Create a tiny win: finish a 5-minute version of your task",
        ],
        "power": [
            "Say no to one distraction (write it down, then close it)",
            "Stand tall + 10 deep breaths before your next action",
            "Set one boundary for the next hour (no phone / no tabs)",
        ],
        "freedom": [
            "Delete or delegate one obligation you don’t want",
            "Create a 3-step plan to reduce one recurring problem",
            "Design one system: checklist for a repeated task",
        ],
        "money": [
            "Track every spend for the next 2 hours",
            "Find one expense to cut or downgrade (write the change)",
            "Increase income: identify 1 skill → 1 action to sell it",
        ],
        "grooming": [
            "10-minute tidy + outfit prep for tomorrow",
            "Skincare/hygiene reset: do your full routine once",
            "Hair/wardrobe: choose 1 upgrade and schedule it",
        ],
    }

    def local() -> list[ChallengeOut]:
        picks = templates[focus_category]
        out: list[ChallengeOut] = []
        for i in range(count):
            out.append(
                ChallengeOut(
                    title=picks[i % len(picks)],
                    category=focus_category,  # type: ignore[arg-type]
                    difficulty="Easy",
                    time="15 min",
                    points=random.randint(1, 9),
                    body_part=SKELETON_PARTS[(i + random.randint(0, 999)) % len(SKELETON_PARTS)],
                )
            )
        print(
            f"[coach] local followup used for user={user_id} date={date} "
            f"category={focus_category} count={count}"
        )
        return out

    try:
        _ensure_backend_env_loaded()
        instructions = (
            "Generate follow-up challenges after a user completed a task."
        )
        prompt = f"""
Return ONLY valid JSON as an array of exactly {count} objects:
[
  {{
    "title": string,
    "category": "{focus_category}",
    "difficulty": one of ["Easy","Medium","Hard"],
    "time": string (format: "<number> min"),
    "points": integer (random 1..9),
    "body_part": one of {json.dumps(SKELETON_PARTS)}
  }}
]

Make titles actionable and varied. Use the user's stats (JSON below) lightly.
Stats:
{json.dumps(stats, ensure_ascii=False)}
""".strip()
        agent = Agent(name="Monk Coach Followup", instructions=instructions, model=(os.environ.get("OPENAI_AGENTS_MODEL") or None))
        result = Runner.run_sync(agent, prompt)
        raw_text = getattr(result, "final_output", None) or str(result)
        m = re.search(r"\[[\s\S]*\]", raw_text)
        if not m:
            raise ValueError("No JSON array found")
        payload = json.loads(m.group(0))
        items = [ChallengeOut.model_validate(x) for x in payload]
        if len(items) != count:
            raise ValueError("Wrong followup count")
        items = _dedupe_challenges(items)
        print(
            f"[coach] agent followup validated user={user_id} date={date} "
            f"category={focus_category} count={count}"
        )
        return items
    except Exception as exc:
        print(f"[coach] followup agent failed, using local: {exc}")
        return local()


def _extract_json_object(text: str) -> str:
    # Best-effort extraction in case the model adds commentary.
    match = re.search(r"\{[\\s\\S]*\}", text)
    if not match:
        raise ValueError("No JSON object found in model output")
    return match.group(0)


def _rag_snippet_for_daily_quote(user_id: str, date: str) -> str:
    rows = rag_all_chunks(user_id)
    if not rows:
        return ""
    h = int(hashlib.sha256(f"{user_id}:{date}:quote".encode()).hexdigest(), 16)
    parts: list[str] = []
    for j in range(3):
        r = rows[(h + j) % len(rows)]
        c = str(r.get("content") or "").strip()
        if c:
            parts.append(c[:520])
    return "\n\n---\n\n".join(parts)


_CLEAR_DAILY_QUOTES: tuple[str, ...] = (
    # Cause-effect and “rule of thumb” lines: one clear idea, plain English.
    "If you wait until you feel ready, you will wait forever—so start with a five-minute version.",
    "You learn what works by shipping something small and reading the result, not by thinking longer.",
    "Trust is not a feeling you wait for; it is built when you keep a promise to yourself.",
    "When the task feels huge, cut it until you can finish it in one sitting.",
    "Your attention is the bottleneck: pick one priority, then remove one distraction before you begin.",
    "A decision you act on beats a smarter decision you keep postponing.",
    "If you cannot explain the next step in one sentence, the plan is still too vague.",
    "People buy from people they trust, and trust comes from clear communication and follow-through.",
    "Stress drops when you replace a worry loop with one scheduled action on the calendar.",
    "If you track nothing, you cannot improve anything—pick one metric and move it a little today.",
    "You do not need more ideas; you need one idea tested with real feedback.",
    "Energy follows clarity: write the outcome first, then do the smallest step toward it.",
    "If you say yes to everything, you are saying no to your best work—cut one commitment today.",
    "Confidence grows when you collect proof, not when you collect intentions.",
    "When you are tired, lower the bar but keep the streak—consistency beats intensity.",
    "If you want better relationships, be predictable: do what you said you would do, on time.",
    "Procrastination is often fear in disguise—make the first step embarrassingly small.",
    "You cannot control every outcome, but you can control your next honest effort.",
    "If the task is unclear, spend two minutes writing a checklist before you touch the work.",
    "Sales and trust both improve when you listen first, then offer one simple next step.",
    "Burnout is a signal that your boundaries failed—set one boundary and keep it today.",
    "If you compare yourself to strangers online, compare your actions instead of your feelings.",
    "Money moves when you ask for it with a clear offer, a price, and a deadline.",
    "You finish more when you timebox: set a timer, work, stop, then decide the next block.",
    "If you want discipline, design the environment so the right action is the easy action.",
    "Learning sticks when you teach it back in your own words or apply it once immediately.",
    "When emotions spike, slow down—write facts first, then choose one response.",
    "If you want respect, communicate expectations early instead of hoping people guess them.",
    "Your reputation is the sum of small kept promises, not one big speech.",
    "If you feel stuck, change one variable: time, place, tool, or the size of the task.",
    "Progress is visible when you save evidence: a message sent, a file updated, a number changed.",
    "You cannot read your way to results; you practice your way to results.",
    "If you avoid hard tasks, schedule them first—willpower is higher earlier in the day.",
    "Good sleep and one focused hour beat caffeine and four distracted ones.",
    "If you want to lead, make decisions on time and explain them in simple language.",
    "Anxiety shrinks when you convert “what if” into “next step” on paper.",
    "You build a career by repeating useful skills until they become automatic.",
    "If you want calm productivity, end each day by naming tomorrow’s first task.",
)

_MOOD_LOGICAL_QUOTES: dict[str, tuple[str, ...]] = {
    "happy": (
        "Good energy is useful only if you aim it—pick one outcome and finish one piece of it today.",
        "When you feel positive, channel it into a task you usually avoid while motivation is high.",
        "A strong mood is a window: use it to clear a backlog item, not only to feel busy.",
    ),
    "tired": (
        "Low energy means smaller scope, not zero action—do one easy win and stop.",
        "When you are drained, protect sleep first, then do one twenty-minute task with a timer.",
        "If you cannot think straight, pick the smallest physical step and complete only that.",
    ),
    "energetic": (
        "High energy is temporary—spend it on your hardest important task before it fades.",
        "When you feel wired, convert motion into output: ship something concrete before the day scatters.",
        "Use strong drive to tackle one task that moves money, health, or learning—not just busywork.",
    ),
    "motivational": (
        "Motivation follows action more often than the reverse—begin, then motivation catches up.",
        "If you need a push, stack two tiny wins back-to-back to rebuild momentum.",
        "Drive grows when you prove you can start; make the first step smaller than your excuse.",
    ),
}


def _looks_like_bad_quote_fragment(line: str) -> bool:
    """
    Reject mid-sentence fragments from OCR/RAG (e.g. starting mid-word or with a conjunction).
    """
    s = (line or "").strip()
    if not s:
        return True
    s = re.sub(r"\s+", " ", s)
    # Drop surrounding quotes for checks
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1].strip()
    if len(s) < 18:
        return True
    first = s[0]
    if first.isalpha() and first.islower():
        return True
    bad_prefixes = (
        "and ",
        "but ",
        "so ",
        "or ",
        "as ",
        "if ",
        "when ",
        "while ",
        "because ",
        "which ",
        "that ",
        "also ",
        "then ",
        "either ",
        "neither ",
        "nor ",
        "yet ",
        "although ",
        "however ",
        "for some ",
        "as a result",
        "as a result ",
        "by default",
        "customers ",
        "they ",
        "their ",
        "y ",
        "much ",
        "very ",
    )
    low = s.lower()
    for p in bad_prefixes:
        if low.startswith(p):
            return True
    return False


def _looks_like_weak_or_vague_quote(line: str) -> bool:
    """
    Reject rambling, slash-joined, or overly long lines that read like bad AI filler.
    """
    s = re.sub(r"\s+", " ", (line or "").strip())
    if not s:
        return True
    if " / " in s or "  /  " in s:
        return True
    words = s.split()
    if len(words) > 42:
        return True
    if s.count(" and ") > 3:
        return True
    low = s.lower()
    fuzzy = (
        "unlock your",
        "synergy",
        "paradigm shift",
        "game-changer",
        "level up",
        "crush it",
        "hustle harder",
        "manifest",
        "vibrate",
    )
    if any(x in low for x in fuzzy):
        return True
    return False


def _quote_pool_for_mood(mood: str) -> tuple[str, ...]:
    m = (mood or "motivational").strip().lower()
    mood_specific = _MOOD_LOGICAL_QUOTES.get(m, ())
    if mood_specific:
        return mood_specific + _CLEAR_DAILY_QUOTES
    return _CLEAR_DAILY_QUOTES


def _deterministic_daily_quote(*, user_id: str, date: str, mood: str = "motivational") -> str:
    """
    Always returns a complete, readable sentence (no raw RAG mid-chunk fragments).
    Picks from mood-specific logical lines when available, else the general pool.
    """
    pool = _quote_pool_for_mood(mood)
    h = int(
        hashlib.sha256(f"{user_id}:{date}:{mood}:qclear".encode()).hexdigest(),
        16,
    )
    return pool[h % len(pool)]


def _normalize_daily_quote_clarity(
    q: str,
    *,
    user_id: str,
    date: str,
    mood: str,
) -> str:
    s = re.sub(r"\s+", " ", (q or "").strip())
    if len(s) > 220:
        s = s[:217].rsplit(" ", 1)[0] + "…"
    if (
        len(s) < 18
        or _looks_like_bad_quote_fragment(s)
        or _looks_like_weak_or_vague_quote(s)
    ):
        return _deterministic_daily_quote(user_id=user_id, date=date, mood=mood)
    return s


def ensure_logical_daily_quote(
    *,
    quote: str,
    user_id: str,
    date: str,
    mood: str,
) -> str:
    """
    Public helper for views: sanitize any stored/returned quote into a logical line.
    """
    return _normalize_daily_quote_clarity(quote, user_id=user_id, date=date, mood=mood)


def generate_daily_quote_ai(
    *,
    user_id: str,
    date: str,
    mood: str,
    stats: dict,
    achieved: dict | None = None,
) -> str:
    """
    One original, day-specific motivational line grounded in RAG + user context.
    Falls back to a deterministic RAG-derived line if the agent fails.
    """
    achieved_ctx = achieved or {}
    rag = _rag_snippet_for_daily_quote(user_id, date)
    prompt = f"""
You write ONE original line for a productivity app (not a famous quote, no attribution).

Inputs:
- date: {date} (the quote should feel written *for this day*; do not mention the ISO date string literally unless natural)
- mood: {mood}
- stats JSON: {json.dumps(stats, ensure_ascii=False)}
- achieved today JSON: {json.dumps(achieved_ctx, ensure_ascii=False)}

Document grounding (themes only — paraphrase insight; do not copy sentences verbatim):
{rag if rag else "(none)"}

Return ONLY JSON:
{{ "dailyQuote": "<single line, max 220 characters>" }}

Rules (must all pass):
- ONE sentence only. Plain English. Immediately understandable.
- Make it LOGICAL: express a clear cause → effect, a clear rule of thumb, or a concrete “if/then” or “when/then” insight.
- Match the mood: {mood} (adjust tone: lighter scope if tired; bolder execution if energetic).
- No vague inspiration clichés (“unlock”, “synergy”, “manifest”, “level up”, “crush it”).
- No poetry that hides the point; the reader should know what to do or what is true after reading once.
- Do NOT copy phrases from the document snippets; paraphrase one idea in your own words.
- Do NOT output sentence fragments, mid-thought continuations, or OCR-style broken text.
- No hashtags, no bullet points, no nested quotation marks inside the string.
""".strip()

    try:
        _ensure_backend_env_loaded()
        agent = Agent(
            name="Monk Daily Quote",
            instructions=(
                "Write one logical, concrete daily line: clear cause-effect or actionable rule. "
                "No vague hype. Full sentence only. "
                "Return ONLY valid JSON for DailyQuoteOut shape: {\"dailyQuote\": \"...\"}."
            ),
            model=(os.environ.get("OPENAI_AGENTS_MODEL") or None),
        )
        result = Runner.run_sync(agent, prompt)
        raw_text = getattr(result, "final_output", None) or str(result)
        payload_text = _extract_json_object(raw_text)
        payload = json.loads(payload_text)
        out = DailyQuoteOut.model_validate(payload)
        q = (out.dailyQuote or "").strip()
        if len(q) < 8:
            raise ValueError("quote too short")
        return _normalize_daily_quote_clarity(q, user_id=user_id, date=date, mood=mood)
    except Exception as exc:
        print(f"[coach] daily quote agent failed, using clear fallback: {exc}")
        return _deterministic_daily_quote(user_id=user_id, date=date, mood=mood)


def _heading_outline_from_rows(rows: list) -> str:
    """Collect # markdown headings from chunks so the model sees doc structure."""
    headings: list[str] = []
    seen: set[str] = set()
    for r in rows:
        for line in str(r.get("content") or "").splitlines():
            s = line.strip()
            if s.startswith("#") and len(s) > 2:
                if s not in seen:
                    seen.add(s)
                    headings.append(s)
            if len(headings) >= 70:
                break
        if len(headings) >= 70:
            break
    if not headings:
        return (
            "(No explicit # headings in indexed text — treat the first strong sentence of each "
            "excerpt as the section topic and still anchor tasks to that material.)"
        )
    return "\n".join(headings)


def _gather_rag_context_for_plan(*, user_id: str, mood: str) -> str:
    rows = rag_all_chunks(user_id)
    if not rows:
        return ""
    outline = _heading_outline_from_rows(rows)
    excerpt_block = ""
    try:
        q = f"{mood} execution discipline measurable outcomes habits focus"
        chs = retrieve(user_id=user_id, query=q, k=14)
        if chs:
            excerpt_block = "\n\n".join([f"[{c.source}#{c.chunk_id}]\n{c.content}" for c in chs])
    except Exception as exc:
        print(f"[coach] semantic RAG for plan failed, using chunk sample: {exc}")
    if not excerpt_block.strip():
        buckets: dict[str, list[str]] = {}
        for r in rows:
            src = str(r.get("source") or "unknown")
            buckets.setdefault(src, []).append(str(r.get("content") or ""))
        parts: list[str] = []
        for src, items in sorted(buckets.items()):
            for i, content in enumerate(items[:5]):
                parts.append(f"[{src} #{i}]\n{content[:1400]}")
        excerpt_block = "\n\n".join(parts).strip()

    return (
        "=== DOCUMENT OUTLINE (read headings & structure first) ===\n"
        f"{outline}\n\n"
        "=== PASSAGES FROM YOUR FILES (ground every task here) ===\n"
        f"{excerpt_block}"
    ).strip()


def _rag_fingerprint(rows: list[dict]) -> str:
    if not rows:
        return "empty"
    n = len(rows)
    first = rows[0]
    last = rows[-1]
    raw = (
        f"{n}|{first.get('source','')}|{first.get('chunkId','')}|"
        f"{last.get('source','')}|{last.get('chunkId','')}"
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _build_doc_digest(rows: list[dict], *, max_samples: int = 40, clip: int = 450) -> str:
    if not rows:
        return "(no document chunks)"
    samples: list[str] = []
    n = len(rows)
    stride = max(1, n // max_samples)
    i = 0
    while i < n and len(samples) < max_samples:
        r = rows[i]
        src = str(r.get("source") or "unknown")
        cid = str(r.get("chunkId") or "")
        txt = re.sub(r"\s+", " ", str(r.get("content") or "")).strip()
        if txt:
            samples.append(f"[{src}#{cid}] {txt[:clip]}")
        i += stride
    return "\n\n".join(samples)


def _local_doc_mindset(rows: list[dict]) -> str:
    digest = _build_doc_digest(rows, max_samples=24, clip=260)
    return (
        "Core mindset: execution over consumption, output over intention, consistency over intensity.\n"
        "Primary principles: define clear outcomes, run focused blocks, ship visible proof, review and iterate.\n"
        "Decision style: choose high-leverage actions with measurable results in real-world context.\n"
        "Context digest:\n"
        f"{digest[:2600]}"
    )


def build_doc_mindset_profile(user_id: str) -> str:
    rows = rag_all_chunks(user_id)
    if not rows:
        return "No RAG document loaded."
    fp = _rag_fingerprint(rows)
    cached = _DOC_MINDSET_CACHE.get(user_id)
    if cached and cached[0] == fp:
        return cached[1]

    digest = _build_doc_digest(rows, max_samples=44, clip=420)
    try:
        _ensure_backend_env_loaded()
        prompt = f"""
You are a strategic analyst. Read the digest of a user's full knowledge base and produce a compact mindset profile.

Return ONLY JSON:
{{
  "thesis": "<1-2 lines: what this whole document is really optimizing for>",
  "mindset": "<1 short paragraph: how user should think while acting>",
  "principles": ["<6 to 10 concrete principles>"],
  "antiPatterns": ["<3 to 6 failure patterns to avoid>"],
  "practicalLevers": ["<6 to 10 practical levers for real life execution>"]
}}

Rules:
- Infer from whole digest, not isolated keywords.
- Prefer practical, real-world interpretation.
- No motivational fluff.

Digest:
{digest}
""".strip()
        agent = Agent(
            name="Monk Document Mindset",
            instructions=(
                "Synthesize whole-document mindset and actionable levers. "
                "Return ONLY valid JSON."
            ),
            model=(os.environ.get("OPENAI_AGENTS_MODEL") or None),
        )
        result = Runner.run_sync(agent, prompt)
        raw = getattr(result, "final_output", None) or str(result)
        payload = json.loads(_extract_json_object(raw))
        thesis = str(payload.get("thesis") or "").strip()
        mindset = str(payload.get("mindset") or "").strip()
        principles = [str(x).strip() for x in (payload.get("principles") or []) if str(x).strip()]
        anti = [str(x).strip() for x in (payload.get("antiPatterns") or []) if str(x).strip()]
        levers = [str(x).strip() for x in (payload.get("practicalLevers") or []) if str(x).strip()]
        profile = (
            f"Thesis:\n{thesis}\n\n"
            f"Mindset:\n{mindset}\n\n"
            "Principles:\n- " + "\n- ".join(principles[:10]) + "\n\n"
            "Anti-patterns:\n- " + "\n- ".join(anti[:6]) + "\n\n"
            "Practical levers:\n- " + "\n- ".join(levers[:10])
        )
    except Exception as exc:
        print(f"[coach] mindset profile agent failed, using local synthesis: {exc}")
        profile = _local_doc_mindset(rows)

    _DOC_MINDSET_CACHE[user_id] = (fp, profile)
    return profile


def _build_agent_daily_plan_prompt(
    *,
    user_id: str,
    date: str,
    mood: str,
    stats: dict,
    achieved: dict,
    rag_context: str,
    mindset_profile: str,
    user_mindset_context: str,
    recent_titles: list[str],
) -> str:
    categories_csv = ", ".join(ALLOWED_CATEGORIES)
    return f"""
You are an experienced human coach — not a template bot. You have read the user's documents (see OUTLINE and PASSAGES below).
Important: documents are context for understanding the user, not a script to copy from.
Think step by step: (1) notice section titles and what each part is trying to teach, (2) pick a coherent action that fits "{mood}" mood and their stats,
(3) spell out how someone would actually finish the task today.

Return ONLY valid JSON with the exact shape:
{{
  "challenges": [
    {{
      "title": string,
      "category": one of ["{categories_csv}"],
      "difficulty": one of ["Easy","Medium","Hard"],
      "time": string (format: "<number> min"),
      "points": integer (Easy 5-9, Medium 10-19, Hard 20-35),
      "body_part": one of {json.dumps(SKELETON_PARTS)},
      "details": string,
      "benefits": string
    }}
  ],
  "motivation": string,
  "summary": string,
  "dailyQuote": string
}}

For EVERY challenge, `details` MUST be plain text with these labeled sections (use newlines; keep it practical):
WHY — 1-2 sentences: which idea or heading from the user's material this applies, and why it matters today.
IDEAS — 2-4 lines starting with "• " : realistic options a person could try to complete this (tools, environments, who to talk to, what to write).
STEPS — numbered 3-6 steps: smallest first step to done, ending with what to save as proof.
IF STUCK — one short fallback if energy or focus is low.

For EVERY challenge, `benefits` MUST be 2-4 sentences: immediate win, knock-on effect this week, and realistic long-term life impact (not generic praise).

Constraints:
- Exactly 12 challenges: 2 per category in order business, motivation, power, freedom, money, grooming.
- Use document headings/passages only as supporting context. Prioritize real-world outcomes, user's stats, and practical execution.
- First reason from DOCUMENT MINDSET PROFILE (whole-document synthesis), then use excerpts as evidence.
- Do NOT generate tasks from isolated highlighted words only.
- Each challenge must feel practical, logical, and meaningful in real life.
- TITLE (required): each `title` is 2 or 3 lines separated by \\n in the JSON string:
  Line 1 — Insight tied to the document (or the named section).
  Line 2 — Concrete action for today.
  Line 3 — "Done when:" measurable proof (omit only if line 2 already states proof).
- All 12 titles unique. No vague one-liners.
- Avoid repeating recent plan titles from the past days list below.
- No prebuilt template phrasing. Do NOT reuse repeated patterns across categories.
- Do NOT copy raw phrasing from passages. Never reuse more than 3 consecutive words from the source text.
- Do NOT output OCR-like or slash-joined fragments (example of forbidden style: "profits / selling").
- Make tasks feel high-leverage and slightly surprising, while still realistic for today.
- Each action must name a concrete target (person, artifact, metric, channel, or resource).
- Summary MUST include Achieved today / Today milestone / Benefits using Achieved JSON.
- dailyQuote: ONE original sentence, <= 220 chars. Must sound LOGICAL: clear cause→effect, rule of thumb, or if/then insight.
  Plain English only; no vague hype, no poetry that hides the point, not copied from passages.

--- Knowledge (outline + passages) ---
{rag_context}

--- DOCUMENT MINDSET PROFILE ---
{mindset_profile}

--- USER MINDSET FROM THEIR REAL ACTIONS (completion notes + custom tasks) ---
{user_mindset_context}

--- RECENT PLAN TITLES TO AVOID REPEATING ---
{json.dumps(recent_titles[:120], ensure_ascii=False)}

user_id: {user_id}
date: {date}
mood: {mood}

Stats:
{json.dumps(stats, ensure_ascii=False, indent=2)}

Achieved today:
{json.dumps(achieved, ensure_ascii=False, indent=2)}
""".strip()


def _build_user_mindset_context(user_id: str) -> str:
    sig = recent_user_mindset_signals(user_id, note_limit=20, custom_limit=20)
    notes = [x.strip() for x in (sig.get("completionNotes") or []) if x.strip()]
    custom_titles = [x.strip() for x in (sig.get("customTaskTitles") or []) if x.strip()]
    if not notes and not custom_titles:
        return "No user-authored signals yet."
    note_lines = "\n".join(f"- {x[:180]}" for x in notes[:12]) or "- (none)"
    custom_lines = "\n".join(f"- {x[:160]}" for x in custom_titles[:12]) or "- (none)"
    return (
        "What user says they completed:\n"
        f"{note_lines}\n\n"
        "What user chooses as custom tasks:\n"
        f"{custom_lines}\n\n"
        "Use these to infer user's personal style, constraints, and preferred action patterns."
    )


def _truncate_challenge_title(title: str, max_len: int = 520) -> str:
    t = (title or "").strip()
    if len(t) <= max_len:
        return t
    cut = t[: max_len - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut + "…"


def _ensure_card_title_multiline(title: str) -> str:
    t = (title or "").strip()
    if "\n" in t and len(t) >= 12:
        return _truncate_challenge_title(t)
    return _truncate_challenge_title(
        f"{t}\n"
        f"Execute: one focused block tied to this category.\n"
        f"Proof: one deliverable saved (note, file, or message)."
    )


def _env_flag(name: str) -> bool:
    v = (os.environ.get(name) or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _normalize_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def _dedupe_challenges(items: list[ChallengeOut]) -> list[ChallengeOut]:
    """
    Ensure titles are unique. If duplicates occur, slightly vary later ones.
    """
    seen: set[str] = set()
    out: list[ChallengeOut] = []
    for i, ch in enumerate(items):
        base = ch.title.strip()
        norm = _normalize_title(base)
        if norm in seen or not base:
            lines = base.split("\n")
            # Keep user-facing text clean: nudge wording instead of "(variation N)" labels.
            nudges = (
                " Keep scope to one sitting.",
                " Ship a draft, not a perfect version.",
                " One channel, one proof.",
                " Finish with something you can screenshot or forward.",
            )
            if len(lines) >= 2:
                lines[-1] = f"{lines[-1].rstrip()} {nudges[i % len(nudges)]}".strip()
                base = "\n".join(lines)
            else:
                base = f"{base.strip()} {nudges[i % len(nudges)]}".strip()
            norm = _normalize_title(base)
            if norm in seen:
                base = f"{ch.title.strip()}\n{nudges[(i + 1) % len(nudges)]}".strip()
                norm = _normalize_title(base)
        seen.add(norm)
        out.append(
            ch.model_copy(update={"title": _truncate_challenge_title(base)})
        )
    return out


def _run_agent_with_timeout(agent: Agent, prompt: str, timeout_sec: int = 35):
    # Avoid background threadpool usage here; it can emit noisy shutdown tracebacks
    # during Django dev-server reload/stop on Windows.
    void_timeout = timeout_sec
    _ = void_timeout
    return Runner.run_sync(agent, prompt)


def _local_rag_fallback_plan(
    *,
    user_id: str,
    date: str,
    mood: str,
    stats: dict,
    achieved: dict | None = None,
    regen_key: str = "",
) -> DailyPlanOut:
    """
    Deterministic fallback that still uses RAG retrieval from ModelTrainingData.docx.
    This keeps generation doc-grounded even when model calls fail or timeout.
    """
    def first_sentence(text: str) -> str:
        txt = re.sub(r"\s+", " ", (text or "").strip())
        parts = re.split(r"(?<=[.!?])\s+", txt)
        for p in parts:
            if len(p) >= 35:
                return p
        return txt[:220].strip()

    def first_heading_or_lead(text: str) -> str:
        for line in (text or "").splitlines():
            s = line.strip()
            if s.startswith("#"):
                return re.sub(r"^#+\s*", "", s).strip()[:160]
        return first_sentence(text)

    # Local fallback should be very fast and use local whole-document synthesis only.
    # Avoid extra model calls here.
    rows = rag_all_chunks(user_id)
    mindset_profile = _local_doc_mindset(rows)
    profile_lines = [ln.strip("- ").strip() for ln in mindset_profile.splitlines() if ln.strip()]
    generic_themes = [
        "execution over consumption",
        "consistency over intensity",
        "one visible output each day",
        "clear outcome and measurable proof",
        "review and iterate quickly",
        "real-world action over overthinking",
    ]
    mindset_themes = [x for x in profile_lines if len(x) >= 18][:8] or generic_themes
    user_sig = recent_user_mindset_signals(user_id, note_limit=10, custom_limit=10)
    user_lines = [x.strip() for x in (user_sig.get("completionNotes") or []) if len(x.strip()) >= 12]
    user_lines += [x.strip() for x in (user_sig.get("customTaskTitles") or []) if len(x.strip()) >= 12]
    mindset_themes.extend(user_lines[:6])

    action_templates: dict[str, list[str]] = {
        "business": [
            "Create one practical mini-offer and send it to one real prospect via {channel}",
            "Pick one lead and send a concise outreach message to {target}",
            "Create a one-page action plan and execute step 1 before noon",
            "Write one short pitch and test it with one real person in {place}",
            "List 5 possible buyers, choose the strongest one, and make contact today",
            "Define one clear before/after result and post your offer in {channel}",
        ],
        "motivation": [
            "Set one non-negotiable win and start in 5 minutes",
            "Create a 15-minute starter sprint and finish one visible output",
            "Write one commitment line and execute before checking your phone",
            "Use a countdown start (5-4-3-2-1) and begin immediately",
        ],
        "power": [
            "Make one clear decision and act on it now",
            "Run one distraction-free deep-work block on your top priority",
            "Set a strict boundary for 25 minutes and execute one task only",
            "Choose one hard action and finish it before switching tasks",
        ],
        "freedom": [
            "Identify one bottleneck and remove one friction point today",
            "Build a 3-step system for one repeating task and test it once now",
            "Simplify one repeated task into a reusable checklist",
            "Delete, delegate, or defer one low-value item blocking progress",
        ],
        "money": [
            "Choose one income action and execute it in one focused block",
            "Find one cost leak and apply one concrete fix today",
            "Create one small paid offer and send it to 3 contacts",
            "Track one money metric and improve it with one immediate action",
        ],
        "grooming": [
            "Set today’s personal standard and complete the routine once",
            "Prepare tomorrow’s grooming and appearance checklist",
            "Upgrade one visible detail and lock it as a daily habit",
            "Do a full reset and capture a simple before/after note",
        ],
    }

    def daily_action_from_context(
        cat: str, slot: int, used_actions: set[str], *, bump: int = 0
    ) -> str:
        templates = action_templates.get(cat) or [f"Execute one {cat} action today"]
        h = int(
            hashlib.sha256(
                f"{user_id}:{date}:{cat}:{slot}:{regen_key}:{bump}".encode()
            ).hexdigest(),
            16,
        )
        channels = ["WhatsApp", "Instagram DM", "LinkedIn", "local Facebook group", "email"]
        targets = ["one previous contact", "one warm lead", "one local business owner", "one friend referral"]
        places = ["your contacts list", "your niche community", "a local business circle", "your social feed"]
        base_idx = h % len(templates)

        for step in range(len(templates)):
            template = templates[(base_idx + step) % len(templates)]
            action = template.format(
                channel=channels[(h + step + slot) % len(channels)],
                target=targets[(h + 2 * step + slot) % len(targets)],
                place=places[(h + 3 * step + slot) % len(places)],
            )
            norm = _normalize_title(action)
            if norm not in used_actions:
                used_actions.add(norm)
                return action

        fallback = templates[base_idx].format(
            channel=channels[(h + slot) % len(channels)],
            target=targets[(h + slot) % len(targets)],
            place=places[(h + slot) % len(places)],
        )
        return fallback

    category_outcome: dict[str, str] = {
        "business": "move one real opportunity forward",
        "motivation": "start on time without overthinking",
        "power": "make and execute one clear decision",
        "freedom": "remove one repeated friction point",
        "money": "improve one money action today",
        "grooming": "raise your visible personal standard",
    }

    def cat_stats(cat: str) -> tuple[int, int]:
        raw = stats.get(cat, {}) if isinstance(stats, dict) else {}
        completed_local = int(raw.get("completed", 0) or 0)
        missed_local = int(raw.get("missed", 0) or 0)
        return completed_local, missed_local

    mood_logic: dict[str, str] = {
        "happy": "Use momentum: start medium/hard tasks early, then close with quick wins.",
        "energetic": "Push execution depth: prioritize harder tasks and longer focus blocks.",
        "tired": "Protect consistency: keep scope smaller but finish every selected action.",
        "motivational": "Build confidence loops: stack fast completions before deeper tasks.",
    }

    blocked_recent = {
        _normalize_title(t)
        for t in recent_plan_titles(user_id, end_date=date, days=7)
        if (t or "").strip()
    }
    challenges: list[ChallengeOut] = []
    for i, cat in enumerate(ALLOWED_CATEGORIES):
        used_actions: set[str] = set()

        for j in range(2):
            h = int(
                hashlib.sha256(f"{user_id}:{date}:{cat}:{j}:{regen_key}".encode()).hexdigest(),
                16,
            )
            theme = mindset_themes[(h + i + j) % len(mindset_themes)]
            diff: Difficulty = (
                "Easy" if mood in {"tired", "motivational"} else ("Hard" if (i + j) % 2 else "Medium")
            )
            time = "15 min" if diff == "Easy" else ("25 min" if diff == "Medium" else "35 min")
            pts = 5 if diff == "Easy" else (7 if diff == "Medium" else 9)
            action = daily_action_from_context(cat, j, used_actions, bump=0)
            heading = _truncate_challenge_title(first_heading_or_lead(theme), max_len=100)
            title = _truncate_challenge_title(
                f"Today you will {category_outcome.get(cat, f'advance {cat} in real life')} by completing one focused task.\n"
                f"Complete this challenge: {action}.\n"
                "Finish by saving one proof item, such as a message sent, a file updated, or a checklist screenshot."
            )
            # Cross-day uniqueness: if this resembles recent days, re-pick action via bump (no visible "(variation N)" text).
            tnorm = _normalize_title(title)
            if tnorm in blocked_recent:
                for bump in range(1, 32):
                    action = daily_action_from_context(cat, j, used_actions, bump=bump)
                    title = _truncate_challenge_title(
                        f"Today you will {category_outcome.get(cat, f'advance {cat} in real life')} by completing one focused task.\n"
                        f"Complete this challenge: {action}.\n"
                        "Finish by saving one proof item, such as a message sent, a file updated, or a checklist screenshot."
                    )
                    tnorm = _normalize_title(title)
                    if tnorm not in blocked_recent:
                        break
            blocked_recent.add(tnorm)
            completed_cat, missed_cat = cat_stats(cat)
            details_text = (
                "WHY — "
                f"Your {cat} trend is {completed_cat} completed / {missed_cat} missed. "
                f"This task improves that ratio through one practical output today. "
                f"Mood fit: {mood_logic.get(mood, mood_logic['motivational'])}\n\n"
                "IDEAS —\n"
                "• Start with the smallest high-value deliverable (not a perfect final version).\n"
                "• Timebox it and remove one distraction before the timer starts.\n"
                "• If needed, ask one person/tool for fast feedback once draft is done.\n\n"
                "STEPS —\n"
                f"1) Write one sentence: what “done” looks like for: {action}.\n"
                f"2) Run a {time} focused block.\n"
                "3) Save proof (message, note, checklist, or draft).\n"
                "4) Re-read your first line and fix one thing before you stop.\n\n"
                "IF STUCK — Shrink to a 5-minute version: one sentence + one proof screenshot or note.\n\n"
                f"Mindset anchor from your file themes: {heading}"
            )
            benefit_text = (
                f"Immediate: you produce a real {cat} result instead of only consuming information. "
                "This week: repeated proof outputs build confidence and execution consistency. "
                "Long-term: better decisions, stronger identity, and measurable progress in daily life."
            )
            challenges.append(
                ChallengeOut(
                    title=title,
                    category=cat,  # type: ignore[arg-type]
                    difficulty=diff,
                    time=time,
                    points=pts,
                    body_part=SKELETON_PARTS[(i * 2 + j) % len(SKELETON_PARTS)],
                    details=details_text,
                    benefits=benefit_text,
                )
            )

    achieved_ctx = achieved or {}
    completed = int(achieved_ctx.get("completedTasks", 0) or 0)
    points = int(achieved_ctx.get("earnedPoints", 0) or 0)
    top_cat = str(achieved_ctx.get("topCategory", "") or "")
    summary = (
        "Achieved today:\n"
        f"- Completed tasks: {completed}\n"
        f"- Points earned: {points}\n"
        + (f"- Top category: {top_cat}\n" if top_cat else "")
        + "\nPlan logic:\n"
        + f"- Mood strategy: {mood_logic.get(mood, mood_logic['motivational'])}\n"
        + "- 2 tasks per category: one foundational action + one execution action.\n"
        + "- Every task is derived from whole-document mindset themes (not copied phrases).\n"
        + "\nToday milestone:\n"
        + "- Finish at least 6/12 tasks with proof output.\n"
        + "- Complete at least one task in each of your weak categories.\n"
        + "\nExpected benefits:\n"
        + "- Better decision quality and clearer priorities.\n"
        + "- Stronger consistency and visible, trackable progress."
    )
    motivation = (
        f"Daily plan for {date} (mood: {mood}).\n"
        "This plan is not random: each challenge is selected from your document context and mapped to category goals.\n"
        "Execution rule: finish one meaningful output per task, not just activity.\n"
        f"Strategy: {mood_logic.get(mood, mood_logic['motivational'])}"
    )
    if _env_flag("MONK_USE_AGENT_DAILY_QUOTE"):
        daily_quote = generate_daily_quote_ai(
            user_id=user_id,
            date=date,
            mood=mood,
            stats=stats,
            achieved=achieved_ctx,
        )
    else:
        daily_quote = _deterministic_daily_quote(user_id=user_id, date=date, mood=mood)
    return DailyPlanOut(
        challenges=_dedupe_challenges(challenges),
        motivation=motivation,
        summary=summary,
        dailyQuote=daily_quote,
    )


def generate_daily_plan(
    *,
    user_id: str,
    date: str,
    mood: str = "motivational",
    stats: dict,
    achieved: dict | None = None,
    regen_key: str = "",
    fast_mode: bool = False,
) -> DailyPlanOut:
    achieved_ctx = achieved or {}
    ensure_rag_chunks_if_empty(user_id)
    if not rag_all_chunks(user_id):
        raise ValueError("NO_RAG: add supported files to backend/read/ and ingest (see /api/coach/read-folder/ingest)")

    # Fast-mode (used by manual reload) skips agent calls for snappy UX.
    if fast_mode:
        return _local_rag_fallback_plan(
            user_id=user_id,
            date=date,
            mood=mood,
            stats=stats,
            achieved=achieved_ctx,
            regen_key=regen_key,
        )

    # Agent-first by default. Set MONK_FORCE_LOCAL_DAILY_PLAN=1 only if you explicitly
    # want deterministic local fallback templates for offline/stability scenarios.
    if _env_flag("MONK_FORCE_LOCAL_DAILY_PLAN"):
        return _local_rag_fallback_plan(
            user_id=user_id,
            date=date,
            mood=mood,
            stats=stats,
            achieved=achieved_ctx,
            regen_key=regen_key,
        )

    rag_context = _gather_rag_context_for_plan(user_id=user_id, mood=mood)
    mindset_profile = build_doc_mindset_profile(user_id=user_id)
    user_mindset_context = _build_user_mindset_context(user_id=user_id)
    recent_titles = recent_plan_titles(user_id, end_date=date, days=7)
    prompt = _build_agent_daily_plan_prompt(
        user_id=user_id,
        date=date,
        mood=mood,
        stats=stats,
        achieved=achieved_ctx,
        rag_context=rag_context or "(context unavailable)",
        mindset_profile=mindset_profile,
        user_mindset_context=user_mindset_context,
        recent_titles=recent_titles,
    )
    if regen_key:
        prompt = f"{prompt}\n\nregeneration_key: {regen_key}\nGenerate a distinct plan from prior same-day attempts."
    try:
        _ensure_backend_env_loaded()
        agent = Agent(
            name="Monk Daily Plan Builder",
            instructions=(
                "You read the user's materials like a thoughtful coach: notice headings, connect ideas to actions, "
                "and write challenges a real person could finish today. "
                "Every challenge must include WHY / IDEAS / STEPS / IF STUCK in `details`, and concrete benefits in `benefits`. "
                "Avoid repetitive template-style lines; each challenge should feel custom and high-impact. "
                "Titles: 2-3 lines with newlines inside the JSON string; each title max 500 characters. "
                "dailyQuote must be one logical sentence (cause→effect or clear rule), no vague hype. "
                "Return ONLY valid JSON for DailyPlanOut — no markdown fences, no commentary."
            ),
            model=(os.environ.get("OPENAI_AGENTS_MODEL") or None),
        )
        result = _run_agent_with_timeout(agent, prompt, timeout_sec=25)
        raw_text = getattr(result, "final_output", None) or str(result)
        try:
            payload = json.loads(_extract_json_object(raw_text))
        except Exception:
            # One strict repair retry to reduce malformed JSON failures.
            repair_prompt = (
                "Return ONLY valid JSON for DailyPlanOut. "
                "No prose, no markdown, no code fences. Regenerate now.\n\n"
                + prompt
            )
            result2 = _run_agent_with_timeout(agent, repair_prompt, timeout_sec=12)
            raw_text2 = getattr(result2, "final_output", None) or str(result2)
            payload = json.loads(_extract_json_object(raw_text2))
        for ch in payload.get("challenges") or []:
            if isinstance(ch, dict) and isinstance(ch.get("title"), str):
                ch["title"] = _truncate_challenge_title(
                    _ensure_card_title_multiline(ch["title"])
                )
        plan = DailyPlanOut.model_validate(payload)
        dq = _normalize_daily_quote_clarity(
            (plan.dailyQuote or "").strip(),
            user_id=user_id,
            date=date,
            mood=mood,
        )
        return DailyPlanOut(
            challenges=_dedupe_challenges(plan.challenges),
            motivation=plan.motivation,
            summary=plan.summary,
            dailyQuote=dq,
        )
    except Exception as exc:
        # Reliability-first: never leave frontend empty when agent fails.
        # Set MONK_STRICT_AGENT_ONLY=1 only if you want hard failure instead.
        if _env_flag("MONK_STRICT_AGENT_ONLY"):
            raise RuntimeError(
                f"DAILY_PLAN_AGENT_FAILED: {exc}. "
                "Strict mode enabled (MONK_STRICT_AGENT_ONLY=1)."
            )
        print(f"[coach] daily plan agent failed, using local fallback: {exc}")
        return _local_rag_fallback_plan(
            user_id=user_id,
            date=date,
            mood=mood,
            stats=stats,
            achieved=achieved_ctx,
            regen_key=regen_key,
        )


def generate_day_meta(
    *,
    user_id: str,
    date: str,
    mood: str,
    personality: str,
    stats: dict,
    achieved: dict | None = None,
    today_challenges: list[dict] | None = None,
) -> DayMetaOut:
    """
    Regenerates motivation/summary/dailyQuote when user changes coach personality,
    without changing today's challenges.
    """
    _ensure_backend_env_loaded()
    today = today_challenges or []
    achieved_ctx = achieved or {}

    prompt = f"""
You are the Monk coach meta generator.

Inputs:
- user_id: {user_id}
- date: {date}
- mood: {mood}
- coach_personality: {personality} (one of strict, friendly, motivational, minimalist)

Stats JSON:
{json.dumps(stats, ensure_ascii=False, indent=2)}

Achieved today JSON:
{json.dumps(achieved_ctx, ensure_ascii=False, indent=2)}

Today's challenges (do NOT change these; just use them for context):
{json.dumps(today, ensure_ascii=False)}

Write:
- motivation: 1-2 sentences, in the selected personality.
- summary: MUST include Achieved today / Today milestone / Benefits (3-6 lines max).
- dailyQuote: one original line for this day (<= 220 chars), in personality voice; not a famous quote.
  One complete sentence: logical cause-effect or clear rule the user can act on immediately.

Quality rules:
- Be concise but intelligent.
- Avoid vague motivational filler and hype clichés.
- Every line must be practical and meaningful for this user's current day.

Return ONLY JSON:
{{
  "motivation": "...",
  "summary": "...",
  "dailyQuote": "..."
}}
""".strip()

    agent = Agent(
        name="Monk Coach Day Meta",
        instructions=(
            "Regenerate only the coach text. "
            "Be consistent with the chosen personality. "
            "Keep it short, practical, and high impact. "
            "Prefer concrete wording over generic motivation. "
            "dailyQuote must be one logical sentence (cause→effect or clear rule), no vague hype. "
            "Return ONLY valid JSON."
        ),
        model=(os.environ.get("OPENAI_AGENTS_MODEL") or None),
    )
    result = Runner.run_sync(agent, prompt)
    raw_text = getattr(result, "final_output", None) or str(result)
    payload_text = _extract_json_object(raw_text)
    payload = json.loads(payload_text)
    out = DayMetaOut.model_validate(payload)
    dq = _normalize_daily_quote_clarity(
        out.dailyQuote,
        user_id=user_id,
        date=date,
        mood=mood,
    )
    return out.model_copy(update={"dailyQuote": dq})


def generate_challenge_deep_dive(
    *,
    user_id: str,
    date: str,
    mood: str,
    personality: str,
    challenge: dict,
) -> ChallengeDetailOut:
    _ensure_backend_env_loaded()
    title = str(challenge.get("title") or "")
    category = str(challenge.get("category") or "")
    details = str(challenge.get("details") or "")
    benefits = str(challenge.get("benefits") or "")

    rows = rag_all_chunks(user_id)
    tokens = re.findall(r"[a-z0-9]+", f"{category} {title}".lower())
    scored: list[tuple[int, str]] = []
    for r in rows:
        content = str(r.get("content") or "")
        low = content.lower()
        score = sum(low.count(t) for t in tokens if len(t) > 2)
        scored.append((score, content))
    scored.sort(key=lambda x: x[0], reverse=True)
    picks = [c for s, c in scored[:3] if c.strip()]
    rag_ctx = "\n\n".join([p[:700] for p in picks]) if picks else "(no additional context)"

    # Optional agent pass (disabled by default for speed/stability).
    # Keep this opt-in for faster detail loading.
    if _env_flag("MONK_USE_AGENT_DEEP_DIVE"):
      try:
        prompt = f"""
You are a practical coach. Explain ONE challenge in easy, human wording.

Challenge:
- title: {title}
- category: {category}
- mood: {mood}
- personality: {personality}
- existing details: {details}
- existing benefits: {benefits}

Context snippets:
{rag_ctx}

Return ONLY JSON with exact shape:
{{
  "explanation": "<2-3 short sentences, very easy language>",
  "approaches": [
    "<example 1: exact way to complete this task>",
    "<example 2: exact way to complete this task>",
    "<example 3: exact way to complete this task>"
  ],
  "benefits": [
    "<benefit 1 specific to this task>",
    "<benefit 2 specific to this task>",
    "<benefit 3 specific to this task>"
  ],
  "quickStart": "<single clear first step, <= 140 chars>"
}}

Rules:
- examples must be specific to THIS task, not generic motivational lines.
- benefits must be real-life outcomes of THIS task.
- keep language simple, short, and smart.
- exactly 3 approaches and exactly 3 benefits.
- infer the real domain from title words even if category is generic.
- adapt to any task type (health, study, sports, business, creative, admin, home, etc).
- avoid repeating boilerplate opening/closing lines.
""".strip()
        agent = Agent(
            name="Monk Challenge Detail",
            instructions=(
                "Write concrete, simple, task-specific detail. "
                "No fluff. Be concise but intelligent and meaningful. "
                "Return ONLY valid JSON for ChallengeDetailOut."
            ),
            model=(os.environ.get("OPENAI_AGENTS_MODEL") or None),
        )
        result = _run_agent_with_timeout(agent, prompt, timeout_sec=20)
        raw_text = getattr(result, "final_output", None) or str(result)
        try:
            payload = json.loads(_extract_json_object(raw_text))
        except Exception:
            repair_prompt = (
                "Return ONLY valid JSON for ChallengeDetailOut. "
                "No prose, no markdown, no code fences.\n\n"
                + prompt
            )
            result2 = _run_agent_with_timeout(agent, repair_prompt, timeout_sec=10)
            raw_text2 = getattr(result2, "final_output", None) or str(result2)
            payload = json.loads(_extract_json_object(raw_text2))
        payload["approaches"] = list((payload.get("approaches") or []))[:3]
        payload["benefits"] = list((payload.get("benefits") or []))[:3]
        return ChallengeDetailOut.model_validate(payload)
      except Exception as exc:
          print(f"[coach] challenge deep-dive agent failed, using local: {exc}")

    # Deterministic fallback, still task-specific.
    task_line = title.split("\n")[1].strip() if "\n" in title and len(title.split("\n")) > 1 else title.strip()
    if ":" in task_line:
        task_line = task_line.split(":", 1)[1].strip()
    task_line = task_line or f"complete one {category} task"

    explanation = (
        f"This challenge is: {task_line}. "
        f"It helps your {category} progress today by turning intention into one finished action."
    )
    task_low = task_line.lower()
    domain = "general"
    if any(k in task_low for k in ["study", "exam", "read", "learn", "practice chapter", "revision"]):
        domain = "study"
    elif any(k in task_low for k in ["email", "message", "call", "follow up", "outreach", "pitch", "client"]):
        domain = "communication"
    elif any(k in task_low for k in ["clean", "room", "home", "kitchen", "desk", "organize"]):
        domain = "home"
    elif any(k in task_low for k in ["write", "design", "build", "code", "create", "record", "edit"]):
        domain = "creative"
    elif any(k in task_low for k in ["exercise", "workout", "run", "walk", "gym", "sport", "play", "yoga"]):
        domain = "physical"

    if category == "money":
        approaches = [
            "Pick one quick offer you can deliver today (e.g., CV edit, poster design, social media post), set a small fixed price, and post it in one WhatsApp/Telegram group.",
            "Find one item or subscription to cut this week, make the change now, and write the exact amount saved in your notes.",
            "Message 3 people who may need your skill with one clear line: what you do, price, and delivery time; track replies in one list.",
        ]
        out_benefits = [
            "You create a direct money move today instead of only thinking about money.",
            "You learn which offer or action brings real response from real people.",
            "You build a repeatable cash routine: choose action, execute, track result.",
        ]
    elif category == "business":
        approaches = [
            "Pick one customer type, write one problem they face, and send one short offer message to a real person today.",
            "Open your old leads, choose 3 names, and send each one a specific follow-up with one clear next step.",
            "Create a simple one-page offer (problem, solution, price), then share it with at least one potential buyer.",
        ]
        out_benefits = [
            "You move business forward with actual outreach and offers.",
            "You get market feedback that improves your next decision.",
            "You build consistency in sales actions, not just planning.",
        ]
    elif domain == "study":
        explanation = (
            f"This challenge is: {task_line}. "
            "It builds learning momentum by turning study into a finished session with proof."
        )
        approaches = [
            "Define one clear study target (topic/questions/pages) before you start.",
            "Run one focused block without distractions and solve or summarize what you studied.",
            "Save proof: your notes, solved questions, or a short recap in your own words.",
        ]
        out_benefits = [
            "You retain more because you complete active study, not passive reading.",
            "You reduce exam stress by creating daily measurable progress.",
            "You build a repeatable study system that compounds over time.",
        ]
    elif domain == "communication":
        explanation = (
            f"This challenge is: {task_line}. "
            "It improves outcomes by making one real communication action happen today."
        )
        approaches = [
            "Draft a short message with one clear purpose and one clear next step.",
            "Send it to the right person/channel and avoid over-editing.",
            "Track the reply status and set one follow-up reminder.",
        ]
        out_benefits = [
            "You create real movement instead of waiting or overthinking.",
            "You improve communication clarity and response rate over time.",
            "You build confidence by handling important conversations directly.",
        ]
    elif domain == "physical":
        explanation = (
            f"This challenge is: {task_line}. "
            "It improves health and discipline through one completed physical session today."
        )
        approaches = [
            "Set a simple target (duration, reps, or rounds) before starting.",
            "Do one focused session with proper form and controlled pace.",
            "Record your result and one improvement point for next time.",
        ]
        out_benefits = [
            "You improve fitness, stamina, and body confidence through action.",
            "You increase daily energy and stress control.",
            "You build consistency by proving you can execute physical goals.",
        ]
    else:
        approaches = [
            f"Do this task in one focused block: {task_line}. Stop only after one visible output is done.",
            "Break the task into 3 clear steps and finish the first two today.",
            "Complete one version now, then improve it once after a short review.",
        ]
        out_benefits = [
            f"You make real {category} progress today from this task.",
            "You reduce overthinking because you execute a clear plan.",
            "You build trust in yourself by finishing what you start.",
        ]
    quick = f"Start now: do the first 5 minutes of '{task_line}'."
    if benefits.strip():
        out_benefits[0] = benefits[:220]

    return ChallengeDetailOut(
        explanation=explanation,
        approaches=approaches,
        benefits=out_benefits,
        quickStart=quick[:140],
    )

