"""Correlation ID middleware (aligned with querylab_sql CorrelationIdMiddleware)."""
import time
import uuid
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Reads or generates X-Request-ID, stores on request.state.request_id,
    and echoes the header on the response for tracing.
    """

    HEADER_NAME = "X-Request-ID"

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get(self.HEADER_NAME) or str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        response.headers[self.HEADER_NAME] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
        return response
