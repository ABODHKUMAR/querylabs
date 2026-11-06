"""Save chat turns (same behavior as querylab_sql create_chat_message_async)."""
import logging
import os
from typing import Any, Dict, Optional

from sqlalchemy import select

from orchestrator.config import chat_persistence_enabled
from orchestrator.persistence.db import async_session_scope
from orchestrator.persistence.models import ChatHistory, ChatMessage

logger = logging.getLogger(__name__)


async def _generate_title(query: str) -> str:
    """Summarise a user query as a ≤5-word title using the configured LLM."""
    try:
        from openai import AsyncOpenAI  # import here to avoid hard dep at module load
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        resp = await client.chat.completions.create(
            model=model,
            messages=[{
                "role": "user",
                "content": (
                    "Summarize the following question as a title in 5 words or fewer. "
                    "Reply with only the title — no quotes, no punctuation at the end.\n\n"
                    f"Question: {query}"
                ),
            }],
            max_tokens=20,
            temperature=0.3,
        )
        title = resp.choices[0].message.content.strip().strip('"').strip("'")
        return title[:255] if title else query[:50]
    except Exception as exc:
        logger.warning("Title generation failed (%s); using raw query", exc)
        return query[:50]


async def _get_history_id(session, user_id: str, session_id: str) -> Optional[str]:
    stmt = (
        select(ChatHistory.hist_id)
        .where(ChatHistory.user_id == user_id)
        .where(ChatHistory.session_id == session_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def save_chat_turn_async(
    user_id: str,
    session_id: str,
    title: str,
    response_payload: Dict[str, Any],
    trace_id: str,
) -> Optional[str]:
    """
    Append a message to chat_messages (create chat_history row if needed).
    Returns new message id or None on skip/failure.
    On first message in a session, calls LLM to generate a short title.
    """
    if not chat_persistence_enabled():
        logger.debug("Chat persistence disabled; skipping save")
        return None
    try:
        async with async_session_scope() as session:
            hist_id = await _get_history_id(session, user_id, session_id)
            if hist_id is None:
                generated_title = await _generate_title(title)
                new_history = ChatHistory(
                    user_id=user_id,
                    session_id=session_id,
                    title=generated_title,
                )
                session.add(new_history)
                await session.flush()
                hist_id = new_history.hist_id
                logger.debug(
                    "Created chat_history hist_id=%s title=%r", hist_id, generated_title
                )

            context = {"response": response_payload, "trace_id": trace_id}
            new_message = ChatMessage(hist_id=hist_id, context=context)
            session.add(new_message)
            await session.flush()
            mid = new_message.id
            logger.debug("Saved chat_message id=%s hist_id=%s trace_id=%s", mid, hist_id, trace_id)
            return str(mid) if mid is not None else None
    except Exception as e:
        logger.error("Error saving chat history: %s", e, exc_info=True)
        return None
