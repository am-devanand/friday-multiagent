"""
Docs tools — thin FastMCP namespace stub (Google Docs / Drive).
===============================================================
Mount pattern:

    from fastmcp import FastMCP
    from friday.tools import docs
    docs_sub = FastMCP("docs")
    docs.register(docs_sub)
    master.mount(docs_sub, namespace="docs")  # -> docs_read, ...

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
    """Return a namespaced FastMCP sub-server for `master.mount(sub, namespace='docs')`."""
    from fastmcp import FastMCP

    sub = FastMCP("docs")
    register(sub)
    return sub


def register(mcp):
    @mcp.tool()
    async def read(doc_id: str) -> str:
        """Read a doc by id. risk:read."""
        if not _configured():
            return f"{NOT_CONFIGURED}:read"
        return f"[stub] docs read: {doc_id!r}"

    @mcp.tool()
    async def create(title: str, content: str = "") -> str:
        """Create a doc. risk:write."""
        if not _configured():
            return f"{NOT_CONFIGURED}:create"
        return f"[stub] docs create {title!r} ({len(content)} chars)"

    @mcp.tool()
    async def append(doc_id: str, text: str) -> str:
        """Append text to a doc. risk:write."""
        if not _configured():
            return f"{NOT_CONFIGURED}:append"
        return f"[stub] docs append {doc_id!r} ({len(text)} chars)"

    @mcp.tool()
    async def share(doc_id: str, email: str) -> str:
        """Share a doc (permission change). risk:critical."""
        if not _configured():
            return f"{NOT_CONFIGURED}:share"
        return f"[stub] docs share {doc_id!r} -> {email!r}"
