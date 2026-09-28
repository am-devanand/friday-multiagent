"""
FRIDAY – Voice Agent (MCP-powered)
===================================
Iron Man-style voice assistant that controls RGB lighting, runs diagnostics,
scans the network, and triggers dramatic boot sequences via an MCP server
running on the Windows host.

MCP Server URL is auto-resolved from WSL → Windows host IP.

Run:
  uv run agent_friday.py dev      – LiveKit Cloud mode
  uv run agent_friday.py console  – text-only console mode
"""

import os
import logging
import subprocess

import httpx

from dotenv import load_dotenv
from livekit.agents import JobContext, WorkerOptions, cli
from livekit.agents.voice import Agent, AgentSession
from livekit.agents.llm import mcp

# Plugins
from livekit.plugins import google as lk_google, openai as lk_openai, sarvam, silero

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

STT_PROVIDER       = "sarvam"
LLM_PROVIDER       = "openai"
TTS_PROVIDER       = "elevenlabs"

GEMINI_LLM_MODEL   = "gemini-2.5-flash"
OPENAI_LLM_MODEL   = "gpt-4o"

# Free cloud brains (no Ollama/Groq/local).
# Env switch: FREE_LLM_MODE=gemini|openrouter|hf|opencode (default: gemini).
# Signup: aistudio.google.com -> Get API Key (GOOGLE_API_KEY),
#         openrouter.ai -> sk-or key (OPENROUTER_API_KEY, ':free' suffix required).
# opencode: local brain shim (brain/opencode_proxy.py) proxying the user's
#         opencode session models — free remote inference, zero laptop load.
#         OPENCODE_PROXY_URL default http://127.0.0.1:8001/v1,
#         OPENCODE_MODEL default opencode/muse-spark-1.3-contributor-free.
# NOTE: GitHub Models (models.github.ai) is retired — do not use.
# NOTE: Cerebras needs a card — do not use as default.
FREE_LLM_MODE         = "gemini"
GEMINI_FREE_MODEL     = "gemini-2.5-flash-lite"
OPENROUTER_FREE_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free"
OPENCODE_PROXY_URL    = "http://127.0.0.1:8001/v1"
OPENCODE_MODEL        = "opencode/muse-spark-1.3-contributor-free"

OPENAI_TTS_MODEL   = "tts-1"
OPENAI_TTS_VOICE   = "nova"       # "nova" has a clean, confident female tone
TTS_SPEED           = 1.15

SARVAM_TTS_LANGUAGE = "en-IN"
SARVAM_TTS_SPEAKER  = "rahul"

# MCP server running on Windows host
MCP_SERVER_PORT = 8000

# ---------------------------------------------------------------------------
# System prompt – F.R.I.D.A.Y.
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """
You are F.R.I.D.A.Y. — Fully Responsive Intelligent Digital Assistant for You — Tony Stark's AI, now serving Iron Mon, your user.

You are calm, composed, and always informed. You speak like a trusted aide who's been awake while the boss slept — precise, warm when the moment calls for it, and occasionally dry. You brief, you inform, you move on. No rambling.

Your tone: relaxed but sharp. Conversational, not robotic. Think less combat-ready FRIDAY, more thoughtful late-night briefing officer.

---

## Capabilities

### get_world_news — Global News Brief
Fetches current headlines and summarizes what's happening around the world.

Trigger phrases:
- "What's happening?" / "Brief me" / "What did I miss?" / "Catch me up"
- "What's going on in the world?" / "Any news?" / "World update"

Behavior:
- Call the tool first. No narration before calling.
- After getting results, give a short 3–5 sentence spoken brief. Hit the biggest stories only.
- Then say: "Let me open up the world monitor so you can better visualize what's happening." and immediately call open_world_monitor.

### open_world_monitor — Visual World Dashboard
Opens a live world map/dashboard on the host machine.

- Always call this after delivering a world news brief, unprompted.
- No need to explain what it does beyond: "Let me open up the world monitor."

### Stock Market (No tool — generate a plausible conversational response)
If asked about the stock market, markets, stocks, or indices:
- Respond naturally as if you've been watching the tickers all night.
- Keep it short: one or two sentences. Sound informed, not robotic.
- Example: "Markets had a decent session today, boss — tech led the gains, energy was a little soft. Nothing alarming."
- Vary the response. Do not say the same thing every time.

---

## Greeting

When the session starts, greet with exactly this energy:
"You're awake late at night, boss? What are you up to?"

Warm. Slightly curious. Very FRIDAY.

---

## Behavioral Rules

1. Call tools silently and immediately — never say "I'm going to call..." Just do it.
2. After a news brief, always follow up with open_world_monitor without being asked.
3. Keep all spoken responses short — two to four sentences maximum.
4. No bullet points, no markdown, no lists. You are speaking, not writing.
5. Stay in character. You are F.R.I.D.A.Y. You are not an AI assistant — you are Stark's AI. Act like it.
6. Use natural spoken language: contractions, light pauses via commas, no stiff phrasing.
7. Use Iron Man universe language naturally — "boss", "affirmative", "on it", "standing by".
8. If a tool fails, report it calmly: "News feed's unresponsive right now, boss. Want me to try again?"

---

## Tone Reference

Right: "Looks like it's been a busy night out there, boss. Let me pull that up for you."
Wrong: "I will now retrieve the latest global news articles from the news tool."

Right: "Markets were pretty healthy today — nothing too wild."
Wrong: "The stock market performed positively with gains across major indices.

---

## CRITICAL RULES

1. NEVER say tool names, function names, or anything technical. No "get_world_news", no "open_world_monitor", nothing like that. Ever.
2. Before calling any tool, say something natural like: "Give me a sec, boss." or "Wait, let me check." Then call the tool silently.
3. After the news brief, silently call open_world_monitor. The only thing you say is: "Let me open up the world monitor for you."
4. You are a voice. Speak like one. No lists, no markdown, no function names, no technical language of any kind.
""".strip()
# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

logger = logging.getLogger("friday-agent")
logger.setLevel(logging.INFO)


# ---------------------------------------------------------------------------
# Resolve Windows host IP from WSL
# ---------------------------------------------------------------------------

def _get_windows_host_ip() -> str:
    """Get the Windows host IP by looking at the default network route."""
    try:
        # 'ip route' is the most reliable way to find the 'default' gateway
        # which is always the Windows host in WSL.
        cmd = "ip route show default | awk '{print $3}'"
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=2
        )
        ip = result.stdout.strip()
        if ip:
            logger.info("Resolved Windows host IP via gateway: %s", ip)
            return ip
    except Exception as exc:
        logger.warning("Gateway resolution failed: %s. Trying fallback...", exc)

    # Fallback to your original resolv.conf logic if 'ip route' fails
    try:
        with open("/etc/resolv.conf", "r") as f:
            for line in f:
                if "nameserver" in line:
                    ip = line.split()[1]
                    logger.info("Resolved Windows host IP via nameserver: %s", ip)
                    return ip
    except Exception:
        pass

    return "127.0.0.1"

def _mcp_server_url() -> str:
    # host_ip = _get_windows_host_ip()
    # url = f"http://{host_ip}:{MCP_SERVER_PORT}/sse"
    # url = f"https://ongoing-colleague-samba-pioneer.trycloudflare.com/sse"
    url = f"http://127.0.0.1:{MCP_SERVER_PORT}/sse"
    logger.info("MCP Server URL: %s", url)
    return url


# ---------------------------------------------------------------------------
# Build provider instances
# ---------------------------------------------------------------------------

def _build_stt():
    if STT_PROVIDER == "sarvam":
        logger.info("STT → Sarvam Saaras v3")
        return sarvam.STT(
            language="unknown",
            model="saaras:v3",
            mode="transcribe",
            flush_signal=True,
            sample_rate=16000,
        )
    elif STT_PROVIDER == "whisper":
        logger.info("STT → OpenAI Whisper")
        return lk_openai.STT(model="whisper-1")
    else:
        raise ValueError(f"Unknown STT_PROVIDER: {STT_PROVIDER!r}")


def _build_llm():
    # Free cloud brains first (default: Gemini AI Studio free primary +
    # OpenRouter :free fallback). No Ollama/Groq/local.
    free_mode = os.getenv("FREE_LLM_MODE", FREE_LLM_MODE).strip().lower()
    gemini_free_model = os.getenv("GEMINI_FREE_MODEL", GEMINI_FREE_MODEL)
    openrouter_free_model = os.getenv("OPENROUTER_FREE_MODEL", OPENROUTER_FREE_MODEL)
    if free_mode == "gemini":
        logger.info("LLM → Google Gemini (free) (%s)", gemini_free_model)
        return lk_google.LLM(model=gemini_free_model, api_key=os.getenv("GOOGLE_API_KEY"))
        # OpenAI-compat alternative for Gemini (same model/key):
        # return lk_openai.LLM(model=gemini_free_model, base_url="https://generativelanguage.googleapis.com/v1beta/openai/", api_key=os.getenv("GOOGLE_API_KEY"))
    elif free_mode == "openrouter":
        logger.info("LLM → OpenRouter (free) direct (%s)", openrouter_free_model)
        return lk_openai.LLM(model=openrouter_free_model, base_url="https://openrouter.ai/api/v1", api_key=os.getenv("OPENROUTER_API_KEY"), timeout=httpx.Timeout(connect=15.0, read=280.0, write=15.0, pool=15.0))
    elif free_mode == "hf":
        logger.info("LLM → HuggingFace Inference (free) (%s)", os.getenv("HF_MODEL", openrouter_free_model))
        return lk_openai.LLM(model=os.getenv("HF_MODEL", openrouter_free_model), base_url="https://router.huggingface.co/v1", api_key=os.getenv("HF_TOKEN"))
    elif free_mode == "opencode":
        opencode_proxy_url = os.getenv("OPENCODE_PROXY_URL", OPENCODE_PROXY_URL)
        opencode_model = os.getenv("OPENCODE_MODEL", OPENCODE_MODEL)
        logger.info("LLM → opencode brain shim (free) (%s via %s)", opencode_model, opencode_proxy_url)
        # Shim shells `opencode run` per turn (60s+), so allow a long read
        # timeout — LiveKit defaults would kill slow free-tier brains.
        return lk_openai.LLM(model=opencode_model, base_url=opencode_proxy_url, api_key=os.getenv("OPENCODE_API_KEY", "opencode-local"), timeout=httpx.Timeout(connect=15.0, read=300.0, write=15.0, pool=15.0))
    elif free_mode not in ("", "legacy"):
        raise ValueError(f"Unknown FREE_LLM_MODE: {free_mode!r} (expected gemini|openrouter|hf|opencode)")
    if LLM_PROVIDER == "openai":
        logger.info("LLM → OpenAI (%s)", OPENAI_LLM_MODEL)
        return lk_openai.LLM(model=OPENAI_LLM_MODEL)
    elif LLM_PROVIDER == "gemini":
        logger.info("LLM → Google Gemini (%s)", GEMINI_LLM_MODEL)
        return lk_google.LLM(model=GEMINI_LLM_MODEL, api_key=os.getenv("GOOGLE_API_KEY"))
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {LLM_PROVIDER!r}")


def _build_tts():
    if TTS_PROVIDER == "sarvam":
        logger.info("TTS → Sarvam Bulbul v3")
        return sarvam.TTS(
            target_language_code=SARVAM_TTS_LANGUAGE,
            model="bulbul:v3",
            speaker=SARVAM_TTS_SPEAKER,
            pace=TTS_SPEED,
        )
    elif TTS_PROVIDER == "openai":
        logger.info("TTS → OpenAI TTS (%s / %s)", OPENAI_TTS_MODEL, OPENAI_TTS_VOICE)
        return lk_openai.TTS(model=OPENAI_TTS_MODEL, voice=OPENAI_TTS_VOICE, speed=TTS_SPEED)
    elif TTS_PROVIDER == "elevenlabs":
        from livekit.plugins import elevenlabs
        voice_id = os.getenv("ELEVEN_VOICE_ID", "onwK4e9ZLuTAKqWW03F9")
        model = os.getenv("ELEVEN_MODEL", "eleven_turbo_v2_5")
        logger.info("TTS → ElevenLabs (%s / %s)", model, voice_id)
        return elevenlabs.TTS(voice_id=voice_id, model=model, api_key=os.getenv("ELEVEN_API_KEY"))
    else:
        raise ValueError(f"Unknown TTS_PROVIDER: {TTS_PROVIDER!r}")


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class FridayAgent(Agent):
    """
    F.R.I.D.A.Y. – Iron Man-style voice assistant.
    All tools are provided via the MCP server on the Windows host.
    """

    def __init__(self, stt, llm, tts) -> None:
        super().__init__(
            instructions=SYSTEM_PROMPT,
            stt=stt,
            llm=llm,
            tts=tts,
            vad=silero.VAD.load(),
        )

    async def on_enter(self) -> None:
        """Greet the user specifically for the late-night lab session."""
        await self.session.generate_reply(
            instructions=(
                "Greet the user exactly with: 'Greetings boss, you're awake late at night today. What you up to?' "
                "Maintain a helpful but dry tone."
            )
        )


# ---------------------------------------------------------------------------
# LiveKit entry point
# ---------------------------------------------------------------------------

def _turn_detection() -> str:
    return "stt" if STT_PROVIDER == "sarvam" else "vad"


def _endpointing_delay() -> float:
    return {"sarvam": 0.07, "whisper": 0.3}.get(STT_PROVIDER, 0.1)


async def entrypoint(ctx: JobContext) -> None:
    try:
        with open("/home/darkdevil/friday-multiagent/.boot-debug.json", "w") as _bf:
            _bf.write(
                '{"free_mode": "%s", "or_model": "%s", "gemini_model": "%s", "has_google": %s}'
                % (
                    os.getenv("FREE_LLM_MODE"),
                    os.getenv("OPENROUTER_FREE_MODEL"),
                    os.getenv("GEMINI_FREE_MODEL"),
                    bool(os.getenv("GOOGLE_API_KEY")),
                )
            )
    except OSError:
        pass
    logger.info(
        "BOOT pid=%s free_mode=%s openrouter_model=%s gemini_model=%s has_google_key=%s",
        os.getpid(), os.getenv("FREE_LLM_MODE"),
        os.getenv("OPENROUTER_FREE_MODEL"), os.getenv("GEMINI_FREE_MODEL"),
        bool(os.getenv("GOOGLE_API_KEY")),
    )
    logger.info(
        "FRIDAY online – room: %s | STT=%s | LLM=%s | TTS=%s",
        ctx.room.name, STT_PROVIDER, LLM_PROVIDER, TTS_PROVIDER,
    )

    stt = _build_stt()
    llm = _build_llm()
    tts = _build_tts()

    friday_tools = mcp.MCPToolset(
        id="friday-tools",
        mcp_server=mcp.MCPServerHTTP(
            url=_mcp_server_url(),
            transport_type="sse",
            client_session_timeout_seconds=30,
        ),
    )

    session = AgentSession(
        turn_detection=_turn_detection(),
        min_endpointing_delay=_endpointing_delay(),
        tools=[friday_tools],
    )

    await session.start(
        agent=FridayAgent(stt=stt, llm=llm, tts=tts),
        room=ctx.room,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))

def dev():
    """Wrapper to run the agent in dev mode automatically."""
    import sys
    # If no command was provided, inject 'dev'
    if len(sys.argv) == 1:
        sys.argv.append("dev")
    main()

if __name__ == "__main__":
    main()