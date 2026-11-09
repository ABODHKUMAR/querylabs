"""Login / logout routes (JWT stateless; logout is client-side discard)."""
import logging
from typing import Any, Optional

import pymysql
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from orchestrator.audit import log_login_attempt
from orchestrator.auth import create_access_token, verify_password
from orchestrator.config import (
    BACKEND_DB_DATABASE,
    BACKEND_DB_HOST,
    BACKEND_DB_PASSWORD,
    BACKEND_DB_PORT,
    BACKEND_DB_USER,
    JWT_SECRET_KEY,
    auth_login_enabled,
)
from orchestrator.guest import (
    GUEST_MAX_SESSIONS,
    GUEST_SESSION_MINUTES,
    GuestLimitExceeded,
    resolve_origin,
    start_guest_session,
)
from orchestrator.rate_limit import limiter, login_rate_limit_string

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


class UserLogin(BaseModel):
    user_id: str = Field(..., description="Email / user id (same as querylab_sql login)")
    password: str


def _db_connect() -> pymysql.connections.Connection:
    return pymysql.connect(
        host=BACKEND_DB_HOST,
        user=BACKEND_DB_USER,
        password=BACKEND_DB_PASSWORD,
        database=BACKEND_DB_DATABASE,
        port=BACKEND_DB_PORT,
        cursorclass=pymysql.cursors.DictCursor,
    )


@router.post("/login")
@limiter.limit(login_rate_limit_string())
def login_user(request: Request, user: UserLogin) -> dict[str, Any]:
    if not auth_login_enabled():
        raise HTTPException(
            status_code=503,
            detail="Login not configured: set SECRET_KEY and BACKEND_DB_* for MySQL.",
        )
    client_host = request.client.host if request.client else None
    conn: Optional[pymysql.connections.Connection] = None
    try:
        conn = _db_connect()
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM user_master WHERE user_id = %s", (str(user.user_id),))
            row = cursor.fetchone()
            if not row or not verify_password(user.password, row["password"]):
                log_login_attempt(
                    outcome="failure",
                    user_id_attempt=str(user.user_id),
                    request_path=str(request.url.path),
                    client_host=client_host,
                )
                raise HTTPException(status_code=401, detail="Invalid email or password")

            # JWT sub = login body user_id (legacy querylab API parity). DB role column is "roll".
            user_role = row["roll"]
            token = create_access_token(str(user.user_id), user_role)

            cursor.execute("INSERT INTO user_login_history (user_id) VALUES (%s)", (str(row["user_id"]),))
            conn.commit()

            cursor.execute(
                """
                DELETE FROM user_login_history
                WHERE user_id = %s AND id NOT IN (
                    SELECT id FROM (
                        SELECT id FROM user_login_history
                        WHERE user_id = %s
                        ORDER BY login_time DESC
                        LIMIT 7
                    ) AS t
                )
                """,
                (str(row["user_id"]), str(row["user_id"])),
            )
            conn.commit()

        log_login_attempt(
            outcome="success",
            user_id_attempt=str(row["user_id"]),
            request_path=str(request.url.path),
            client_host=client_host,
        )
        return {
            "token": token,
            "user": {
                "user_id": row["user_id"],
                "display_name": row.get("display_name"),
                "role": user_role,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Login error: %s", e)
        log_login_attempt(
            outcome="error",
            user_id_attempt=str(user.user_id),
            request_path=str(request.url.path),
            client_host=client_host,
        )
        raise HTTPException(status_code=500, detail="An error occurred during login")
    finally:
        if conn is not None:
            conn.close()


def _create_guest_session(request: Request) -> dict[str, Any]:
    """Shared implementation for the versioned and legacy guest routes."""
    if not JWT_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="Guest login not configured: set SECRET_KEY.",
        )
    client_host = request.client.host if request.client else None
    origin = resolve_origin(request)
    try:
        session = start_guest_session(origin)
    except GuestLimitExceeded:
        log_login_attempt(
            outcome="guest_denied",
            user_id_attempt=origin,
            request_path=str(request.url.path),
            client_host=client_host,
        )
        raise HTTPException(
            status_code=429,
            detail=(
                f"Guest session limit reached for this origin "
                f"({GUEST_MAX_SESSIONS} sessions of {GUEST_SESSION_MINUTES} minutes)."
            ),
        )

    token = create_access_token(
        session.user_id,
        "guest",
        expires_minutes=GUEST_SESSION_MINUTES,
        extra_claims={"is_guest": True, "origin": session.origin},
    )
    log_login_attempt(
        outcome="guest_success",
        user_id_attempt=session.user_id,
        request_path=str(request.url.path),
        client_host=client_host,
    )
    return {
        "token": token,
        "user": {
            "user_id": session.user_id,
            "display_name": "Guest",
            "role": "guest",
            "is_guest": True,
            "origin": session.origin,
        },
        "expires_in_seconds": session.expires_in_seconds,
        "expires_at": session.expires_at.isoformat(),
        "guest_sessions_used": session.sessions_used,
        "guest_sessions_remaining": session.sessions_remaining,
        "guest_session_limit": GUEST_MAX_SESSIONS,
    }


@router.post("/guest")
@limiter.limit(login_rate_limit_string())
def guest_login(request: Request) -> dict[str, Any]:
    """Start a credential-less guest session (10 minutes, 3 per origin)."""
    return _create_guest_session(request)


@router.post("/logout")
def logout_user() -> dict[str, str]:
    """Stateless JWT: client discards the token."""
    return {"message": "Logged out. Discard the token on the client."}


# ---------------------------------------------------------------------------
# Legacy paths (querylab_sql: app.include_router(auth.router, prefix="/api") → POST /api/login)
# ---------------------------------------------------------------------------
legacy_auth_router = APIRouter(tags=["auth-legacy"])


@legacy_auth_router.post("/login")
@limiter.limit(login_rate_limit_string())
def legacy_api_login(request: Request, user: UserLogin) -> dict[str, Any]:
    """Same as POST /api/v1/auth/login — for clients still calling /api/login."""
    return login_user(request, user)


@legacy_auth_router.post("/guest")
@limiter.limit(login_rate_limit_string())
def legacy_api_guest(request: Request) -> dict[str, Any]:
    """Same as POST /api/v1/auth/guest — for the SPA calling /api/guest."""
    return _create_guest_session(request)


@legacy_auth_router.post("/logout")
def legacy_api_logout() -> dict[str, str]:
    """Same as POST /api/v1/auth/logout."""
    return logout_user()
