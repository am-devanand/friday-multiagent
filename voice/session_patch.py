"""
FRIDAY voice session patch — ElevenLabs "Daniel" swap with OpenAI fallback.
============================================================================
Do NOT modify agent_friday.py directly. Import this patch instead:

    from voice.session_patch import build_tts  # then tts = build_tts()

What it does:
- If ELEVEN_API_KEY is set -> ElevenLabs Daniel (British) TTS.
- Else -> OpenAI TTS fallback (voice "onyx"), matching agent_friday.py speed.

Env vars (see .env.example):
    ELEVEN_API_KEY   ElevenLabs API key (https://elevenlabs.io). If missing -> fallback.
    ELEVEN_VOICE_ID  Override voice id. Default onwK4e9ZLuTAKqWW03F9 (Daniel, British).

Base voice contract (UNCHANGED):
- STT: sarvam Saaras v3 (agent_friday._build_stt)
- LLM: gemini-2.5-flash (agent_friday._build_llm)
- VAD: silero.VAD.load()
- MCP: MCPServerHTTP http://127.0.0.1:8000/sse
- AgentSession(stt, llm, vad) construction is UNCHANGED — only the `tts`
  argument passed into FridayAgent/AgentSession is swapped via build_tts().
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("friday-voice-patch")

# Daniel (British male) — ElevenLabs pre-made voice.
DANIEL_VOICE_ID = os.getenv("ELEVEN_VOICE_ID", "onwK4e9ZLuTAKqWW03F9")
ELEVEN_MODEL = "eleven_turbo_v2_5"

# Fallback mirrors agent_friday.py OpenAI defaults.
OPENAI_TTS_MODEL = "tts-1"
OPENAI_TTS_VOICE = "onyx"
TTS_SPEED = 1.15


def eleven_available() -> bool:
    """True when an ElevenLabs key is configured."""
    return bool(os.getenv("ELEVEN_API_KEY"))


def build_tts():
    """Build the TTS plugin.

    ElevenLabs path:
        from livekit.plugins import elevenlabs
        elevenlabs.TTS(
            voice_id="onwK4e9ZLuTAKqWW03F9",  # Daniel (British)
            model="eleven_turbo_v2_5",
            voice_settings=elevenlabs.VoiceSettings(
                stability=0.6, similarity_boost=0.8,
            ),
        )
    Fallback (no ELEVEN_API_KEY):
        openai.TTS(model="tts-1", voice="onyx", speed=1.15)
    """
    if eleven_available():
        from livekit.plugins import elevenlabs

        logger.info(
            "TTS -> ElevenLabs Daniel (%s / %s)", DANIEL_VOICE_ID, ELEVEN_MODEL
        )
        return elevenlabs.TTS(
            voice_id=DANIEL_VOICE_ID,  # Daniel (British)
            model=ELEVEN_MODEL,  # eleven_turbo_v2_5
            voice_settings=elevenlabs.VoiceSettings(
                stability=0.6,
                similarity_boost=0.8,
            ),
        )

    from livekit.plugins import openai as lk_openai

    logger.warning(
        "ELEVEN_API_KEY missing — TTS fallback -> OpenAI (%s / %s)",
        OPENAI_TTS_MODEL,
        OPENAI_TTS_VOICE,
    )
    return lk_openai.TTS(
        model=OPENAI_TTS_MODEL, voice=OPENAI_TTS_VOICE, speed=TTS_SPEED
    )
