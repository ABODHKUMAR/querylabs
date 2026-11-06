"""Security audit logging (no passwords; pseudonymous IP)."""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Optional

from orchestrator.structured_logging import log_extra

logger = logging.getLogger("orchestrator.audit")


def _salt() -> str:
    return (os.environ.get("ORCHESTRATOR_AUDIT_SALT") or os.getenv("SECRET_KEY") or "querylab-audit")[:32]


def hash_audit_value(value: Optional[str]) -> str:
    if not value:
        return ""
    h = hashlib.sha256(f"{_salt()}:{value}".encode("utf-8")).hexdigest()
    return h[:16]


def truncate_ip(client_host: Optional[str]) -> str:
    """IPv4: last octet zeroed; IPv6: truncated prefix only."""
    if not client_host:
        return ""
    if "." in client_host:
        parts = client_host.split(".")
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}.0"
    if ":" in client_host:
        return client_host.split(":")[0] + ":…"
    return client_host[:8] + "…"


def log_login_attempt(
    *,
    outcome: str,
    user_id_attempt: str,
    request_path: str,
    client_host: Optional[str],
) -> None:
    logger.info(
        "audit_login",
        extra=log_extra(
            event="audit_login",
            outcome=outcome,
            user_id_hash=hash_audit_value(user_id_attempt.strip().lower()),
            client_ip_hash=hash_audit_value(client_host or ""),
            client_ip_truncated=truncate_ip(client_host),
            route=request_path,
        ),
    )


def log_rate_limited(*, route: str, client_host: Optional[str]) -> None:
    logger.warning(
        "audit_rate_limited",
        extra=log_extra(
            event="rate_limited",
            outcome="throttled",
            client_ip_hash=hash_audit_value(client_host or ""),
            client_ip_truncated=truncate_ip(client_host),
            route=route,
        ),
    )
