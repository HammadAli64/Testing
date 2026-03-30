# Monk Agent Workflow Guide

This file explains how agents work in this project, which agent does what, how challenges are generated, what users see as examples/benefits, how data is saved, and how loading is handled.

## 1) End-to-End Flow

1. Frontend asks backend for day data via `GET /api/coach/day-state`.
2. If challenges already exist for that date, backend returns them immediately.
3. If no challenges exist for that date, backend auto-generates and stores a day plan, then returns it.
4. User opens challenge detail via `GET /api/coach/challenge-detail`.
5. User submits completion note via `POST /api/coach/challenge-status` (note is required for completed status).

## 2) Which Agent Does What

## Daily Plan Agent
- Function: `generate_daily_plan()` in `backend/coach/agent.py`
- Purpose: create 12 daily challenges (2 per category) + motivation + summary + daily quote.
- Inputs:
  - User stats (completed/missed trends)
  - RAG context from indexed files in `backend/read/`
  - Document mindset profile (whole-doc synthesis)
  - Recent titles (to reduce repeats across days)
- Output: strict JSON plan used by backend and stored in DB.

## Document Mindset Agent
- Function: `build_doc_mindset_profile()`
- Purpose: summarize whole document set into thesis/mindset/principles/anti-patterns/practical levers.
- Why: avoids keyword-only challenges; forces whole-context reasoning.

## Category Chooser Agent (optional)
- Function: `choose_best_and_low_category_ai()`
- Purpose: infer best and weak category from stats.
- Default: local non-agent logic unless enabled.

## Challenge Deep-Dive Agent (optional)
- Function: `generate_challenge_deep_dive()`
- Purpose: detailed explanation + 3 examples + 3 benefits for one challenge.
- Default: local fast detail in `views.py` is used first for speed.

## 3) Challenge Generation Rules

Daily plan generator creates:
- Exactly 12 challenges:
  - business x2
  - motivation x2
  - power x2
  - freedom x2
  - money x2
  - grooming x2
- Each challenge contains:
  - title (multi-line)
  - difficulty, time, points, body part
  - detailed execution text
  - benefit text

### Practicality + Uniqueness
- Uses RAG context + mindset profile, not only highlighted words.
- Applies recent-title avoidance (cross-day anti-repeat window).
- Enforces uniqueness in same-day category pairs.

## 4) Example Challenge Style (Practical)

Example task line:
- `Create a small paid offer from your skill and send it to 3 contacts on WhatsApp or LinkedIn today.`

Example detail guidance:
- Who to target first (warm lead / local owner)
- What to write in message (problem, offer, price, timeline)
- What output counts as done (sent messages + reply tracking)

Example real-life benefits:
- immediate output (offer sent)
- real market feedback
- compounding consistency in sales behavior

## 5) How Challenge Data Is Saved

Primary tables in `backend/db.sqlite3`:

- `challenge_status`
  - stores daily challenge rows, status (`pending/completed/missed`), points, completion note
- `challenge_detail`
  - stores details and benefits text for each challenge
- `day_plan_meta`
  - stores motivation, summary, daily quote per day
- `rag_chunk`
  - vector-indexed chunks from files in `backend/read/`

When a day plan is generated:
1. challenges are upserted into `challenge_status` with `pending`
2. details/benefits go into `challenge_detail`
3. motivation/summary/quote go into `day_plan_meta`

When user completes a task:
- `POST /api/coach/challenge-status` requires `completionNote` for `completed`
- backend updates `challenge_status` for that challenge

## 6) Loading and “No Challenge” Recovery

Current anti-empty design:
- `day_state` is self-healing.
- If date has no challenges, backend generates a new plan and returns it in same flow.

Why this helps:
- frontend won’t stay blank when direct `/daily-plan` call fails or times out.

## 7) Agent/Mode Flags (Environment)

Configured in `backend/.env`:

- `OPENAI_API_KEY`
  - required for agent + embeddings.
- `OPENAI_AGENTS_MODEL`
  - optional model override.
- `MONK_FORCE_LOCAL_DAILY_PLAN=1`
  - force local planner (skip daily plan agent).
- `MONK_STRICT_AGENT_ONLY=1`
  - if daily plan agent fails, do not fallback (returns error).
- `MONK_USE_AGENT_DAILY_QUOTE=1`
  - use agent-generated quote; otherwise deterministic local quote.
- `MONK_USE_AGENT_CATEGORY_CHOOSER=1`
  - enable agent chooser for best/low category.
- `MONK_USE_AGENT_DEEP_DIVE=1`
  - enable agent deep-dive for challenge detail.

## 8) How to Keep It Fast in Dev

- Keep `MONK_USE_AGENT_DEEP_DIVE` off unless needed.
- Use self-healing `day_state` (already implemented) as source of truth.
- Re-index `backend/read/` only when files change:
  - `POST /api/coach/read-folder/ingest`
- Restart backend after major agent logic edits.

## 9) Testing Daily Change Behavior

To verify next-day uniqueness:
1. Open app and note today’s challenges.
2. Click **Next day**.
3. Confirm date changed and challenge IDs changed (`plan-YYYY-MM-DD-*`).
4. Confirm business/money tasks are not copied from previous day.
5. Check history/progress endpoints for updated day series.

