"""
Query Labs Orchestrator: thin layer over the agents API.

- GET /data_sources  → agent card names from agents service
- POST /query/stream → streaming query using agents as tools (same SSE contract as querylab_sql v3)

Set QUERYLAB_AGENTS_API_URL to the agents service base URL (default http://localhost:8000).
"""
__version__ = "0.1.0"
