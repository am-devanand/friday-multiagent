"""
Gmail tools — thin FastMCP namespace stub.
==========================================
Mount pattern (in server bootstrap):

    from fastmcp import FastMCP
    from friday.tools import gmail
    gmail_sub = FastMCP("gmail")
    gmail.register(gmail_sub)
    master.mount(gmail_sub, namespace="gmail")  # -> gmail_search, gmail_read, ...

Env vars (stubs — real OAuth NOT implemented):
    GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

Risk tags follow naming convention risk:<read|write|critical> in docstrings.
Without OAuth creds every tool returns NOT_CONFIGURED:<tool>.
"""

from __future__ import annotations

import os

NOT_CONFIGURED = "NOT_CONFIGURED: set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET"


def _configured() -> bool:
    return bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))


def make_sub_server():
    """Return a namespaced FastMCP sub-server for `master.mount(sub, namespace='gmail')`."""
    from fastmcp import FastMCP

    sub = FastMCP("gmail")
    register(sub)
    return sub


def register(mcp):
    @mcp.tool()
    async def search(query: str, max_results: int = 10) -> str:
        """Search Gmail. risk:read."""
        if not _configured():
            return f"{NOT_CONFIGURED}:search"
        return f"[stub] gmail search: {query!r} (max={max_results})"

    @mcp.tool()
    async def read(message_id: str) -> str:
        """Read a Gmail message by id. risk:read."""
        if not _configured():
            return f"{NOT_CONFIGURED}:read"
        return f"[stub] gmail read: {message_id!r}"

    @mcp.tool()
    async def send(to: str, subject: str, body: str) -> str:
        """Send an email. risk:write."""
        if not _configured():
            return f"{NOT_CONFIGURED}:send"
        return f"[stub] gmail send to={to!r} subject={subject!r}"

    @mcp.tool()
    async def draft(to: str, subject: str, body: str) -> str:
        """Create a draft (no send). risk:write."""
        if not _configured():
            return f"{NOT_CONFIGURED}:draft"
        return f"[stub] gmail draft to={to!r} subject={subject!r}"

    @mcp.tool()
    async def label(message_id: str, label: str) -> str:
        """Apply a label to a message. risk:critical."""
        if not _configured():
            return f"{NOT_CONFIGURED}:label"
        return f"[stub] gmail label {message_id!r} -> {label!r}"
