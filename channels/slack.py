"""
Slack ingress — thin stub -> master_router.run_turn.
=====================================================
Events: app_mention + message.im (requires scopes
`app_mentions:read`, `chat:write`).

Env vars:
    SLACK_BOT_TOKEN     xoxb-... bot token (chat:write)
    SLACK_SIGNING_SECRET request signature verification

Wiring (FastAPI host app):

    from channels.slack import router
    app.include_router(router)

Inbound flow: Slack event -> verify signing secret -> strip <@mention> ->
master_router.run_turn(channel="slack", user=<id>, text=<clean>) ->
chat.postMessage back to the channel.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time

logger = logging.getLogger("friday-channels-slack")

SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")
SLACK_SIGNING_SECRET = os.getenv("SLACK_SIGNING_SECRET", "")


def _verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
    """Verify Slack request signature (stub returns False if secret missing)."""
    if not SLACK_SIGNING_SECRET:
        return False
    basestring = f"v0:{timestamp}:{body.decode('utf-8', 'replace')}"
    digest = hmac.new(
        SLACK_SIGNING_SECRET.encode(), basestring.encode(), hashlib.sha256
    ).hexdigest()
    if abs(time.time() - int(timestamp or 0)) > 60 * 5:
        return False
    return hmac.compare_digest(f"v0={digest}", signature or "")


def _strip_mention(text: str) -> str:
    import re

    return re.sub(r"<@[A-Z0-9]+>\s*", "", text or "").strip()


async def handle_event(event: dict) -> str:
    """Handle one Slack event dict; call master_router.run_turn and return reply."""
    if event.get("type") not in ("app_mention", "message"):
        return "ignored"
    if event.get("bot_id"):
        return "ignored"  # never reply to ourselves
    text = _strip_mention(event.get("text", ""))
    if not text:
        return "ignored"
    if not SLACK_BOT_TOKEN:
        return "NOT_CONFIGURED: set SLACK_BOT_TOKEN/SLACK_SIGNING_SECRET"
    from master_router import run_turn  # sibling-agent router

    return await run_turn(channel="slack", user=event.get("user", "slack"), text=text)


try:  # Optional FastAPI router — only active when fastapi installed.
    from fastapi import APIRouter, BackgroundTasks, Header, Request

    router = APIRouter(tags=["slack"])

    @router.post("/slack/events")
    async def slack_events(
        request: Request,
        background: BackgroundTasks,
        x_slack_signature: str = Header(default=""),
        x_slack_request_timestamp: str = Header(default=""),
    ):
        body = await request.body()
        if not _verify_slack_signature(body, x_slack_request_timestamp, x_slack_signature):
            return {"ok": False, "error": "bad_signature"}
        payload = await request.json()
        if payload.get("type") == "url_verification":  # Slack handshake
            return {"challenge": payload.get("challenge")}
        event = payload.get("event", {})
        background.add_task(handle_event, event)
        return {"ok": True}
except ImportError:  # pragma: no cover — import-time fallback for py_compile envs
    router = None
