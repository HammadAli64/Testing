# Coach Backend (Django) - How It Works & How To Use

This backend powers the “coach insight / daily challenges” feature using the **OpenAI Agents SDK**.

## Where your OpenAI API key goes
- It is **not stored in your repo** and **not hardcoded**.
- Recommended: put it in `backend/.env`:
  - `OPENAI_API_KEY` (required)
  - `OPENAI_AGENTS_MODEL` (optional, if you want to force a specific model)

The backend automatically loads `backend/.env` at startup (if the file exists).

## What the backend does
1. `POST /api/coach/daily-plan`
   - Reads your category performance stats from `backend/db.sqlite3`
   - Calls the Agents SDK to generate **exactly 6 challenges**
   - Returns:
     - `plan.challenges[]` (title, category, difficulty, time, points, and a stable `id`)
     - `plan.motivation`
     - `plan.summary`
   - Also stores the generated challenges as **pending** in SQLite, so later completion updates are valid.

2. `POST /api/coach/challenge-status`
   - When you mark a challenge as `completed` or `missed` in the frontend, the backend records that status in SQLite.

3. `POST /api/coach/custom-challenge`
   - When you add a custom task in the frontend, the backend stores it in SQLite and also registers it as a pending challenge.

## How “learning” works (simple version)
For each category (fitness, sleep, mind, productivity, nutrition, games), the backend tracks:
- number of times challenges were marked `completed`
- number of times challenges were marked `missed`

When generating the next daily plan, the prompt encourages the agent to:
- emphasize categories with higher completion rates
- still include at least one lower-performing category to improve weak spots

## API Endpoints
### Health check
- `GET /api/coach/health`
Response:
```json
{"ok": true}
```

### Generate today’s plan
- `POST /api/coach/daily-plan`
Request JSON:
```json
{
  "userId": "some-user-id",
  "date": "YYYY-MM-DD" 
}
```
Response JSON:
```json
{
  "ok": true,
  "date": "YYYY-MM-DD",
  "plan": {
    "challenges": [
      {
        "id": "plan-YYYY-MM-DD-0",
        "title": "...",
        "category": "fitness",
        "difficulty": "Easy",
        "time": "15 min",
        "points": 12
      }
    ],
    "motivation": "...",
    "summary": "..."
  }
}
```

### Record completion or missed
- `POST /api/coach/challenge-status`
Request JSON:
```json
{
  "userId": "some-user-id",
  "date": "YYYY-MM-DD",
  "status": "completed",
  "challenge": {
    "id": "plan-YYYY-MM-DD-0",
    "category": "fitness",
    "title": "...",
    "difficulty": "Easy",
    "timeEstimate": "15 min",
    "points": 12,
    "isCustom": false
  }
}
```
`status` must be either `"completed"` or `"missed"`.

### Store a custom task
- `POST /api/coach/custom-challenge`
Request JSON:
```json
{
  "userId": "some-user-id",
  "date": "YYYY-MM-DD",
  "challenge": {
    "id": "custom-...",
    "category": "productivity",
    "title": "...",
    "difficulty": "Medium",
    "timeEstimate": "20 min",
    "points": 5,
    "isCustom": true
  }
}
```

## How to run (local dev)
1. Install dependencies:
   - `cd backend`
   - `pip install -r requirements.txt`
2. Create `backend/.env` (copy from `backend/.env.example`) and set:
   - `OPENAI_API_KEY="YOUR_KEY_HERE"`
   - optionally `OPENAI_AGENTS_MODEL="gpt-4.1-mini"` (example)
3. Start Django:
   - `python manage.py runserver 0.0.0.0:8001`
4. Start your Next.js app (already running in your terminal):
   - frontend calls `http://localhost:8001/api/coach/...` by default

## Notes / limitations
- This demo uses SQLite (`backend/db.sqlite3`) for persistence.
- There is no user authentication yet. The frontend generates/stores a random `userId` in `localStorage`.
- If you stop the backend, the frontend automatically falls back to mock data.

