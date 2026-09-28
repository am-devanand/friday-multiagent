"""
Telegram ingress — thin stub -> master_router.run_turn.
=======================================================
Webhook: https://<host>/telegram/webhook (set via setWebhook with secret).

Env vars:
    TELEGRAM_TOKEN          Bot token from @BotFather
    TELEGRAM_WEBHOOK_SECRET Shared secret sent as X-Telegram-Bot-Api-Secret-Token

Flow: verify secret (hmac compare) -> BackgroundTasks -> run_turn ->
split reply into 4096-char chunks -> sendMessage per chunk.
"""

from __future__ import annotations

import hmac
import logging
import os

import httpx

logger = logging.getLogger("friday-channels-telegram")

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
TELEGRAM_API = (
    f"https://api.telegram.org/bot{TELEGRAM_TOKEN}" if TELEGRAM_TOKEN else ""
)
MAX_CHUNK = 4096


def _secret_ok(provided: str) -> bool:
    if not TELEGRAM_WEBHOOK_SECRET:
        return False
    return hmac.compare_digest(provided or "", TELEGRAM_WEBHOOK_SECRET)


def split_telegram(text: str, limit: int = MAX_CHUNK) -> list[str]:
    """Split a reply into <=4096-char Telegram-safe chunks."""
    text = text or ""
    return [text[i : i + limit] for i in range(0, len(text), limit)] or [""]


async def _send(chat_id: int | str, text: str) -> None:
    if not TELEGRAM_API:
        logger.warning("NOT_CONFIGURED: set TELEGRAM_TOKEN")
        return
    async with httpx.AsyncClient(timeout=10) as client:
        for chunk in split_telegram(text):
            await client.post(
                f"{TELEGRAM_API}/sendMessage",
                json={"chat_id": chat_id, "text": chunk},
            )


async def handle_update(update: dict) -> None:
    """Handle one Telegram update dict in the background."""
    msg = update.get("message") or update.get("edited_message") or {}
    text = (msg.get("text") or "").strip()
    chat = msg.get("chat", {})
    if not text or not chat.get("id"):
        return
    if not TELEGRAM_TOKEN:
        logger.warning("NOT_CONFIGURED: set TELEGRAM_TOKEN/TELEGRAM_WEBHOOK_SECRET")
        return
    from master_router import run_turn  # sibling-agent router

    reply = await run_turn(
        channel="telegram",
        user=str(msg.get("from", {}).get("id", chat.get("id"))),
        text=text,
    )
    await _send(chat["id"], reply)


try:  # Optional FastAPI router.
    from fastapi import APIRouter, BackgroundTasks, Header, Request

    router = APIRouter(tags=["telegram"])

    @router.post("/telegram/webhook")
    async def telegram_webhook(
        request: Request,
        background: BackgroundTasks,
        x_telegram_bot_api_secret_token: str = Header(default=""),
    ):
        if not _secret_ok(x_telegram_bot_api_secret_token):
            return {"ok": False, "error": "bad_secret"}
        update = await request.json()
        background.add_task(handle_update, update)
        return {"ok": True}
except ImportError:  # pragma: no cover
    router = None
