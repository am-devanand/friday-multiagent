"""
iMessage ingress — thin BlueBubbles webhook stub -> master_router.run_turn.
============================================================================
BlueBubbles: self-hosted relay exposing POST /api/v1/message/text to send,
and a `new-message` webhook event pushed to us at POST /imessage/webhook.

Env vars:
    BLUEBUBBLES_URL      e.g. http://mac-mini:1234
    BLUEBUBBLES_PASSWORD API password for the BlueBubbles server

Flow: receive new-message webhook -> extract sender + text ->
master_router.run_turn(channel="imessage", ...) -> POST back via
{BLUEBUBBLES_URL}/api/v1/message/text with address + message.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger("friday-channels-imessage")

BLUEBUBBLES_URL = os.getenv("BLUEBUBBLES_URL", "").rstrip("/")
BLUEBUBBLES_PASSWORD = os.getenv("BLUEBUBBLES_PASSWORD", "")


def _configured() -> bool:
    return bool(BLUEBUBBLES_URL and BLUEBUBBLES_PASSWORD)


async def _send(address: str, message: str) -> None:
    if not _configured():
        logger.warning("NOT_CONFIGURED: set BLUEBUBBLES_URL/BLUEBUBBLES_PASSWORD")
        return
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(
            f"{BLUEBUBBLES_URL}/api/v1/message/text",
            params={"password": BLUEBUBBLES_PASSWORD},
            json={"address": address, "message": message},
        )


async def handle_webhook(payload: dict) -> str:
    """Handle one BlueBubbles `new-message` payload; return reply text."""
    data = payload.get("data", payload)
    text = (data.get("text") or "").strip()
    sender = data.get("sender") or data.get("address") or data.get("handle") or ""
    if not text or data.get("isFromMe"):
        return "ignored"
    if not _configured():
        return "NOT_CONFIGURED: set BLUEBUBBLES_URL/BLUEBUBBLES_PASSWORD"
    from master_router import run_turn  # sibling-agent router

    reply = await run_turn(channel="imessage", user=str(sender), text=text)
    await _send(str(sender), reply)
    return reply


try:  # Optional FastAPI router.
    from fastapi import APIRouter, BackgroundTasks, Request

    router = APIRouter(tags=["imessage"])

    @router.post("/imessage/webhook")
    async def imessage_webhook(request: Request, background: BackgroundTasks):
        payload = await request.json()
        if payload.get("type") not in (None, "new-message"):
            return {"ok": True, "ignored": True}
        background.add_task(handle_webhook, payload)
        return {"ok": True}
except ImportError:  # pragma: no cover
    router = None
