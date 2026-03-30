# Django Coach Backend (OpenAI Agents SDK)

## What this provides
- `POST /api/coach/daily-plan` returns a daily set of challenges + coach motivation/summary.
- `POST /api/coach/challenge-status` records when a user marks a challenge as `completed` or `missed`.
- `POST /api/coach/custom-challenge` records user-created custom tasks.

User learning is based on aggregated `completed` vs `missed` counts per category, stored in a local SQLite DB at `backend/db.sqlite3`.

## Setup (local dev)
1. Open a terminal in `backend/`
2. Install Python deps:
   - `pip install -r requirements.txt`
3. Create `backend/.env` (copy from `backend/.env.example`) and set:
   - `OPENAI_API_KEY` (required for embeddings / optional agent features)
   - optionally `OPENAI_AGENTS_MODEL` (if you want to force a model)
   - **Speed (default):** daily challenges use the **fast local RAG planner** (no slow LLM). To use the LLM for daily plans instead, set `MONK_USE_AGENT_DAILY_PLAN=1`.
   - **Daily quote:** default is a **fast deterministic** line from your docs. For an LLM-generated quote, set `MONK_USE_AGENT_DAILY_QUOTE=1`.
4. Start Django on port **8000**:
   - `python manage.py runserver 0.0.0.0:8000`

## Frontend wiring
- Run the Next app on port **3000**: `npm run dev` (see root `package.json`).
- The frontend defaults to the coach API at **`http://127.0.0.1:8000`**.

If you use a different host/port, set:
- `NEXT_PUBLIC_COACH_API_BASE_URL` (e.g. `http://127.0.0.1:8000`)

After changing documents in `backend/read/`, re-index with `POST /api/coach/read-folder/ingest` so headings and text are refreshed in the vector store.

## Security note
Do not paste API keys into chat or commit them to the repo.
Store them in environment variables instead.

For a full setup guide and endpoint examples, see `backend/COACH_BACKEND_USAGE.md`.
For architecture and agent behavior details, see `backend/AGENT_WORKFLOW.md`.

