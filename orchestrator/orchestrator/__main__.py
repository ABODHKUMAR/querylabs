"""Run orchestrator with: poetry run python -m orchestrator"""
import os

import orchestrator.settings  # noqa: F401 — loads project + cwd .env
import uvicorn

from orchestrator.settings import get_api_settings

if __name__ == "__main__":
    api = get_api_settings()
    host = os.environ.get("ORCHESTRATOR_HOST", api.ORCHESTRATOR_HOST)
    port = int(os.environ.get("ORCHESTRATOR_PORT", str(api.ORCHESTRATOR_PORT)))
    uvicorn.run(
        "orchestrator.app:app",
        host=host,
        port=port,
        reload=os.environ.get("ORCHESTRATOR_RELOAD", "").lower() in ("1", "true", "yes"),
    )
