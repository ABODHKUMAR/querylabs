"""
LangGraph nodes for the 3-node orchestrator:

  decompose_node  — LLM splits the user query into sub-tasks, one per agent.
  route_node      — asyncio.gather() fan-out: calls each agent in parallel.
  synthesise_node — LLM merges all agent responses into one coherent answer.

Each node pushes SSE-formatted strings into an asyncio.Queue supplied via
the LangGraph config["configurable"]["event_queue"].  The SSE generator in
query_stream.py drains that queue in real-time.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re as _re
import uuid
from typing import Any, Callable, Coroutine, Dict, List, Optional

from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI

from orchestrator.graph.state import AgentResponse, OrchestratorState, SubTask

logger = logging.getLogger(__name__)

# ── SSE helper (mirrors query_stream.format_sse_event, kept local to avoid
#    circular imports) ────────────────────────────────────────────────────────

def _sse(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── LLM prompts ──────────────────────────────────────────────────────────────

_DECOMPOSE_SYSTEM = """\
You are an intelligent orchestrator.  Given a user query and a list of available
agents, decompose the query into the MINIMUM number of self-contained sub-tasks
needed to answer it fully — one sub-task per agent to call.

Rules:
- If one agent can answer the question completely, return exactly ONE sub-task.
- Only assign a sub-task to an agent whose description clearly matches that part
  of the question.
- Each sub-task "task" must be a complete, standalone question the agent can
  answer without context from the other sub-tasks.
- Return ONLY valid JSON — a JSON array of objects with keys
  "agent_name", "task", and "reasoning".  No prose, no markdown fences.
- "reasoning" is one sentence (max 80 chars) explaining why this agent was chosen.

Routing rules — use ALL of the following signals:
- Data source match: if the user query mentions a term found in an agent's "Data sources" list,
  that is a strong match (e.g., "KYC alerts" → agent with "ForgeKYCAMLReports").
- Capability match:
    • metrics, counts, revenue, KPIs, time-series, SQL data → prefer agents listing "query_sql"
    • documents, memos, communications, qualitative analysis → prefer agents listing "query_vector"
    • queries needing BOTH data and document context → create TWO sub-tasks to the SAME agent
      (if it has both capabilities) — one framed as a data question, one as a document question.
- Example query match: if the user question closely resembles an agent's "Example queries",
  that agent is the best semantic match.
- Fallback: if no agent clearly matches, return ONE sub-task to the agent whose description or
  data sources have the highest keyword overlap with the query.
- Sub-task cap: NEVER create more than 2 sub-tasks for a single user question unless it explicitly
  references 3 or more entirely distinct data domains.
- CRITICAL: return ONLY agent names that appear in the available agents list. Do not invent names.

Available agents:
{agent_list}

Return format (JSON array, no other text):
[
  {{"agent_name": "name_of_agent", "task": "specific question for this agent", "reasoning": "one sentence, max 80 chars"}},
  ...
]
"""

_SYNTHESISE_SYSTEM = """\
You are an expert analyst.  The user asked a question that was routed to one or
more specialised agents.  Combine their responses into a single, coherent,
well-structured answer.

Instructions:
- Integrate information from all agent responses naturally.
- Cite the source agent in parentheses when referencing specific data,
  e.g. "(source: domain_agent)".
- If only one agent responded and its answer is already complete, return it
  largely unchanged (light editing for clarity is fine).
- Format the answer in clear markdown.
- Be concise — do not pad or repeat information.
"""

_CHART_SPEC_PROMPT = """
If the answer contains numerical or comparative data (scores, amounts, counts, percentages,
dates with values), append a chart specification block using EXACTLY this format at the very end
of your response — after all text:

<querylab_chart>
{
  "title": "short human-readable title",
  "chart_type": "bar",
  "x_label": "name of the categorical/label column",
  "series": [
    {"name": "metric name", "x": ["label1","label2"], "y": [value1, value2]}
  ]
}
</querylab_chart>

Rules for the chart block:
- Each series has exactly one "name" (string), one "x" array (labels), one "y" array (numbers).
- "y" values must be plain numbers — strip currency symbols, percentage signs, commas.
- Replace missing or null "y" values with 0.
- All values in a series "x" array must be strings — never mix numbers with strings.
- If multiple numeric columns exist, include each as a separate series object.
- Do NOT include the <querylab_chart> block at all if there is truly no numerical data or fewer than 2 x-axis points.
- Output valid JSON inside the block — no trailing commas, no comments.
- Set "chart_type" to "line" when x values are time-based (months, quarters Q1/Q2, years, fiscal years FY2023, date strings); use "bar" for all other categories.
- For line charts: sort the x and y arrays together in chronological order before inserting them.
"""

_QUERYLAB_CHART_RE = _re.compile(r'<querylab_chart>(.*?)</querylab_chart>', _re.DOTALL)

_CHART_WORDS_RE = _re.compile(
    r'\b(chart|plot|graph|visuali|trend|compare|distribution|breakdown|ranking)\b',
    _re.IGNORECASE,
)
_NUMBER_RE = _re.compile(r'\b\d+[\.,]?\d*\b')
_METRIC_NUMBER_RE = _re.compile(
    r'\d+[\.,]?\d*\s*%|'
    r'[\$£€]\s*\d+[\.,]?\d*|'
    r'\d+[\.,]?\d*\s*(million|billion|thousand)\b|'
    r'(score|rate|index|ratio|revenue|sales|cost|profit|loss|units|volume|growth)'
    r'[:\s]+\d+[\.,]?\d*',
    _re.IGNORECASE,
)


def _should_generate_chart(responses: List[Dict], user_query: str) -> bool:
    """Return True when chart generation is worth attempting."""
    if _CHART_WORDS_RE.search(user_query):
        return True
    for resp in responses:
        # Fix 10: SQL table artifact with ≥2 rows always warrants a chart
        for artifact in (resp.get("artifacts") or []):
            if (artifact.get("type") == "table"
                    and isinstance(artifact.get("data"), list)
                    and len(artifact["data"]) >= 2):
                return True
        # Fix 11: For text-only responses require metric-context numbers, not just any numbers
        answer = resp.get("answer") or resp.get("result") or ""
        if len(_METRIC_NUMBER_RE.findall(str(answer))) >= 2:
            return True
    return False


def _extract_synthesis_chart(text: str) -> tuple:
    """
    Parse <querylab_chart>JSON</querylab_chart> block from synthesis output.
    Returns (clean_text, plotly_spec_or_None).
    Strips the block from the visible answer regardless of parse success.
    Never raises.
    """
    match = _QUERYLAB_CHART_RE.search(text)
    clean_text = _QUERYLAB_CHART_RE.sub('', text).strip() if match else text

    if not match:
        return clean_text, None

    try:
        data = json.loads(match.group(1).strip())
        series = data.get("series") or []
        if not series:
            return clean_text, None

        # Fix 4: read chart_type from LLM output
        chart_type = (data.get("chart_type") or "bar").lower().strip()
        is_line = chart_type == "line"
        trace_type = "scatter" if is_line else "bar"

        traces = []
        for s in series:
            x_vals = [str(v) for v in (s.get("x") or [])]
            y_vals = []
            for v in (s.get("y") or []):
                try:
                    y_vals.append(float(v))
                except (TypeError, ValueError):
                    y_vals.append(0.0)
            if x_vals and y_vals:
                trace = {"type": trace_type, "name": s.get("name", ""), "x": x_vals, "y": y_vals}
                if is_line:
                    trace["mode"] = "lines+markers"
                traces.append(trace)

        if not traces:
            return clean_text, None

        title = data.get("title", "")
        x_label = data.get("x_label", "")
        tick_angle = -45 if max(len(s.get("x", [])) for s in series) > 8 else 0
        layout: Dict = {
            "title": {"text": title},
            "xaxis": {"title": {"text": x_label}, "tickangle": tick_angle},
            "yaxis": {"title": {"text": series[0].get("name", "Value") if len(traces) == 1 else "Value"}},
            "height": 420,
            "margin": {"t": 60, "b": 110, "l": 60, "r": 20},
            "legend": {"orientation": "h", "y": -0.25},
        }
        if not is_line:
            layout["barmode"] = "group" if len(traces) > 1 else "relative"
        plotly_spec = {"data": traces, "layout": layout}
        return clean_text, plotly_spec

    except Exception as exc:
        logger.warning("[chart_gen] synthesis chart parse failed: %s", exc)
        return clean_text, None


# ── Agent card formatting for decompose prompt ───────────────────────────────

def _format_agent_for_prompt(card: dict) -> str:
    """Format an agent card as a multi-line prompt block with all routing signals."""
    lines = [f"- {card['name']}: {card.get('description', 'No description available.')}"]

    allowed_skills = card.get('allowed_skills') or []
    if not allowed_skills:
        raw = card.get('skills') or []
        allowed_skills = [s.get('name', '') if isinstance(s, dict) else str(s) for s in raw]
    if allowed_skills:
        lines.append(f"  Capabilities: {', '.join(allowed_skills)}")

    sub_sources = card.get('sub_sources') or []
    if sub_sources:
        lines.append(f"  Data sources: {', '.join(sub_sources[:6])}")

    suggested = card.get('suggested_questions') or []
    if suggested:
        lines.append(f"  Example queries: {' | '.join(str(q) for q in suggested[:3])}")

    return "\n".join(lines)


# ── Node: decompose ──────────────────────────────────────────────────────────

async def decompose_node(
    state: OrchestratorState,
    config: RunnableConfig,
) -> Dict[str, Any]:
    """
    Use the LLM to split the user query into per-agent sub-tasks.

    Emits a 'thought' SSE event listing the planned sub-tasks.
    Falls back to a single sub-task on any parse error.
    """
    cfg = config.get("configurable", {})
    llm: ChatOpenAI = cfg["llm"]
    agent_cards: List[Dict] = cfg["agent_cards"]
    event_queue: asyncio.Queue = cfg["event_queue"]
    trace_id: str = cfg.get("trace_id", "")

    # Build the agent list section of the prompt with full routing metadata
    agent_list_str = "\n\n".join(_format_agent_for_prompt(c) for c in agent_cards)
    system_prompt = _DECOMPOSE_SYSTEM.format(agent_list=agent_list_str)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": state["user_query"]},
    ]

    sub_tasks: List[SubTask] = []
    try:
        response = await llm.ainvoke(messages)
        raw = (response.content or "").strip()

        # Strip markdown code fences if the LLM wraps the JSON
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:]).rstrip("`").strip()

        parsed = json.loads(raw)
        for item in parsed:
            agent_name = (item.get("agent_name") or "").strip()
            task = (item.get("task") or "").strip()
            reasoning = (item.get("reasoning") or "").strip()[:80]
            if agent_name and task:
                sub_tasks.append(
                    SubTask(
                        task_id=str(uuid.uuid4()),
                        agent_name=agent_name,
                        task=task,
                        reasoning=reasoning or None,
                    )
                )
    except Exception as exc:
        logger.warning(
            "[%s] decompose_node: LLM/parse error (%s) — using single-agent fallback",
            trace_id, exc,
        )

    # Validate: keep only sub-tasks whose agent_name exists in agent_cards
    valid_names = {c["name"] for c in agent_cards}
    sub_tasks = [t for t in sub_tasks if t["agent_name"] in valid_names]

    # Fallback: keyword-score all agents and pick the best match
    if not sub_tasks:
        if not agent_cards:
            return state
        query_lower = state["user_query"].lower()
        query_words = [w for w in query_lower.split() if len(w) > 3]
        best_card = agent_cards[0]
        best_score = 0
        for card in agent_cards:
            score = 0
            desc = (card.get('description') or '').lower()
            for word in query_words:
                if word in desc:
                    score += 1
            for src in (card.get('sub_sources') or []):
                src_lower = src.lower()
                if src_lower in query_lower or any(w in src_lower for w in query_words):
                    score += 2
            for q in (card.get('suggested_questions') or []):
                if any(w in str(q).lower() for w in query_words):
                    score += 1
            if score > best_score:
                best_score = score
                best_card = card
        fallback = best_card["name"]
        sub_tasks = [
            SubTask(
                task_id=str(uuid.uuid4()),
                agent_name=fallback,
                task=state["user_query"],
            )
        ]
        await event_queue.put(_sse("thought", {
            "type": "decompose_fallback",
            "content": f"Decomposition failed — routing entire query to {fallback}",
            "fallback_agent": fallback,
        }))
        logger.info("[%s] decompose_node: fallback to agent=%r (score=%d)", trace_id, fallback, best_score)

    # Emit thought event so the frontend can show the decomposition plan
    await event_queue.put(_sse("thought", {
        "type": "decompose",
        "content": (
            f"Decomposed into {len(sub_tasks)} sub-task(s): "
            + "; ".join(f"{t['agent_name']}: {t['task'][:80]}" for t in sub_tasks)
        ),
        "sub_tasks": [
            {"agent": t["agent_name"], "task": t["task"], "reasoning": t.get("reasoning") or ""}
            for t in sub_tasks
        ],
    }))
    await event_queue.put(_sse("status", {
        "stage": "routing",
        "message": f"Routing to {len(sub_tasks)} agent(s)...",
    }))

    logger.info(
        "[%s] decompose_node: %d sub-task(s) → %s",
        trace_id, len(sub_tasks), [t["agent_name"] for t in sub_tasks],
    )
    return {"sub_tasks": sub_tasks}


# ── Node: route ───────────────────────────────────────────────────────────────

async def route_node(
    state: OrchestratorState,
    config: RunnableConfig,
) -> Dict[str, Any]:
    """
    Fan-out: call every sub-task agent in parallel via asyncio.gather().

    For each agent call, emits:
      - 'thought / tool_call'  before the call
      - 'thought / tool_result' after the call (or 'tool_error' on failure)
    """
    cfg = config.get("configurable", {})
    base_url: str = cfg["base_url"]
    event_queue: asyncio.Queue = cfg["event_queue"]
    trace_id: str = cfg.get("trace_id", "")
    orch_span_id: str = cfg.get("orch_span_id", "")
    # ask_agent_fn is injected from query_stream to avoid circular imports
    ask_agent_fn: Callable[..., Coroutine[Any, Any, str]] = cfg["ask_agent_fn"]
    agent_cards: List[Dict] = cfg["agent_cards"]
    card_by_name: Dict[str, Dict] = {c["name"]: c for c in agent_cards}

    async def _call_one(sub_task: SubTask) -> AgentResponse:
        agent_name = sub_task["agent_name"]
        task = sub_task["task"]
        task_id = sub_task["task_id"]
        step_id = sub_task.get("step_id")
        span_id = str(uuid.uuid4())

        await event_queue.put(_sse("thought", {
            "type": "tool_call",
            "tool": agent_name,
            "content": f"Querying {agent_name}...",
        }))
        await event_queue.put(_sse("status", {
            "stage": "tool_execution",
            "message": f"Executing {agent_name}...",
        }))
        if step_id:
            await event_queue.put(_sse("plan_step_status", {
                "step_id": step_id, "status": "in_progress",
                "agent_name": agent_name, "error": None,
            }))

        trace_context = {
            "trace_id": trace_id,
            "parent_span_id": orch_span_id,
            "span_id": span_id,
        }

        artifacts: List[Dict] = []
        skill_name: Optional[str] = None
        skill_type: Optional[str] = None
        mcp_server: Optional[str] = None
        tool_calls: Optional[int] = None
        prompt_tokens: Optional[int] = None
        completion_tokens: Optional[int] = None
        total_tokens: Optional[int] = None
        estimated_cost_usd: Optional[float] = None
        try:
            resp_data = await ask_agent_fn(
                base_url=base_url,
                agent_name=agent_name,
                question=task,
                trace_context=trace_context,
                event_queue=event_queue,
                step_id=step_id,
            )
            result = resp_data["answer"]
            artifacts = resp_data["artifacts"]
            skill_name = resp_data["skill_name"]
            skill_type = resp_data["skill_type"]
            mcp_server = resp_data["mcp_server"]
            tool_calls = resp_data.get("tool_calls")
            prompt_tokens = resp_data.get("prompt_tokens")
            completion_tokens = resp_data.get("completion_tokens")
            total_tokens = resp_data.get("total_tokens")
            estimated_cost_usd = resp_data.get("estimated_cost_usd")
            status = "success"
            await event_queue.put(_sse("thought", {
                "type": "tool_result",
                "tool": agent_name,
                "content": f"Completed: {agent_name}",
            }))
            await event_queue.put(_sse("thought", {
                "type": "agent_response",
                "agent": agent_name,
                "step_id": step_id,
                "answer": result[:1000],
                "truncated": len(result) > 1000,
                "metadata": {
                    "mcp_server": mcp_server,
                    "tool_calls": tool_calls,
                    "total_tokens": total_tokens,
                },
            }))
            for seq, te in enumerate(resp_data.get("tool_events") or [], start=1):
                tool_name = te.get("tool", "")
                await event_queue.put(_sse("thought", {
                    "type": "agent_tool_trace",
                    "agent": agent_name,
                    "step_id": step_id,
                    "seq": seq,
                    "tool": tool_name,
                    "args": te.get("args", {}),
                    "result": te.get("result", ""),
                    "truncated": te.get("truncated", False),
                }))
                if tool_name == "generate_sql" and te.get("sql"):
                    await event_queue.put(_sse("thought", {
                        "type": "sql_generated",
                        "agent": agent_name,
                        "step_id": step_id,
                        "sql": te["sql"],
                        "seq": seq,
                    }))
            if step_id:
                await event_queue.put(_sse("plan_step_status", {
                    "step_id": step_id, "status": "completed",
                    "agent_name": agent_name, "error": None,
                }))
            logger.info("[%s] route_node: agent=%r ok, result_len=%d", trace_id, agent_name, len(result))
        except Exception as exc:
            result = f"[Error from {agent_name}: {exc}]"
            status = "failed"
            logger.warning("[%s] route_node: agent=%r failed: %s", trace_id, agent_name, exc)
            await event_queue.put(_sse("thought", {
                "type": "tool_error",
                "tool": agent_name,
                "content": f"Error from {agent_name}: {str(exc)[:120]}",
            }))
            if step_id:
                await event_queue.put(_sse("plan_step_status", {
                    "step_id": step_id, "status": "failed",
                    "agent_name": agent_name, "error": str(exc)[:120],
                }))

        # Collect MCP sources from agent card
        sources: List[str] = list(card_by_name.get(agent_name, {}).get("allowed_mcp_servers") or [])

        return AgentResponse(
            task_id=task_id,
            agent_name=agent_name,
            result=result,
            status=status,
            sources=sources,
            artifacts=artifacts,
            skill_name=skill_name,
            skill_type=skill_type,
            mcp_server=mcp_server,
            tool_calls=tool_calls,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=estimated_cost_usd,
        )

    responses = list(await asyncio.gather(*[_call_one(t) for t in state["sub_tasks"]]))

    logger.info(
        "[%s] route_node: collected %d response(s), statuses=%s",
        trace_id, len(responses), [r["status"] for r in responses],
    )
    # Return list — the Annotated[..., operator.add] reducer appends it to state
    return {"responses": responses}


# ── Node: synthesise ──────────────────────────────────────────────────────────

async def synthesise_node(
    state: OrchestratorState,
    config: RunnableConfig,
) -> Dict[str, Any]:
    """
    Merge all agent responses into one final answer.

    - Single successful response → returned as-is (no extra LLM call).
    - Multiple responses (or single failure) → LLM synthesis with streaming
      tokens pushed to event_queue so the SSE generator can forward them live.
    """
    cfg = config.get("configurable", {})
    llm: ChatOpenAI = cfg["llm"]
    event_queue: asyncio.Queue = cfg["event_queue"]
    trace_id: str = cfg.get("trace_id", "")

    responses: List[AgentResponse] = state.get("responses") or []

    if not responses:
        logger.warning("[%s] synthesise_node: no responses to merge", trace_id)
        final_answer = "No response was generated by any agent."
        await event_queue.put(_sse("token", {"content": final_answer}))
        return {"final_answer": final_answer}

    successful = [r for r in responses if r["status"] != "failed"]
    strategy = "passthrough" if len(successful) == 1 else "multi_agent_synthesis"
    await event_queue.put(_sse("thought", {
        "type": "synthesis_context",
        "strategy": strategy,
        "agents_used": [r["agent_name"] for r in successful],
        "failed_agents": [r["agent_name"] for r in responses if r["status"] == "failed"],
    }))

    generate_chart = _should_generate_chart(responses, state["user_query"])

    # ── Single successful response: pass through (with optional chart synthesis) ─
    if len(responses) == 1 and responses[0]["status"] != "failed":
        raw_answer = responses[0]["result"]
        chart_vis: Optional[Dict] = None

        if generate_chart:
            # Run one LLM call to embed the chart spec in the response
            chart_messages = [
                {"role": "system", "content": _SYNTHESISE_SYSTEM + "\n\n" + _CHART_SPEC_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"User question: {state['user_query']}\n\n"
                        f"Agent responses:\n\n**{responses[0]['agent_name']}**:\n{raw_answer}"
                    ),
                },
            ]
            try:
                chart_resp = await llm.ainvoke(chart_messages)
                raw_answer = chart_resp.content or raw_answer
            except Exception as exc:
                logger.warning("[%s] synthesise_node: chart LLM call failed: %s", trace_id, exc)
            final_answer, chart_vis = _extract_synthesis_chart(raw_answer)
        else:
            final_answer = raw_answer

        logger.info("[%s] synthesise_node: single-agent passthrough, len=%d, chart=%s",
                    trace_id, len(final_answer), chart_vis is not None)
        # Stream word-by-word so the frontend renders progressively
        words = final_answer.split()
        for i, word in enumerate(words):
            token = (" " + word) if i > 0 else word
            await event_queue.put(_sse("token", {"content": token}))
        return {"final_answer": final_answer, "chart_vis": chart_vis}

    # ── Multiple responses (or all failed): synthesise with LLM ─────────────
    context_parts: List[str] = []
    for resp in responses:
        prefix = f"**{resp['agent_name']}**"
        if resp["status"] != "failed":
            context_parts.append(f"{prefix}:\n{resp['result']}")
        else:
            context_parts.append(f"{prefix}: *(agent failed to respond)*")
    context_str = "\n\n---\n\n".join(context_parts)

    system_content = _SYNTHESISE_SYSTEM + ("\n\n" + _CHART_SPEC_PROMPT if generate_chart else "")
    messages = [
        {"role": "system", "content": system_content},
        {
            "role": "user",
            "content": (
                f"User question: {state['user_query']}\n\n"
                f"Agent responses:\n\n{context_str}"
            ),
        },
    ]

    await event_queue.put(_sse("status", {"stage": "synthesising", "message": "Synthesising answer..."}))

    raw_answer = ""
    chart_vis = None
    try:
        synth_resp = await llm.ainvoke(messages)
        raw_answer = synth_resp.content or ""
    except Exception as exc:
        logger.error("[%s] synthesise_node: LLM error: %s", trace_id, exc)
        raw_answer = context_str

    final_answer, chart_vis = _extract_synthesis_chart(raw_answer)

    # Stream clean answer word-by-word
    words = final_answer.split()
    for i, word in enumerate(words):
        token = (" " + word) if i > 0 else word
        await event_queue.put(_sse("token", {"content": token}))

    logger.info("[%s] synthesise_node: final_answer len=%d, chart=%s",
                trace_id, len(final_answer), chart_vis is not None)
    return {"final_answer": final_answer, "chart_vis": chart_vis}
