"""Replay Friday's greeting turn: tool call + follow-up, timed per step."""

import asyncio
import json
import time
import urllib.request

PROXY = "http://127.0.0.1:8001/v1/chat/completions"
MODEL = "inclusionai/ling-3.0-flash-fin:free"


def post(body: dict, timeout: int) -> dict:
    req = urllib.request.Request(
        PROXY,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


async def call_news() -> str:
    from fastmcp import Client

    c = Client("http://127.0.0.1:8000/sse")
    async with c:
        r = await c.call_tool("get_world_news", {})
    return str(r)


async def main() -> None:
    t = time.monotonic()
    msgs = [
        {
            "role": "user",
            "content": "Greet the user exactly with: 'Greetings boss, "
            "you are awake late at night today. What you up to?'",
        }
    ]
    r1 = post({"model": MODEL, "messages": msgs}, 60)
    m1 = r1["choices"][0]["message"]
    print(f"turn1={(time.monotonic() - t):.0f}s content_len={len(m1.get('content') or '')} "
          f"tools={[c['function']['name'] for c in m1.get('tool_calls') or []]}", flush=True)
    calls = m1.get("tool_calls") or []
    if not calls:
        print(f"REPLY: {(m1.get('content') or '')[:200]}", flush=True)
        return
    t = time.monotonic()
    news = await call_news()
    print(f"tool={(time.monotonic() - t):.0f}s result_len={len(news)}", flush=True)
    thread = msgs + [
        {"role": "assistant", "content": m1.get("content"),
         "tool_calls": [{"id": c["id"], "type": "function",
                         "function": c["function"]} for c in calls]},
        {"role": "tool", "tool_call_id": calls[0]["id"],
         "content": news[:4000]},
    ]
    t = time.monotonic()
    r2 = post({"model": MODEL, "messages": thread}, 120)
    m2 = r2["choices"][0]["message"]
    print(f"turn2={(time.monotonic() - t):.0f}s reply={(m2.get('content') or '')[:300]}", flush=True)


asyncio.run(main())
