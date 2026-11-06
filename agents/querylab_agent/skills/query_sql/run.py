"""
query_sql skill: runs a SQL ReAct agent provided by the runtime.

Data and connections come from MCP or another backend (see SKILL.md).
This module is a thin wrapper: it expects to receive a configured
callable that runs the SQL agent, or a configured db executor and
metadata from the caller, which gets connection config from the MCP
layer / agent context.
"""
from typing import Any, Dict

from querylab_agent.skills.base import BaseSkill


class QuerySQLSkill(BaseSkill):
    """
    Stateless skill that runs the SQL ReAct flow.
    MCP servers used are documented in SKILL.md; connection config is
    provided at runtime via context / registry, not hardcoded here.
    """

    @property
    def name(self) -> str:
        return "query_sql"

    async def run(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run SQL ReAct for the given question.

        Expected inputs:
            - question: str (required)
            - context: dict (optional) with user_id, session_id, org_id
            - data_source_name: str (optional)
            - invoke_sql_agent: async callable (required) that runs the SQL agent
            - data_source_name: str (optional)

        This skill intentionally does not import any backend implementation.
        """
        question = inputs.get("question") or ""
        if not question:
            return {
                "result": "",
                "sql_query": None,
                "data": None,
                "sources": [],
                "error": "Missing input: question",
            }

        # Runner can inject an async callable that runs the SQL ReAct agent.
        # This keeps this package independent of any specific backend implementation.
        invoke_sql_agent = inputs.get("invoke_sql_agent")
        if callable(invoke_sql_agent):
            raw = await invoke_sql_agent(question, inputs)
            messages = raw.get("messages", [])
            last_content = ""
            for m in reversed(messages):
                if hasattr(m, "content") and m.content:
                    last_content = m.content if isinstance(m.content, str) else str(m.content)
                    break
            return {
                "result": last_content,
                "sql_query": raw.get("sql_query"),
                "data": raw.get("data"),
                "sources": [inputs.get("data_source_name") or "default"],
            }

        # No injected agent and no backend-specific fallback: clearly report that nothing is configured.
        return {
            "result": "query_sql skill requires an invoke_sql_agent callable in inputs; no default SQL agent is configured.",
            "sql_query": None,
            "data": None,
            "sources": [],
            "error": "No SQL agent available",
        }
