"""
POST /query/stream: streaming query using agents API as tools.

Same SSE contract as querylab_sql api/v3/query_stream
  (status, thought, token, data, complete, error).

Architecture (Phase 4 — LangGraph orchestrator):
  1. Fetch agent cards from agents service (GET /agents/cards).
  2. Build OrchestratorState and per-request LangGraph config.
  3. Run the compiled 3-node graph in a background asyncio task:
       decompose → route → synthesise
  4. Drain the shared event_queue in real-time to yield SSE events.
  5. After the graph finishes, emit the 'complete' SSE event.

SSE event mapping:
  decompose_node  → thought (type=decompose, lists sub-tasks)
  route_node      → thought (type=tool_call / tool_result / tool_error)
  synthesise_node → token  (streamed word-by-word or from LLM chunks)
  final           → complete
"""
import asyncio
import json
import logging
import os
import re as _chart_re
import time
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from langchain_openai import ChatOpenAI

from orchestrator.agents_client import fetch_agent_cards, fetch_agents
from orchestrator.auth import ensure_user_matches_token, verify_jwt_token
from orchestrator.http_client import get_http_client
from orchestrator.config import QUERYLAB_AGENTS_API_URL
from orchestrator.graph.orchestrator_graph import get_graph
from orchestrator.graph.state import SubTask
from orchestrator.models import MessageRequest
from orchestrator.config import chat_persistence_enabled
from orchestrator.persistence.chat import save_chat_turn_async
from orchestrator.persistence.db import async_session_scope
from orchestrator.persistence.models import AgentRun
from orchestrator.structured_logging import log_extra, set_task_id, set_trace_context, set_user_context

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Chart helpers: time-series patterns ──────────────────────────────────────

_MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}
_QS_QUARTER_RE = _chart_re.compile(r'\bq([1-4])\b', _chart_re.IGNORECASE)
_QS_FISCAL_RE  = _chart_re.compile(r'^fy\s*(\d{2,4})$', _chart_re.IGNORECASE)
_QS_HALF_RE    = _chart_re.compile(r'\bh([12])\b', _chart_re.IGNORECASE)
_QS_YEAR_RE    = _chart_re.compile(r'^(19|20)\d{2}$')
_METRIC_NUMBER_RE = _chart_re.compile(
    r'\d+[\.,]?\d*\s*%|'
    r'[\$£€]\s*\d+[\.,]?\d*|'
    r'\d+[\.,]?\d*\s*(million|billion|thousand)\b|'
    r'(score|rate|index|ratio|revenue|sales|cost|profit|loss|units|volume|growth)'
    r'[:\s]+\d+[\.,]?\d*',
    _chart_re.IGNORECASE,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or str(uuid.uuid4())


def format_sse_event(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# _fetch_agents and _fetch_agent_cards moved to agents_client.py
_fetch_agents = fetch_agents
_fetch_agent_cards = fetch_agent_cards


def _parse_markdown_table(text: str) -> Optional[List[Dict]]:
    """Parse the first markdown table from a text response. Returns list of dicts or None. Never raises."""
    if not text:
        return None
    try:
        lines = text.splitlines()

        # Find the first line that looks like a table header (has 2+ pipe chars)
        start = None
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.count('|') >= 2:
                start = i
                break

        if start is None:
            return None

        # Collect contiguous lines containing pipes (blank lines are tolerated)
        table_lines = []
        blank_run = 0
        for line in lines[start:]:
            stripped = line.strip()
            if '|' in stripped:
                table_lines.append(stripped)
                blank_run = 0
            elif not stripped:
                blank_run += 1
                if blank_run > 1:  # two consecutive blanks → table ended
                    break
            else:  # non-empty, non-pipe line ends the table
                break

        if len(table_lines) < 3:  # header + separator + at least one data row
            return None

        def _split_row(line: str) -> List[str]:
            return [c.strip() for c in line.strip('|').split('|')]

        headers = [h for h in _split_row(table_lines[0]) if h]
        if not headers:
            return None

        rows = []
        for line in table_lines[1:]:
            cells = _split_row(line)
            # Skip separator rows (only dashes/colons/spaces)
            if all(not c or set(c) <= {'-', ':', ' '} for c in cells):
                continue
            if len(cells) >= len(headers):
                row = {headers[i]: cells[i] for i in range(len(headers))}
                if any(row.values()):
                    rows.append(row)

        return rows if rows else None
    except Exception:
        return None


def _generate_chart_from_table(
    table_data: List[Dict],
    user_query: str,
) -> Optional[Dict]:
    """Generate a Plotly chart spec from table data. Pure Python, never raises."""
    if not table_data:
        return None

    try:
        columns = list(table_data[0].keys())
        if len(columns) < 2:
            return None

        _STRIP_CHARS = str.maketrans("", "", "$£€¥%,()_")

        def _is_numeric(col: str) -> bool:
            numeric = 0
            non_numeric = 0
            for row in table_data[:5]:
                val = row.get(col)
                if val is None:
                    continue
                if isinstance(val, (int, float)):
                    numeric += 1
                elif isinstance(val, str):
                    cleaned = val.strip().translate(_STRIP_CHARS).strip()
                    if not cleaned:
                        continue
                    try:
                        float(cleaned)
                        numeric += 1
                    except ValueError:
                        non_numeric += 1
            return numeric > 0 and numeric >= non_numeric

        numeric_cols = [c for c in columns if _is_numeric(c)]
        categorical_cols = [c for c in columns if not _is_numeric(c)]

        if not numeric_cols:
            return None

        x_col = categorical_cols[0] if categorical_cols else columns[0]
        y_cols = [c for c in numeric_cols if c != x_col][:3]
        if not y_cols:
            x_col = columns[0]
            y_cols = [c for c in columns[1:4] if c != x_col]
        if not y_cols:
            return None

        # Fix 1: Drop rows with blank/null x-axis values
        table_data = [r for r in table_data if str(r.get(x_col, "") or "").strip()]
        if not table_data:
            return None

        # Fix 7: Require at least 2 rows for a meaningful chart
        if len(table_data) < 2:
            return None

        # Fix 2: Time-series detection — returns (is_time, sort_key_fn_or_None)
        def _detect_time_series(col_name: str, sample_vals):
            col_lower = col_name.lower()
            time_keywords = ("month", "quarter", "year", "date", "period", "week", "day", "fiscal", "half")
            col_is_time = any(k in col_lower for k in time_keywords)
            clean = [str(v).strip().lower() for v in sample_vals if str(v).strip()]
            if not clean:
                return col_is_time, None
            majority = len(clean) / 2
            if sum(1 for v in clean if v in _MONTH_MAP) >= majority:
                return True, lambda row: _MONTH_MAP.get(str(row.get(x_col, "")).strip().lower(), 99)
            if sum(1 for v in clean if _QS_QUARTER_RE.search(v)) >= majority:
                def _q_key(row):
                    m = _QS_QUARTER_RE.search(str(row.get(x_col, "")).strip().lower())
                    return int(m.group(1)) if m else 9
                return True, _q_key
            if sum(1 for v in clean if _QS_HALF_RE.search(v)) >= majority:
                def _h_key(row):
                    m = _QS_HALF_RE.search(str(row.get(x_col, "")).strip().lower())
                    return int(m.group(1)) if m else 9
                return True, _h_key
            if sum(1 for v in clean if _QS_FISCAL_RE.match(v)) >= majority:
                def _fy_key(row):
                    m = _QS_FISCAL_RE.match(str(row.get(x_col, "")).strip().lower())
                    return int(m.group(1)) if m else 9999
                return True, _fy_key
            if sum(1 for v in clean if _QS_YEAR_RE.match(v)) >= majority:
                return True, lambda row: int(str(row.get(x_col, "9999")).strip() or "9999")
            if col_is_time:
                return True, lambda row: str(row.get(x_col, ""))
            return False, None

        is_time, sort_key = _detect_time_series(x_col, [r.get(x_col) for r in table_data[:8]])
        if is_time and sort_key:
            table_data = sorted(table_data, key=sort_key)

        # Fix 8: Cap bar charts at top 15 rows by primary y-value (time-series uncapped)
        MAX_CHART_ROWS = 15
        if not is_time and len(table_data) > MAX_CHART_ROWS:
            primary_y = y_cols[0]
            def _y_sort(row):
                val = row.get(primary_y, 0)
                try:
                    cleaned = str(val).strip().translate(_STRIP_CHARS).strip() if val is not None else "0"
                    return float(cleaned) if cleaned else 0.0
                except (ValueError, TypeError):
                    return 0.0
            table_data = sorted(table_data, key=_y_sort, reverse=True)[:MAX_CHART_ROWS]

        x_values = [str(r.get(x_col, "")) for r in table_data]
        trace_type = "scatter" if is_time else "bar"
        traces = []
        for y_col in y_cols:
            y_values = []
            for row in table_data:
                val = row.get(y_col, 0)
                try:
                    cleaned = str(val).strip().translate(_STRIP_CHARS).strip() if val is not None else "0"
                    y_values.append(float(cleaned) if cleaned else 0.0)
                except (ValueError, TypeError):
                    y_values.append(0.0)
            trace = {"type": trace_type, "name": y_col, "x": x_values, "y": y_values}
            if is_time:
                trace["mode"] = "lines+markers"
            traces.append(trace)

        title = (user_query[:70] + "…") if user_query and len(user_query) > 70 else (user_query or "Data Chart")
        tick_angle = -45 if len(table_data) > 8 else 0
        layout: Dict = {
            "title": {"text": title},
            "xaxis": {"title": {"text": x_col}, "tickangle": tick_angle},
            "yaxis": {"title": {"text": y_cols[0] if len(y_cols) == 1 else "Value"}},
            "height": 420,
            "margin": {"t": 60, "b": 110, "l": 60, "r": 20},
            "legend": {"orientation": "h", "y": -0.25},
        }
        if not is_time:
            layout["barmode"] = "group" if len(y_cols) > 1 else "relative"

        return {"data": traces, "layout": layout}
    except Exception as exc:
        logger.warning("[chart_gen] chart generation failed: %s", exc)
        return None


def _extract_answer(raw: Any) -> str:
    logger.debug("_extract_answer: type=%s, raw=%s", type(raw).__name__, str(raw)[:300])
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        messages = raw.get("messages") or raw.get("message")
        if isinstance(messages, list) and messages:
            last = messages[-1]
            if hasattr(last, "content"):
                return last.content or ""
            if isinstance(last, dict):
                return last.get("content") or ""
        if "answer" in raw:
            return str(raw["answer"])
        if "result" in raw:
            return str(raw["result"])
    return str(raw)


async def _build_chart_vis(
    final_state: Dict,
    all_artifacts_snapshot: List[Dict],
    answer: str,
    query: str,
    llm: Any,
    request_id: str,
) -> tuple:
    """Try all 4 chart-generation priorities and return (chart_vis, extra_artifacts_to_append).

    Priorities 0-2 are synchronous; Priority 3 makes an LLM ainvoke call.
    Never raises — exceptions from the LLM call are caught and logged.
    """
    extra_artifacts: List[Dict] = []
    chart_vis: Optional[Dict] = None

    # Priority 0: Synthesis-time chart (already in state)
    synthesis_chart = (final_state or {}).get("chart_vis")
    if synthesis_chart:
        chart_vis = synthesis_chart
        extra_artifacts.append({"type": "chart", "title": "Chart", "data": chart_vis})
        logger.info("[%s] chart_gen: using synthesis chart from state", request_id)

    # Priority 1: SQL/tool table artifacts
    table_artifacts = [
        a for a in all_artifacts_snapshot
        if a.get("type") == "table"
        and isinstance(a.get("data"), list)
        and len(a.get("data", [])) >= 1
    ]
    if not chart_vis and table_artifacts:
        chart_vis = _generate_chart_from_table(table_artifacts[0]["data"], query)
        if chart_vis:
            extra_artifacts.append({"type": "chart", "title": "Chart", "data": chart_vis})

    # Priority 2: Markdown table in response text
    if not chart_vis and answer:
        md_rows = _parse_markdown_table(answer)
        if md_rows and len(md_rows) >= 1:
            logger.info("[%s] chart_gen: using markdown table (%d rows) from text response", request_id, len(md_rows))
            chart_vis = _generate_chart_from_table(md_rows, query)
            if chart_vis:
                extra_artifacts.append({"type": "chart", "title": "Chart", "data": chart_vis})
                extra_artifacts.append({"type": "table", "title": "Data", "data": md_rows})

    # Priority 3: LLM extraction — only if response has metric-context numbers (Fix 12)
    if not chart_vis and answer and len(_METRIC_NUMBER_RE.findall(answer)) >= 2:
        try:
            _extract_messages = [
                {
                    "role": "system",
                    "content": (
                        "Extract chartable numerical data from the analysis text below. "
                        "Return a JSON array where each object has one label field and one or more numeric fields. "
                        "Rules:\n"
                        "- Only extract data that forms a meaningful comparison (at least 2 items).\n"
                        "- All extracted metrics must be the SAME type — do not mix percentages with absolute counts "
                        "or units with dollar amounts in the same extraction. Pick the most prominent metric type.\n"
                        "- If the data is time-based (months, quarters, years), sort it chronologically.\n"
                        "- Strip currency symbols ($, £, €), percent signs (%), and thousands separators from numeric values.\n"
                        "- Do NOT invent data not explicitly stated in the text.\n"
                        "- If there are fewer than 2 comparable data points, or the numbers are incidental "
                        "(IDs, years in dates, counts of unrelated things), return [].\n"
                        "- Return ONLY a valid JSON array. No prose, no markdown fences.\n"
                        "Example: [{\"month\": \"January\", \"sales\": 120}, {\"month\": \"February\", \"sales\": 150}]"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"User query: {query}\n\n"
                        f"Response to extract data from:\n{answer[:3000]}"
                    ),
                },
            ]
            _extract_resp = await llm.ainvoke(_extract_messages)
            _raw = (_extract_resp.content or "").strip()
            if _raw.startswith("```"):
                _raw = "\n".join(_raw.split("\n")[1:]).rstrip("`").strip()
            _llm_rows = json.loads(_raw)
            if isinstance(_llm_rows, list) and len(_llm_rows) >= 2:
                logger.info("[%s] chart_gen: LLM extracted %d rows for chart", request_id, len(_llm_rows))
                chart_vis = _generate_chart_from_table(_llm_rows, query)
                if chart_vis:
                    extra_artifacts.append({"type": "chart", "title": "Chart", "data": chart_vis})
                    extra_artifacts.append({"type": "table", "title": "Data", "data": _llm_rows})
        except Exception as _exc:
            logger.warning("[%s] chart_gen: LLM extraction failed: %s", request_id, _exc)

    return chart_vis, extra_artifacts


async def _build_follow_up_questions(
    query: str,
    answer: str,
    llm: Any,
    request_id: str,
) -> List[str]:
    """Generate 3 follow-up questions for the given Q&A pair.

    Never raises — exceptions are caught and logged; returns [] on failure.
    """
    try:
        fuq_messages = [
            {
                "role": "system",
                "content": (
                    "Given this question and answer, suggest exactly 3 short follow-up "
                    "questions the user might ask next. "
                    "Return ONLY a valid JSON array of 3 strings. No prose, no markdown fences."
                ),
            },
            {
                "role": "user",
                "content": f"Question: {query}\n\nAnswer: {answer[:500]}",
            },
        ]
        fuq_resp = await llm.ainvoke(fuq_messages)
        fuq_raw = (fuq_resp.content or "").strip()
        if fuq_raw.startswith("```"):
            fuq_raw = "\n".join(fuq_raw.split("\n")[1:]).rstrip("`").strip()
        parsed_fuq = json.loads(fuq_raw)
        if isinstance(parsed_fuq, list):
            return [q for q in parsed_fuq if isinstance(q, str)][:3]
    except Exception as _fuq_exc:
        logger.warning("[%s] follow-up questions failed: %s", request_id, _fuq_exc)
    return []


async def _build_exec_summary(
    answer: str,
    llm: Any,
    request_id: str,
) -> str:
    """Generate a McKinsey answer-first executive briefing (Bottom line / Why / Implication)
    summarizing the final Analyst answer.

    Never raises — returns empty string on failure.
    """
    try:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are creating an executive briefing using the McKinsey \"answer-first\" "
                    "principle. Given the detailed analysis below, produce a short executive "
                    "summary with this exact structure:\n\n"
                    "Bottom line: One sentence stating the core conclusion/recommendation "
                    "upfront — not a summary of topics, but the actual \"so what.\"\n\n"
                    "Why: 2-3 supporting arguments, each as a bolded one-line headline followed "
                    "by 1-2 sentences of evidence (specific numbers/facts only — no exhaustive "
                    "detail).\n\n"
                    "Implication: One sentence on the single most important action to take now.\n\n"
                    "Rules:\n"
                    "- Lead with the conclusion, never build up to it.\n"
                    "- Each argument must earn its place — cut anything that doesn't directly "
                    "support the bottom line.\n"
                    "- Use concrete numbers from the input, not vague language.\n"
                    "- Omit minor details, caveats, and secondary findings — only surface what "
                    "changes a decision.\n"
                    "- End with one optional follow-up question offering to go deeper on a "
                    "specific point.\n"
                    "- Keep the entire output under 200 words."
                ),
            },
            {"role": "user", "content": f"Detailed input:\n\n{answer[:3000]}"},
        ]
        resp = await llm.ainvoke(messages)
        return (resp.content or "").strip()
    except Exception as exc:
        logger.warning("[%s] exec_summary failed: %s", request_id, exc)
    return ""


async def _ask_agent(
    base_url: str,
    agent_name: str,
    question: str,
    skill_type: Optional[str] = None,
    trace_context: Optional[Dict[str, str]] = None,
    **kwargs,  # absorbs event_queue, step_id forwarded by _call_one
) -> str:
    """
    Call agents API POST /ask using A2A protocol.

    Sends an A2ARequest and parses the A2AResponse, returning the result string.
    status=failed → raises RuntimeError; status=partial → returns result with warning logged.
    """
    task_id = (trace_context or {}).get("trace_id") or str(uuid.uuid4())

    # Build A2ARequest context dict: routing info + trace
    ctx: Dict[str, str] = {"agent_name": agent_name}
    if skill_type is not None:
        ctx["skill_type"] = skill_type
    if trace_context:
        ctx.update({k: v for k, v in trace_context.items() if v})

    payload: dict = {
        "task_id": task_id,
        "task": question,
        "context": ctx,
    }

    headers: Dict[str, str] = {}
    if task_id:
        headers["X-Request-ID"] = task_id

    # 5.4 — Log the full A2ARequest before it leaves the orchestrator boundary
    logger.info(
        "a2a_request_sent agent=%r task_id=%s task_preview=%r",
        agent_name, task_id, (payload.get("task") or "")[:120],
        extra=log_extra(
            event="a2a_request_sent",
            agent_name=agent_name,
            task_id=task_id,
            detail=(payload.get("task") or "")[:120],
        ),
    )

    try:
        client = get_http_client()
        r = await client.post(f"{base_url}/ask", json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
        a2a_status = data.get("status", "success")

        # 5.4 — Log the A2AResponse as soon as it arrives
        logger.info(
            "a2a_response_received agent=%r task_id=%s status=%s result_len=%d",
            agent_name, task_id, a2a_status,
            len(data.get("result") or data.get("answer") or ""),
            extra=log_extra(
                event="a2a_response_received",
                agent_name=agent_name,
                task_id=task_id,
                a2a_status=a2a_status,
                duration_ms=None,  # populated below if needed
            ),
        )

        if a2a_status == "failed":
            err = data.get("error") or "Agent returned failure status"
            logger.error("_ask_agent %s: A2A status=failed error=%s", agent_name, err)
            raise RuntimeError(f"Agent {agent_name} failed: {err}")
        if a2a_status == "partial":
            logger.warning("_ask_agent %s: A2A status=partial (timeout/incomplete)", agent_name)
        answer = _extract_answer(data.get("result") or data.get("answer"))
        if not answer:
            logger.warning("_ask_agent %s: empty result, raw=%s", agent_name, str(data)[:500])
        artifacts: List[Dict] = data.get("artifacts") or []
        # Capture skill metadata if the agent returns it
        skill_name = data.get("skill_name") or data.get("tool")
        skill_type = data.get("skill_type")
        mcp_server = data.get("mcp_server")
        return {
            "answer": answer,
            "artifacts": artifacts,
            "skill_name": skill_name,
            "skill_type": skill_type,
            "mcp_server": mcp_server,
            "tool_calls": data.get("tool_calls"),
            "prompt_tokens": data.get("prompt_tokens"),
            "completion_tokens": data.get("completion_tokens"),
            "total_tokens": data.get("total_tokens"),
            "estimated_cost_usd": data.get("estimated_cost_usd"),
            "tool_events": data.get("tool_events") or [],
        }
    except Exception as e:
        logger.error("_ask_agent %s failed: %s", agent_name, str(e), exc_info=True)
        raise


_TOOL_LABELS: Dict[str, str] = {
    "list_tables": "Listing tables in database",
    "MCP_list_tables": "Listing tables in database",
    "get_schema": "Fetching schema",
    "MCP_get_schema": "Fetching schema",
    "describe_table": "Fetching schema",
    "generate_sql": "Building SQL query",
    "MCP_generate_sql": "Building SQL query",
    "execute_query": "Running query",
    "MCP_execute_query": "Running query",
    "run_query": "Running query",
    "execute_sql": "Running query",
    "search_documents": "Searching documents",
    "vector_search": "Searching documents",
    "similarity_search": "Searching documents",
}


async def _ask_agent_streaming(
    base_url: str,
    agent_name: str,
    question: str,
    event_queue: asyncio.Queue,
    step_id: Optional[str] = None,
    skill_type: Optional[str] = None,
    trace_context: Optional[Dict[str, str]] = None,
    **kwargs,
) -> dict:
    """
    Streaming A2A call to POST /a2a/stream.

    Emits agent_tool_start and agent_tool_trace thought events to event_queue
    in real-time as the agent's internal tool calls happen. Returns the same
    dict shape as _ask_agent when the 'done' event arrives.

    Falls back to _ask_agent on 404 (agent doesn't support /a2a/stream yet).
    """
    url = f"{base_url}/a2a/stream"
    task_id = (trace_context or {}).get("trace_id") or str(uuid.uuid4())
    ctx: Dict[str, str] = {"agent_name": agent_name}
    if skill_type is not None:
        ctx["skill_type"] = skill_type
    if trace_context:
        ctx.update({k: v for k, v in trace_context.items() if v})

    payload = {"task_id": task_id, "task": question, "context": ctx}
    headers: Dict[str, str] = {"X-Request-ID": task_id}

    logger.info(
        "a2a_stream_request agent=%r task_id=%s task_preview=%r",
        agent_name, task_id, question[:120],
    )

    try:
        async with get_http_client().stream("POST", url, json=payload, headers=headers) as response:
            if response.status_code == 404:
                logger.info("_ask_agent_streaming: %s has no /a2a/stream, using sync /ask", agent_name)
                return await _ask_agent(
                    base_url, agent_name, question,
                    skill_type=skill_type, trace_context=trace_context,
                )
            response.raise_for_status()

            current_event_type = "message"
            seq_counter = 0

            async for line in response.aiter_lines():
                line = line.strip()
                if line.startswith("event:"):
                    current_event_type = line[6:].strip()
                elif line.startswith("data:"):
                    raw_data = line[5:].strip()
                    if not raw_data:
                        continue
                    try:
                        data = json.loads(raw_data)
                    except json.JSONDecodeError:
                        continue

                    if current_event_type == "tool_start":
                        seq_counter += 1
                        tool_name = data.get("tool", "")
                        label = _TOOL_LABELS.get(tool_name, tool_name)
                        await event_queue.put(format_sse_event("thought", {
                            "type": "agent_tool_start",
                            "agent": agent_name,
                            "step_id": step_id,
                            "seq": data.get("seq", seq_counter),
                            "tool": tool_name,
                            "label": label,
                            "args": data.get("args", {}),
                        }))

                    elif current_event_type == "tool_end":
                        tool_name = data.get("tool", "")
                        await event_queue.put(format_sse_event("thought", {
                            "type": "agent_tool_trace",
                            "agent": agent_name,
                            "step_id": step_id,
                            "seq": data.get("seq", seq_counter),
                            "tool": tool_name,
                            "args": data.get("args", {}),
                            "result": data.get("result", ""),
                            "truncated": data.get("truncated", False),
                        }))
                        if tool_name in ("generate_sql", "MCP_generate_sql") and data.get("sql"):
                            await event_queue.put(format_sse_event("thought", {
                                "type": "sql_generated",
                                "agent": agent_name,
                                "step_id": step_id,
                                "seq": data.get("seq", seq_counter),
                                "sql": data["sql"],
                            }))

                    elif current_event_type == "done":
                        a2a_status = data.get("status", "success")
                        if a2a_status == "failed":
                            err = data.get("error") or "Agent returned failure status"
                            logger.error("_ask_agent_streaming %s: done status=failed: %s", agent_name, err)
                            raise RuntimeError(f"Agent {agent_name} failed: {err}")
                        answer = _extract_answer(data.get("result") or data.get("answer"))
                        logger.info(
                            "a2a_stream_done agent=%r task_id=%s status=%s result_len=%d",
                            agent_name, task_id, a2a_status, len(answer or ""),
                        )
                        return {
                            "answer": answer,
                            "artifacts": data.get("artifacts") or [],
                            "skill_name": data.get("skill_name"),
                            "skill_type": data.get("skill_type"),
                            "mcp_server": data.get("mcp_server"),
                            "tool_calls": data.get("tool_calls"),
                            "prompt_tokens": data.get("prompt_tokens"),
                            "completion_tokens": data.get("completion_tokens"),
                            "total_tokens": data.get("total_tokens"),
                            "estimated_cost_usd": data.get("estimated_cost_usd"),
                            # Empty: tool events were already emitted in real-time above
                            "tool_events": [],
                        }

                    elif current_event_type == "error":
                        raise RuntimeError(
                            f"Agent {agent_name} streaming error: {data.get('error', '')}"
                        )

                    current_event_type = "message"

        raise RuntimeError(f"_ask_agent_streaming: {agent_name} stream ended without 'done' event")

    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            logger.info("_ask_agent_streaming: %s /a2a/stream returned 404, falling back to /ask", agent_name)
            return await _ask_agent(
                base_url, agent_name, question,
                skill_type=skill_type, trace_context=trace_context,
            )
        logger.error("_ask_agent_streaming %s HTTP error: %s", agent_name, exc, exc_info=True)
        raise
    except Exception as exc:
        logger.error("_ask_agent_streaming %s failed: %s", agent_name, exc, exc_info=True)
        raise


async def _ask_agent_with_heartbeat(
    base_url: str,
    agent_name: str,
    question: str,
    heartbeat_callback: Optional[Any] = None,
    skill_type: Optional[str] = None,
    trace_context: Optional[Dict[str, str]] = None,
) -> str:
    """
    Call agents API (A2A protocol) with periodic heartbeat to prevent SSE timeout.

    Sends an A2ARequest to POST /ask, draining the heartbeat_callback every 15 s
    while waiting for the response.
    """
    task_id = (trace_context or {}).get("trace_id") or str(uuid.uuid4())

    ctx: Dict[str, str] = {"agent_name": agent_name}
    if skill_type is not None:
        ctx["skill_type"] = skill_type
    if trace_context:
        ctx.update({k: v for k, v in trace_context.items() if v})

    payload: dict = {"task_id": task_id, "task": question, "context": ctx}
    headers: Dict[str, str] = {"X-Request-ID": task_id}

    async def make_request():
        client = get_http_client()
        r = await client.post(f"{base_url}/ask", json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
        status = data.get("status", "success")
        if status == "failed":
            err = data.get("error") or "Agent returned failure status"
            raise RuntimeError(f"Agent {agent_name} failed: {err}")
        if status == "partial":
            logger.warning("_ask_agent_heartbeat %s: A2A status=partial", agent_name)
        answer = _extract_answer(data.get("result") or data.get("answer"))
        if not answer:
            logger.warning("_ask_agent_heartbeat %s: empty result", agent_name)
        artifacts: List[Dict] = data.get("artifacts") or []
        return answer, artifacts

    request_task = asyncio.create_task(make_request())
    try:
        while not request_task.done():
            try:
                result = await asyncio.wait_for(asyncio.shield(request_task), timeout=15.0)
                return result
            except asyncio.TimeoutError:
                if heartbeat_callback:
                    await heartbeat_callback()
                continue
    except Exception:
        request_task.cancel()
        raise


def _trace_error_payload(request_id: str, message: str) -> dict:
    return {"message": message, "request_id": request_id, "trace_id": request_id}


def _infer_skill(agent_name: str) -> tuple[str, str]:
    """Derive (skill_name, skill_type) from agent name when the A2A response doesn't include them."""
    name = agent_name.lower()
    if "vector" in name or "rag" in name or "doc" in name:
        return "query_vector", "vector"
    if "analytics" in name or "report" in name or "metric" in name:
        return "query_analytics", "analytics"
    return "query_sql", "sql"


async def _save_agent_runs(
    responses: List[Dict],
    request_id: str,
    user_id: str,
    session_id: str,
    question: str,
    elapsed_ms: int,
    max_retries: int = 3,
) -> None:
    """Write one AgentRun row per agent invocation to agent_runs.

    Retries up to max_retries times with linear backoff so transient DB
    hiccups don't silently drop audit rows.  On total failure the full
    context is logged at ERROR so the row can be recovered from logs.
    """
    if not chat_persistence_enabled() or not responses:
        return

    last_exc: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            async with async_session_scope() as session:
                for resp in responses:
                    agent_name = (resp.get("agent_name") or "unknown")
                    # Use skill info from A2A response; infer from agent name if absent
                    skill_name = resp.get("skill_name")
                    skill_type = resp.get("skill_type")
                    if not skill_name or not skill_type:
                        inferred_name, inferred_type = _infer_skill(agent_name)
                        skill_name = skill_name or inferred_name
                        skill_type = skill_type or inferred_type
                    run = AgentRun(
                        trace_id=request_id[:64],
                        task_id=(resp.get("task_id") or request_id)[:64],
                        user_id=user_id[:64],
                        session_id=session_id[:64],
                        agent_name=agent_name[:128],
                        skill_name=skill_name[:128] if skill_name else None,
                        skill_type=skill_type[:64] if skill_type else None,
                        mcp_server=(resp.get("mcp_server") or "")[:128] or None,
                        outcome=resp.get("status") or "success",
                        duration_ms=elapsed_ms,
                        question_snippet=question[:200],
                        tool_calls=resp.get("tool_calls") or 0,
                        prompt_tokens=resp.get("prompt_tokens"),
                        completion_tokens=resp.get("completion_tokens"),
                        total_tokens=resp.get("total_tokens"),
                        estimated_cost_usd=resp.get("estimated_cost_usd"),
                    )
                    session.add(run)
                await session.flush()
            return  # success — exit retry loop
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "[%s] _save_agent_runs attempt %d/%d failed: %s",
                request_id, attempt, max_retries, exc,
            )
            if attempt < max_retries:
                await asyncio.sleep(0.2 * attempt)  # 0.2 s, 0.4 s

    logger.error(
        "[%s] _save_agent_runs failed after %d attempts — audit row lost. "
        "user=%s agents=%r question=%r error=%s",
        request_id, max_retries, user_id,
        [r.get("agent_name") for r in responses],
        question[:80], last_exc,
        exc_info=True,
    )


# ── Main SSE generator ────────────────────────────────────────────────────────

async def stream_query_response(
    request: MessageRequest,
    request_id: str,
    authenticated_user_id: str,
) -> AsyncGenerator[str, None]:
    """
    Stream SSE events for a user query using the LangGraph 3-node orchestrator.

    Flow:
      1. Fetch agent cards.
      2. Filter by request.collection if specified.
      3. Run the LangGraph pipeline (decompose → route → synthesise) in a
         background task, forwarding events via a shared asyncio.Queue.
      4. Drain the queue in real-time while the graph runs.
      5. Emit 'complete' with the final answer and data_sources.
    """
    start_time = time.time()
    base_url = QUERYLAB_AGENTS_API_URL
    orch_span_id = str(uuid.uuid4())

    try:
        yield format_sse_event(
            "status",
            {
                "stage": "initializing",
                "message": "Initializing...",
                "request_id": request_id,
                "trace_id": request_id,
            },
        )

        # ── 1. Fetch agent cards ──────────────────────────────────────────────
        try:
            agent_cards = await _fetch_agent_cards(base_url, request_id)
        except Exception as e:
            logger.warning("Fetch agent cards failed: %s, falling back to agent names", e)
            try:
                agent_names = await _fetch_agents(base_url, request_id)
                agent_cards = [
                    {"name": name, "description": f"Query the {name} data source"}
                    for name in agent_names
                ]
            except Exception as e2:
                logger.warning("Fetch agents failed: %s", e2)
                yield format_sse_event(
                    "error", _trace_error_payload(request_id, "Agents service unavailable")
                )
                return

        if not agent_cards:
            yield format_sse_event(
                "error",
                _trace_error_payload(
                    request_id,
                    "No agents found. Start the agents service with .agents configured.",
                ),
            )
            return

        # ── 2. Filter by collection if specified ─────────────────────────────
        _collections = [c.strip() for c in (request.collection or "").split(",") if c.strip()]
        if _collections:
            # Build reverse map: sub_source_name → agent_name (agent name maps to itself too)
            _sub_src_to_agent: dict[str, str] = {}
            for _card in agent_cards:
                _sub_src_to_agent[_card["name"]] = _card["name"]
                for _sub in (_card.get("sub_sources") or []):
                    _sub_src_to_agent[_sub] = _card["name"]
            # Resolve selected sub-sources to unique agent names (order preserved)
            _agent_names = list(dict.fromkeys(
                _sub_src_to_agent[col] for col in _collections if col in _sub_src_to_agent
            ))
            agent_cards = [c for c in agent_cards if c.get("name") in _agent_names]
            if not agent_cards:
                yield format_sse_event(
                    "error",
                    _trace_error_payload(
                        request_id, "No matching agents for the selected collection."
                    ),
                )
                return

        yield format_sse_event(
            "thought",
            {
                "type": "agents_loaded",
                "content": f"Loaded: {', '.join(c.get('name', '') for c in agent_cards)}",
            },
        )
        yield format_sse_event("status", {"stage": "preparing", "message": "Preparing graph..."})

        # ── 3. Build LLM and conversation context ─────────────────────────────
        api_key = os.getenv("OPENAI_API_KEY", "")
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        llm = ChatOpenAI(model=model, api_key=api_key, temperature=0)

        messages: List[Dict] = []
        for msg in (request.conversation_history or [])[-20:]:
            if isinstance(msg, dict) and "query" in msg:
                messages.append({"role": "user", "content": msg["query"]})
                resp = msg.get("response") or msg.get("data") or ""
                if isinstance(resp, str):
                    messages.append({"role": "assistant", "content": resp})
        messages.append({"role": "user", "content": request.query})

        # ── 4. Run LangGraph pipeline ─────────────────────────────────────────
        event_queue: asyncio.Queue = asyncio.Queue()

        # Convert approved_plan steps → pre-populated sub_tasks (skips decompose_node)
        pre_populated_sub_tasks: List[SubTask] = []
        approved_plan = getattr(request, "approved_plan", None)
        if approved_plan and approved_plan.steps:
            valid_agent_names = {c["name"] for c in agent_cards}
            # Build reverse map: sub_source_name → master agent name (safety net for
            # cases where the user picked a sub-source name in the AGENT(S) dropdown)
            _plan_sub_src_to_agent: dict = {}
            for _card in agent_cards:
                _plan_sub_src_to_agent[_card["name"]] = _card["name"]
                for _sub in (_card.get("sub_sources") or []):
                    _plan_sub_src_to_agent[_sub] = _card["name"]
            for step in approved_plan.steps:
                # agent_name may be comma-separated (user selected multiple agents for one step)
                raw_names = [a.strip() for a in (step.agent_name or "").split(",") if a.strip()]
                # Resolve each name (may be sub-source or master agent) → master agent name, deduplicated
                resolved = list(dict.fromkeys(
                    _plan_sub_src_to_agent[n] for n in raw_names if n in _plan_sub_src_to_agent
                ))
                for agent_name in resolved:
                    if agent_name not in valid_agent_names:
                        continue
                    task = step.task
                    # If user narrowed down sub-sources, prepend a hard constraint that
                    # overrides any "broad question → query all sources" rules in the agent.
                    sel = getattr(step, "selected_sub_sources", None) or []
                    if sel:
                        excluded = [s for s in (step.sub_sources or []) if s not in sel]
                        excluded_line = (
                            f"\nDO NOT query (user excluded): {', '.join(excluded)}"
                            if excluded else ""
                        )
                        task = (
                            f"[MANDATORY USER SUB-SOURCE RESTRICTION — overrides all agent rules]\n"
                            f"ONLY use these sub-sources: {', '.join(sel)}"
                            f"{excluded_line}\n"
                            f"This applies even when the question is broad. "
                            f"Do NOT apply any 'broad question → query all sources' rule here. "
                            f"Mark every non-listed sub-source as NO in any coverage checklist.\n"
                            f"---\n"
                            f"{task}"
                        )
                    if approved_plan.user_constraints:
                        task = f"{task}\n\nAdditional constraints: {approved_plan.user_constraints}"
                    pre_populated_sub_tasks.append(SubTask(
                        task_id=str(uuid.uuid4()),
                        agent_name=agent_name,
                        task=task,
                        step_id=step.step_id,
                    ))
            if pre_populated_sub_tasks:
                yield format_sse_event("thought", {
                    "type": "decompose",
                    "content": f"Using approved plan: {len(pre_populated_sub_tasks)} step(s)",
                    "sub_tasks": [{"agent": t["agent_name"], "task": t["task"]} for t in pre_populated_sub_tasks],
                    "from_plan": True,
                })

        # Append user constraints to query when present
        effective_query = request.query
        if approved_plan and approved_plan.user_constraints:
            effective_query = (
                f"{request.query}\n\nAdditional constraints from user: "
                f"{approved_plan.user_constraints}"
            )

        initial_state = {
            "user_query": effective_query,
            "user_context": {"conversation_history": messages},
            "sub_tasks": pre_populated_sub_tasks,
            "responses": [],
            "final_answer": None,
            "plan_id": approved_plan.plan_id if approved_plan else None,
        }

        lg_config = {
            "configurable": {
                "llm": llm,
                "agent_cards": agent_cards,
                "base_url": base_url,
                "event_queue": event_queue,
                "trace_id": request_id,
                "orch_span_id": orch_span_id,
                # Pass streaming client; falls back to sync /ask on 404
                "ask_agent_fn": _ask_agent_streaming,
            }
        }

        yield format_sse_event("status", {"stage": "processing", "message": "Analyzing question..."})

        graph = get_graph()
        graph_task = asyncio.create_task(graph.ainvoke(initial_state, config=lg_config))

        # ── 5. Drain event_queue while graph runs ─────────────────────────────
        # Poll every 20 ms; asyncio.sleep(0) yields control to the event loop
        # so graph_task (decompose / route / synthesise) can make progress.
        while not graph_task.done():
            await asyncio.sleep(0.02)
            # Drain all events currently in the queue
            while not event_queue.empty():
                try:
                    event_str = event_queue.get_nowait()
                    yield event_str
                except asyncio.QueueEmpty:
                    break

        # Final drain (any events produced right as graph_task completed)
        while not event_queue.empty():
            try:
                event_str = event_queue.get_nowait()
                yield event_str
            except asyncio.QueueEmpty:
                break

        # Retrieve final state (re-raises any exception from the graph)
        try:
            final_state = await graph_task
        except Exception as exc:
            logger.exception("[%s] Graph task failed: %s", request_id, exc)
            yield format_sse_event("error", _trace_error_payload(request_id, str(exc)))
            return

        answer: str = (final_state or {}).get("final_answer") or "No response generated."
        responses: List[Dict] = (final_state or {}).get("responses") or []

        # ── 6. Build data_sources from agents that were actually called ───────
        card_by_name: Dict[str, Dict] = {c.get("name"): c for c in agent_cards}
        data_sources: List[str] = []
        for resp in responses:
            # Prefer sources collected by route_node (from agent card)
            sources = resp.get("sources") or []
            if sources:
                data_sources.extend(sources)
            else:
                # Fallback: look up allowed_mcp_servers on the card
                card = card_by_name.get(resp.get("agent_name", ""), {})
                data_sources.extend(card.get("allowed_mcp_servers") or [])
        # Deduplicate while preserving insertion order
        data_sources = list(dict.fromkeys(data_sources))
        if not data_sources:
            # Final fallback: all discovered agent names
            data_sources = [c.get("name") for c in agent_cards if c.get("name")]

        # ── 7. Emit 'complete' event ──────────────────────────────────────────
        yield format_sse_event("status", {"stage": "complete", "message": "Done."})

        # Collect artifacts from all agent responses
        all_artifacts: List[Dict] = []
        for resp in (final_state.get("responses") or []):
            all_artifacts.extend(resp.get("artifacts") or [])

        # ── 7b + 7a. Chart generation and follow-up questions (parallel) ────────
        logger.info("[%s] chart_gen: all_artifacts=%d", request_id, len(all_artifacts))

        chart_result, follow_up_questions, exec_summary = await asyncio.gather(
            _build_chart_vis(final_state, list(all_artifacts), answer, request.query, llm, request_id),
            _build_follow_up_questions(request.query, answer, llm, request_id),
            _build_exec_summary(answer, llm, request_id),
            return_exceptions=True,
        )

        chart_vis: Optional[Dict] = None
        if isinstance(chart_result, Exception):
            logger.warning("[%s] chart_gen failed: %s", request_id, chart_result)
        else:
            chart_vis, extra_artifacts = chart_result
            all_artifacts.extend(extra_artifacts)

        if isinstance(follow_up_questions, Exception):
            logger.warning("[%s] follow-up questions failed: %s", request_id, follow_up_questions)
            follow_up_questions = []

        if isinstance(exec_summary, Exception):
            logger.warning("[%s] exec_summary failed: %s", request_id, exec_summary)
            exec_summary = ""

        final_response: Dict = {
            "query": request.query,
            "response": answer,
            "exec_summary": exec_summary or None,
            "sql_query": None,
            "data": None,
            "source": None,
            "data_sources": data_sources,
            "chart_vis": chart_vis,
            "artifacts": all_artifacts if all_artifacts else None,
            "follow_up_questions": follow_up_questions,
            "requires_user_input": None,
            "clarifying_questions": None,
            "missing_critical_info": None,
            "request_id": request_id,
            "trace_id": request_id,
            "collection": request.collection or None,
        }
        final_response = {k: v for k, v in final_response.items() if v is not None}
        # Always include follow_up_questions (even if empty list)
        final_response["follow_up_questions"] = follow_up_questions
        yield format_sse_event("complete", final_response)

        # ── 8. Persist chat turn ──────────────────────────────────────────────
        try:
            await save_chat_turn_async(
                user_id=authenticated_user_id,
                session_id=request.session_id,
                title=request.query,
                response_payload=dict(final_response),
                trace_id=request_id,
            )
        except Exception as err:
            logger.error("[%s] Error saving history: %s", request_id, err)

        # ── 9. Persist agent runs ─────────────────────────────────────────────
        try:
            elapsed_ms_now = int((time.time() - start_time) * 1000)
            await _save_agent_runs(
                responses=final_state.get("responses") or [],
                request_id=request_id,
                user_id=authenticated_user_id,
                session_id=request.session_id,
                question=request.query,
                elapsed_ms=elapsed_ms_now,
            )
        except Exception as err:
            logger.error("[%s] Error saving agent runs: %s", request_id, err)

    except Exception as e:
        logger.exception("Stream error: %s", e)
        yield format_sse_event("error", _trace_error_payload(request_id, str(e)))
    finally:
        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.info("[%s] Stream done in %dms", request_id, elapsed_ms)


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/query/stream")
async def stream_query(
    http_request: Request,
    body: MessageRequest,
    token_user: dict = Depends(verify_jwt_token),
):
    """Streaming query using agents API via LangGraph orchestrator. Requires Bearer JWT."""
    request_id = _get_request_id(http_request)
    ensure_user_matches_token(token_user, body.user_id)
    authenticated_user_id = str(token_user["sub"])
    # Propagate request_id as both trace_id and task_id so every log line in this
    # request context carries the same identifier (greppable across all layers).
    set_trace_context(request_id)
    set_task_id(request_id)
    set_user_context(user_id=authenticated_user_id, session_id=body.session_id)
    logger.info(
        "stream_query_start",
        extra=log_extra(
            event="query_stream",
            route="/api/v3/query/stream",
            trace_id=request_id,
            user_id=authenticated_user_id,
            session_id=body.session_id,
        ),
    )
    return StreamingResponse(
        stream_query_response(body, request_id, authenticated_user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Request-ID": request_id,
        },
    )


@router.post("/query")
async def blocking_query(
    http_request: Request,
    body: MessageRequest,
    token_user: dict = Depends(verify_jwt_token),
):
    """Non-streaming query: runs the orchestrator pipeline and returns a single JSON response."""
    request_id = _get_request_id(http_request)
    ensure_user_matches_token(token_user, body.user_id)
    authenticated_user_id = str(token_user["sub"])
    set_trace_context(request_id)
    set_task_id(request_id)
    set_user_context(user_id=authenticated_user_id, session_id=body.session_id)

    base_url = QUERYLAB_AGENTS_API_URL
    start_time = time.time()

    agent_cards = await _fetch_agent_cards(base_url, request_id)
    if not agent_cards:
        return {"response": {"response": "No agents available.", "data_sources": []}}

    collections = [c.strip() for c in (body.collection or "").split(",") if c.strip()]
    if collections:
        agent_cards = [c for c in agent_cards if c.get("name") in collections]

    api_key = os.getenv("OPENAI_API_KEY", "")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    llm = ChatOpenAI(model=model, api_key=api_key, temperature=0)

    orch_span_id = str(uuid.uuid4())
    graph = get_graph()
    initial_state = {
        "user_query": body.query,
        "user_context": {"user_id": authenticated_user_id, "session_id": body.session_id,
                         "conversation_history": body.conversation_history or []},
        "sub_tasks": [],
        "responses": [],
        "final_answer": None,
    }
    config = {
        "configurable": {
            "agent_cards": agent_cards,
            "base_url": base_url,
            "trace_id": request_id,
            "orch_span_id": orch_span_id,
            "llm": llm,
            "event_queue": asyncio.Queue(),
            "ask_agent_fn": _ask_agent,
        },
        "recursion_limit": 50,
    }
    final_state = await graph.ainvoke(initial_state, config=config)
    elapsed_ms = int((time.time() - start_time) * 1000)
    answer = final_state.get("final_answer") or "No answer generated."

    agent_responses = final_state.get("responses") or []
    data_sources = list(dict.fromkeys(
        r.get("agent_name") for r in agent_responses if r.get("agent_name")
    ))

    final_response = {
        "response": answer,
        "data_sources": data_sources,
        "collection": body.collection or None,
        "request_id": request_id,
        "trace_id": request_id,
    }

    # Persist chat history
    try:
        await save_chat_turn_async(
            user_id=authenticated_user_id,
            session_id=body.session_id,
            title=body.query,
            response_payload={"query": body.query, **final_response},
            trace_id=request_id,
        )
    except Exception as err:
        logger.error("[%s] Error saving history: %s", request_id, err)

    # Persist agent run records
    try:
        await _save_agent_runs(
            responses=agent_responses,
            request_id=request_id,
            user_id=authenticated_user_id,
            session_id=body.session_id,
            question=body.query,
            elapsed_ms=elapsed_ms,
        )
    except Exception as err:
        logger.error("[%s] Error saving agent runs: %s", request_id, err)

    return {"response": final_response}
