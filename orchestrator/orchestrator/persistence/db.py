"""Async SQLAlchemy engine for MySQL (aiomysql)."""
import logging
import urllib.parse
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from orchestrator.config import (
    BACKEND_DB_DATABASE,
    BACKEND_DB_HOST,
    BACKEND_DB_PASSWORD,
    BACKEND_DB_PORT,
    BACKEND_DB_USER,
    chat_persistence_enabled,
)

logger = logging.getLogger(__name__)

_engine = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def _async_database_url() -> str:
    user = urllib.parse.quote_plus(BACKEND_DB_USER)
    password = urllib.parse.quote_plus(BACKEND_DB_PASSWORD)
    return (
        f"mysql+aiomysql://{user}:{password}@"
        f"{BACKEND_DB_HOST}:{BACKEND_DB_PORT}/{BACKEND_DB_DATABASE}"
    )


def get_engine():
    global _engine, _session_factory
    if not chat_persistence_enabled():
        return None
    if _engine is None:
        _engine = create_async_engine(
            _async_database_url(),
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            pool_recycle=3600,
        )
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)
        logger.info("Orchestrator async DB engine created for %s@%s/%s", BACKEND_DB_USER, BACKEND_DB_HOST, BACKEND_DB_DATABASE)
    return _engine


@asynccontextmanager
async def async_session_scope() -> AsyncGenerator[AsyncSession, None]:
    get_engine()
    if _session_factory is None:
        raise RuntimeError("Database not configured")
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
