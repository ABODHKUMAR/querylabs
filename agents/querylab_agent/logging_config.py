"""
Shared logging configuration for the agents service.

Set QUERYLAB_AGENTS_LOG_LEVEL=DEBUG for verbose output.
Set QUERYLAB_AGENTS_LOG_FORMAT=json for one JSON object per line (structured observability).
"""
from querylab_agent.structured_logging import configure_structured_logging


def configure_logging(stream=None, force: bool = True) -> None:
    """Configure logging for querylab_agent. Call once at startup (api.py or __main__.py)."""
    # stream/force kept for API compatibility; structured logging uses stderr
    configure_structured_logging()
