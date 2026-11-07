"""
Settings APIs for Query Labs UI (connection / LLM / token usage).

These replace the old querylab_sql settings endpoints so the Settings page works
against the local Docker stack (MySQL MCPs + OpenAI).
"""
from __future__ import annotations

from copy import deepcopy
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["settings"])

# In-memory connection catalog (seeded for local Query Labs). Toggle updates this store.
_CONNECTIONS: list[dict[str, Any]] = [
    {
        "id": 1,
        "DB_TYPE": "MySQL",
        "updated_at": "2025-03-06",
        "is_active": 1,
        "metadata_config": {
            "id": 1,
            "sementic_name": "Finance Metrics",
            "is_active": True,
            "provider": "mysql_mcp",
        },
        "config": {
            "HOST": "mysql",
            "PORT": 3306,
            "DATABASE": "financial_metrics",
            "USER": "querylab",
        },
    },
    {
        "id": 2,
        "DB_TYPE": "MySQL",
        "updated_at": "2025-03-06",
        "is_active": 1,
        "metadata_config": {
            "id": 2,
            "sementic_name": "QA Observability",
            "is_active": True,
            "provider": "beat_mcp",
        },
        "config": {
            "HOST": "mysql",
            "PORT": 3306,
            "DATABASE": "beat_results_dev",
            "USER": "querylab",
        },
    },
    {
        "id": 3,
        "DB_TYPE": "MySQL",
        "updated_at": "2025-03-06",
        "is_active": 1,
        "metadata_config": {
            "id": 3,
            "sementic_name": "Portfolio Lab",
            "is_active": True,
            "provider": "meridian_mcp",
        },
        "config": {
            "HOST": "mysql",
            "PORT": 3306,
            "DATABASE": "meridian_ventures",
            "USER": "querylab",
        },
    },
    {
        "id": 4,
        "DB_TYPE": "MySQL",
        "updated_at": "2025-03-06",
        "is_active": 1,
        "metadata_config": {
            "id": 4,
            "sementic_name": "Growth Analytics",
            "is_active": True,
            "provider": "novadash_mcp",
        },
        "config": {
            "HOST": "mysql",
            "PORT": 3306,
            "DATABASE": "novadash",
            "USER": "querylab",
        },
    },
    {
        "id": 5,
        "DB_TYPE": "MySQL",
        "updated_at": "2025-03-06",
        "is_active": 1,
        "metadata_config": {
            "id": 5,
            "sementic_name": "Retail Ops",
            "is_active": True,
            "provider": "avani_mcp",
        },
        "config": {
            "HOST": "mysql",
            "PORT": 3306,
            "DATABASE": "avani",
            "USER": "querylab",
        },
    },
    {
        "id": 6,
        "DB_TYPE": "MySQL",
        "updated_at": "2025-03-06",
        "is_active": 1,
        "metadata_config": {
            "id": 6,
            "sementic_name": "Hospitality Lab",
            "is_active": True,
            "provider": "mvw_mcp",
        },
        "config": {
            "HOST": "mysql",
            "PORT": 3306,
            "DATABASE": "mvw",
            "USER": "querylab",
        },
    },
    {
        "id": 7,
        "DB_TYPE": "MySQL",
        "updated_at": "2025-03-06",
        "is_active": 1,
        "metadata_config": {
            "id": 7,
            "sementic_name": "Markets Desk",
            "is_active": True,
            "provider": "pe_trading_mcp",
        },
        "config": {
            "HOST": "mysql",
            "PORT": 3306,
            "DATABASE": "pe_trading_db",
            "USER": "querylab",
        },
    },
    {
        "id": 8,
        "DB_TYPE": "Weaviate",
        "updated_at": "2025-03-06",
        "is_active": 1,
        "metadata_config": {
            "id": 8,
            "sementic_name": "Weaviate Vector Store",
            "is_active": True,
            "provider": "weaviate_mcp",
        },
        "config": {
            "HOST": "weaviate",
            "PORT": 8080,
            "DATABASE": "querylab collections",
            "USER": "querylab_admin",
        },
    },
    {
        "id": 9,
        "DB_TYPE": "postgres",
        "updated_at": "2026-11-07",
        "is_active": 1,
        "metadata_config": {
            "id": 9,
            "sementic_name": "Kestiq",
            "is_active": True,
            "provider": "kestiq_mcp",
        },
        "config": {
            "HOST": "ep-soft-silence-az1c8c2c-pooler.c-3.ap-southeast-1.aws.neon.tech",
            "PORT": 5432,
            "DATABASE": "neondb",
            "USER": "neondb_owner",
        },
    },
]

_MODELS: list[dict[str, Any]] = [
    {
        "id": 1,
        "model_type": "Chat",
        "model": "gpt-4o-mini",
        "provider": "OpenAI",
        "is_active": 1,
        "config": {"model_name": "gpt-4o-mini", "provider": "OpenAI"},
    },
    {
        "id": 2,
        "model_type": "Embeddings",
        "model": "text-embedding-3-small",
        "provider": "OpenAI",
        "is_active": 1,
        "config": {"model_name": "text-embedding-3-small", "provider": "OpenAI"},
    },
]


def _token_usage_rows() -> list[dict[str, Any]]:
    today = date.today()
    rows = []
    # Sample last 14 days so Token Usage tab has content
    base = [
        (12400, 8200, 0.042),
        (9800, 6100, 0.033),
        (15100, 9400, 0.051),
        (8700, 5200, 0.028),
        (11200, 7300, 0.039),
        (13400, 8800, 0.046),
        (7600, 4100, 0.024),
    ]
    for i in range(14):
        p, c, cost = base[i % len(base)]
        day = today - timedelta(days=13 - i)
        rows.append(
            {
                "DATE": day.isoformat(),
                "PROMPT_TOKENS": p + i * 37,
                "COMPLETION_TOKENS": c + i * 21,
                "TOTAL_TOKENS": p + c + i * 58,
                "TOTAL_COST": round(cost + i * 0.0015, 4),
            }
        )
    return rows


class ToggleBody(BaseModel):
    conn_id: int = Field(..., description="Connection metadata id")
    is_active: bool


class CreateConnectionBody(BaseModel):
    DB_TYPE: str = "MySQL"
    metadata_config: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)


@router.get("/settings/connection/all")
def list_connections() -> dict[str, Any]:
    return {"connections": deepcopy(_CONNECTIONS)}


@router.get("/settings/llm/all")
def list_models() -> dict[str, Any]:
    return {"models": deepcopy(_MODELS)}


@router.get("/settings/daily_tokens")
def daily_tokens() -> dict[str, Any]:
    return {"token_usage": _token_usage_rows()}


@router.post("/settings/connection/toggle")
def toggle_connection(body: ToggleBody) -> dict[str, Any]:
    for conn in _CONNECTIONS:
        meta = conn.get("metadata_config") or {}
        if int(meta.get("id", -1)) == int(body.conn_id):
            meta["is_active"] = bool(body.is_active)
            conn["metadata_config"] = meta
            conn["is_active"] = 1 if body.is_active else 0
            return {"ok": True, "connection": deepcopy(conn)}
    raise HTTPException(status_code=404, detail=f"Connection id {body.conn_id} not found")


@router.post("/settings/connection/create")
def create_connection(body: CreateConnectionBody) -> dict[str, Any]:
    new_id = max((c["metadata_config"]["id"] for c in _CONNECTIONS), default=0) + 1
    meta = dict(body.metadata_config or {})
    meta.setdefault("sementic_name", meta.get("semantic_name") or f"Connection {new_id}")
    meta["id"] = new_id
    meta["is_active"] = True
    row = {
        "id": new_id,
        "DB_TYPE": body.DB_TYPE or "MySQL",
        "updated_at": date.today().isoformat(),
        "is_active": 1,
        "metadata_config": meta,
        "config": dict(body.config or {}),
    }
    _CONNECTIONS.append(row)
    return {"ok": True, "connection": deepcopy(row)}


@router.post("/settings/connection/update")
def update_connection(payload: dict[str, Any]) -> dict[str, Any]:
    # Frontend may send { connection: {...}, conn_id } or a flat body
    body = payload.get("connection") if isinstance(payload.get("connection"), dict) else payload
    meta = body.get("metadata_config") or {}
    conn_id = (
        meta.get("id")
        or body.get("conn_id")
        or body.get("id")
        or payload.get("conn_id")
    )
    if conn_id is None:
        raise HTTPException(status_code=400, detail="metadata_config.id required")
    for i, conn in enumerate(_CONNECTIONS):
        if int(conn.get("metadata_config", {}).get("id", -1)) == int(conn_id):
            updated = deepcopy(conn)
            if "DB_TYPE" in body:
                updated["DB_TYPE"] = body["DB_TYPE"]
            if "config" in body:
                updated["config"] = body["config"]
            if "metadata_config" in body:
                merged = {**updated["metadata_config"], **body["metadata_config"]}
                merged["id"] = int(conn_id)
                updated["metadata_config"] = merged
            updated["updated_at"] = date.today().isoformat()
            _CONNECTIONS[i] = updated
            return {"ok": True, "connection": deepcopy(updated)}
    raise HTTPException(status_code=404, detail=f"Connection id {conn_id} not found")
