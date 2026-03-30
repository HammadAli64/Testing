# Monk Project Workflow

This document explains how the project works, which "agents" do what, and how daily challenges are generated.

## 1) High-Level Architecture

- Frontend: Next.js app in `src/`
- Backend: Django API in `backend/`
- Storage: SQLite (`backend/db.sqlite3`)
- AI + RAG:
  - Challenge and coach logic in `backend/coach/agent.py`
  - RAG chunking/embedding/retrieval in `backend/coach/rag.py`
  - Data access helpers in `backend/coach/store.py`

The frontend calls backend REST endpoints. Backend handles all persistent state and AI/RAG logic.

---

## 2) Main Backend Modules

### `backend/coach/views.py` (API layer)

Responsibilities:
- Exposes endpoints like:
  - `POST /api/coach/daily-plan`
  - `GET /api/coach/day-state`
  - `GET /api/coach/challenge-detail`
  - `POST /api/coach/chat`
  - `GET /api/coach/progress`
  - `GET /api/coach/history`
  - RAG endpoints (`rag/status`, `rag/upload`, `rag/ingest-local`)
- Validates request payloads
- Calls agent/store functions
- Returns JSON responses for frontend

### `backend/coach/agent.py` (AI + generation logic)

Responsibilities:
- `generate_daily_plan(...)`:
  - Current reliability mode uses local RAG-grounded generator (`_local_rag_fallback_plan`)
  - Produces 12 challenges (2 per category), plus motivation/summary/quote
- `generate_challenge_deep_dive(...)`:
  - Creates detailed explanation + 2–3 approaches + benefits for one challenge
- `generate_chat_reply(...)`:
  - Coach chat response based on:
    - user message
    - conversation history
    - today's challenges
    - RAG context
    - frontend context snapshot (UI state)
    - selected coach personality
- `generate_day_meta(...)`:
  - Regenerates motivation/summary/quote when personality changes

### `backend/coach/rag.py` (RAG engine)

Responsibilities:
- `extract_docx_text(path)` reads `.docx` content
- `chunk_text(...)` splits text into chunks
- `index_user_file(...)` embeds chunks and stores vectors in SQLite
- `retrieve(...)` retrieves top relevant chunks by cosine similarity

### `backend/coach/store.py` (database operations)

Responsibilities:
- Challenge status persistence (`pending/completed/missed`)
- Progress metrics (daily/weekly/monthly/category/streak/points)
- Day meta storage (motivation/summary/quote)
- Challenge detail storage
- RAG chunk storage and stats
- History queries

---

## 3) "Which Agent Does What?"

In this project, "agent" means backend AI functions in `agent.py`:

- Daily planning agent:
  - Builds daily challenge list and top-level daily text
  - Grounded in `ModelTrainingData.docx` RAG data
- Chat coach agent:
  - Conversational assistant for user Q&A
  - Uses personality, challenges, history, and frontend data
- Detail agent:
  - Explains one challenge deeply and gives execution approaches/benefits
- Day-meta agent:
  - Rewrites motivational texts when coach personality changes
- Category chooser agent:
  - Selects best/low category from user completion stats

---

## 4) How Challenges Are Generated (Current Flow)

1. Frontend requests `POST /api/coach/daily-plan` with:
   - `userId`, `date`, `mood`
2. Backend (`views.py`) ensures RAG is available for this user.
   - Project enforces use of `backend/ModelTrainingData.docx`
3. Backend calls `generate_daily_plan(...)` in `agent.py`.
4. Daily plan is produced with:
   - 12 challenges total
   - category-balanced output
   - mood-aware difficulty/time
   - structured challenge details and benefits
5. Backend stores generated challenges in SQLite as `pending`.
6. Frontend loads day state and renders cards.

### Challenge quality logic

Each challenge includes:
- clear title (action-oriented, not random fragments)
- objective/logic in `details`
- execution steps
- success criteria
- practical benefits

---

## 5) How Detail Page Works

1. Frontend opens `/challenge/[id]?date=...`
2. Calls `GET /api/coach/challenge-detail`
3. Backend finds selected challenge from day data
4. `generate_challenge_deep_dive(...)` returns:
   - `explanation`
   - `approaches` (2–3)
   - `benefits`
   - `quickStart`
5. Frontend renders sections in this order:
   - explanation
   - plans/approaches
   - benefits

---

## 6) How Coach Chat Works

1. Frontend sends `POST /api/coach/chat` with:
   - user text
   - message history
   - selected personality
   - date
   - frontend context snapshot (plan state, progress, task list, etc.)
2. Backend enriches with:
   - today challenges from DB
   - best/low categories
   - RAG context
3. `generate_chat_reply(...)` returns tactical conversational response.
4. If model output fails, deterministic local fallback still gives actionable response.

---

## 7) Frontend Data Flow Summary

- Global state lives in `src/context/AppStateProvider.tsx`
- On day load:
  - fetches `day-state`
  - if missing, requests `daily-plan`
  - fetches stats + progress
- UI pages consume this shared state:
  - Dashboard
  - Mock mode
  - Mood mode
  - Personality mode
  - Challenge detail

---

## 8) Important Endpoints (Quick Reference)

- Health: `GET /api/coach/health`
- Daily plan: `POST /api/coach/daily-plan`
- Day state: `GET /api/coach/day-state`
- Day meta: `POST /api/coach/day-meta`
- Challenge detail: `GET /api/coach/challenge-detail`
- Chat: `POST /api/coach/chat`
- Progress: `GET /api/coach/progress`
- History: `GET /api/coach/history`
- RAG status: `GET /api/coach/rag/status`
- RAG ingest local file: `POST /api/coach/rag/ingest-local`

---

## 9) Current Design Principles

- Backend-driven state (not demo/mock-driven behavior)
- RAG-grounded challenge generation from `ModelTrainingData.docx`
- Clear, logic-based challenge instructions
- Mood + personality adaptation
- Fast response path for daily planning reliability

