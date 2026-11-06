"""
Plan generation for the Pre-Execution Transparency Layer.

Given a user query and available agents, generates an ordered set of
analysis steps (PlanStep[]) for user review before execution begins.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime
from typing import List

from fastapi import HTTPException
from langchain_openai import ChatOpenAI

from orchestrator.agents_client import fetch_agent_cards
from orchestrator.config import QUERYLAB_AGENTS_API_URL
from orchestrator.models import GeneratePlanRequest, GeneratePlanResponse, PlanStep

logger = logging.getLogger(__name__)

_PLAN_BASE_PROMPT = """You are an intelligent orchestrator. Given a user query and available agents, \
generate an ANALYSIS PLAN: the minimum ordered set of steps to answer the query.

First, decide whether you have enough information to build a good plan. Ask a clarifying question \
ONLY if a critical detail is missing that would materially change which agent(s) or steps you'd \
choose — e.g. an unstated time range, metric, entity/scope, or comparison basis. Do NOT ask about \
stylistic or minor ambiguity; make the most reasonable choice yourself whenever possible. At most one \
question, specific and answerable in a short reply.

If you need to ask, return ONLY this JSON object, no other text:
{{"needs_clarification": true, "clarification_question": "...", "steps": []}}

Otherwise, build the plan. Rules:
- One step per agent needed. If one agent suffices, return exactly one step.
- Only assign a step to an agent whose description clearly matches that part.
- Each step "task" must be a complete, standalone question for that agent.
- "description" is a human-readable label (max 80 chars) e.g. "Fetch Q3 revenue data"
- "rationale" is one sentence explaining why this agent was chosen

Return ONLY this JSON object, no other text:
{{"needs_clarification": false, "clarification_question": null, "steps": [{{"agent_name":"...","task":"...","description":"...","rationale":"..."}}]}}

Available agents:
{agent_list}"""


def _get_llm() -> ChatOpenAI:
    api_key = os.getenv("OPENAI_API_KEY", "")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    return ChatOpenAI(model=model, api_key=api_key, temperature=0)


def _build_agent_list_str(agent_cards: list) -> str:
    lines = []
    for card in agent_cards:
        name = card.get("name", "")
        desc = card.get("description", "")
        servers = card.get("allowed_mcp_servers") or []
        server_str = f" [MCP: {', '.join(servers)}]" if servers else ""
        lines.append(f"- {name}: {desc}{server_str}")
    return "\n".join(lines)


def _score_confidence(agent_name: str, agent_cards: list) -> str:
    for card in agent_cards:
        if card.get("name") == agent_name:
            if card.get("allowed_mcp_servers"):
                return "high"
            return "medium"
    return "low"


async def generate_analysis_plan(
    request: GeneratePlanRequest,
    request_id: str,
    authenticated_user_id: str,
) -> GeneratePlanResponse:
    # 0. A clarification round already happened (answered or skipped) — never ask again,
    # enforced below in code (not just via prompt) regardless of what the LLM returns.
    already_answered = bool(request.clarification_answer) or request.skip_clarification

    # 1. Fetch agent cards
    try:
        agent_cards = await fetch_agent_cards(QUERYLAB_AGENTS_API_URL, request_id)
    except Exception as exc:
        logger.error("[%s] Failed to fetch agent cards: %s", request_id, exc)
        raise HTTPException(status_code=502, detail="Upstream agents service unreachable") from exc

    if not agent_cards:
        raise HTTPException(status_code=502, detail="No agents available")

    # 2. If the user pre-selected data sources, restrict the LLM to matching agents.
    # Build sub_source → agent name map, then filter agent_cards to only agents that
    # own the selected sources (same logic as query_stream.py at execution time).
    _collection_fixed = bool(request.collection)
    if request.collection:
        _sub_src_to_agent: dict = {}
        for c in agent_cards:
            for sub in (c.get("sub_sources") or []):
                _sub_src_to_agent[sub] = c.get("name")
        _valid_names = {c.get("name") for c in agent_cards}
        _collections = [s.strip() for s in request.collection.split(",") if s.strip()]
        _resolved = list(dict.fromkeys(
            _sub_src_to_agent.get(col) or (col if col in _valid_names else None)
            for col in _collections
        ))
        _resolved = [n for n in _resolved if n]
        if _resolved:
            agent_cards = [c for c in agent_cards if c.get("name") in set(_resolved)]
            logger.info("[%s] collection=%r → restricted plan to agents: %s", request_id, request.collection, _resolved)

    # 3. Build system prompt with conditional appends
    agent_list_str = _build_agent_list_str(agent_cards)
    system_prompt = _PLAN_BASE_PROMPT.format(agent_list=agent_list_str)

    if request.regeneration_feedback:
        system_prompt += (
            f'\n\nThe user rejected a previous plan. Their feedback: '
            f'"{request.regeneration_feedback}". Incorporate this.'
        )

    if request.previous_plan_steps:
        summary = "; ".join(
            f"{s.get('agent_name', '')}: {s.get('description', '')}"
            for s in request.previous_plan_steps[:5]
        )
        system_prompt += (
            f"\n\nPrevious query used these steps: {summary}. "
            f"Reuse, adapt, or replace as needed."
        )

    if _collection_fixed:
        system_prompt += (
            "\n\nThe user has already fixed the data source via the UI — do not ask which data "
            "source to use. Only ask about other remaining ambiguity (e.g. time range, metric, scope)."
        )

    if already_answered:
        system_prompt += (
            "\n\nA clarifying question was already asked and the user has responded (or chosen to "
            'skip). You must return a plan now — set "needs_clarification" to false and do not ask '
            "another question, no matter how ambiguous the query still seems."
        )
        if request.skip_clarification and not request.clarification_answer:
            system_prompt += (
                " The user chose to skip answering — make the most reasonable default assumption for "
                "the ambiguous detail (e.g. the most recent period, or all available sources) and "
                "proceed."
            )

    # 4. Build messages list
    messages: list = [{"role": "system", "content": system_prompt}]
    for msg in (request.conversation_history or [])[-10:]:
        if isinstance(msg, dict) and "query" in msg:
            messages.append({"role": "user", "content": msg["query"]})
            resp = msg.get("response") or msg.get("data") or ""
            if isinstance(resp, str) and resp:
                messages.append({"role": "assistant", "content": resp})

    # Fold a clarification answer into the same final message rather than appending a
    # second trailing user turn — keeps the query and its answer as one coherent input.
    final_query_content = request.query
    if request.clarification_answer:
        final_query_content = (
            f"{request.query}\n\n(Answering a clarifying question) {request.clarification_answer}"
        )
    messages.append({"role": "user", "content": final_query_content})

    # 5. Call LLM
    try:
        llm = _get_llm()
        response = await llm.ainvoke(messages)
        raw_content = response.content if hasattr(response, "content") else str(response)
    except Exception as exc:
        logger.error("[%s] LLM call failed during plan generation: %s", request_id, exc)
        raise HTTPException(status_code=500, detail="Plan generation failed: LLM error") from exc

    # 6. Parse JSON response — now a JSON object, not a bare array
    try:
        # Strip markdown code fences if present
        text = raw_content.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.rstrip("`").strip()
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError("Expected a JSON object")
    except Exception as exc:
        logger.error("[%s] Failed to parse plan JSON: %s | raw: %s", request_id, exc, raw_content[:300])
        raise HTTPException(status_code=500, detail="Plan generation failed: invalid LLM response") from exc

    # 6a. Clarification branch — enforce the one-round cap in code (not just via prompt),
    # and defend against a malformed/empty question despite the flag being set.
    clarification_question = (parsed.get("clarification_question") or "").strip()
    needs_clarification = bool(parsed.get("needs_clarification")) and not already_answered and bool(clarification_question)

    if needs_clarification:
        logger.info("[%s] plan_generator: asking clarification: %r", request_id, clarification_question)
        return GeneratePlanResponse(
            plan_id=str(uuid.uuid4()),
            steps=[],
            query=request.query,
            generated_at=datetime.utcnow().isoformat(),
            needs_clarification=True,
            clarification_question=clarification_question,
        )

    raw_steps = parsed.get("steps") or []
    if not isinstance(raw_steps, list) or len(raw_steps) == 0:
        logger.error("[%s] Plan response had no steps. Raw: %s", request_id, raw_content[:300])
        raise HTTPException(status_code=500, detail="Plan generation failed: invalid LLM response")

    # 7. Validate agent names — drop steps with invalid agents
    valid_agent_names = {c.get("name") for c in agent_cards}
    valid_steps = [s for s in raw_steps if s.get("agent_name") in valid_agent_names]

    # 8. If ALL steps invalid, raise
    if not valid_steps:
        logger.error("[%s] No valid agents in plan. Raw steps: %s", request_id, raw_steps)
        raise HTTPException(status_code=500, detail="No valid agents in plan")

    # 9 & 10. Assign confidence and step_id
    _card_by_name = {c.get("name"): c for c in agent_cards}
    plan_steps: List[PlanStep] = []
    for s in valid_steps:
        agent_name = s["agent_name"]
        confidence = _score_confidence(agent_name, agent_cards)
        agent_card = _card_by_name.get(agent_name, {})
        mcp_servers = agent_card.get("allowed_mcp_servers") or []
        derived_data_source = ", ".join(mcp_servers) if mcp_servers else (s.get("data_source") or "")
        plan_steps.append(
            PlanStep(
                step_id=str(uuid.uuid4()),
                agent_name=agent_name,
                task=s.get("task", ""),
                description=s.get("description", "")[:80],
                data_source=derived_data_source,
                confidence=confidence,
                rationale=s.get("rationale", ""),
                sub_sources=agent_card.get("sub_sources") or [],
            )
        )

    # 11. Return response
    return GeneratePlanResponse(
        plan_id=str(uuid.uuid4()),
        steps=plan_steps,
        query=request.query,
        generated_at=datetime.utcnow().isoformat(),
        needs_clarification=False,
        clarification_question=None,
    )
