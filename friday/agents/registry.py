"""
Agents registry — delegate_* stubs with risk tags.
risk:read = read-only, risk:write = state-changing, risk:critical = privileged.
"""

from __future__ import annotations

from typing import Any

REGISTRY: dict[str, dict[str, str]] = {
    "news": {"risk": "risk:read", "description": "Headlines brief + world monitor."},
    "memory": {"risk": "risk:read", "description": "Honcho recall for the LiveKit room."},
    "writer": {"risk": "risk:write", "description": "Record memory / draft messages."},
    "system": {"risk": "risk:critical", "description": "Privileged system actions; confirm first."},
}


def delegate_news(query: str = "world news", **kwargs: Any) -> str:
    """Delegate news brief — risk:read."""
    return f"delegate_news queued query={query!r} (risk:read)"


def delegate_memory(query: str, room: str = "default", **kwargs: Any) -> str:
    """Delegate memory recall — risk:read."""
    try:
        from app.honcho_adapter import recall as honcho_recall

        return str(honcho_recall(query, room=room))
    except Exception as exc:
        return f"memory delegate unavailable: {exc}"


def delegate_writer(content: str, room: str = "default", **kwargs: Any) -> str:
    """Delegate memory write / drafting — risk:write."""
    try:
        from app.honcho_adapter import record as honcho_record

        honcho_record(content, room=room, peer=kwargs.get("peer", "friday"))
        return "ok"
    except Exception as exc:
        return f"writer delegate unavailable: {exc}"


def delegate_system(action: str, **kwargs: Any) -> str:
    """Delegate privileged system action — risk:critical. Confirm first."""
    return f"delegate_system received action={action!r} (risk:critical) — confirmation required"


def register(mcp):
    """Expose delegate_* stubs as MCP tools (follows register(mcp) pattern)."""

    @mcp.tool()
    def agent_news(query: str = "world news") -> str:
        """Delegate to news agent — risk:read."""
        return delegate_news(query)

    @mcp.tool()
    def agent_memory(query: str, room: str = "default") -> str:
        """Delegate to memory agent — risk:read."""
        return delegate_memory(query, room=room)

    @mcp.tool()
    def agent_writer(content: str, room: str = "default") -> str:
        """Delegate to writer agent — risk:write."""
        return delegate_writer(content, room=room)

    @mcp.tool()
    def agent_system(action: str) -> str:
        """Delegate to system agent — risk:critical."""
        return delegate_system(action)
