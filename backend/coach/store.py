from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date as Date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
import secrets
import string


DB_PATH = Path(__file__).resolve().parent.parent / "db.sqlite3"

ALLOWED_CATEGORIES = [
    "business",
    "motivation",
    "power",
    "freedom",
    "money",
    "grooming",
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_tables() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_profile (
              user_id TEXT PRIMARY KEY,
              created_at TEXT NOT NULL
            );
            """,
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS custom_tasks (
              user_id TEXT NOT NULL,
              date TEXT NOT NULL,
              challenge_id TEXT NOT NULL,
              title TEXT NOT NULL,
              category TEXT NOT NULL,
              difficulty TEXT NOT NULL,
              time_estimate TEXT NOT NULL,
              points INTEGER NOT NULL,
              body_part TEXT,
              created_at TEXT NOT NULL,
              PRIMARY KEY (user_id, date, challenge_id)
            );
            """,
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS challenge_status (
              user_id TEXT NOT NULL,
              date TEXT NOT NULL,
              challenge_id TEXT NOT NULL,
              category TEXT NOT NULL,
              title TEXT NOT NULL,
              difficulty TEXT NOT NULL,
              time_estimate TEXT NOT NULL,
              points INTEGER NOT NULL,
              body_part TEXT,
              is_custom INTEGER NOT NULL,
              completion_note TEXT,
              status TEXT NOT NULL, -- pending | completed | missed
              updated_at TEXT NOT NULL,
              PRIMARY KEY (user_id, date, challenge_id)
            );
            """,
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS streak_restore_invite (
              code TEXT PRIMARY KEY,
              owner_user_id TEXT NOT NULL,
              break_date TEXT NOT NULL, -- YYYY-MM-DD date the user missed
              prev_streak INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              used_by_user_id TEXT,
              used_at TEXT
            );
            """,
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rag_chunk (
              user_id TEXT NOT NULL,
              source TEXT NOT NULL,
              chunk_id TEXT NOT NULL,
              content TEXT NOT NULL,
              embedding_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              PRIMARY KEY (user_id, source, chunk_id)
            );
            """,
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS day_plan_meta (
              user_id TEXT NOT NULL,
              date TEXT NOT NULL,
              motivation TEXT NOT NULL,
              summary TEXT NOT NULL,
              daily_quote TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (user_id, date)
            );
            """,
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS challenge_detail (
              user_id TEXT NOT NULL,
              date TEXT NOT NULL,
              challenge_id TEXT NOT NULL,
              details TEXT NOT NULL,
              benefits TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (user_id, date, challenge_id)
            );
            """,
        )

        # Backfill schema upgrades for existing DBs.
        def _ensure_column(table: str, column: str, ddl: str) -> None:
            cols = conn.execute(f"PRAGMA table_info({table});").fetchall()
            names = {c[1] for c in cols}
            if column not in names:
                conn.execute(ddl)

        _ensure_column(
            "custom_tasks",
            "body_part",
            "ALTER TABLE custom_tasks ADD COLUMN body_part TEXT;",
        )
        _ensure_column(
            "challenge_status",
            "body_part",
            "ALTER TABLE challenge_status ADD COLUMN body_part TEXT;",
        )
        _ensure_column(
            "challenge_status",
            "completion_note",
            "ALTER TABLE challenge_status ADD COLUMN completion_note TEXT;",
        )


@dataclass(frozen=True)
class CategoryStats:
    completed: int
    missed: int

    @property
    def completion_rate(self) -> float:
        total = self.completed + self.missed
        return 0.0 if total == 0 else self.completed / total


def upsert_custom_task(
    *,
    user_id: str,
    date: str,
    challenge_id: str,
    title: str,
    category: str,
    difficulty: str,
    time_estimate: str,
    points: int,
    body_part: str | None = None,
) -> None:
    ensure_tables()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO user_profile (user_id, created_at)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO NOTHING;
            """,
            (user_id, _utc_now_iso()),
        )
        conn.execute(
            """
            INSERT INTO custom_tasks (
              user_id, date, challenge_id, title, category,
              difficulty, time_estimate, points, body_part, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date, challenge_id) DO UPDATE SET
              title=excluded.title,
              category=excluded.category,
              difficulty=excluded.difficulty,
              time_estimate=excluded.time_estimate,
              points=excluded.points,
              body_part=excluded.body_part;
            """,
            (
                user_id,
                date,
                challenge_id,
                title,
                category,
                difficulty,
                time_estimate,
                int(points),
                body_part,
                _utc_now_iso(),
            ),
        )


def upsert_challenge_status(
    *,
    user_id: str,
    date: str,
    challenge_id: str,
    category: str,
    title: str,
    difficulty: str,
    time_estimate: str,
    points: int,
    body_part: str | None = None,
    completion_note: str | None = None,
    is_custom: bool,
    status: str,
) -> None:
    ensure_tables()

    if status not in {"pending", "completed", "missed"}:
        raise ValueError("Invalid status")

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO user_profile (user_id, created_at)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO NOTHING;
            """,
            (user_id, _utc_now_iso()),
        )
        conn.execute(
            """
            INSERT INTO challenge_status (
              user_id, date, challenge_id, category, title, difficulty,
              time_estimate, points, body_part, is_custom, completion_note, status, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date, challenge_id) DO UPDATE SET
              category=excluded.category,
              title=excluded.title,
              difficulty=excluded.difficulty,
              time_estimate=excluded.time_estimate,
              points=excluded.points,
              body_part=excluded.body_part,
              is_custom=excluded.is_custom,
              completion_note=excluded.completion_note,
              status=excluded.status,
              updated_at=excluded.updated_at;
            """,
            (
                user_id,
                date,
                challenge_id,
                category,
                title,
                difficulty,
                time_estimate,
                int(points),
                body_part,
                1 if is_custom else 0,
                completion_note,
                status,
                _utc_now_iso(),
            ),
        )


def upsert_challenge_detail(
    *,
    user_id: str,
    date: str,
    challenge_id: str,
    details: str,
    benefits: str,
) -> None:
    ensure_tables()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO challenge_detail (
              user_id, date, challenge_id, details, benefits, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date, challenge_id) DO UPDATE SET
              details=excluded.details,
              benefits=excluded.benefits,
              updated_at=excluded.updated_at;
            """,
            (user_id, date, challenge_id, details, benefits, _utc_now_iso()),
        )


def get_user_category_stats(user_id: str) -> dict[str, CategoryStats]:
    ensure_tables()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
              category,
              SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END) AS missed
            FROM challenge_status
            WHERE user_id = ?
              AND status IN ('completed','missed')
            GROUP BY category;
            """,
            (user_id,),
        ).fetchall()

    stats: dict[str, CategoryStats] = {c: CategoryStats(0, 0) for c in ALLOWED_CATEGORIES}
    for r in rows:
        stats[r["category"]] = CategoryStats(
            completed=int(r["completed"] or 0),
            missed=int(r["missed"] or 0),
        )
    return stats


def get_recent_custom_task_titles(user_id: str, limit_per_category: int = 3) -> dict[str, list[str]]:
    ensure_tables()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT category, title
            FROM custom_tasks
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 200;
            """,
            (user_id,),
        ).fetchall()

    result: dict[str, list[str]] = {c: [] for c in ALLOWED_CATEGORIES}
    counts: dict[str, int] = {c: 0 for c in ALLOWED_CATEGORIES}
    for r in rows:
        cat = r["category"]
        if cat not in result:
            continue
        if counts[cat] >= limit_per_category:
            continue
        result[cat].append(str(r["title"]))
        counts[cat] += 1
    return result


def recent_user_mindset_signals(
    user_id: str,
    *,
    note_limit: int = 24,
    custom_limit: int = 24,
) -> dict[str, list[str]]:
    """
    Returns recent user-authored signals that can shape future challenge generation:
    - completionNotes: notes user wrote when marking tasks completed
    - customTaskTitles: titles user created as custom tasks
    """
    ensure_tables()
    note_limit = max(1, min(int(note_limit), 80))
    custom_limit = max(1, min(int(custom_limit), 80))
    with _connect() as conn:
        note_rows = conn.execute(
            """
            SELECT completion_note
            FROM challenge_status
            WHERE user_id = ?
              AND status = 'completed'
              AND completion_note IS NOT NULL
              AND TRIM(completion_note) <> ''
            ORDER BY updated_at DESC
            LIMIT ?;
            """,
            (user_id, note_limit),
        ).fetchall()
        custom_rows = conn.execute(
            """
            SELECT title
            FROM custom_tasks
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?;
            """,
            (user_id, custom_limit),
        ).fetchall()

    completion_notes = [str(r["completion_note"]).strip() for r in note_rows if str(r["completion_note"]).strip()]
    custom_task_titles = [str(r["title"]).strip() for r in custom_rows if str(r["title"]).strip()]
    return {
        "completionNotes": completion_notes,
        "customTaskTitles": custom_task_titles,
    }


def as_promptable_stats(user_id: str) -> dict[str, Any]:
    stats = get_user_category_stats(user_id)
    return {
        category: {
            "completed": s.completed,
            "missed": s.missed,
            "completion_rate": round(s.completion_rate, 3),
        }
        for category, s in stats.items()
    }


def today_achievement(user_id: str, *, date: str) -> dict[str, Any]:
    """
    Computes today's achievement stats for summaries.
    """
    ensure_tables()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT category,
                   COUNT(*) AS completed_count,
                   COALESCE(SUM(points), 0) AS points_sum
            FROM challenge_status
            WHERE user_id = ?
              AND date = ?
              AND status = 'completed'
            GROUP BY category
            ORDER BY completed_count DESC, points_sum DESC;
            """,
            (user_id, date),
        ).fetchall()

        total_row = conn.execute(
            """
            SELECT COUNT(*) AS completed_count,
                   COALESCE(SUM(points), 0) AS points_sum
            FROM challenge_status
            WHERE user_id = ?
              AND date = ?
              AND status = 'completed';
            """,
            (user_id, date),
        ).fetchone()

    completed = int(total_row["completed_count"] or 0) if total_row else 0
    points = int(total_row["points_sum"] or 0) if total_row else 0
    top_category = str(rows[0]["category"]) if rows else ""
    return {
        "date": date,
        "completedTasks": completed,
        "earnedPoints": points,
        "topCategory": top_category,
    }


def day_challenges(user_id: str, *, date: str) -> list[dict[str, Any]]:
    """
    Returns all challenges for the given day from challenge_status,
    including status and is_custom flags.
    """
    ensure_tables()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
              cs.challenge_id,
              cs.title,
              cs.category,
              cs.difficulty,
              cs.time_estimate,
              cs.points,
              cs.body_part,
              cs.is_custom,
              cs.completion_note,
              cs.status,
              cd.details,
              cd.benefits
            FROM challenge_status
            cs
            LEFT JOIN challenge_detail cd
              ON cd.user_id = cs.user_id
             AND cd.date = cs.date
             AND cd.challenge_id = cs.challenge_id
            WHERE cs.user_id = ?
              AND cs.date = ?
            ORDER BY cs.is_custom DESC, cs.challenge_id ASC;
            """,
            (user_id, date),
        ).fetchall()

    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "id": str(r["challenge_id"]),
                "title": str(r["title"]),
                "category": str(r["category"]),
                "difficulty": str(r["difficulty"]),
                "time": str(r["time_estimate"]),
                "points": int(r["points"] or 0),
                "bodyPart": str(r["body_part"] or "") or None,
                "completionNote": str(r["completion_note"] or "") or None,
                "details": str(r["details"] or "") or None,
                "benefits": str(r["benefits"] or "") or None,
                "isCustom": bool(int(r["is_custom"] or 0)),
                "status": str(r["status"]),
            }
        )
    return out


def upsert_day_plan_meta(
    *,
    user_id: str,
    date: str,
    motivation: str,
    summary: str,
    daily_quote: str,
) -> None:
    ensure_tables()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO day_plan_meta (
              user_id, date, motivation, summary, daily_quote, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET
              motivation=excluded.motivation,
              summary=excluded.summary,
              daily_quote=excluded.daily_quote,
              updated_at=excluded.updated_at;
            """,
            (user_id, date, motivation, summary, daily_quote, _utc_now_iso()),
        )


def get_day_plan_meta(user_id: str, *, date: str) -> dict[str, str] | None:
    ensure_tables()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT motivation, summary, daily_quote
            FROM day_plan_meta
            WHERE user_id = ?
              AND date = ?
            LIMIT 1;
            """,
            (user_id, date),
        ).fetchone()
    if not row:
        return None
    return {
        "motivation": str(row["motivation"] or ""),
        "summary": str(row["summary"] or ""),
        "dailyQuote": str(row["daily_quote"] or ""),
    }


def history_days(
    user_id: str, *, days: int = 30, end_date: str | None = None
) -> list[dict[str, Any]]:
    """
    Returns real history days from stored challenge_status.
    Each day includes completed and missed lists.
    We treat status in ('missed','pending') as missed for history display.
    """
    ensure_tables()
    days = max(1, min(int(days), 120))
    end = _parse_iso_date(end_date) if end_date else datetime.now().date()

    with _connect() as conn:
        drows = conn.execute(
            """
            SELECT DISTINCT date
            FROM challenge_status
            WHERE user_id = ?
              AND date <= ?
            ORDER BY date DESC
            LIMIT ?;
            """,
            (user_id, end.isoformat(), days),
        ).fetchall()

        out: list[dict[str, Any]] = []
        for dr in drows:
            d = str(dr["date"])
            rows = conn.execute(
                """
                SELECT challenge_id, title, category, difficulty, time_estimate,
                       points, body_part, is_custom, status
                FROM challenge_status
                WHERE user_id = ?
                  AND date = ?;
                """,
                (user_id, d),
            ).fetchall()

            completed: list[dict[str, Any]] = []
            missed: list[dict[str, Any]] = []
            for r in rows:
                item = {
                    "id": str(r["challenge_id"]),
                    "title": str(r["title"]),
                    "category": str(r["category"]),
                    "difficulty": str(r["difficulty"]),
                    "timeEstimate": str(r["time_estimate"]),
                    "points": int(r["points"] or 0),
                    "bodyPart": str(r["body_part"] or "") or None,
                    "isCustom": bool(int(r["is_custom"] or 0)),
                }
                if str(r["status"]) == "completed":
                    completed.append(item)
                else:
                    missed.append(item)

            total = len(completed) + len(missed)
            score = 0 if total == 0 else round((len(completed) / total) * 100)
            out.append(
                {
                    "date": d,
                    "score": int(score),
                    "completed": completed,
                    "missed": missed,
                    "aiSummary": "",
                }
            )
    return out


def best_and_low_categories(user_id: str) -> tuple[str, str]:
    """
    Returns (best_category, low_category) by completion_rate.
    Ties are broken by total attempts, then by category name for stability.
    """
    stats = get_user_category_stats(user_id)

    def key_best(cat: str) -> tuple[float, int, str]:
        s = stats[cat]
        return (s.completion_rate, s.completed + s.missed, cat)

    def key_low(cat: str) -> tuple[float, int, str]:
        s = stats[cat]
        return (s.completion_rate, -(s.completed + s.missed), cat)

    best = max(ALLOWED_CATEGORIES, key=key_best)
    low = min(ALLOWED_CATEGORIES, key=key_low)
    return best, low


def _parse_iso_date(d: str) -> Date:
    return datetime.strptime(d, "%Y-%m-%d").date()


def daily_completion_series(
    user_id: str, *, days: int = 14, end_date: str | None = None
) -> list[dict[str, Any]]:
    """
    Returns a list of {date: 'YYYY-MM-DD', rate: number 0..100} for the last N days (UTC).
    """
    ensure_tables()
    days = max(1, min(int(days), 90))
    # Use provided end_date (YYYY-MM-DD) when present; otherwise local today.
    end = _parse_iso_date(end_date) if end_date else datetime.now().date()
    start = end - timedelta(days=days - 1)

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT date,
              SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status IN ('completed','missed','pending') THEN 1 ELSE 0 END) AS total
            FROM challenge_status
            WHERE user_id = ?
              AND date >= ?
              AND date <= ?
            GROUP BY date
            ORDER BY date ASC;
            """,
            (user_id, start.isoformat(), end.isoformat()),
        ).fetchall()

    by_date: dict[str, tuple[int, int]] = {
        r["date"]: (int(r["completed"] or 0), int(r["total"] or 0)) for r in rows
    }

    out: list[dict[str, Any]] = []
    for i in range(days):
        d = start + timedelta(days=i)
        key = d.isoformat()
        completed, total = by_date.get(key, (0, 0))
        rate = 0 if total == 0 else round((completed / total) * 100)
        out.append({"date": key, "rate": rate})
    return out


def weekly_completion_buckets(
    user_id: str, *, weeks: int = 4, end_date: str | None = None
) -> list[dict[str, Any]]:
    """
    Returns a list like [{week:'W1', value: 0..100}, ...] for the last N weeks.
    """
    ensure_tables()
    weeks = max(1, min(int(weeks), 12))
    end = _parse_iso_date(end_date) if end_date else datetime.now().date()
    # Align to week starts (Monday) for stable buckets
    end_monday = end - timedelta(days=end.weekday())
    start_monday = end_monday - timedelta(days=(weeks - 1) * 7)

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT date,
              SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status IN ('completed','missed','pending') THEN 1 ELSE 0 END) AS total
            FROM challenge_status
            WHERE user_id = ?
              AND date >= ?
              AND date <= ?
            GROUP BY date;
            """,
            (user_id, start_monday.isoformat(), (end_monday + timedelta(days=6)).isoformat()),
        ).fetchall()

    daily: dict[Date, tuple[int, int]] = {}
    for r in rows:
        d = _parse_iso_date(r["date"])
        daily[d] = (int(r["completed"] or 0), int(r["total"] or 0))

    out: list[dict[str, Any]] = []
    for w in range(weeks):
        wk_start = start_monday + timedelta(days=w * 7)
        wk_end = wk_start + timedelta(days=6)
        completed = 0
        total = 0
        for j in range(7):
            d = wk_start + timedelta(days=j)
            c, t = daily.get(d, (0, 0))
            completed += c
            total += t
        value = 0 if total == 0 else round((completed / total) * 100)
        out.append({"week": f"W{w+1}", "value": value})
    return out


def monthly_completion_series(
    user_id: str, *, months: int = 6, end_date: str | None = None
) -> list[dict[str, Any]]:
    """
    Returns a list of {month: 'Mon', rate: 0..100} for the last N months (approx, UTC).
    """
    ensure_tables()
    months = max(1, min(int(months), 12))
    today = _parse_iso_date(end_date) if end_date else datetime.now().date()

    # Approx months by stepping back in 30-day chunks (good enough for a demo).
    points: list[Date] = [(today - timedelta(days=30 * (months - 1 - i))) for i in range(months)]

    # Compute for each 30-day window ending at that point (exclusive) or month label only.
    out: list[dict[str, Any]] = []
    for d in points:
        start = d - timedelta(days=29)
        end = d
        with _connect() as conn:
            row = conn.execute(
                """
                SELECT
                  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
                  SUM(CASE WHEN status IN ('completed','missed','pending') THEN 1 ELSE 0 END) AS total
                FROM challenge_status
                WHERE user_id = ?
                  AND date >= ?
                  AND date <= ?;
                """,
                (user_id, start.isoformat(), end.isoformat()),
            ).fetchone()
        completed = int(row["completed"] or 0) if row else 0
        total = int(row["total"] or 0) if row else 0
        rate = 0 if total == 0 else round((completed / total) * 100)
        out.append({"month": d.strftime("%b"), "rate": rate})
    return out


def category_scores(user_id: str, *, date: str | None = None) -> list[dict[str, Any]]:
    """
    Returns [{category, score}] where score is 0..100 for *today*:
    completed / (completed + missed + pending) per category.
    """
    ensure_tables()
    today = (date or datetime.now().date().isoformat())
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT category,
              SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END) AS missed,
              SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending
            FROM challenge_status
            WHERE user_id = ?
              AND date = ?
            GROUP BY category;
            """,
            (user_id, today),
        ).fetchall()

    by_cat: dict[str, tuple[int, int, int]] = {}
    for r in rows:
        by_cat[str(r["category"])] = (
            int(r["completed"] or 0),
            int(r["missed"] or 0),
            int(r["pending"] or 0),
        )
    out: list[dict[str, Any]] = []
    for cat in ALLOWED_CATEGORIES:
        c, m, p = by_cat.get(cat, (0, 0, 0))
        total = c + m + p
        score = 0 if total == 0 else round((c / total) * 100)
        out.append({"category": cat, "score": score})
    return out


def totals(user_id: str, *, date: str | None = None) -> dict[str, int]:
    """
    Returns counts for the current day only.
    """
    ensure_tables()
    today = (date or datetime.now().date().isoformat())
    with _connect() as conn:
        completed = conn.execute(
            "SELECT COUNT(*) as c FROM challenge_status WHERE user_id = ? AND status='completed' AND date=?",
            (user_id, today),
        ).fetchone()
        missed = conn.execute(
            "SELECT COUNT(*) as c FROM challenge_status WHERE user_id = ? AND status='missed' AND date=?",
            (user_id, today),
        ).fetchone()
        pending = conn.execute(
            "SELECT COUNT(*) as c FROM challenge_status WHERE user_id = ? AND status='pending' AND date=?",
            (user_id, today),
        ).fetchone()

    return {
        "totalCompleted": int(completed["c"] or 0),
        "totalMissed": int(missed["c"] or 0),
        "totalPending": int(pending["c"] or 0),
    }


def lifetime_points(user_id: str) -> int:
    """
    Sum of points from all completed challenges for the user.
    """
    ensure_tables()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT COALESCE(SUM(points), 0) AS pts
            FROM challenge_status
            WHERE user_id = ?
              AND status = 'completed';
            """,
            (user_id,),
        ).fetchone()
    return int(row["pts"] or 0) if row else 0


def compute_streak(user_id: str, *, end_date: str | None = None) -> int:
    """
    Computes consecutive-day completion streak ending today.
    New rules:
    - If you miss a day (no completions), the streak becomes 0 on the next day.
    - If there is no completed day yet, returns 0.
    - If the selected day has no completions yet but *yesterday* did, carry forward.
    """
    ensure_tables()
    end = _parse_iso_date(end_date) if end_date else datetime.now().date()

    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT date
            FROM challenge_status
            WHERE user_id = ? AND status='completed';
            """,
            (user_id,),
        ).fetchall()
    completed_dates = {str(r["date"]) for r in rows}

    if not completed_dates:
        return 0

    end_key = end.isoformat()
    if end_key not in completed_dates:
        yesterday = (end - timedelta(days=1)).isoformat()
        # If you completed something yesterday, your streak still shows on the new day
        # until you miss a day.
        if yesterday in completed_dates:
            end = _parse_iso_date(yesterday)
        else:
            return 0

    streak = 0
    cur = end
    while cur.isoformat() in completed_dates:
        streak += 1
        cur = cur - timedelta(days=1)

    return streak


def _random_code(length: int = 10) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def streak_restore_status(user_id: str, *, end_date: str) -> dict[str, Any]:
    """
    Returns whether the user can restore a broken streak for end_date.
    A restore is valid for the missed day = end_date - 1.
    """
    ensure_tables()
    end = _parse_iso_date(end_date)
    break_date = (end - timedelta(days=1)).isoformat()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT code, prev_streak, used_at
            FROM streak_restore_invite
            WHERE owner_user_id = ?
              AND break_date = ?
            ORDER BY created_at DESC
            LIMIT 1;
            """,
            (user_id, break_date),
        ).fetchone()
    return {
        "breakDate": break_date,
        "hasInvite": bool(row),
        "inviteCode": str(row["code"]) if row else None,
        "prevStreak": int(row["prev_streak"]) if row else None,
        "used": bool(row and row["used_at"]),
    }


def compute_streak_with_restore(user_id: str, *, end_date: str) -> int:
    """
    Same as compute_streak(), but if the streak is broken (0) and there is a used
    restore invite for the missed day, return the previous streak value.
    """
    base = compute_streak(user_id, end_date=end_date)
    if base != 0:
        return base
    status = streak_restore_status(user_id, end_date=end_date)
    if status["used"] and status["prevStreak"] is not None:
        return int(status["prevStreak"])
    return 0


def create_streak_restore_invite(
    user_id: str, *, end_date: str, force_new: bool = False
) -> dict[str, Any]:
    """
    Creates (or reuses) an invite code to restore the streak for a missed day.
    Only meaningful when compute_streak(user_id, end_date=end_date) == 0.
    """
    ensure_tables()
    end = _parse_iso_date(end_date)
    break_date = (end - timedelta(days=1)).isoformat()
    # The streak we restore to is what the user had before the missed day.
    prev_end = (end - timedelta(days=2)).isoformat()
    prev_streak = compute_streak(user_id, end_date=prev_end)

    with _connect() as conn:
        existing = conn.execute(
            """
            SELECT code, prev_streak, used_at
            FROM streak_restore_invite
            WHERE owner_user_id = ?
              AND break_date = ?
            ORDER BY created_at DESC
            LIMIT 1;
            """,
            (user_id, break_date),
        ).fetchone()
        if (not force_new) and existing and not existing["used_at"]:
            return {
                "code": str(existing["code"]),
                "breakDate": break_date,
                "prevStreak": int(existing["prev_streak"] or 0),
            }

        # Ensure code uniqueness (keep trying until unique).
        code = _random_code()
        while True:
            clash = conn.execute(
                "SELECT 1 FROM streak_restore_invite WHERE code = ? LIMIT 1;",
                (code,),
            ).fetchone()
            if not clash:
                break
            code = _random_code()

        conn.execute(
            """
            INSERT INTO streak_restore_invite (
              code, owner_user_id, break_date, prev_streak, created_at
            ) VALUES (?, ?, ?, ?, ?);
            """,
            (code, user_id, break_date, int(prev_streak), _utc_now_iso()),
        )
        return {"code": code, "breakDate": break_date, "prevStreak": int(prev_streak)}


def accept_streak_restore_invite(
    friend_user_id: str, *, code: str
) -> dict[str, Any] | None:
    """
    Marks an invite as used by friend_user_id. Returns the invite data or None if invalid/used.
    """
    ensure_tables()
    code = (code or "").strip().upper()
    if not code:
        return None

    with _connect() as conn:
        row = conn.execute(
            """
            SELECT code, owner_user_id, break_date, prev_streak, used_at
            FROM streak_restore_invite
            WHERE code = ?;
            """,
            (code,),
        ).fetchone()
        if not row or row["used_at"]:
            return None
        conn.execute(
            """
            UPDATE streak_restore_invite
            SET used_by_user_id = ?, used_at = ?
            WHERE code = ?;
            """,
            (friend_user_id, _utc_now_iso(), code),
        )
        return {
            "code": str(row["code"]),
            "ownerUserId": str(row["owner_user_id"]),
            "breakDate": str(row["break_date"]),
            "prevStreak": int(row["prev_streak"] or 0),
        }


def clear_rag(user_id: str) -> None:
    ensure_tables()
    with _connect() as conn:
        conn.execute("DELETE FROM rag_chunk WHERE user_id = ?;", (user_id,))


def clear_day_plan(user_id: str, *, date: str) -> None:
    """
    Clears non-custom day plan content for the given date.
    (Challenges, meta, and details). Does NOT touch custom tasks.
    """
    ensure_tables()
    with _connect() as conn:
        conn.execute(
            "DELETE FROM challenge_status WHERE user_id = ? AND date = ? AND is_custom = 0;",
            (user_id, date),
        )
        conn.execute(
            "DELETE FROM challenge_detail WHERE user_id = ? AND date = ?;",
            (user_id, date),
        )
        conn.execute(
            "DELETE FROM day_plan_meta WHERE user_id = ? AND date = ?;",
            (user_id, date),
        )


def upsert_rag_chunk(
    *,
    user_id: str,
    source: str,
    chunk_id: str,
    content: str,
    embedding_json: str,
) -> None:
    ensure_tables()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO rag_chunk (
              user_id, source, chunk_id, content, embedding_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, source, chunk_id) DO UPDATE SET
              content=excluded.content,
              embedding_json=excluded.embedding_json,
              created_at=excluded.created_at;
            """,
            (user_id, source, chunk_id, content, embedding_json, _utc_now_iso()),
        )


def rag_stats(user_id: str) -> dict[str, Any]:
    ensure_tables()
    with _connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM rag_chunk WHERE user_id = ?;",
            (user_id,),
        ).fetchone()
        sources = conn.execute(
            "SELECT source, COUNT(*) AS c FROM rag_chunk WHERE user_id = ? GROUP BY source ORDER BY c DESC;",
            (user_id,),
        ).fetchall()
    return {
        "chunks": int(row["c"] or 0) if row else 0,
        "sources": [{"source": str(r["source"]), "chunks": int(r["c"] or 0)} for r in sources],
    }


def rag_all_chunks(user_id: str) -> list[dict[str, Any]]:
    ensure_tables()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT source, chunk_id, content, embedding_json FROM rag_chunk WHERE user_id = ?;",
            (user_id,),
        ).fetchall()
    return [
        {
            "source": str(r["source"]),
            "chunkId": str(r["chunk_id"]),
            "content": str(r["content"]),
            "embeddingJson": str(r["embedding_json"]),
        }
        for r in rows
    ]


def recent_plan_titles(
    user_id: str,
    *,
    end_date: str,
    days: int = 7,
) -> list[str]:
    """
    Returns recent non-custom challenge titles up to `days` back from end_date,
    across all statuses (pending/completed/missed). Used to avoid repeats.
    """
    ensure_tables()
    days = max(1, min(int(days), 30))
    end = _parse_iso_date(end_date)
    start = (end - timedelta(days=days)).isoformat()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT title
            FROM challenge_status
            WHERE user_id = ?
              AND is_custom = 0
              AND date >= ?
              AND date < ?
            ORDER BY date DESC, updated_at DESC
            LIMIT 500;
            """,
            (user_id, start, end.isoformat()),
        ).fetchall()
    return [str(r["title"]) for r in rows if str(r["title"] or "").strip()]

