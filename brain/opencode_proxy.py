"""
OpenAI-compatible brain shim for friday-multiagent.

Exposes GET /v1/models and POST /v1/chat/completions in OpenAI format and
translates chat turns to the headless opencode CLI (`opencode run`).

Stdlib only (http.server + subprocess) so it runs on plain `python3` with
no extra installs.

Backend: one `opencode run` subprocess per chat completion
(`--pure --dir /tmp/friday-brain` keeps plugin context out); the created
session is deleted best-effort afterwards, so no sessions accumulate.
Each turn is stateless — full flattened history is sent as the prompt.
"""

import json
import os
import socket
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_first(*args, **kwargs):
    """Prefer IPv4: this host's IPv6 routes stall, and plain urllib has
    no Happy Eyeballs, so each dead IPv6 attempt burns the full timeout."""
    try:
        results = _orig_getaddrinfo(*args, **kwargs)
    except socket.gaierror:
        raise
    return sorted(results, key=lambda r: r[0] != socket.AF_INET)


socket.getaddrinfo = _ipv4_first

KNOWN_MODELS = [
    "opencode/big-pickle",
    "opencode/ling-3.0-flash-fin-free",
    "opencode/mimo-v2.6-flash-free",
    "opencode/muse-spark-1.3-contributor-free",
    "opencode/nemotron-3-ultra-free",
    "opencode/nemotron-3.5-lightning-free",
    "opencode/space-bunny-free",
]

DEFAULT_MODEL = os.getenv(
    "OPENCODE_MODEL", "opencode/muse-spark-1.3-contributor-free"
)
RUN_DIR = os.getenv("OPENCODE_RUN_DIR", "/tmp/friday-brain")
RUN_TIMEOUT = float(os.getenv("OPENCODE_RUN_TIMEOUT", "120"))

# TODO: tool-calling passthrough. `opencode run --format json` text events
# are concatenated; tool events are ignored, so completions are text-only
# for now (no `tools`/`tool_choice` support).

FAST_URL = "https://openrouter.ai/api/v1/chat/completions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"


def _load_env_key(name: str) -> str:
    """Provider key from env, else the friday .env next to this proxy.

    Key never leaves this machine except as a bearer token upstream;
    it is never logged or echoed.
    """
    key = os.getenv(name, "").strip()
    if key:
        return key
    try:
        env_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"
        )
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return ""


def _load_openrouter_key() -> str:
    return _load_env_key("OPENROUTER_API_KEY")


def _reply_preview(upstream: dict) -> str:
    """One-line summary of an upstream reply for logs (no secrets)."""
    try:
        msg = upstream["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        return "unparseable"
    parts = []
    content = (msg.get("content") or "").strip().replace("\n", " ")
    parts.append(f"text={len(content)}chars:{content[:100]}")
    calls = msg.get("tool_calls") or []
    parts.append(f"tools={[c.get('function', {}).get('name') for c in calls]}")
    return " ".join(parts)


def forward_openrouter(body: dict) -> dict:
    """Forward a chat body to OpenRouter, return its OpenAI-shape JSON."""
    import urllib.error
    import urllib.request

    model = body.get("model") or ""
    if model.startswith("gemini-"):
        url, key, who = GEMINI_URL, _load_env_key("GOOGLE_API_KEY"), "gemini"
    else:
        url, key, who = FAST_URL, _load_openrouter_key(), "openrouter"
    if not key:
        raise RuntimeError(f"no key available for fast models ({who})")
    fwd = dict(body)
    fwd["stream"] = False
    req = urllib.request.Request(
        url,
        data=json.dumps(fwd).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "http://localhost:3000/",
            "X-Title": "Friday HUD",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"{who} HTTP {exc.code}: {detail}")


def resolve_model(requested: str) -> str:
    """Pick the model for a completion: request model if known, else env/default."""
    if requested and requested in KNOWN_MODELS:
        return requested
    return os.getenv("OPENCODE_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL


def messages_to_prompt(messages) -> str:
    """Flatten OpenAI chat messages into a single prompt text.

    System messages become a header block; history becomes
    `role: content` lines in order.
    """
    if not messages:
        return ""
    systems = [m.get("content", "") for m in messages if m.get("role") == "system"]
    turns = [m for m in messages if m.get("role") != "system"]
    parts = []
    if systems:
        parts.append("System instructions:\n" + "\n".join(systems))
    for m in turns:
        role = m.get("role", "user")
        parts.append(f"{role}: {m.get('content', '')}")
    return "\n\n".join(parts).strip()


def openai_completion_response(model: str, content: str) -> dict:
    """Build a non-streaming OpenAI-format chat completion payload."""
    now = int(time.time())
    return {
        "id": f"chatcmpl-opencode-{now}",
        "object": "chat.completion",
        "created": now,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {},
    }


def openai_error_response(message: str, code: int = 502) -> dict:
    return {
        "error": {
            "message": message,
            "type": "upstream_error",
            "code": code,
        }
    }


def _parse_run_events(stdout: str) -> tuple:
    """Concatenate {"type":"text"} event part.text in order; capture sessionID."""
    texts = []
    session_id = None
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict):
            continue
        sid = event.get("sessionID") or event.get("sessionId")
        if sid and not session_id:
            session_id = str(sid)
        if event.get("type") == "text":
            part = event.get("part") or {}
            text = part.get("text", "") if isinstance(part, dict) else ""
            if text:
                texts.append(text)
    return "".join(texts), session_id


def _delete_session(session_id: str) -> None:
    """Best-effort cleanup of the CLI-created session; never raises."""
    try:
        subprocess.run(
            ["opencode", "session", "delete", session_id],
            capture_output=True,
            timeout=30,
        )
    except Exception:
        pass


def run_completion(prompt: str, model: str) -> str:
    """Run one headless `opencode run`, return assistant text, clean up session."""
    os.makedirs(RUN_DIR, exist_ok=True)
    try:
        proc = subprocess.run(
            [
                "opencode", "run",
                "--pure",
                "--dir", RUN_DIR,
                "-m", model,
                "--format", "json",
                "--title", "friday-brain",
                prompt,
            ],
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"opencode run timed out after {RUN_TIMEOUT:g}s")
    except OSError as exc:
        raise RuntimeError(f"opencode run failed to start: {exc}")
    text, session_id = _parse_run_events(proc.stdout or "")
    if session_id:
        _delete_session(session_id)
    if proc.returncode != 0 and not text:
        err = (proc.stderr or "").strip()[-500:]
        raise RuntimeError(f"opencode run exited {proc.returncode}: {err}")
    if not text:
        raise RuntimeError("opencode run returned no assistant text")
    return text


class Handler(BaseHTTPRequestHandler):
    server_version = "opencode-proxy/1"

    def _send_json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/v1/models", "/v1/models/"):
            self._send_json(
                200,
                {
                    "object": "list",
                    "data": [
                        {"id": m, "object": "model", "owned_by": "opencode"}
                        for m in KNOWN_MODELS
                    ],
                },
            )
        elif self.path in ("/", "/healthz"):
            self._send_json(200, {"status": "ok", "backend": "opencode-run"})
        else:
            self._send_json(404, openai_error_response("not found", 404))

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/v1/chat/completions", "/v1/chat/completions/"):
            self._send_json(404, openai_error_response("not found", 404))
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = 0
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except ValueError:
            self._send_json(400, openai_error_response("invalid JSON body", 400))
            return
        messages = body.get("messages", [])
        requested = (body.get("model") or "").strip()
        if requested.startswith("nvidia/"):
            preview = " | ".join(
                f"{m.get('role')}:{(m.get('content') or '')[:80]}"
                for m in messages[:3]
            )
            print(
                f"[{time.strftime('%H:%M:%S')}] MYSTERY_NVIDIA from={self.client_address[1]} "
                f"content={preview}",
                flush=True,
            )
        print(
            f"[{time.strftime('%H:%M:%S')}] POST model={requested} msgs={len(messages)} from={self.client_address[1]} ua={(self.headers.get('User-Agent') or '')[:60]}",
            flush=True,
        )
        if requested and requested not in KNOWN_MODELS:
            t0 = time.monotonic()
            want_stream = bool(body.get("stream"))
            chain = [requested]
            if requested.startswith("gemini-"):
                chain += [
                    "inclusionai/ling-3.0-flash-fin:free",
                    "nvidia/nemotron-3.5-lightning:free",
                ]
            elif requested != "inclusionai/ling-3.0-flash-fin:free":
                chain += [
                    "inclusionai/ling-3.0-flash-fin:free",
                    "nvidia/nemotron-3.5-lightning:free",
                ]
            upstream = None
            used = requested
            last_err = "empty chain"
            for candidate in dict.fromkeys(chain):
                attempt = dict(body)
                attempt["model"] = candidate
                try:
                    upstream = forward_openrouter(attempt)
                    used = candidate
                    break
                except Exception as exc:  # noqa: BLE001
                    last_err = f"{candidate}: {type(exc).__name__}: {str(exc)[:100]}"
                    print(
                        f"[{time.strftime('%H:%M:%S')}] CHAIN_FAIL model={candidate} "
                        f"after={time.monotonic() - t0:.0f}s err={last_err}",
                        flush=True,
                    )
            if upstream is None:
                print(
                    f"[{time.strftime('%H:%M:%S')}] FAST_FAIL model={requested} "
                    f"after={time.monotonic() - t0:.0f}s err={last_err}",
                    flush=True,
                )
                self._send_json(502, openai_error_response(last_err, 502))
                return
            requested = used
            if want_stream:
                self._send_sse(upstream, requested, t0)
                return
            print(
                f"[{time.strftime('%H:%M:%S')}] FAST_OK model={requested} "
                f"after={time.monotonic() - t0:.0f}s "
                f"preview={_reply_preview(upstream)}",
                flush=True,
            )
            raw = json.dumps(upstream).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        model = resolve_model(requested)
        prompt = messages_to_prompt(messages)
        if not prompt:
            self._send_json(400, openai_error_response("no messages provided", 400))
            return
        try:
            text = run_completion(prompt, model)
        except RuntimeError as exc:
            self._send_json(502, openai_error_response(str(exc), 502))
            return
        self._send_json(200, openai_completion_response(model, text))

    def _send_sse(self, upstream: dict, model: str, t0: float) -> None:
        """Reply in OpenAI SSE streaming shape for stream:true callers."""
        try:
            msg = upstream["choices"][0]["message"]
        except (KeyError, IndexError, TypeError):
            msg = {}
        content = msg.get("content") or ""
        now = int(time.time())
        base = {"id": f"chatcmpl-opencode-{now}", "object": "chat.completion.chunk",
                "created": now, "model": model}
        chunks = [
            {**base, "choices": [{"index": 0,
                                 "delta": {"role": "assistant", "content": content},
                                 "finish_reason": None}]},
            {**base, "choices": [{"index": 0, "delta": {},
                                 "finish_reason": "stop"}]},
        ]
        raw = "".join(f"data: {json.dumps(c)}\n\n" for c in chunks)
        raw += "data: [DONE]\n\n"
        payload = raw.encode("utf-8")
        print(
            f"[{time.strftime('%H:%M:%S')}] FAST_SSE model={model} "
            f"after={time.monotonic() - t0:.0f}s chars={len(content)}",
            flush=True,
        )
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args) -> None:  # keep logs quiet
        pass


def run(port: int = 8001) -> None:
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"opencode-proxy listening on 127.0.0.1:{port} backend=opencode-run")
    server.serve_forever()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="OpenAI-compatible opencode proxy")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("PROXY_PORT", "8001")),
        help="local proxy port (default 8001, never the opencode port)",
    )
    run(parser.parse_args().port)
