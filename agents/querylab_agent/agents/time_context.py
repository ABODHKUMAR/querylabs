"""Shared helper for grounding agent/LLM prompts in the real current date.

Without this, relative time phrases in a user question ("this quarter", "last
month", "YTD") are resolved by the LLM against whatever date it associates
with "now" from its own training, not the actual current date — producing
hallucinated years in generated SQL and search queries.
"""
from datetime import datetime, timezone


def current_date_context() -> str:
    """One-line system-prompt snippet anchoring relative time phrases to the real current date."""
    now = datetime.now(timezone.utc)
    quarter = (now.month - 1) // 3 + 1
    return (
        f"Today's date is {now:%Y-%m-%d} (Q{quarter} {now.year}). "
        "Resolve relative time phrases (\"this quarter\", \"last month\", \"YTD\", \"this year\") "
        "against this date — never guess or assume a different year."
    )
