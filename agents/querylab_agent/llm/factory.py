"""
LLM factory for agents.

Use this for orchestrator and domain agents that need an LLM. For the query_sql
skill we delegate to backend_sql/querylab_sql (SQL ReAct agent has its own LLM init);
this factory is for agent-level reasoning (routing, synthesis, etc.).
"""
from typing import Any, Optional

_llm_cache: dict[str, Any] = {}


def get_llm(
    provider: str = "openai",
    model_name: Optional[str] = None,
    temperature: Optional[float] = None,
    streaming: bool = False,
    **kwargs: Any,
) -> Any:
    """
    Return a LangChain-compatible LLM instance.

    Prefer reusing backend_sql's InitializeLLM when running inside the same
    process (e.g. same settings). This factory is for standalone agent usage.
    """
    key = f"{provider}:{model_name or 'default'}:{temperature}:{streaming}"
    if key not in _llm_cache:
        if provider == "openai":
            from langchain_openai import ChatOpenAI
            import os

            _llm_cache[key] = ChatOpenAI(
                model=model_name or os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
                temperature=temperature if temperature is not None else 0.0,
                api_key=kwargs.get("api_key") or os.environ.get("OPENAI_API_KEY"),
                streaming=streaming,
            )
        else:
            raise ValueError(f"Unknown LLM provider: {provider}")
    return _llm_cache[key]
