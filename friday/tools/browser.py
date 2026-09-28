"""
Browser tools — thin FastMCP stub (no namespace mount required).
=================================================================
Registered directly on master (no OAuth). Follows web.py async pattern.

Risk tags risk:<read|write|critical> in docstrings.
"""

from __future__ import annotations


def register(mcp):
    @mcp.tool()
    async def open(url: str) -> str:
        """Open a URL in the host browser. risk:write."""
        import webbrowser

        try:
            webbrowser.open(url)
            return f"Opened {url} on the host display."
        except Exception as exc:
            return f"Unable to open browser: {exc}"

    @mcp.tool()
    async def fetch_text(url: str) -> str:
        """Fetch raw text of a URL (first 4k chars). risk:read."""
        import httpx

        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.text[:4000]

    @mcp.tool()
    async def screenshot(url: str) -> str:
        """Capture a screenshot (stub — headless runner not wired). risk:read."""
        return f"[stub] screenshot queued for: {url!r}"

    @mcp.tool()
    def tabs() -> list:
        """List open tabs (stub, sync). risk:read."""
        return []
