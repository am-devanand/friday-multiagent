"""
Skills registry — SKILLS dict + register_skills(mcp).
Each skill module follows the register(mcp) pattern with @mcp.tool.
Risk tags: risk:read / risk:write / risk:critical in docstrings.
"""

from __future__ import annotations

SKILLS: dict = {}


def _skill(name: str, risk: str, description: str):
    def deco(fn):
        SKILLS[name] = {
            "risk": risk,
            "description": description,
            "handler": fn,
        }
        return fn

    return deco


@_skill("news_brief", "risk:read", "Fetch headlines and give a short spoken brief.")
def skill_news_brief(mcp, query: str = "world news") -> None:  # pragma: no cover - registered at runtime
    pass


@_skill("world_monitor", "risk:read", "Open the visual world dashboard.")
def skill_world_monitor(mcp) -> None:  # pragma: no cover - registered at runtime
    pass


@_skill("memory_recall", "risk:read", "Recall Honcho memory for the LiveKit room.")
def skill_memory_recall(mcp, query: str, room: str = "default") -> None:  # pragma: no cover
    pass


@_skill("memory_record", "risk:write", "Record content into Honcho room memory.")
def skill_memory_record(mcp, content: str, room: str = "default") -> None:  # pragma: no cover
    pass


@_skill("system_control", "risk:critical", "Privileged system actions; confirm first.")
def skill_system_control(mcp, action: str) -> None:  # pragma: no cover
    pass


def register_skills(mcp):
    """Register all skills onto the MCP server instance."""

    @mcp.tool()
    def news_brief(query: str = "world news") -> str:
        """Fetch headlines brief — risk:read."""
        return f"news_brief skill queued for query={query!r} (risk:read)"

    @mcp.tool()
    def world_monitor() -> str:
        """Open the world monitor dashboard — risk:read."""
        return "world_monitor skill queued (risk:read)"

    @mcp.tool()
    def memory_recall(query: str, room: str = "default") -> str:
        """Recall Honcho memory — risk:read."""
        try:
            from app.honcho_adapter import recall as honcho_recall

            return str(honcho_recall(query, room=room))
        except Exception as exc:
            return f"memory recall unavailable: {exc}"

    @mcp.tool()
    def memory_record(content: str, room: str = "default", peer: str = "user") -> str:
        """Record Honcho memory — risk:write."""
        try:
            from app.honcho_adapter import record as honcho_record

            honcho_record(content, room=room, peer=peer)
            return "ok"
        except Exception as exc:
            return f"memory record unavailable: {exc}"

    @mcp.tool()
    def system_control(action: str) -> str:
        """Privileged system action — risk:critical. Confirm with user first."""
        return f"system_control received action={action!r} (risk:critical) — confirmation required"


def register(mcp):
    """Alias following the register(mcp) pattern."""
    return register_skills(mcp)
