"""Optional background synthetic checks (agents /ready or POST /ask)."""
import asyncio
import logging
import os

import httpx

from orchestrator.config import QUERYLAB_AGENTS_API_URL
from orchestrator.structured_logging import log_extra

logger = logging.getLogger("orchestrator.canary")


async def run_canary_loop() -> None:
    interval = int(os.getenv("ORCHESTRATOR_CANARY_INTERVAL_SEC", "0") or "0")
    if interval <= 0:
        return

    mode = (os.getenv("ORCHESTRATOR_CANARY_MODE") or "ready").strip().lower()
    ask_url = f"{QUERYLAB_AGENTS_API_URL}/ask"
    ready_url = f"{QUERYLAB_AGENTS_API_URL}/ready"
    health_url = f"{QUERYLAB_AGENTS_API_URL}/health"
    question = (os.getenv("ORCHESTRATOR_CANARY_QUESTION") or "health check ping").strip()
    agent_name = (os.getenv("ORCHESTRATOR_CANARY_AGENT_NAME") or "").strip() or None

    logger.info(
        "canary_started",
        extra=log_extra(
            event="canary",
            outcome="started",
            route="background",
            interval_sec=interval,
            mode=mode,
        ),
    )

    while True:
        await asyncio.sleep(interval)
        probe_route = ready_url
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                if mode == "ask":
                    probe_route = ask_url
                    payload: dict = {"question": question}
                    if agent_name:
                        payload["agent_name"] = agent_name
                    r = await client.post(ask_url, json=payload)
                    ok = r.status_code == 200
                    detail = f"status={r.status_code}"
                else:
                    probe_route = ready_url if mode == "ready" else health_url
                    r = await client.get(probe_route)
                    ok = r.status_code == 200
                    detail = f"status={r.status_code}"

            if ok:
                logger.info(
                    "canary_ok",
                    extra=log_extra(event="canary", outcome="success", route=probe_route, detail=detail),
                )
            else:
                logger.error(
                    "canary_failed",
                    extra=log_extra(
                        event="canary",
                        outcome="failure",
                        route=probe_route,
                        error_type="probe_failed",
                        detail=detail,
                    ),
                )
        except Exception as e:
            logger.exception(
                "canary_error",
                extra=log_extra(event="canary", outcome="error", error_type=type(e).__name__),
            )
