"""Access logging + trace context from X-Request-ID."""
import logging
import time
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from querylab_agent.structured_logging import log_extra, reset_request_context, set_trace_context

logger = logging.getLogger("querylab_agent.access")


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        reset_request_context()
        rid = request.headers.get("X-Request-ID") or ""
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
