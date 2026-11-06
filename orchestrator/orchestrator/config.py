"""Orchestrator config — loaded via orchestrator.settings (pydantic-settings, backend_sql–compatible env names)."""
import os

from orchestrator.settings import (
    effective_jwt_algorithm,
    effective_jwt_secret,
    get_api_settings,
    get_db_settings,
)

_db = get_db_settings()
_api = get_api_settings()

# Agents service (from agents/).
QUERYLAB_AGENTS_API_URL = _api.QUERYLAB_AGENTS_API_URL.strip().rstrip("/")

# JWT (SECRET_KEY + ALGORITHM same env names as querylab_sql SecuritySettings)
JWT_SECRET_KEY = effective_jwt_secret()
JWT_ALGORITHM = effective_jwt_algorithm()

# MySQL — same names as querylab_sql AppBackendDBSettings
BACKEND_DB_HOST = (_db.BACKEND_DB_HOST or "").strip()
BACKEND_DB_USER = (_db.BACKEND_DB_USER or "").strip()
BACKEND_DB_PASSWORD = _db.BACKEND_DB_PASSWORD or ""
BACKEND_DB_DATABASE = (_db.BACKEND_DB_DATABASE or "").strip()
BACKEND_DB_PORT = int(_db.BACKEND_DB_PORT)


def chat_persistence_enabled() -> bool:
    return bool(
        BACKEND_DB_HOST
        and BACKEND_DB_USER
        and BACKEND_DB_DATABASE
        and os.getenv("ORCHESTRATOR_DISABLE_CHAT_PERSISTENCE", "").strip().lower()
        not in ("1", "true", "yes")
    )


def auth_login_enabled() -> bool:
    """Login route needs DB + JWT secret."""
    return bool(JWT_SECRET_KEY and BACKEND_DB_HOST and BACKEND_DB_USER and BACKEND_DB_DATABASE)
