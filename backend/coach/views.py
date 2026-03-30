from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .agent import (
    choose_best_and_low_category_ai,
    ensure_logical_daily_quote,
    generate_chat_reply,
    generate_challenge_deep_dive,
    generate_day_meta,
    generate_daily_plan,
    generate_followup_challenges,
)
import os
from pathlib import Path

from .read_extractors import extract_text_from_path, list_supported_files
from .rag import (
    ensure_rag_chunks_if_empty,
    extract_docx_text,
    index_user_file,
    ingest_read_folder,
    read_folder_path,
)
from .store import (
    as_promptable_stats,
    best_and_low_categories,
    category_scores,
    daily_completion_series,
    get_recent_custom_task_titles,
    day_challenges,
    lifetime_points,
    today_achievement,
    totals as totals_fn,
    monthly_completion_series,
    weekly_completion_buckets,
    upsert_challenge_status,
    upsert_custom_task,
  compute_streak_with_restore,
  compute_streak,
  create_streak_restore_invite,
  accept_streak_restore_invite,
  streak_restore_status,
    rag_stats,
    history_days,
    upsert_day_plan_meta,
    get_day_plan_meta,
    upsert_challenge_detail,
    clear_day_plan,
)


def _today_utc_date() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _read_json(request: HttpRequest) -> dict:
    try:
        raw = request.body.decode("utf-8")
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}


def _auto_points_from_difficulty(difficulty: str) -> int:
    """
    Difficulty-aware points in the 1..9 range:
    Easy: 1..3, Medium: 4..6, Hard: 7..9
    """
    d = str(difficulty or "Medium").strip().lower()
    if d == "easy":
        return 2
    if d == "hard":
        return 8
    return 5


def _sanitize_meta_quote(
    *,
    user_id: str,
    date: str,
    mood: str,
    meta: dict | None,
) -> dict | None:
    if not meta:
        return meta
    q_raw = str(meta.get("dailyQuote") or "").strip()
    if not q_raw:
        return meta
    q_fixed = ensure_logical_daily_quote(
        quote=q_raw,
        user_id=user_id,
        date=date,
        mood=mood,
    )
    if q_fixed != q_raw:
        upsert_day_plan_meta(
            user_id=user_id,
            date=date,
            motivation=str(meta.get("motivation") or ""),
            summary=str(meta.get("summary") or ""),
            daily_quote=q_fixed,
        )
        out = dict(meta)
        out["dailyQuote"] = q_fixed
        return out
    return meta


@require_GET
def health(_request: HttpRequest) -> JsonResponse:
    return JsonResponse({"ok": True})


@csrf_exempt
@require_POST
def rag_upload(request: HttpRequest) -> JsonResponse:
    """
    Upload knowledge file content for RAG.
    JSON: { userId, source?, content }
    """
    payload = _read_json(request)
    user_id = payload.get("userId")
    source = payload.get("source") or "uploaded.txt"
    content = payload.get("content") or ""
    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)
    if not isinstance(content, str) or not content.strip():
        return JsonResponse({"ok": False, "error": "Missing content"}, status=400)
    try:
        out = index_user_file(user_id=user_id, source=str(source), content=content, replace=True)
    except Exception as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=500)
    return JsonResponse(out)


@require_GET
def rag_status(request: HttpRequest) -> JsonResponse:
    user_id = request.GET.get("userId")
    if not user_id:
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)
    return JsonResponse({"ok": True, "rag": rag_stats(user_id)})


@require_GET
def history(request: HttpRequest) -> JsonResponse:
    user_id = request.GET.get("userId")
    if not user_id:
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)
    days = int(request.GET.get("days") or 30)
    as_of = request.GET.get("asOf")
    return JsonResponse(
        {
            "ok": True,
            "days": history_days(user_id, days=days, end_date=as_of),
        }
    )


@csrf_exempt
@require_POST
def rag_ingest_local(request: HttpRequest) -> JsonResponse:
    """
    Ingest a file that already exists on the backend disk.
    JSON: { userId, path }
    Only allows files inside the backend/ directory.
    """
    payload = _read_json(request)
    user_id = payload.get("userId")
    rel_path = payload.get("path") or ""
    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)
    if not isinstance(rel_path, str) or not rel_path.strip():
        return JsonResponse({"ok": False, "error": "Missing path"}, status=400)

    backend_root = Path(__file__).resolve().parents[1]
    target = (backend_root / rel_path).resolve()
    if backend_root not in target.parents and target != backend_root:
        return JsonResponse({"ok": False, "error": "Invalid path"}, status=400)
    if not target.exists() or not target.is_file():
        return JsonResponse({"ok": False, "error": "File not found"}, status=404)

    suffix = target.suffix.lower()
    try:
        if suffix in {".docx", ".pdf", ".xlsx", ".csv", ".json", ".txt", ".md"}:
            content = extract_text_from_path(target)
        else:
            return JsonResponse({"ok": False, "error": "Unsupported file type"}, status=400)

        out = index_user_file(
            user_id=user_id,
            source=target.name,
            content=content,
            replace=True,
        )
    except Exception as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=500)

    return JsonResponse(out)


@require_GET
def read_folder_status(_request: HttpRequest) -> JsonResponse:
    read_dir = read_folder_path()
    files = [p.name for p in list_supported_files(read_dir)] if read_dir.is_dir() else []
    return JsonResponse({"ok": True, "readDir": str(read_dir), "files": files})


@csrf_exempt
@require_POST
def read_folder_ingest(request: HttpRequest) -> JsonResponse:
    """
    Re-index all supported files in backend/read/ into the vector store for this user.
    JSON: { userId }
    """
    payload = _read_json(request)
    user_id = payload.get("userId")
    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)
    try:
        out = ingest_read_folder(user_id)
        status = 200 if out.get("ok") else 400
        return JsonResponse(out, status=status)
    except Exception as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=500)


@require_GET
def stats(request: HttpRequest) -> JsonResponse:
    user_id = request.GET.get("userId")
    if not user_id:
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    stats_payload = as_promptable_stats(user_id)
    choice = choose_best_and_low_category_ai(stats_payload)
    return JsonResponse(
        {
            "ok": True,
            "stats": stats_payload,
            "bestCategory": choice.bestCategory,
            "lowCategory": choice.lowCategory,
            "bestReason": choice.bestReason,
            "lowReason": choice.lowReason,
        }
    )


@require_GET
def progress(request: HttpRequest) -> JsonResponse:
    user_id = request.GET.get("userId")
    if not user_id:
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    days = int(request.GET.get("days") or 14)
    weeks = int(request.GET.get("weeks") or 4)
    months = int(request.GET.get("months") or 6)
    as_of = request.GET.get("asOf")

    streak_raw = compute_streak(user_id, end_date=as_of or _today_utc_date())
    streak = compute_streak_with_restore(user_id, end_date=as_of or _today_utc_date())
    restore = (
        streak_restore_status(user_id, end_date=as_of)
        if as_of
        else streak_restore_status(user_id, end_date=_today_utc_date())
    )

    return JsonResponse(
        {
            "ok": True,
            "daily": daily_completion_series(user_id, days=days, end_date=as_of),
            "weekly": weekly_completion_buckets(user_id, weeks=weeks, end_date=as_of),
            "monthly": monthly_completion_series(user_id, months=months, end_date=as_of),
            "categoryScores": category_scores(user_id, date=as_of),
            "totals": totals_fn(user_id, date=as_of),
            "streak": streak,
            "streakBroken": streak_raw == 0,
            "streakRestore": restore,
            "lifetimePoints": lifetime_points(user_id),
        }
    )


@csrf_exempt
@require_POST
def streak_restore_invite(request: HttpRequest) -> JsonResponse:
    payload = _read_json(request)
    user_id = payload.get("userId")
    date = payload.get("date") or _today_utc_date()
    force_new = bool(payload.get("forceNew") or False)
    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    # Only allow invite when the streak is broken for that date.
    if compute_streak(user_id, end_date=str(date)) != 0:
        return JsonResponse({"ok": False, "error": "Streak is not broken"}, status=400)

    invite = create_streak_restore_invite(user_id, end_date=str(date), force_new=force_new)
    return JsonResponse({"ok": True, "invite": invite})


@csrf_exempt
@require_POST
def streak_restore_accept(request: HttpRequest) -> JsonResponse:
    payload = _read_json(request)
    user_id = payload.get("userId")
    code = payload.get("code") or ""
    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    out = accept_streak_restore_invite(user_id, code=str(code))
    if not out:
        return JsonResponse({"ok": False, "error": "Invalid or already used code"}, status=400)

    return JsonResponse({"ok": True, "accepted": out})


@require_GET
def day_state(request: HttpRequest) -> JsonResponse:
    user_id = request.GET.get("userId")
    date = request.GET.get("date") or _today_utc_date()
    mood = str(request.GET.get("mood") or "motivational")
    if not user_id:
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    items = day_challenges(user_id, date=str(date))
    if not items:
        # Self-healing: if no plan exists for this date, generate once so frontend
        # always receives challenges from day-state.
        try:
            ensure_rag_chunks_if_empty(user_id)
            stats = as_promptable_stats(user_id)
            achieved = today_achievement(user_id, date=str(date))
            plan = generate_daily_plan(
                user_id=user_id,
                date=str(date),
                mood=mood,
                stats=stats,
                achieved=achieved,
            )
            for i, ch in enumerate(plan.challenges):
                challenge_id = f"plan-{date}-{i}"
                upsert_challenge_status(
                    user_id=user_id,
                    date=str(date),
                    challenge_id=challenge_id,
                    category=ch.category,
                    title=ch.title,
                    difficulty=ch.difficulty,
                    time_estimate=ch.time,
                    points=ch.points,
                    body_part=ch.body_part,
                    is_custom=False,
                    status="pending",
                )
                upsert_challenge_detail(
                    user_id=user_id,
                    date=str(date),
                    challenge_id=challenge_id,
                    details=ch.details,
                    benefits=ch.benefits,
                )
            upsert_day_plan_meta(
                user_id=user_id,
                date=str(date),
                motivation=plan.motivation,
                summary=plan.summary,
                daily_quote=plan.dailyQuote,
            )
            items = day_challenges(user_id, date=str(date))
        except Exception as exc:
            return JsonResponse(
                {"ok": False, "error": f"Auto day-state generation failed: {exc}"},
                status=500,
            )
    meta = get_day_plan_meta(user_id, date=str(date))
    meta = _sanitize_meta_quote(
        user_id=user_id,
        date=str(date),
        mood=mood,
        meta=meta,
    )
    return JsonResponse({"ok": True, "date": str(date), "challenges": items, "meta": meta})


@require_GET
def challenge_detail(request: HttpRequest) -> JsonResponse:
    user_id = request.GET.get("userId")
    date = request.GET.get("date") or _today_utc_date()
    challenge_id = request.GET.get("challengeId") or ""
    mood = str(request.GET.get("mood") or "motivational")
    personality = str(request.GET.get("personality") or "friendly")
    if not user_id:
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)
    if not challenge_id:
        return JsonResponse({"ok": False, "error": "Missing challengeId"}, status=400)

    items = day_challenges(user_id, date=str(date))
    target = next((i for i in items if str(i.get("id")) == str(challenge_id)), None)
    if not target:
        return JsonResponse({"ok": False, "error": "Challenge not found"}, status=404)

    # Fast path: reuse stored detail for instant load (no agent call).
    details_raw = str(target.get("details") or "").strip()
    benefits_raw = str(target.get("benefits") or "").strip()
    is_custom = bool(target.get("isCustom"))
    # If old generic custom-task detail exists, regenerate from title logic.
    generic_markers = (
        "This challenge is:",
        "motivation progress today",
        "turning intention into one finished action",
    )
    if is_custom and any(m in details_raw for m in generic_markers):
        details_raw = ""
        benefits_raw = ""

    out_detail = None
    if details_raw or benefits_raw:
        title_raw = str(target.get("title") or "").strip()
        t_lines = [x.strip() for x in title_raw.splitlines() if x.strip()]
        insight_line = t_lines[0] if t_lines else ""
        task_line = t_lines[1] if len(t_lines) >= 2 else (t_lines[0] if t_lines else "")
        done_line = t_lines[2] if len(t_lines) >= 3 else ""
        task_line = re.sub(r"^(action|move|complete this challenge)\s*:\s*", "", task_line, flags=re.I).strip()
        if not task_line:
            task_line = f"complete one {str(target.get('category') or 'daily')} action"
        cat = str(target.get("category") or "")

        def practical_examples(category: str, task: str) -> list[str]:
            t = task.rstrip(".")
            low = t.lower()
            if category == "money":
                if "income lever" in low or "income" in low:
                    return [
                        "Pick one skill you can sell in 24 hours (editing, design, writing, tutoring), set one fixed starter price, and write the offer in one sentence.",
                        "Send that offer to 3 real people (friend, old contact, local business) and ask one direct question: 'Do you want this this week?'",
                        "Track replies in notes (name, status, next step) and follow up once before end of day.",
                    ]
                if "cost leak" in low or "expense" in low or "cut" in low:
                    return [
                        "Open bank/app statements and circle 3 non-essential spends from last 7 days.",
                        "Cancel, pause, or downgrade one subscription/expense right now and note the monthly amount saved.",
                        "Create one spending rule for this week (for example: no food delivery on weekdays) and set a reminder.",
                    ]
                if "money position" in low:
                    return [
                        "Write current money snapshot in notes: cash in hand, due bills, and expected income this week.",
                        "Choose one immediate action that improves position today: collect one due payment, reduce one bill, or make one small sale.",
                        "Record before/after amount so you can see the exact impact of today’s action.",
                    ]
                return [
                    f"Open your notes and list 3 money moves; pick one and do it now: {t}.",
                    f"Set a 15-minute timer, finish {t.lower()}, then write the exact result in one line.",
                    f"Before/after check: note your money position before {t.lower()} and after it, so you can see real change.",
                ]
            if category == "business":
                if "offer" in low:
                    return [
                        "Choose one customer type and write their top pain in one line.",
                        "Write a simple offer: 'I help [who] get [result] in [time] for [price]'.",
                        "Send this offer to one real person and ask for a yes/no response.",
                    ]
                if "outreach" in low or "message" in low:
                    return [
                        "Pick 5 leads from phone, LinkedIn, or local contacts and keep only people with a clear need.",
                        "Send one short message each: problem + your solution + one clear next step.",
                        "Follow up with non-responders once after 6-12 hours.",
                    ]
                return [
                    f"Choose one real customer/prospect and execute: {t}.",
                    f"Create a tiny draft in 10 minutes, then send/publish it instead of over-editing.",
                    f"After finishing, log one metric (reply, lead, call, or progress) from this task.",
                ]
            if category == "power":
                if "decision" in low:
                    return [
                        "List 2 options and choose one using a 60-second deadline.",
                        "Write one decision sentence with action and deadline.",
                        "Execute the first action immediately before opening any new tab/app.",
                    ]
                if "deep work" in low or "distraction" in low:
                    return [
                        "Set phone to airplane mode and close all non-task tabs.",
                        "Run one 25-minute focus block on only this task.",
                        "At the end, note one concrete output completed in that block.",
                    ]
                return [
                    f"Block distractions for 20 minutes and do only this: {t}.",
                    f"Write one decision sentence, then execute the first action immediately.",
                    f"End by noting one thing you controlled better during this task.",
                ]
            if category == "freedom":
                if "bottleneck" in low:
                    return [
                        "Pick one daily bottleneck (late start, scattered work, repeated interruptions).",
                        "Write the root cause in one line and choose one fix you can apply today.",
                        "Test the fix once now and note whether it saved time or stress.",
                    ]
                if "system" in low:
                    return [
                        "Create a 3-step repeat system: trigger -> action -> proof.",
                        "Apply it to one real task today and keep it simple.",
                        "Save the system as a checklist so you can reuse it tomorrow.",
                    ]
                return [
                    f"Pick one daily friction point and apply this task directly: {t}.",
                    f"Build a simple 3-step system and test it once today.",
                    f"Remove one blocker (app/tab/notification) so this change is easier tomorrow.",
                ]
            if category == "grooming":
                if "grooming standard" in low:
                    return [
                        "Define your daily standard in 3 checks: hair/face, clothes, and hygiene.",
                        "Prepare tonight what you need for tomorrow (outfit + essentials).",
                        "Do a quick mirror check before leaving and adjust one detail.",
                    ]
                return [
                    f"Prepare your setup first (clothes/tools/checklist), then complete: {t}.",
                    f"Do a quick before/after check and keep what improved your presentation most.",
                    f"Set a repeat time for tomorrow so this becomes automatic.",
                ]
            return [
                f"Start with a 10-minute version of this exact task: {t}.",
                "Break it into 3 mini steps and finish at least the first two today.",
                "Save one visible result (note, screenshot, message, or file) before you stop.",
            ]

        def practical_benefits(category: str, task: str) -> list[str]:
            if category == "money":
                return [
                    "You make one direct financial improvement today, not just a plan.",
                    "You gain clarity on what money action actually moves your position.",
                    "You build a repeatable money habit that compounds over time.",
                ]
            if category == "business":
                return [
                    "You create real business momentum through one shipped action.",
                    "You reduce procrastination by focusing on output, not perfection.",
                    "You improve your pipeline and decision quality with measurable progress.",
                ]
            if category == "power":
                return [
                    "You strengthen discipline by executing one hard thing on command.",
                    "You become faster at making and acting on clear decisions.",
                    "You build confidence from controlled, repeatable execution.",
                ]
            if category == "freedom":
                return [
                    "You remove one friction source that drains time and energy.",
                    "You create a system that gives you more control over your day.",
                    "You feel lighter because recurring problems are handled proactively.",
                ]
            if category == "grooming":
                return [
                    "You improve how you present yourself in real situations today.",
                    "You increase self-respect by maintaining a clear personal standard.",
                    "You make daily preparation easier and faster for tomorrow.",
                ]
            return [
                f"You complete a meaningful task today: {task.rstrip('.')}.",
                "You build confidence through clear execution.",
                "You strengthen your daily action consistency.",
            ]

        lines = [ln.strip() for ln in details_raw.splitlines() if ln.strip()]
        why_line = next((ln for ln in lines if ln.lower().startswith("why")), "")
        if why_line:
            why_line = re.sub(r"^why\s*[—:\-]\s*", "", why_line, flags=re.I).strip()
        intro = {
            "business": "This challenge helps you move one real opportunity forward today.",
            "money": "This challenge helps you improve your money position with one concrete action today.",
            "power": "This challenge helps you take control through one clear decision and execution block.",
            "freedom": "This challenge helps you remove friction and create more control over your day.",
            "grooming": "This challenge helps you raise your personal standard with visible daily actions.",
            "motivation": "This challenge helps you convert intention into action quickly and consistently.",
        }.get(cat, "This challenge helps you produce one clear result today.")
        title_explained = (
            f"Title meaning: {insight_line}. "
            if insight_line
            else ""
        )
        done_explained = (
            f"Success check: {done_line}. "
            if done_line
            else "Success check: finish the task and save one proof item. "
        )
        explanation = (
            f"{intro} "
            f"{title_explained}"
            f"Your exact task is: {task_line.rstrip('.')}. "
            f"{done_explained}"
            f"{why_line}"
        ).strip()

        approaches: list[str] = []
        for ln in lines:
            if ln.startswith("•") or re.match(r"^\d+\)", ln) or re.match(r"^\d+\.", ln):
                cleaned = re.sub(r"^[•\-\d\.\)\s]+", "", ln).strip()
                if cleaned:
                    approaches.append(cleaned)
            if len(approaches) >= 3:
                break
        # Prefer realistic task-specific examples over generic extracted bullets.
        approaches = practical_examples(cat, task_line)

        benefit_items: list[str] = []
        for p in re.split(r"[.\n]+", benefits_raw):
            s = p.strip(" -•\t")
            if s:
                benefit_items.append(s)
            if len(benefit_items) >= 3:
                break
        benefit_items = practical_benefits(cat, task_line)

        quick = "Start now: do the first small step in 5 minutes."
        if approaches:
            quick = f"Start now: {approaches[0][:140]}"
        out_detail = {
            "explanation": explanation,
            "approaches": approaches[:3],
            "benefits": benefit_items[:3],
            "quickStart": quick,
            "titleMeaning": insight_line or intro,
            "taskDescription": task_line,
            "doneCriteria": done_line or "Save one visible proof (message, note, checklist, screenshot, or file).",
        }

    if out_detail is None and bool(target.get("isCustom")):
        try:
            out = generate_challenge_deep_dive(
                user_id=user_id,
                date=str(date),
                mood=mood,
                personality=personality,
                challenge=target,
            )
            out_detail = {
                "explanation": out.explanation,
                "approaches": out.approaches[:3],
                "benefits": out.benefits[:3],
                "quickStart": out.quickStart,
                "titleMeaning": "",
                "taskDescription": task_line if "task_line" in locals() else str(target.get("title") or ""),
                "doneCriteria": "Save one visible proof (message, note, checklist, screenshot, or file).",
            }
            try:
                upsert_challenge_detail(
                    user_id=user_id,
                    date=str(date),
                    challenge_id=str(challenge_id),
                    details=out.explanation,
                    benefits="\n".join(out.benefits[:3]),
                )
            except Exception:
                # Persistence is best-effort; response should still succeed.
                pass
        except Exception:
            # Fall through to local fallback.
            out_detail = None

    if out_detail is None:
        # Fast local fallback for detail page responsiveness.
        title_raw = str(target.get("title") or "").strip()
        t_lines = [x.strip() for x in title_raw.splitlines() if x.strip()]
        insight_line = t_lines[0] if t_lines else ""
        task_line = t_lines[1] if len(t_lines) >= 2 else (t_lines[0] if t_lines else "")
        done_line = t_lines[2] if len(t_lines) >= 3 else ""
        task_line = re.sub(r"^(action|move|complete this challenge)\s*:\s*", "", task_line, flags=re.I).strip()
        if not task_line:
            task_line = f"complete one {str(target.get('category') or 'daily')} action"
        cat = str(target.get("category") or "")
        out_detail = {
            "explanation": (
                f"This challenge is about {cat}: {insight_line or 'one focused daily improvement'}. "
                f"Your action is: {task_line}. "
                f"Done means: {done_line or 'save one visible proof of completion'}."
            ),
            "approaches": [
                f"Do a 10-minute starter version first for: {task_line}.",
                "Run one focused block (15-25 minutes) and remove distractions during it.",
                "Save one proof item (message, checklist, note, or screenshot) before stopping.",
            ],
            "benefits": [
                f"You make visible progress in {cat} today.",
                "You improve consistency by finishing one concrete action.",
                "You build confidence through proof-based execution.",
            ],
            "quickStart": f"Start now: {task_line[:120]}",
            "titleMeaning": insight_line or f"One focused {cat} improvement for today.",
            "taskDescription": task_line,
            "doneCriteria": done_line or "Save one visible proof (message, note, checklist, screenshot, or file).",
        }
    return JsonResponse(
        {
            "ok": True,
            "challenge": {
                "id": target.get("id"),
                "title": target.get("title"),
                "category": target.get("category"),
                "difficulty": target.get("difficulty"),
                "time": target.get("time"),
                "points": target.get("points"),
            },
            "detail": out_detail,
        }
    )

@csrf_exempt
@require_POST
def chat(request: HttpRequest) -> JsonResponse:
    payload = _read_json(request)
    user_id = payload.get("userId")
    message = payload.get("message")
    history = payload.get("messages") or []
    date = payload.get("date") or _today_utc_date()
    personality = str(payload.get("personality") or "friendly")
    frontend_context = payload.get("frontendContext") or {}

    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)
    if not message or not isinstance(message, str):
        return JsonResponse({"ok": False, "error": "Missing message"}, status=400)

    stats_payload = as_promptable_stats(user_id)
    choice = choose_best_and_low_category_ai(stats_payload)

    recent_titles = get_recent_custom_task_titles(user_id, limit_per_category=2)
    today = day_challenges(user_id, date=str(date))

    try:
        chat_out = generate_chat_reply(
            user_id=user_id,
            date=str(date),
            personality=personality,
            message=message,
            history=history,
            stats=stats_payload,
            bestCategory=str(choice.bestCategory),
            lowCategory=str(choice.lowCategory),
            recent_custom_titles=recent_titles,
            today_challenges=today,
            frontend_context=frontend_context if isinstance(frontend_context, dict) else {},
        )
    except Exception as exc:
        return JsonResponse({"ok": False, "error": f"Chat failed: {exc}"}, status=500)

    return JsonResponse({"ok": True, "reply": chat_out.reply})

@csrf_exempt
@require_POST
def followup(request: HttpRequest) -> JsonResponse:
    payload = _read_json(request)
    user_id = payload.get("userId")
    date = payload.get("date") or _today_utc_date()
    category = payload.get("category") or ""
    count = payload.get("count") or 2

    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    stats_payload = as_promptable_stats(user_id)
    items = generate_followup_challenges(
        user_id=user_id, date=date, stats=stats_payload, focus_category=str(category), count=int(count)
    )

    print(
        f"[coach] followup generated user={user_id} date={date} "
        f"category={category} count={len(items)}"
    )
    for i, ch in enumerate(items):
        print(
            f"[coach]  - followup {i+1}/{len(items)}: {ch.category} | {ch.difficulty} | {ch.time} | {ch.points}pts | {ch.body_part} | {ch.title}"
        )

    # Make stable ids, store as pending.
    base_id = f"fu-{date}-{str(category)[:12]}"
    out = []
    for i, ch in enumerate(items):
        cid = f"{base_id}-{int(datetime.now(timezone.utc).timestamp())}-{i}"
        upsert_challenge_status(
            user_id=user_id,
            date=date,
            challenge_id=cid,
            category=ch.category,
            title=ch.title,
            difficulty=ch.difficulty,
            time_estimate=ch.time,
            points=ch.points,
            body_part=ch.body_part,
            is_custom=False,
            status="pending",
        )
        out.append(
            {
                "id": cid,
                "title": ch.title,
                "category": ch.category,
                "difficulty": ch.difficulty,
                "time": ch.time,
                "points": ch.points,
                "bodyPart": ch.body_part,
            }
        )

    return JsonResponse({"ok": True, "challenges": out})

@csrf_exempt
@require_POST
def daily_plan(request: HttpRequest) -> JsonResponse:
    payload = _read_json(request)
    user_id = payload.get("userId")
    date = payload.get("date") or _today_utc_date()
    mood = str(payload.get("mood") or "motivational")
    force = bool(payload.get("force") or False)
    replace = bool(payload.get("replace") or False)
    fast = bool(payload.get("fast") or False)
    regen_key = str(payload.get("regenKey") or "")
    if force and replace and not regen_key:
        regen_key = datetime.now(timezone.utc).isoformat()

    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    try:
        ensure_rag_chunks_if_empty(user_id)
    except Exception as exc:
        # Keep request alive; planner will return a concrete error if RAG is still missing.
        print(f"[coach] auto-ingest default doc failed for user={user_id}: {exc}")

    if force:
        # By default we block regeneration if user already completed tasks.
        # Set replace=true to explicitly reset today's plan.
        today_items = day_challenges(user_id, date=str(date))
        if (not replace) and any(i.get("status") == "completed" for i in today_items):
            return JsonResponse(
                {
                    "ok": False,
                    "error": "Cannot regenerate after completing tasks today (use replace=true to reset)",
                },
                status=400,
            )
        clear_day_plan(user_id, date=str(date))

    stats = as_promptable_stats(user_id)
    achieved = today_achievement(user_id, date=date)
    try:
        plan = generate_daily_plan(
            user_id=user_id,
            date=date,
            mood=mood,
            stats=stats,
            achieved=achieved,
            regen_key=regen_key,
            fast_mode=fast,
        )
    except Exception as exc:
        print(f"[coach] daily-plan generation failed: {exc}")
        return JsonResponse(
            {"ok": False, "error": f"Agent generation failed: {exc}"},
            status=500,
        )

    try:
        categories = [ch.category for ch in plan.challenges]
        print(
            f"[coach] generated daily-plan for user={user_id} date={date} "
            f"categories={categories}"
        )
        for ch in plan.challenges:
            print(
                f"[coach]  - {ch.category} | {ch.difficulty} | {ch.time} | {ch.points}pts | {ch.body_part} | {ch.title}"
            )
    except Exception:
        # Logging must never break the response.
        pass

    # Store today's challenges as "pending" so subsequent completion events are always valid.
    for i, ch in enumerate(plan.challenges):
        challenge_id = f"plan-{date}-{i}"
        upsert_challenge_status(
            user_id=user_id,
            date=date,
            challenge_id=challenge_id,
            category=ch.category,
            title=ch.title,
            difficulty=ch.difficulty,
            time_estimate=ch.time,
            points=ch.points,
            body_part=ch.body_part,
            is_custom=False,
            status="pending",
        )
        upsert_challenge_detail(
            user_id=user_id,
            date=date,
            challenge_id=challenge_id,
            details=ch.details,
            benefits=ch.benefits,
        )
    upsert_day_plan_meta(
        user_id=user_id,
        date=date,
        motivation=plan.motivation,
        summary=plan.summary,
        daily_quote=plan.dailyQuote,
    )

    # Frontend expects challenge id to be stable.
    return JsonResponse(
        {
            "ok": True,
            "date": date,
            "plan": {
                "challenges": [
                    {
                        "id": f"plan-{date}-{i}",
                        "title": ch.title,
                        "category": ch.category,
                        "difficulty": ch.difficulty,
                        "time": ch.time,
                        "points": ch.points,
                        "bodyPart": ch.body_part,
                        "details": ch.details,
                        "benefits": ch.benefits,
                    }
                    for i, ch in enumerate(plan.challenges)
                ],
                "motivation": plan.motivation,
                "summary": plan.summary,
                "dailyQuote": plan.dailyQuote,
            },
        }
    )


@csrf_exempt
@require_POST
def day_meta(request: HttpRequest) -> JsonResponse:
    payload = _read_json(request)
    user_id = payload.get("userId")
    date = payload.get("date") or _today_utc_date()
    mood = str(payload.get("mood") or "motivational")
    personality = str(payload.get("personality") or "friendly")

    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    stats = as_promptable_stats(user_id)
    achieved = today_achievement(user_id, date=str(date))
    today = day_challenges(user_id, date=str(date))
    try:
        meta = generate_day_meta(
            user_id=user_id,
            date=str(date),
            mood=mood,
            personality=personality,
            stats=stats,
            achieved=achieved,
            today_challenges=today,
        )
    except Exception as exc:
        return JsonResponse({"ok": False, "error": f"Meta generation failed: {exc}"}, status=500)

    upsert_day_plan_meta(
        user_id=user_id,
        date=str(date),
        motivation=meta.motivation,
        summary=meta.summary,
        daily_quote=meta.dailyQuote,
    )
    clean_quote = ensure_logical_daily_quote(
        quote=meta.dailyQuote,
        user_id=user_id,
        date=str(date),
        mood=mood,
    )
    if clean_quote != meta.dailyQuote:
        upsert_day_plan_meta(
            user_id=user_id,
            date=str(date),
            motivation=meta.motivation,
            summary=meta.summary,
            daily_quote=clean_quote,
        )
    out_quote = clean_quote
    return JsonResponse(
        {
            "ok": True,
            "meta": {
                "motivation": meta.motivation,
                "summary": meta.summary,
                "dailyQuote": out_quote,
            },
        }
    )


@csrf_exempt
@require_POST
def challenge_status(request: HttpRequest) -> JsonResponse:
    payload = _read_json(request)
    user_id = payload.get("userId")
    date = payload.get("date") or _today_utc_date()
    challenge = payload.get("challenge") or {}
    status = payload.get("status")
    completion_note = str(payload.get("completionNote") or "").strip()

    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    if status not in {"completed", "missed", "pending"}:
        return JsonResponse(
            {"ok": False, "error": "status must be completed, missed, or pending"},
            status=400,
        )
    if status == "completed" and not completion_note:
        return JsonResponse(
            {"ok": False, "error": "completionNote is required to complete a challenge"},
            status=400,
        )

    try:
        upsert_challenge_status(
            user_id=user_id,
            date=date,
            challenge_id=str(challenge.get("id", "")),
            category=str(challenge.get("category", "")),
            title=str(challenge.get("title", "")),
            difficulty=str(challenge.get("difficulty", "Medium")),
            time_estimate=str(challenge.get("timeEstimate", challenge.get("time", "20 min"))),
            points=int(challenge.get("points", 0)),
            body_part=str(challenge.get("bodyPart") or "") or None,
            completion_note=completion_note if status == "completed" else None,
            is_custom=bool(challenge.get("isCustom", False)),
            status=status,
        )
    except Exception as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=500)

    return JsonResponse({"ok": True})


@csrf_exempt
@require_POST
def custom_challenge(request: HttpRequest) -> JsonResponse:
    payload = _read_json(request)
    user_id = payload.get("userId")
    date = payload.get("date") or _today_utc_date()
    challenge = payload.get("challenge") or {}

    if not user_id or not isinstance(user_id, str):
        return JsonResponse({"ok": False, "error": "Missing userId"}, status=400)

    try:
        difficulty = str(challenge.get("difficulty", "Medium"))
        points_raw = int(challenge.get("points", 0) or 0)
        points = points_raw if 1 <= points_raw <= 9 else _auto_points_from_difficulty(difficulty)
        upsert_custom_task(
            user_id=user_id,
            date=date,
            challenge_id=str(challenge.get("id", "")),
            title=str(challenge.get("title", "")),
            category=str(challenge.get("category", "")),
            difficulty=difficulty,
            time_estimate=str(challenge.get("timeEstimate", challenge.get("time", "20 min"))),
            points=points,
            body_part=str(challenge.get("bodyPart") or "") or None,
        )
        # Also store as pending challenge so status updates can apply cleanly.
        upsert_challenge_status(
            user_id=user_id,
            date=date,
            challenge_id=str(challenge.get("id", "")),
            category=str(challenge.get("category", "")),
            title=str(challenge.get("title", "")),
            difficulty=difficulty,
            time_estimate=str(challenge.get("timeEstimate", challenge.get("time", "20 min"))),
            points=points,
            body_part=str(challenge.get("bodyPart") or "") or None,
            is_custom=True,
            status="pending",
        )
    except Exception as exc:
        return JsonResponse({"ok": False, "error": str(exc)}, status=500)

    return JsonResponse({"ok": True})

