"""
server.py — Lightweight FastAPI server running on port 8001.

Endpoints:
  GET  /health          → {"status": "ok"}
  GET  /api/state       → latest metrics snapshot
  WS   /ws/metrics      → real-time push
  POST /api/token       → Stream user token (for frontend WebRTC)

Run via start_api_server() which spawns a daemon thread with uvicorn.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Optional

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.broadcaster import MetricsBroadcaster

logger = logging.getLogger(__name__)

# Pending session config — populated by frontend POST /api/session/config
# before (or after) the agent joins, so the agent can pick up the topic.
_pending_session_config: dict = {}

# Reasoning loop reference — set by main_agent.join_call so typed messages
# from the frontend can be forwarded directly to handle_learner_answer.
_active_reasoning_loop = None

def set_reasoning_loop(loop) -> None:
    global _active_reasoning_loop
    _active_reasoning_loop = loop

def clear_reasoning_loop() -> None:
    global _active_reasoning_loop
    _active_reasoning_loop = None

# ── AgentLauncher reference — set by main.py after launcher is initialised ──
# The /api/join endpoint uses this to trigger launcher.start_session()
_launcher = None
_main_loop: Optional[asyncio.AbstractEventLoop] = None


def set_launcher(launcher, loop: asyncio.AbstractEventLoop) -> None:
    """Called from main.py to register the live launcher for /api/join."""
    global _launcher, _main_loop
    _launcher = launcher
    _main_loop = loop
    logger.info("AgentLauncher registered with API server")


def get_pending_session_config() -> dict:
    """Return the latest session config pushed by the frontend."""
    return _pending_session_config

app = FastAPI(title="Intelligent Learn Metrics API", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "intelligent-learn-metrics"}


@app.get("/api/state")
async def get_state():
    return MetricsBroadcaster.instance().state


@app.post("/api/join")
async def trigger_join(request: Request):
    """
    Called by the frontend when it creates a Stream call.
    Tells the backend agent to join that call_id so it can hear/speak.
    Body: { call_id, call_type?, user_id?, topic? }
    """
    global _pending_session_config

    body = await request.json()
    call_id   = body.get("call_id")
    call_type = body.get("call_type", "default")
    user_id   = body.get("user_id", "learner")
    topic     = body.get("topic") or ""
    user_name  = body.get("user_name") or ""
    user_email = body.get("user_email") or ""

    # Store for the reasoning loop to pick up
    if topic:
        _pending_session_config["topic"] = topic
    if user_id:
        _pending_session_config["user_id"] = user_id
    if user_name:
        _pending_session_config["user_name"] = user_name
    if user_email:
        _pending_session_config["user_email"] = user_email

    if not call_id:
        return {"ok": False, "error": "call_id is required"}

    if _launcher is None or _main_loop is None:
        # Launcher not ready yet — store call_id and it will be picked up
        _pending_session_config["pending_call_id"]   = call_id
        _pending_session_config["pending_call_type"] = call_type
        logger.warning("Launcher not ready — queued call_id %s", call_id)
        return {"ok": True, "queued": True, "call_id": call_id}

    # Launch the agent session on the main event loop (thread-safe)
    asyncio.run_coroutine_threadsafe(
        _launcher.start_session(call_id, call_type),
        _main_loop,
    )

    # Broadcast call_id so the frontend's WS client can sync
    MetricsBroadcaster.instance().push({
        "call_id":   call_id,
        "call_type": call_type,
    })

    logger.info("Triggered agent join for call_id=%s type=%s", call_id, call_type)
    return {"ok": True, "call_id": call_id, "call_type": call_type}


@app.websocket("/ws/metrics")
async def ws_metrics(websocket: WebSocket):
    broadcaster = MetricsBroadcaster.instance()
    try:
        await broadcaster.connect(websocket)
    except Exception:
        return
    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                # Forward typed learner messages to the reasoning loop
                if raw and raw.strip():
                    import json as _json
                    try:
                        msg = _json.loads(raw)
                        text = msg.get("learner_message", "").strip()
                    except Exception:
                        text = raw.strip()
                    if text and _active_reasoning_loop is not None:
                        asyncio.run_coroutine_threadsafe(
                            _active_reasoning_loop.handle_learner_answer(text, 0.0),
                            _main_loop,
                        )
                        # NOTE: do NOT broadcast learner_speech here — the frontend
                        # already adds the typed message to the log immediately in
                        # handleSend(). Broadcasting it would echo it once per open
                        # WebSocket connection, causing duplicate log entries.
            except asyncio.TimeoutError:
                pass
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        await broadcaster.disconnect(websocket)


@app.get("/api/token")
@app.post("/api/token")
async def get_stream_token(user_id: str = "learner"):
    """Generate a Stream user token for the frontend WebRTC client."""
    try:
        from backend.app.config.settings import settings
        from getstream import Stream

        client = Stream(api_key=settings.stream_api_key, api_secret=settings.stream_api_secret)
        token = client.create_token(user_id=user_id)
        return {"token": token, "user_id": user_id, "api_key": settings.stream_api_key}
    except Exception as e:
        logger.error("Token generation failed: %s", e)
        return {"error": str(e)}, 500


@app.post("/api/session/config")
async def set_session_config(request: Request):
    """
    Called by the frontend when the learner starts a session.
    Stores topic / user_id so the agent can pick them up on next join
    or update the live session mid-flight via a broadcast.
    """
    global _pending_session_config
    body = await request.json()
    _pending_session_config.update(body)
    logger.info("Session config updated: %s", body)

    # Only use an explicit topic (user-provided) as current_topic.
    # content_label is the raw YouTube/video title — it stays in pending config as
    # context for the agent but is NOT broadcast as current_topic right away.
    # extract_topic_from_slide (Gemini vision) will set the real topic once it
    # analyses the screen frame.
    explicit_topic = body.get("topic") or None
    if explicit_topic:
        _pending_session_config["topic"] = explicit_topic
        MetricsBroadcaster.instance().push({"current_topic": explicit_topic})
        logger.info("Explicit topic set: %s", explicit_topic)
    else:
        # Keep content_label in config for reasoning-loop context but don't show it as topic
        content_label = body.get("content_label") or None
        if content_label:
            _pending_session_config["content_label"] = content_label
            logger.info("content_label stored as context (not broadcast as topic): %s", content_label)

    return {"ok": True, "config": _pending_session_config}


# ── Server runner ─────────────────────────────────────────────────────────────

_server_thread: Optional[threading.Thread] = None


def start_api_server(port: int = 8001) -> None:
    """Start uvicorn in a daemon thread so it doesn't block Vision Agents."""
    global _server_thread

    if _server_thread and _server_thread.is_alive():
        return

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        # Give broadcaster a reference to this loop for cross-thread scheduling
        MetricsBroadcaster.instance().set_loop(loop)

        config = uvicorn.Config(app, host="0.0.0.0", port=port, loop="none", log_level="warning")
        server = uvicorn.Server(config)
        loop.run_until_complete(server.serve())

    _server_thread = threading.Thread(target=_run, daemon=True, name="metrics-api")
    _server_thread.start()
    logger.info("Metrics API server starting on http://0.0.0.0:%d", port)
