from django.apps import AppConfig


class CoachConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "coach"

    def ready(self) -> None:
        # Ensure our lightweight SQLite tables exist on startup.
        from .store import ensure_tables  # noqa: WPS433

        ensure_tables()

