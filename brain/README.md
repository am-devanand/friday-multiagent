# Brain: opencode proxy (OpenAI-compatible shim)

Lets `friday-multiagent` use the user's opencode session models (free,
remote inference, zero laptop load) as its LLM via an OpenAI-compatible
local proxy.

## Layout

- `opencode_proxy.py` — stdlib-only proxy. `GET /v1/models`,
  `POST /v1/chat/completions` (OpenAI format, non-streaming, text-only).
  Backend is headless `opencode run --pure --dir /tmp/friday-brain`
  (one subprocess per turn, session deleted best-effort afterwards).

## Run

```bash
# 1. Rediscover the live opencode port (it changes per launch):
ss -tlnp | grep opencode

# 2. Start the shim on its OWN port (default 8001 — never the opencode port):
OPENCODE_PORT=<port-from-ss> python3 brain/opencode_proxy.py --port 8001
# or: OPENCODE_BASE_URL=http://127.0.0.1:<port> python3 brain/opencode_proxy.py
```

Env vars: `PROXY_PORT` (default 8001), `OPENCODE_MODEL`
(default `opencode/muse-spark-1.3-contributor-free`),
`OPENCODE_RUN_DIR` (default /tmp/friday-brain),
`OPENCODE_RUN_TIMEOUT` (default 120s).

## Test

```bash
python3 -m py_compile brain/opencode_proxy.py agent_friday.py
curl -s localhost:8001/v1/models
FREE_LLM_MODE=opencode OPENCODE_PROXY_URL=http://127.0.0.1:8001/v1 uv run agent_friday.py console
```

## Wire into the agent

`agent_friday.py` `_build_llm()` has an `opencode` branch:

```bash
FREE_LLM_MODE=opencode \
OPENCODE_PROXY_URL=http://127.0.0.1:8001/v1 \
OPENCODE_MODEL=opencode/muse-spark-1.3-contributor-free \
uv run agent_friday.py console
```

It builds `lk_openai.LLM(model=..., base_url=<proxy>/v1,
api_key=...)` — any non-empty string works for the local proxy
(`OPENCODE_API_KEY`, default `opencode-local`).

## Hermes custom provider snippet

```yaml
llm:
  provider: openai_compatible
  base_url: http://127.0.0.1:8001/v1
  model: opencode/muse-spark-1.3-contributor-free
  api_key: opencode-local
```

## Constraints

- Works only while the `opencode` CLI is authenticated (free contributor
  models are remote, zero laptop load) — no `opencode serve` needed.
- `--pure --dir /tmp/friday-brain` keeps global plugin context (~40k
  tokens) out of each run.
- TODO: tool-calling passthrough (text-only completions for now; the
  session API event shape for tools is unclear from GET-only discovery).
