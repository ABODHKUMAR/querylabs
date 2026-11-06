"""SlowAPI limiter for auth (keyed by client IP)."""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_login_limit = os.getenv("ORCHESTRATOR_RATE_LIMIT_LOGIN", "20/minute").strip() or "20/minute"
_global = os.getenv("ORCHESTRATOR_RATE_LIMIT_GLOBAL", "").strip()

_kw = {"key_func": get_remote_address}
if _global:
    _kw["default_limits"] = [_global]

limiter = Limiter(**_kw)


def login_rate_limit_string() -> str:
    return _login_limit
