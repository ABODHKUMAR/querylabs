"""
Orchestrator settings — same env variable names and loading pattern as querylab_sql `settings.py`
(package `.env` then cwd `.env` override). Standalone service; no querylab_sql runtime required.

Expected `.env` location: repository root next to `pyproject.toml` (e.g. `orchestrator/.env`).
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# --- Dotenv (mirror querylab_sql/settings.py intent) ---
_PACKAGE_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _PACKAGE_DIR.parent  # folder with pyproject.toml
_ENV_PROJECT = _PROJECT_ROOT / ".env"
_ENV_LOCAL = _PROJECT_ROOT / ".env.local"


def _load_env_files() -> None:
    if os.environ.get("DOCKER_RUNNING", "").strip().lower() in ("1", "true", "yes", "y"):
        return
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    # 1) Repo-root .env (canonical)
    load_dotenv(_ENV_PROJECT)
    if _ENV_LOCAL.is_file():
        load_dotenv(_ENV_LOCAL, override=True)
    # 2) Cwd .env overrides (e.g. run from another directory)
    load_dotenv(Path.cwd() / ".env", override=True)


_load_env_files()

BASE_DIR: str = str(_PACKAGE_DIR)
ENV_PATH: str = str(_ENV_PROJECT)
logger.debug("Orchestrator ENV_PATH (project .env): %s", ENV_PATH)


class AppBackendDBSettings(BaseSettings):
    """
    Same variable names as querylab_sql `AppBackendDBSettings` so one `.env` can be reused
    when migrating off the old API.
    """

    BACKEND_DB_HOST: str = ""
    BACKEND_DB_USER: str = ""
    BACKEND_DB_PASSWORD: str = ""
    BACKEND_DB_DATABASE: str = ""
    BACKEND_DB_PORT: int = Field(default=3306, description="MySQL port (querylab async uses 3306)")

    model_config = SettingsConfigDict(
        env_file=None,
        extra="ignore",
        case_sensitive=False,
    )


class SecuritySettings(BaseSettings):
    """Same fields as querylab_sql `SecuritySettings` (login / JWT)."""

    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=1440,
        description="Default 24h; querylab_sql security.create_access_token used hours=24",
    )

    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)


class OrchestratorAPISettings(BaseSettings):
    """Process / agents URL (querylab_sql had QUERYLAB_API_*; we use orchestrator-specific names)."""

    QUERYLAB_AGENTS_API_URL: str = "http://localhost:8000"
    QUERYLAB_AGENTS_ROOT: str = Field(
        default="",
        description="Absolute path to `.agents` root. Empty = repo `agents/.agents` (sibling of orchestrator folder).",
    )
    ORCHESTRATOR_HOST: str = "0.0.0.0"
    ORCHESTRATOR_PORT: int = 8082

    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)


@lru_cache
def get_db_settings() -> AppBackendDBSettings:
    return AppBackendDBSettings()


@lru_cache
def get_security_settings() -> SecuritySettings:
    return SecuritySettings()


@lru_cache
def get_api_settings() -> OrchestratorAPISettings:
    return OrchestratorAPISettings()


def effective_jwt_secret() -> str:
    """SECRET_KEY from settings, or JWT_SECRET_KEY env if set (orchestrator-only alias)."""
    s = get_security_settings()
    return (s.SECRET_KEY or os.getenv("JWT_SECRET_KEY") or "").strip()


def effective_jwt_algorithm() -> str:
    sec = get_security_settings()
    return (os.getenv("JWT_ALGORITHM") or sec.ALGORITHM or "HS256").strip()
