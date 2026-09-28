# FRIDAY AI — Project Guide

## OVERVIEW
Python AI assistant inspired by Tony Stark's Jarvis. FastMCP server + LiveKit voice agent with tool-use capabilities.

## STRUCTURE
```
friday-tony-stark-demo/
├── server.py           # FastMCP SSE server — main entry point
├── agent_friday.py     # LiveKit voice agent (connects to MCP server)
├── main.py             # stub placeholder
├── pyproject.toml      # project config, scripts, dependencies
├── .env                # env vars (SERVER_NAME, API keys)
└── friday/
    ├── config.py       # Config class, loads .env
    ├── tools/
    │   ├── system.py   # system control tools
    │   ├── utils.py    # utility/helper tools
    │   └── web.py      # web interaction tools
    ├── prompts/
    │   └── templates.py # prompt templates
    └── resources/
        └── data.py     # data resources
```

## WHERE TO LOOK
- **server.py** — MCP server bootstrap, tool/prompt/resource registration
- **agent_friday.py** — voice agent, system prompt, STT/LLM/TTS pipeline, LiveKit entrypoint
- **friday/config.py** — all environment config
- **friday/tools/** — each tool module registers with FastMCP
- **friday/prompts/templates.py** — prompt templates registered with MCP
- **friday/resources/data.py** — static/dynamic data resources

## COMMANDS
```bash
uv run friday              # start MCP SSE server (server.py:main)
uv run friday_voice        # start LiveKit voice agent (agent_friday.py:dev)
uv run agent_friday.py dev       # LiveKit Cloud mode
uv run agent_friday.py console   # text-only console mode
uv run python server.py         # alternative: start MCP server directly
```

## NOTES
- Runtime depends on `.venv/` — activate or use `uv run`
- `agent_friday.py` expects the MCP server running on `localhost:8000` (SSE transport)
- Set `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `LIVEKIT_*`, `SARVAM_API_KEY` in `.env`
- STT/LLM/TTS providers configurable via constants at top of `agent_friday.py`
