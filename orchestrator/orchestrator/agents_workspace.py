"""
JWT-protected CRUD for agent definitions under QUERYLAB_AGENTS_ROOT (default: repo agents/.agents).

Layout matches querylab_agent discovery: <agent>/AGENT.md, <agent>/<skill_type>/*.md
"""
from __future__ import annotations

import logging
import os
import re
import shutil
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from orchestrator.auth import verify_jwt_token
from orchestrator.config import QUERYLAB_AGENTS_API_URL
from orchestrator.settings import _PROJECT_ROOT, get_api_settings
from orchestrator.workspace_generate import WorkspaceGenerateBody, generate_workspace_markdown

logger = logging.getLogger(__name__)

router = APIRouter()

# Safe single path segment (agent name, skill type dir)
_SEGMENT = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$")
# Skill markdown files only
_MD_FILE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,126}\.md$")

MAX_SKILL_FILE_BYTES = 512 * 1024
AGENT_MD_NAME = "AGENT.md"


def _workspace_disabled() -> bool:
    return os.environ.get("ORCHESTRATOR_DISABLE_AGENT_WORKSPACE", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "y",
    )


def get_workspace_root() -> Path:
    api = get_api_settings()
    raw = (getattr(api, "QUERYLAB_AGENTS_ROOT", None) or "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    # orchestrator/ -> querylab/ -> agents/.agents
    return (_PROJECT_ROOT.parent / "agents" / ".agents").resolve()


def _assert_segment(name: str, field: str) -> str:
    if not name or not _SEGMENT.match(name):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field}: use letters, numbers, underscore, hyphen; max 63 chars.",
        )
    return name


def _assert_under(root: Path, candidate: Path) -> Path:
    try:
        candidate.resolve().relative_to(root.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Path escapes workspace root")
    return candidate.resolve()


def _agent_path(agent_name: str) -> Path:
    _assert_segment(agent_name, "agent name")
    root = get_workspace_root()
    p = (root / agent_name).resolve()
    return _assert_under(root, p)


def _skill_dir(agent_name: str, skill_type: str) -> Path:
    _assert_segment(skill_type, "skill_type")
    ad = _agent_path(agent_name)
    p = (ad / skill_type).resolve()
    return _assert_under(get_workspace_root(), p)


class CreateAgentBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)


class CreateSkillDirBody(BaseModel):
    skill_type: str = Field(..., min_length=1, max_length=64)


class FileContentBody(BaseModel):
    content: str = ""


class CreateSkillFileBody(BaseModel):
    filename: str = Field(..., min_length=1, max_length=140)
    content: str = ""


class DeleteAgentBody(BaseModel):
    confirm: str = Field(..., description="Must match agent name exactly")


def _check_enabled() -> None:
    if _workspace_disabled():
        raise HTTPException(status_code=404, detail="Agent workspace API is disabled")


@router.get("/workspace/agents")
async def list_agents_workspace(token_user: dict = Depends(verify_jwt_token)):
    _check_enabled()
    root = get_workspace_root()
    if not root.is_dir():
        return {"agents": [], "root": str(root)}
    agents = sorted(
        p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")
    )
    return {"agents": agents, "root": str(root)}


@router.post("/workspace/agents")
async def create_agent_workspace(
    body: CreateAgentBody,
    token_user: dict = Depends(verify_jwt_token),
):
    _check_enabled()
    d = _agent_path(body.name.strip())
    if d.exists():
        raise HTTPException(status_code=409, detail="Agent already exists")
    d.mkdir(parents=True, exist_ok=False)
    logger.info("agent_workspace_created", extra={"agent": body.name, "sub": token_user.get("sub")})
    return {"ok": True, "name": d.name}


@router.delete("/workspace/agents/{agent_name}")
async def delete_agent_workspace(
    agent_name: str,
    body: DeleteAgentBody,
    token_user: dict = Depends(verify_jwt_token),
):
    _check_enabled()
    if body.confirm.strip() != agent_name.strip():
        raise HTTPException(status_code=400, detail="confirm must match agent name")
    d = _agent_path(agent_name)
    if not d.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found")
    shutil.rmtree(d)
    logger.info("agent_workspace_deleted", extra={"agent": agent_name, "sub": token_user.get("sub")})
    return {"ok": True}


@router.get("/workspace/agents/{agent_name}/tree")
async def get_agent_tree(agent_name: str, token_user: dict = Depends(verify_jwt_token)):
    _check_enabled()
    ad = _agent_path(agent_name)
    if not ad.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found")
    skill_types: List[dict] = []
    for p in sorted(ad.iterdir()):
        if not p.is_dir() or p.name.startswith("."):
            continue
        mds = sorted(f.name for f in p.iterdir() if f.is_file() and _MD_FILE.match(f.name))
        skill_types.append({"name": p.name, "files": mds})
    return {
        "agent": agent_name,
        "agent_md_exists": (ad / AGENT_MD_NAME).is_file(),
        "skill_types": skill_types,
    }


@router.post("/workspace/agents/{agent_name}/skill-types")
async def create_skill_dir(
    agent_name: str,
    body: CreateSkillDirBody,
    token_user: dict = Depends(verify_jwt_token),
):
    _check_enabled()
    sd = _skill_dir(agent_name, body.skill_type.strip())
    if sd.exists():
        raise HTTPException(status_code=409, detail="Skill directory already exists")
    sd.mkdir(parents=True, exist_ok=False)
    logger.info(
        "agent_workspace_skill_dir_created",
        extra={"agent": agent_name, "skill_type": body.skill_type, "sub": token_user.get("sub")},
    )
    return {"ok": True, "skill_type": sd.name}


@router.get("/workspace/agents/{agent_name}/instruction")
async def get_agent_instruction(agent_name: str, token_user: dict = Depends(verify_jwt_token)):
    _check_enabled()
    ad = _agent_path(agent_name)
    if not ad.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found")
    f = ad / AGENT_MD_NAME
    if not f.is_file():
        return {"content": "", "exists": False}
    return {"content": f.read_text(encoding="utf-8", errors="replace"), "exists": True}


@router.put("/workspace/agents/{agent_name}/instruction")
async def put_agent_instruction(
    agent_name: str,
    body: FileContentBody,
    token_user: dict = Depends(verify_jwt_token),
):
    _check_enabled()
    raw = body.content.encode("utf-8")
    if len(raw) > MAX_SKILL_FILE_BYTES:
        raise HTTPException(status_code=413, detail="AGENT.md too large")
    ad = _agent_path(agent_name)
    if not ad.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found")
    (ad / AGENT_MD_NAME).write_text(body.content, encoding="utf-8")
    logger.info("agent_workspace_instruction_saved", extra={"agent": agent_name, "sub": token_user.get("sub")})
    return {"ok": True}


@router.get("/workspace/agents/{agent_name}/skill-types/{skill_type}/files/{filename}")
async def get_skill_file(
    agent_name: str,
    skill_type: str,
    filename: str,
    token_user: dict = Depends(verify_jwt_token),
):
    _check_enabled()
    if not _MD_FILE.match(filename):
        raise HTTPException(status_code=400, detail="Invalid filename (must be .md)")
    sd = _skill_dir(agent_name, skill_type)
    if not sd.is_dir():
        raise HTTPException(status_code=404, detail="Skill directory not found")
    fp = _assert_under(get_workspace_root(), (sd / filename).resolve())
    if not fp.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return {"content": fp.read_text(encoding="utf-8", errors="replace"), "filename": filename}


@router.put("/workspace/agents/{agent_name}/skill-types/{skill_type}/files/{filename}")
async def put_skill_file(
    agent_name: str,
    skill_type: str,
    filename: str,
    body: FileContentBody,
    token_user: dict = Depends(verify_jwt_token),
):
    _check_enabled()
    if not _MD_FILE.match(filename):
        raise HTTPException(status_code=400, detail="Invalid filename (must be .md)")
    raw = body.content.encode("utf-8")
    if len(raw) > MAX_SKILL_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    sd = _skill_dir(agent_name, skill_type)
    if not sd.is_dir():
        raise HTTPException(status_code=404, detail="Skill directory not found; create skill-type first")
    fp = _assert_under(get_workspace_root(), (sd / filename).resolve())
    fp.write_text(body.content, encoding="utf-8")
    logger.info(
        "agent_workspace_skill_file_saved",
        extra={"agent": agent_name, "skill_type": skill_type, "file": filename, "sub": token_user.get("sub")},
    )
    return {"ok": True}


@router.post("/workspace/agents/{agent_name}/skill-types/{skill_type}/files")
async def create_skill_file(
    agent_name: str,
    skill_type: str,
    body: CreateSkillFileBody,
    token_user: dict = Depends(verify_jwt_token),
):
    _check_enabled()
    fn = body.filename.strip()
    if not _MD_FILE.match(fn):
        raise HTTPException(status_code=400, detail="Invalid filename (must end with .md)")
    raw = body.content.encode("utf-8")
    if len(raw) > MAX_SKILL_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    sd = _skill_dir(agent_name, skill_type)
    if not sd.is_dir():
        raise HTTPException(status_code=404, detail="Skill directory not found; create skill-type first")
    fp = _assert_under(get_workspace_root(), (sd / fn).resolve())
    if fp.exists():
        raise HTTPException(status_code=409, detail="File already exists")
    fp.write_text(body.content, encoding="utf-8")
    logger.info(
        "agent_workspace_skill_file_created",
        extra={"agent": agent_name, "skill_type": skill_type, "file": fn, "sub": token_user.get("sub")},
    )
    return {"ok": True, "filename": fn}


@router.delete("/workspace/agents/{agent_name}/skill-types/{skill_type}/files/{filename}")
async def delete_skill_file(
    agent_name: str,
    skill_type: str,
    filename: str,
    token_user: dict = Depends(verify_jwt_token),
):
    _check_enabled()
    if not _MD_FILE.match(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    sd = _skill_dir(agent_name, skill_type)
    fp = _assert_under(get_workspace_root(), (sd / filename).resolve())
    if not fp.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    fp.unlink()
    logger.info(
        "agent_workspace_skill_file_deleted",
        extra={"agent": agent_name, "skill_type": skill_type, "file": filename, "sub": token_user.get("sub")},
    )
    return {"ok": True}


@router.delete("/workspace/agents/{agent_name}/instruction")
async def delete_agent_instruction(agent_name: str, token_user: dict = Depends(verify_jwt_token)):
    _check_enabled()
    ad = _agent_path(agent_name)
    f = ad / AGENT_MD_NAME
    if f.is_file():
        f.unlink()
    return {"ok": True}


@router.post("/workspace/generate")
async def workspace_generate_markdown(
    body: WorkspaceGenerateBody,
    token_user: dict = Depends(verify_jwt_token),
):
    """
    Draft or refine AGENT.md / skill *.md using OPENAI_API_KEY (same model as query/stream).
    Preserves Query Labs frontmatter + ## section format expected by querylab_agent.skills.loader.
    """
    _check_enabled()
    an = body.agent_name.strip()
    _assert_segment(an, "agent name")
    if body.kind == "skill_md":
        std = (body.skill_type_dir or "").strip()
        if std:
            _assert_segment(std, "skill_type_dir")
    try:
        content, warnings = await generate_workspace_markdown(body)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("workspace_generate failed")
        raise HTTPException(status_code=502, detail=f"Generation failed: {e!s}") from e
    logger.info(
        "workspace_generate_ok",
        extra={"kind": body.kind, "agent": an, "sub": token_user.get("sub"), "warnings": len(warnings)},
    )
    return {"content": content, "warnings": warnings}


# ── Proxy: skills & MCP registry ─────────────────────────────────────────────

@router.get("/skills")
async def proxy_skills(token_user: dict = Depends(verify_jwt_token)):
    """Proxy GET /skills from the agents service to the frontend."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{QUERYLAB_AGENTS_API_URL}/skills")
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as e:
        logger.warning("proxy_skills: agents service error: %s", e)
        return {"skills": [], "count": 0}


@router.get("/mcp/registry")
async def proxy_mcp_registry(
    token_user: dict = Depends(verify_jwt_token),
    type: Optional[str] = Query(default=None),
):
    """Proxy GET /mcp/registry from the agents service to the frontend."""
    try:
        params = {"type": type} if type else {}
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{QUERYLAB_AGENTS_API_URL}/mcp/registry", params=params)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as e:
        logger.warning("proxy_mcp_registry: agents service error: %s", e)
        return {"servers": [], "count": 0}
