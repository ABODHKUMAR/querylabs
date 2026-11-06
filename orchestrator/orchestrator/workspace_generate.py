"""
LLM-assisted drafting for Agent Studio: AGENT.md and skill *.md following querylab_agent loader format.

Parsed by querylab_agent.skills.loader: YAML frontmatter between --- lines, then markdown body with
## Purpose, ## When to use, ## Inputs, ## Outputs, ## Agent instructions, ## MCP servers (skills).
"""
from __future__ import annotations

import logging
import os
import re
from typing import Literal, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

MAX_USER_PROMPT_LEN = 8000
MAX_CONTEXT_CONTENT = 512 * 1024

AGENT_MD_SPEC = """
You output a single AGENT.md file for the Query Labs agent runtime. The file MUST follow this exact structure:

1) YAML frontmatter between two lines that are exactly three dashes (---), first line of the file.
   Required keys (use YAML block scalar `|` for multi-line text where shown):
   - name: must equal the agent folder name given in context
   - description: one line or short paragraph (routing / card text)
   - purpose: what this agent does (can be multi-line with |)
   - when_to_use: when the orchestrator should pick this agent (can be multi-line with |)
   - agent_instructions: | 
       (Indented lines: how the agent should choose skills, tone, constraints.)

2) After the closing --- of frontmatter, start the body with a single level-1 heading:
   # <same as agent name>
   Then include AT LEAST these level-2 sections (exact titles — ## then space):
   ## Purpose
   ## When to use
   ## Agent instructions

Expand each section with clear bullets or paragraphs. Do NOT include MCP servers in AGENT.md.

EXAMPLE SHAPE (content is illustrative only):
---
name: my_agent
description: Short card description.
purpose: |
  What the agent is for.
when_to_use: |
  When to route here.
agent_instructions: |
  How to pick query_sql vs query_vector.
  One skill per turn.
---

# my_agent

## Purpose
...

## When to use
...

## Agent instructions
...
""".strip()

SKILL_MD_SPEC = """
You output a single skill definition markdown file for the Query Labs agent runtime. The file MUST follow this structure:

1) YAML frontmatter between --- lines (first line of file must be ---).
   Keys:
   - name: short identifier (often the .md filename without extension)
   - description: one line or short paragraph
   - skill_type: MUST be exactly "sql" if the skill lives under folder query_sql, or "vector" if under query_vector
   - mcp_servers: YAML list. Prefer a list of config objects with name, transport (http or stdio), and for http: url;
     for stdio: command and args as list. Use plausible placeholder URLs/commands if the user did not specify.
   - agent_instructions: |
       (Tool usage: e.g. SELECT-only for SQL, call get_schema first, etc.)

2) After frontmatter, start with level-1 heading # <skill name> (same as frontmatter name).
   Then markdown body with these sections (## titles exact; use ## Inputs (from agent) for inputs):
   ## Purpose
   ## When to use
   ## Inputs (from agent)
   ## Outputs
   ## MCP server
   In ## MCP server, explain how to run/configure the MCP and repeat or reference the server setup.

Do not use code fences around the whole file. The raw file starts with ---.
""".strip()


class WorkspaceGenerateBody(BaseModel):
    kind: Literal["agent_md", "skill_md"]
    user_prompt: str = Field(..., min_length=1, max_length=MAX_USER_PROMPT_LEN)
    agent_name: str = Field(..., min_length=1, max_length=64)
    """Folder name under .agents (must match safe segment rules)."""
    skill_type_dir: Optional[str] = Field(None, max_length=64)
    """e.g. query_sql or query_vector — directory under the agent."""
    skill_name: Optional[str] = Field(None, max_length=128)
    """Stem for the skill (frontmatter name); defaults from filename in UI."""
    mode: Literal["create", "refine"] = "create"
    current_content: Optional[str] = Field(None, max_length=MAX_CONTEXT_CONTENT)


def _unwrap_markdown_fences(text: str) -> str:
    s = text.strip()
    if not s.startswith("```"):
        return s
    lines = s.split("\n")
    if not lines:
        return s
    first = lines[0].strip()
    if first.startswith("```"):
        lines = lines[1:]
    while lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _validate_agent_md_shape(text: str) -> list[str]:
    warnings: list[str] = []
    t = text.strip()
    if not t.startswith("---"):
        warnings.append("Output should start with YAML frontmatter (---).")
    if not re.search(r"(?m)^##\s+Purpose\s*$", t):
        warnings.append("Missing ## Purpose section in body.")
    if not re.search(r"(?m)^##\s+When to use\s*$", t):
        warnings.append("Missing ## When to use section in body.")
    if not re.search(r"(?m)^##\s+Agent instructions\s*$", t):
        warnings.append("Missing ## Agent instructions section in body.")
    return warnings


def _validate_skill_md_shape(text: str) -> list[str]:
    warnings: list[str] = []
    t = text.strip()
    if not t.startswith("---"):
        warnings.append("Output should start with YAML frontmatter (---).")
    checks = [
        ("Purpose", r"(?m)^##\s+Purpose\b"),
        ("When to use", r"(?m)^##\s+When to use\b"),
        ("Inputs", r"(?m)^##\s+Inputs\b"),
        ("Outputs", r"(?m)^##\s+Outputs\b"),
        ("MCP server", r"(?m)^##\s+MCP server\b"),
    ]
    for label, pattern in checks:
        if not re.search(pattern, t, re.IGNORECASE):
            warnings.append(f"Missing ## {label} section in body.")
    return warnings


async def generate_workspace_markdown(body: WorkspaceGenerateBody) -> tuple[str, list[str]]:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set; cannot generate content.")

    model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()
    llm = ChatOpenAI(model=model, api_key=api_key, temperature=0.15, max_tokens=8192)

    if body.kind == "agent_md":
        spec = AGENT_MD_SPEC
        validator = _validate_agent_md_shape
    else:
        spec = SKILL_MD_SPEC
        validator = _validate_skill_md_shape

    skill_dir = (body.skill_type_dir or "").strip() or "query_sql"
    skill_stem = (body.skill_name or "").strip() or "new_skill"

    user_parts = [
        f"Agent folder name (must appear as name: in frontmatter for AGENT.md): {body.agent_name}",
    ]
    if body.kind == "skill_md":
        user_parts.append(f"Skill directory under agent (folder): {skill_dir}")
        user_parts.append(f"Skill file stem / frontmatter name: {skill_stem}")
        if skill_dir.lower() in ("query_sql", "sql"):
            user_parts.append('Frontmatter skill_type must be "sql".')
        elif skill_dir.lower() in ("query_vector", "vector"):
            user_parts.append('Frontmatter skill_type must be "vector".')
        else:
            user_parts.append(
                "If folder is query_sql use skill_type: sql; if query_vector use skill_type: vector."
            )

    user_parts.append(f"User request:\n{body.user_prompt.strip()}")

    if body.mode == "refine" and body.current_content and body.current_content.strip():
        user_parts.append(
            "Existing file content to improve (keep valid frontmatter + sections; apply the request):\n\n"
            + body.current_content.strip()[:MAX_CONTEXT_CONTENT]
        )

    system = (
        "You are a technical writer for Query Labs AI agent definitions. "
        "Output ONLY the markdown file content. No preamble, no explanation, no surrounding quotes. "
        "Follow the format specification exactly.\n\n"
        + spec
    )

    messages = [
        SystemMessage(content=system),
        HumanMessage(content="\n\n".join(user_parts)),
    ]

    result = await llm.ainvoke(messages)
    raw = result.content if hasattr(result, "content") else str(result)
    text = _unwrap_markdown_fences(str(raw))
    warnings = validator(text)
    logger.info(
        "workspace_generate_done",
        extra={"kind": body.kind, "agent": body.agent_name, "warnings": len(warnings)},
    )
    return text, warnings
