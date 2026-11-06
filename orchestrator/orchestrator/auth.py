"""JWT verification (compatible with querylab_sql tokens) and access token creation."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from orchestrator.config import JWT_ALGORITHM, JWT_SECRET_KEY
from orchestrator.settings import get_security_settings

security = HTTPBearer(auto_error=True)


def _require_secret() -> str:
    if not JWT_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="Authentication not configured: set SECRET_KEY (same as querylab_sql).",
        )
    return JWT_SECRET_KEY


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
    except Exception:
        return False


def create_access_token(user_id: str, role: str) -> str:
    """JWT claims aligned with querylab_sql `security.create_access_token` (sub, role, exp)."""
    secret = _require_secret()
    sec = get_security_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=sec.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "role": role,
        "exp": exp,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


async def verify_jwt_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Validate Bearer JWT; returns {sub, role}."""
    secret = _require_secret()
    token = credentials.credentials
    try:
        payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
        return {"sub": payload.get("sub"), "role": payload.get("role")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def ensure_user_matches_token(token_user: dict, body_user_id: str) -> None:
    """Reject if client user_id does not match JWT subject."""
    sub = token_user.get("sub")
    if not sub or str(body_user_id).strip() != str(sub).strip():
        raise HTTPException(
            status_code=403,
            detail="user_id in body must match the authenticated user (JWT sub).",
        )
