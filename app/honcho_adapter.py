"""
Honcho memory adapter — workspace friday-multiagent.
Peers: user / friday. One session per LiveKit room.
recall()/record() use session.context with tokens=2000, peer_target=user.
Bot peer uses observe_me=False.
"""

from __future__ import annotations

import os
from typing import Any

WORKSPACE = "friday-multiagent"
PEER_USER = "user"
PEER_FRIDAY = "friday"
CONTEXT_TOKENS = 2000


def _api_key(explicit: str | None = None) -> str:
    return explicit or os.getenv("HONCHO_API_KEY", "") or os.getenv("HONCHO_WORKSPACE", WORKSPACE) and os.getenv("HONCHO_API_KEY", "")


class HonchoMemory:
    """Honcho-backed memory with one session per LiveKit room."""

    def __init__(self, api_key: str | None = None, workspace: str = WORKSPACE) -> None:
        self.api_key = api_key or os.getenv("HONCHO_API_KEY", "")
        self.workspace_name = workspace or WORKSPACE
        self._client: Any = None
        self._workspace: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            from honcho import Honcho  # type: ignore
        except ImportError as exc:
            raise RuntimeError("honcho-ai not installed; add honcho-ai to dependencies.") from exc
        self._client = Honcho(api_key=self.api_key) if self.api_key else Honcho()
        return self._client

    def _get_workspace(self) -> Any:
        if self._workspace is not None:
            return self._workspace
        client = self._get_client()
        # Prefer get-or-create semantics; fall back across SDK variants.
        for attr in ("get_or_create_workspace", "get_workspace", "create_workspace"):
            fn = getattr(client, attr, None)
            if callable(fn):
                try:
                    self._workspace = fn(self.workspace_name)
                    return self._workspace
                except Exception:
                    continue
        # Last resort: attribute access / constructor kwarg variants.
        try:
            self._workspace = client.workspace(self.workspace_name)  # type: ignore[attr-defined]
            return self._workspace
        except Exception as exc:
            raise RuntimeError(f"Cannot resolve Honcho workspace {self.workspace_name!r}") from exc

    def _session(self, room: str) -> Any:
        """One Honcho session per LiveKit room."""
        workspace = self._get_workspace()
        room = room or "default"
        for attr in ("get_or_create_session", "get_session", "create_session", "session"):
            fn = getattr(workspace, attr, None)
            if callable(fn):
                try:
                    return fn(room)
                except TypeError:
                    try:
                        return fn(session_id=room)
                    except Exception:
                        continue
                except Exception:
                    continue
        raise RuntimeError(f"Honcho workspace has no session accessor (room={room!r})")

    @staticmethod
    def _context(session: Any, query: str) -> Any:
        ctx = getattr(session, "context", None)
        if callable(ctx):
            return ctx(query, tokens=CONTEXT_TOKENS, peer_target=PEER_USER)
        context = getattr(session, "context", None)
        if context is not None and hasattr(context, "__call__"):
            return context(query, tokens=CONTEXT_TOKENS, peer_target=PEER_USER)
        get_ctx = getattr(session, "get_context", None)
        if callable(get_ctx):
            return get_ctx(query, tokens=CONTEXT_TOKENS, peer_target=PEER_USER)
        raise RuntimeError("Honcho session has no context accessor")

    def recall(self, query: str, room: str = "default") -> Any:
        """Recall memory for query in room's session (tokens=2000, peer_target=user)."""
        session = self._session(room)
        return self._context(session, query)

    def record(self, content: str, room: str = "default", peer: str = PEER_USER) -> Any:
        """Record content into room's session. Bot peer friday uses observe_me=False."""
        session = self._session(room)
        observe_me = False if peer == PEER_FRIDAY else True
        # Try common SDK write paths.
        for attr in ("add_message", "add_messages", "observe", "create_message"):
            fn = getattr(session, attr, None)
            if callable(fn):
                try:
                    return fn(peer, content, observe_me=observe_me)
                except TypeError:
                    try:
                        return fn({"peer": peer, "content": content, "observe_me": observe_me})
                    except Exception:
                        continue
                except Exception:
                    continue
        # Fallback: raw message append without observe flag.
        for attr in ("add_message", "create_message"):
            fn = getattr(session, attr, None)
            if callable(fn):
                return fn(peer, content)
        raise RuntimeError("Honcho session has no message-write accessor")


# Module-level default for convenience.
_default: HonchoMemory | None = None


def get_memory(workspace: str = WORKSPACE) -> HonchoMemory:
    global _default
    if _default is None or _default.workspace_name != workspace:
        _default = HonchoMemory(workspace=workspace)
    return _default


def recall(query: str, room: str = "default") -> Any:
    return get_memory().recall(query, room=room)


def record(content: str, room: str = "default", peer: str = PEER_USER) -> Any:
    return get_memory().record(content, room=room, peer=peer)


def register(mcp):
    """Expose Honcho recall/record as MCP tools (follows register(mcp) pattern)."""

    @mcp.tool()
    def honcho_recall(query: str, room: str = "default") -> str:
        """Recall Honcho memory for query in LiveKit room session — risk:read."""
        try:
            result = recall(query, room=room)
            return str(result)
        except Exception as exc:
            return f"honcho recall unavailable: {exc}"

    @mcp.tool()
    def honcho_record(content: str, room: str = "default", peer: str = "user") -> str:
        """Record content into Honcho room session — risk:write."""
        try:
            record(content, room=room, peer=peer)
            return "ok"
        except Exception as exc:
            return f"honcho record unavailable: {exc}"
