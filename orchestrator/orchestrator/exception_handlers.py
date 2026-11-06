"""Centralized HTTP and unhandled exception logging with trace_id."""
import logging
from typing import Union

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from orchestrator.structured_logging import log_extra

logger = logging.getLogger("orchestrator.errors")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exc_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        trace_id = getattr(request.state, "request_id", "") or ""
        logger.warning(
            "http_exception",
            extra=log_extra(
                event="error",
                route=request.url.path,
                method=request.method,
                error_type="HTTPException",
                status_code=exc.status_code,
                trace_id=trace_id,
            ),
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "trace_id": trace_id or None},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        trace_id = getattr(request.state, "request_id", "") or ""
        logger.warning(
            "validation_error",
            extra=log_extra(
                event="error",
                route=request.url.path,
                method=request.method,
                error_type="RequestValidationError",
                trace_id=trace_id,
            ),
        )
        return JSONResponse(
            status_code=422,
            content={"detail": exc.errors(), "trace_id": trace_id or None},
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        trace_id = getattr(request.state, "request_id", "") or ""
        logger.exception(
            "unhandled_exception",
            extra=log_extra(
                event="error",
                route=request.url.path,
                method=request.method,
                error_type=type(exc).__name__,
                trace_id=trace_id,
            ),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "trace_id": trace_id or None},
        )
