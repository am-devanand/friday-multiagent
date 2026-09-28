"""
Router — route user intent to delegate_* stubs.
Risk tags: risk:read / risk:write / risk:critical.
"""

from __future__ import annotations

from typing import Any

from friday.agents.registry import (
    delegate_memory,
    delegate_news,
    delegate_system,
    delegate_writer,
)


def route(intent: str, payload: dict[str, Any] | None = None) -> str:
    """Route intent to the matching delegate_* stub."""
    payload = payload or {}
    intent = (intent or "").lower().strip()
    if intent in ("news", "brief", "world_news"):
        return delegate_news(payload.get("query", "world news"))
    if intent in ("memory", "recall"):
        return delegate_memory(payload.get("query", ""), room=payload.get("room", "default"))
    if intent in ("write", "record", "draft"):
        return delegate_writer(payload.get("content", ""), room=payload.get("room", "default"))
    if intent in ("system", "control", "privileged"):
        return delegate_system(payload.get("action", ""))
    # Default: memory recall — risk:read.
    return delegate_memory(payload.get("query", intent), room=payload.get("room", "default"))


def register(mcp):
    """Expose router as an MCP tool (follows register(mcp) pattern)."""

    @mcp.tool()
    def route_intent(intent: str, query: str = "", room: str = "default") -> str:
        """Route intent to delegate_* agent — risk:read (escalates per target)."""
        return route(intent, {"query": query, "room": room})
