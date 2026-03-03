"""
broadcaster.py — Thread-safe singleton that holds the latest learning-state
snapshot and pushes it to all connected WebSocket clients.

Processors call MetricsBroadcaster.push(...) from Vision Agents event loop.
FastAPI WebSocket handler reads from it on its own loop.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from typing import Any, Dict, List, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Keys that carry one-shot event payloads (speech, action) — they must be
# cleared from _state after each broadcast so reconnecting clients don't
# receive stale events as if they were fresh.
_TRANSIENT_KEYS = {
    "agent_speech", "agent_action", "agent_action_topic",
    "agent_transcript", "learner_speech",
}


class MetricsBroadcaster:
    """Singleton – use MetricsBroadcaster.instance()."""

    _lock = threading.Lock()
    _inst: "MetricsBroadcaster | None" = None

    @classmethod
    def instance(cls) -> "MetricsBroadcaster":
        with cls._lock:
            if cls._inst is None:
                cls._inst = cls()
            return cls._inst

    def __init__(self) -> None:
        # Latest snapshot (built by processors)
        self._state: Dict[str, Any] = {
            "connected": True,
            "agent_status": "connected",
            # Stream WebRTC call info — set by join_call so frontend can join
            "call_id": None,
            "call_type": "default",
            "current_topic": None,          # auto-detected from screen or set via /api/session/config
            "face_detected": False,
            "gaze_on_screen": True,
            "blink_rate": 15.0,
            "restlessness": 0.0,
            "head_yaw": 0.0,
            "head_pitch": 0.0,
            "engagement_score": 50.0,
            "attention_score": 50.0,
            "cognitive_load_score": 50.0,
            "performance_score": 50.0,
            "learner_state": "neutral",
            "intervention_type": "none",
            "intervention_message": "",
            "last_updated": time.time(),
        }
        self._clients: Set[WebSocket] = set()
        self._clients_lock = threading.Lock()
        # The asyncio loop that the FastAPI server runs on
        self._loop: asyncio.AbstractEventLoop | None = None

    # ── Called by FastAPI server on startup ───────────────────────────────
    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    # ── Called by processors (from Vision Agents loop) ────────────────────
    def push(self, patch: Dict[str, Any]) -> None:
        """Thread-safe state update. Triggers a broadcast."""
        self._state.update(patch)
        self._state["last_updated"] = time.time()
        self._schedule_broadcast()

    def _schedule_broadcast(self) -> None:
        if self._loop and not self._loop.is_closed():
            asyncio.run_coroutine_threadsafe(self._broadcast(), self._loop)

    # ── WebSocket lifecycle ───────────────────────────────────────────────
    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        with self._clients_lock:
            self._clients.add(ws)
        logger.info("Metrics WebSocket connected — %d clients", len(self._clients))
        # Send current state immediately — but strip transient event fields
        # so a freshly (re)connected client doesn't replay stale speech/actions.
        try:
            initial = {k: v for k, v in self._state.items() if k not in _TRANSIENT_KEYS}
            await ws.send_text(json.dumps(initial))
        except Exception:
            pass

    async def disconnect(self, ws: WebSocket) -> None:
        with self._clients_lock:
            self._clients.discard(ws)
        logger.info("Metrics WebSocket disconnected — %d clients", len(self._clients))

    async def _broadcast(self) -> None:
        payload = json.dumps(self._state)
        dead: List[WebSocket] = []
        with self._clients_lock:
            clients = list(self._clients)
        for ws in clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        if dead:
            with self._clients_lock:
                for ws in dead:
                    self._clients.discard(ws)
        # Clear transient event fields so the NEXT client to connect (or the
        # next reconnect after a 3-second drop) doesn't replay old speech.
        for key in _TRANSIENT_KEYS:
            self._state.pop(key, None)

    @property
    def state(self) -> Dict[str, Any]:
        return dict(self._state)
