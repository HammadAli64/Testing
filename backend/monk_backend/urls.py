from django.urls import path

from coach import views


urlpatterns = [
    path("api/coach/health", views.health),
    path("api/coach/rag/upload", views.rag_upload),
    path("api/coach/rag/status", views.rag_status),
    path("api/coach/rag/ingest-local", views.rag_ingest_local),
    path("api/coach/read-folder/status", views.read_folder_status),
    path("api/coach/read-folder/ingest", views.read_folder_ingest),
    path("api/coach/daily-plan", views.daily_plan),
    path("api/coach/day-meta", views.day_meta),
    path("api/coach/stats", views.stats),
    path("api/coach/progress", views.progress),
    path("api/coach/history", views.history),
    path("api/coach/day-state", views.day_state),
    path("api/coach/challenge-detail", views.challenge_detail),
    path("api/coach/followup", views.followup),
    path("api/coach/challenge-status", views.challenge_status),
    path("api/coach/custom-challenge", views.custom_challenge),
    path("api/coach/chat", views.chat),
    path("api/coach/streak/restore-invite", views.streak_restore_invite),
    path("api/coach/streak/restore-accept", views.streak_restore_accept),
]

