"""
Hermes adapter — swappable brain config for Friday.
Wraps Hermes AIAgent.chat() and reads ~/.hermes/config.yaml.

Expected Hermes config shape (~/.hermes/config.yaml):
  model:
    provider: gemini  # swappable: gemini | openai | groq | ...
    name: gemini-2.5-flash
  mcp_servers:
    friday_backend:
      url: http://localhost:8000/sse
      transport: sse
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_PATH = os.path.expanduser("~/.hermes/config.yaml")
DEFAULT_MCP_URL = "http://localhost:8000/sse"
DEFAULT_TRANSPORT = "sse"


def load_hermes_config(path: str = DEFAULT_CONFIG_PATH) -> dict:
    """Load Hermes YAML config. Returns {} when missing/unparseable."""
    try:
        import yaml  # type: ignore
    except ImportError:
        return {}
    p = Path(path).expanduser()
    if not p.exists():
        return {}
    try:
        data = yaml.safe_load(p.read_text()) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def get_model_config(cfg: dict | None = None) -> dict:
    """Return swappable model brain config: {provider, name, ...}."""
    cfg = cfg if cfg is not None else load_hermes_config()
    model = (cfg.get("model") or {}) if isinstance(cfg, dict) else {}
    return {
        "provider": model.get("provider", "gemini"),
        "name": model.get("name", "gemini-2.5-flash"),
        "extra": {k: v for k, v in model.items() if k not in ("provider", "name")},
    }


def get_friday_backend_config(cfg: dict | None = None) -> dict:
    """Return mcp_servers.friday_backend config with SSE defaults."""
    cfg = cfg if cfg is not None else load_hermes_config()
    servers = (cfg.get("mcp_servers") or {}) if isinstance(cfg, dict) else {}
    backend = servers.get("friday_backend") or {}
    return {
        "url": backend.get("url", DEFAULT_MCP_URL),
        "transport": backend.get("transport", DEFAULT_TRANSPORT),
    }


class HermesAdapter:
    """Thin wrapper around Hermes AIAgent.chat() with swappable brain."""

    def __init__(self, config_path: str = DEFAULT_CONFIG_PATH) -> None:
        self.config_path = config_path
        self.config = load_hermes_config(config_path)
        self.model = get_model_config(self.config)
        self.backend = get_friday_backend_config(self.config)
        self._agent: Any = None

    def _get_agent(self) -> Any:
        if self._agent is not None:
            return self._agent
        try:
            # Hermes repo: https://github.com/NousResearch/hermes-agent
            from hermes.agent import AIAgent  # type: ignore
        except ImportError:
            try:
                from hermes_agent.agent import AIAgent  # type: ignore
            except ImportError as exc:
                raise RuntimeError(
                    "Hermes AIAgent not installed; cannot chat via Hermes. "
                    "Check ~/.hermes/config.yaml and install hermes-agent."
                ) from exc
        self._agent = AIAgent(config=self.config)
        return self._agent

    def reload(self) -> dict:
        """Re-read ~/.hermes/config.yaml (enables model.provider swap)."""
        self.config = load_hermes_config(self.config_path)
        self.model = get_model_config(self.config)
        self.backend = get_friday_backend_config(self.config)
        self._agent = None
        return self.config

    def chat(self, message: str, **kwargs: Any) -> Any:
        """Delegate to AIAgent.chat()."""
        agent = self._get_agent()
        return agent.chat(message, **kwargs)

    async def achat(self, message: str, **kwargs: Any) -> Any:
        """Async delegate when the underlying agent supports it."""
        agent = self._get_agent()
        achat = getattr(agent, "achat", None)
        if callable(achat):
            return await achat(message, **kwargs)
        chat = getattr(agent, "chat")
        return chat(message, **kwargs)


def register(mcp):
    """Expose Hermes brain config as MCP tools (follows register(mcp) pattern)."""

    @mcp.tool()
    def hermes_model_info() -> dict:
        """Return current swappable brain config (model.provider) — risk:read."""
        cfg = load_hermes_config()
        return get_model_config(cfg)

    @mcp.tool()
    def hermes_backend_info() -> dict:
        """Return friday_backend SSE connection info — risk:read."""
        cfg = load_hermes_config()
        return get_friday_backend_config(cfg)
