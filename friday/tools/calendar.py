"""
Calendar tools — thin FastMCP namespace stub.
=============================================
Mount pattern:

    from fastmcp import FastMCP
    from friday.tools import calendar
    cal_sub = FastMCP("calendar")
    calendar.register(cal_sub)
    master.mount(cal_sub, namespace="calendar")  # -> calendar_list, ...

Env vars (stubs — real OAuth NOT implemented):
    GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

Risk tags risk:<read|write|critical> in docstrings.
Without OAuth creds every tool returns NOT_CONFIGURED:<tool>.
"""

from __future__ import annotations

import os

NOT_CONFIGURED = "NOT_CONFIGURED: set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET"


def _configured() -> bool:
    return bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))


def make_sub_server():
    """Return a namespaced FastMCP sub-server for `master.mount(sub, namespace='calendar')`."""
    from fastmcp import FastMCP

    sub = FastMCP("calendar")
    register(sub)
    return sub


def register(mcp):
    @mcp.tool()
    async def list(day: str = "today") -> str:
        """List events for a day. risk:read."""
        if not _configured():
            return f"{NOT_CONFIGURED}:list"
        return f"[stub] calendar list: {day!r}"

    @mcp.tool()
    async def create(title: str, start: str, end: str = "") -> str:
        """Create a calendar event. risk:write."""
        if not _configured():
            return f"{NOT_CONFIGURED}:create"
        return f"[stub] calendar create {title!r} {start!r}->{end!r}"

    @mcp.tool()
    async def delete(event_id: str) -> str:
        """Delete a calendar event. risk:critical."""
        if not _configured():
            return f"{NOT_CONFIGURED}:delete"
        return f"[stub] calendar delete: {event_id!r}"

    @mcp.tool()
    def now() -> str:
        """Return today's date (sync, no creds needed). risk:read."""
        import datetime

        return datetime.date.today().isoformat()
