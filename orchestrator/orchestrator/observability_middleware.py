"""Access logging + context binding (trace from request.state)."""
import logging
import time
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from orchestrator.structured_logging import reset_request_context, set_trace_context, log_extra

logger = logging.getLogger("orchestrator.access")


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """
    Resets log context per request, binds trace_id from request.state (set by CorrelationIdMiddleware),
    logs one structured access line after the response is created.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        reset_request_context()
        rid = getattr(request.state, "request_id", None) or ""
        set_trace_context(rid)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "request_completed",
            extra=log_extra(
                event="access",
                route=request.url.path,
                method=request.method,
                duration_ms=duration_ms,
                status_code=response.status_code,
            ),
        )
        return response
