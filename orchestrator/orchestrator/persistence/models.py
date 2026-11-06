"""
ORM models mirroring querylab_sql chat_history / chat_messages (MySQL-compatible defaults).
"""
import uuid

from sqlalchemy import CHAR, Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def _uuid() -> str:
    return str(uuid.uuid4())


class ChatHistory(Base):
    __tablename__ = "chat_history"

    hist_id = Column(CHAR(36), primary_key=True, nullable=False, default=_uuid)
    user_id = Column(String(255), nullable=False)
    session_id = Column(String(255), nullable=True)
    title = Column(String(255), nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    is_pinned = Column(Boolean, nullable=False, default=False, server_default="0")

    messages = relationship("ChatMessage", back_populates="history", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(CHAR(36), primary_key=True, nullable=False, default=_uuid)
    hist_id = Column(CHAR(36), ForeignKey("chat_history.hist_id", ondelete="CASCADE"), nullable=False)
    context = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    history = relationship("ChatHistory", back_populates="messages")


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trace_id = Column(String(64), nullable=False, index=True)
    task_id = Column(String(64), nullable=False)
    user_id = Column(String(64), nullable=False, index=True)
    org_id = Column(String(64), nullable=True)
    session_id = Column(String(64), nullable=False)
    agent_name = Column(String(128), nullable=False, index=True)
    skill_name = Column(String(128), nullable=True)
    skill_type = Column(String(64), nullable=True)
    mcp_server = Column(String(128), nullable=True)
    outcome = Column(String(16), nullable=False)
    tool_calls = Column(Integer, nullable=False, default=0, server_default="0")
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    estimated_cost_usd = Column(Float, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error_type = Column(String(128), nullable=True)
    question_snippet = Column(String(200), nullable=True)
    feedback = Column(String(10), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
