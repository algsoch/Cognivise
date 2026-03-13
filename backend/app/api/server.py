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

# ── Engagement processor reference — set by main_agent so /api/analyze-frame
# can run face analysis on frames sent directly from the browser (bypasses
# the Stream WebRTC path which often fails to deliver frames to the agent).
_active_eng_processor = None

def set_engagement_processor(proc) -> None:
    global _active_eng_processor
    _active_eng_processor = proc

def get_engagement_processor():
    return _active_eng_processor

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

    # ── RESET stale config from previous session ───────────────────────────
    # Each /api/join is a brand-new session — don't carry over topic/transcript from last one
    _pending_session_config.clear()

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
                    except Exception:
                        msg = {}

                    # ── Typed learner message ─────────────────────────────
                    text = msg.get("learner_message", "").strip() if isinstance(msg, dict) else raw.strip()
                    if text and _active_reasoning_loop is not None:
                        asyncio.run_coroutine_threadsafe(
                            _active_reasoning_loop.handle_learner_answer(text, 0.0),
                            _main_loop,
                        )
                        # NOTE: do NOT broadcast learner_speech here — the frontend
                        # already adds the typed message to the log immediately in
                        # handleSend(). Broadcasting it would echo it once per open
                        # WebSocket connection, causing duplicate log entries.

                    # ── Browser face metrics (MediaPipe WASM → backend) ───
                    # FaceMonitorOverlay computes real face data at 5fps and
                    # sends it here.  Inject into EngagementProcessor so the
                    # ReasoningLoop has real signals to act on.
                    elif isinstance(msg, dict) and "face_metrics" in msg:
                        fm = msg["face_metrics"]
                        try:
                            from backend.app.models.learning_state import EngagementSignal as _ES
                            from backend.app.processors.engagement_processor import EngagementUpdatedEvent as _EUE
                            sig = _ES(
                                face_detected      = bool(fm.get("face_detected", False)),
                                gaze_on_screen     = bool(fm.get("gaze_on_screen", True)),
                                blink_rate         = float(fm.get("blink_rate", 15.0)),
                                restlessness_score = float(fm.get("restlessness", 0.0)),
                                head_pose_confidence = 1.0,
                                head_yaw           = float(fm.get("head_yaw", 0.0)),
                                head_pitch         = float(fm.get("head_pitch", 0.0)),
                            )
                            # Inject into engagement processor (used by ReasoningLoop._tick)
                            if _active_reasoning_loop is not None:
                                ep = _active_reasoning_loop._eng_processor
                                if ep is not None:
                                    ep._latest_signal = sig
                                    # Also fire event so AttentionProcessor updates
                                    if ep._events:
                                        ep._events.send(_EUE(signal=sig, engagement_score=sig.to_score()))
                            # Always broadcast back immediately so frontend metrics panel updates
                            score = sig.to_score()
                            MetricsBroadcaster.instance().push({
                                "face_detected"       : sig.face_detected,
                                "gaze_on_screen"      : sig.gaze_on_screen,
                                "blink_rate"          : round(sig.blink_rate, 1),
                                "restlessness"        : round(sig.restlessness_score, 3),
                                "head_yaw"            : round(sig.head_yaw, 1),
                                "head_pitch"          : round(sig.head_pitch, 1),
                                "head_pose_confidence": 1.0,
                                "engagement_score"    : round(score, 1),
                            })
                        except Exception as _fe:
                            logger.debug("face_metrics inject error: %s", _fe)
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
    """Called by the frontend when the learner starts a session."""
    global _pending_session_config
    body = await request.json()
    _pending_session_config.update(body)
    logger.info("Session config updated: %s", {k: v for k, v in body.items() if k != 'video_transcript'})

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


@app.get("/api/youtube-transcript")
async def get_youtube_transcript(url: str):
    """
    Fetch the transcript for a YouTube video.
    Accepts full URLs (youtube.com/watch?v=) or short URLs (youtu.be/ID).
    Returns cleaned text with timestamps stripped.
    """
    import re as _re
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        return {"ok": False, "error": "youtube-transcript-api not installed"}

    # Extract video ID from any YouTube URL format
    video_id = None
    try:
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(url)
        if parsed.hostname in ("youtu.be",):
            video_id = parsed.path.lstrip("/").split("?")[0]
        elif parsed.hostname in ("www.youtube.com", "youtube.com"):
            if parsed.path.startswith("/embed/"):
                video_id = parsed.path.split("/embed/")[1].split("?")[0]
            else:
                qs = parse_qs(parsed.query)
                video_id = (qs.get("v") or [None])[0]
    except Exception:
        pass

    # Fallback: bare 11-char video ID
    if not video_id:
        m = _re.search(r"[a-zA-Z0-9_-]{11}", url)
        if m:
            video_id = m.group()

    if not video_id:
        return {"ok": False, "error": f"Could not extract video ID from: {url}"}

    try:
        # Try English first, then auto-generated, then any available
        fetched = YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US", "en-GB"])
        # Concatenate into a single clean text string
        raw_text = " ".join(entry["text"] for entry in fetched)
        # Remove music/sound cues like [Music] [Applause]
        clean_text = _re.sub(r"\[[^\]]+\]", "", raw_text)
        clean_text = _re.sub(r"\s+", " ", clean_text).strip()
        # Truncate to 8000 chars to fit in Gemini context without overflowing
        if len(clean_text) > 8000:
            clean_text = clean_text[:8000] + "..."
        logger.info("Fetched YouTube transcript for %s: %d chars", video_id, len(clean_text))
        # Also inject into pending session config so reasoning loop picks it up immediately
        _pending_session_config["video_transcript"] = clean_text
        return {"ok": True, "video_id": video_id, "transcript": clean_text, "length": len(clean_text)}
    except Exception as e:
        logger.warning("Transcript fetch failed for %s: %s", video_id, e)
        return {"ok": False, "error": str(e), "video_id": video_id}


@app.post("/api/analyze-frame")
async def analyze_frame(request: Request):
    """
    Receive a base64-encoded JPEG frame from the frontend webcam,
    run it through the EngagementProcessor vision pipeline, and
    return + broadcast computed metrics immediately.

    This bypasses the Stream WebRTC path which is unreliable for
    getting frames into the Vision Agents processor.

    Body: { "frame": "<base64 JPEG>", "width": int, "height": int }
    """
    import base64
    import numpy as np

    proc = _active_eng_processor
    if proc is None:
        return {"ok": False, "reason": "processor not ready"}

    try:
        body = await request.json()
        b64 = body.get("frame", "")
        if not b64:
            return {"ok": False, "reason": "no frame"}

        # Decode JPEG bytes → RGB numpy array
        raw_bytes = base64.b64decode(b64.split(",")[-1])  # strip data-URL prefix
        arr = np.frombuffer(raw_bytes, dtype=np.uint8)
        import cv2
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            return {"ok": False, "reason": "decode failed"}
        img_rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

        # Run full face / EAR / head-pose / motion analysis
        signal = proc._analyse(img_rgb)
        proc._latest_signal = signal
        proc._latest_frame  = img_rgb
        score = signal.to_score()

        # Derive gaze direction
        yaw, pitch = signal.head_yaw, signal.head_pitch
        if not signal.gaze_on_screen:
            gaze_dir = "away"
        elif abs(yaw) < 8 and abs(pitch) < 8:
            gaze_dir = "center"
        elif yaw > 12:    gaze_dir = "right"
        elif yaw < -12:   gaze_dir = "left"
        elif pitch < -10: gaze_dir = "up"
        elif pitch > 10:  gaze_dir = "down"
        else:             gaze_dir = "center"

        metrics = {
            "face_detected"       : signal.face_detected,
            "gaze_on_screen"      : signal.gaze_on_screen,
            "blink_rate"          : round(signal.blink_rate, 1),
            "restlessness"        : round(signal.restlessness_score, 3),
            "background_movement" : round(signal.restlessness_score, 3),
            "head_pose_confidence": round(signal.head_pose_confidence, 2),
            "engagement_score"    : round(score, 1),
            "head_yaw"            : round(signal.head_yaw, 1),
            "head_pitch"          : round(signal.head_pitch, 1),
            "eye_ar"              : round(proc._latest_ear, 3),
            "fixation_duration"   : round(proc._fixation_duration, 1),
            "eye_closure_duration": round(proc._eye_closure_duration, 3),
            "gaze_direction"      : gaze_dir,
            "people_count"        : proc._people_count,
        }
        MetricsBroadcaster.instance().push(metrics)
        return {"ok": True, **metrics}
    except Exception as exc:
        logger.warning("analyze-frame error: %s", exc)
        return {"ok": False, "reason": str(exc)}


# ── English Coach (Groq LLaMA) ─────────────────────────────────────────────────

_GROQ_ANALYZE_PROMPT = """\
You are an expert English communication coach. Analyze the following speech input from a learner.
Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{{
  "score": <integer 0-100>,
  "tone": "<formal|casual|neutral>",
  "corrections": [
    {{"word": "<original word>", "suggestion": "<better word>", "issue": "<brief explanation>"}}
  ],
  "grammar_notes": ["<note 1>", "<note 2>"],
  "overall_feedback": "<2-3 sentence constructive paragraph>",
  "improvement_tip": "<1 specific actionable tip for today>"
}}

Rules:
- score: 100 = perfect native-speaker English, 0 = incomprehensible
- corrections: only for WRONG or awkward word choices, filler words, unclear expressions
- grammar_notes: sentence-level grammar issues (tense, articles, prepositions, etc.)
- Keep all values concise. Maximum 3 corrections. Maximum 3 grammar notes.
- If speech is perfect, return empty arrays for corrections and grammar_notes.

Learner said: "{transcript}"
"""

_GROQ_REPEAT_PROMPT = """\
You are an English pronunciation and fluency coach. The learner was asked to repeat a sentence.
Analyze their response for accuracy, fluency mistakes, and missing words compared to natural spoken English.
Return ONLY valid JSON (no markdown):
{{
  "score": <integer 0-100>,
  "tone": "<formal|casual|neutral>",
  "corrections": [
    {{"word": "<problematic word>", "suggestion": "<correct form>", "issue": "<explanation>"}}
  ],
  "grammar_notes": ["<note>"],
  "overall_feedback": "<2-3 sentence evaluation of clarity and fluency>",
  "improvement_tip": "<specific pronunciation or fluency tip>"
}}

Learner said: "{transcript}"
"""

_GROQ_SENTENCE_PROMPT = """\
Generate ONE natural English sentence for a learner ({level} level) to practice speaking aloud.
The sentence should:
- Be realistic, conversational, and interesting
- Test common pronunciation challenges (for intermediate: words with 'th', 'r/l', silent letters, etc.)
- Be 10-20 words for beginner, 15-25 words for intermediate, 20-35 for advanced

Return ONLY valid JSON: {{"sentence": "<the sentence>"}}
"""


@app.post("/api/english-coach")
async def english_coach_analyze(request: Request):
    """
    Analyze a speech transcript using Groq LLaMA-3.
    Body: { "transcript": str, "mode": "analyze"|"repeat"|"topic" }
    """
    import json as _json
    try:
        from backend.app.config.settings import settings
        from groq import Groq
    except ImportError as e:
        return {"ok": False, "error": f"groq package not installed: {e}"}

    if not settings.groq_api_key:
        return {"ok": False, "error": "GROQ_API_KEY not configured"}

    try:
        body = await request.json()
        transcript = (body.get("transcript") or "").strip()
        mode       = body.get("mode", "analyze")
        if not transcript:
            return {"ok": False, "error": "transcript is required"}

        if mode == "repeat":
            prompt = _GROQ_REPEAT_PROMPT.format(transcript=transcript)
        else:
            prompt = _GROQ_ANALYZE_PROMPT.format(transcript=transcript)

        client   = Groq(api_key=settings.groq_api_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=700,
        )
        raw = response.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = _json.loads(raw)
        result["ok"] = True
        return result

    except Exception as exc:
        logger.error("English coach analyze error: %s", exc)
        return {"ok": False, "error": str(exc)}


@app.post("/api/english-coach/sentence")
async def english_coach_sentence(request: Request):
    """
    Generate a practice sentence for the learner to read aloud.
    Body: { "level": "beginner"|"intermediate"|"advanced" }
    """
    import json as _json
    try:
        from backend.app.config.settings import settings
        from groq import Groq
    except ImportError as e:
        return {"ok": False, "error": f"groq package not installed: {e}"}

    if not settings.groq_api_key:
        # Fallback sentences if key not set
        fallbacks = {
            "beginner":     "The weather is nice today. I like to walk in the park.",
            "intermediate": "She quickly realized that the beautiful weather would not last throughout the entire weekend.",
            "advanced":     "Despite the overwhelming evidence suggesting otherwise, the committee unanimously decided to proceed with the controversial proposal.",
        }
        try:
            body = await request.json()
            level = body.get("level", "intermediate")
        except Exception:
            level = "intermediate"
        return {"ok": True, "sentence": fallbacks.get(level, fallbacks["intermediate"])}

    try:
        body  = await request.json()
        level = body.get("level", "intermediate")

        client   = Groq(api_key=settings.groq_api_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": _GROQ_SENTENCE_PROMPT.format(level=level)}],
            temperature=0.9,
            max_tokens=120,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = _json.loads(raw)
        result["ok"] = True
        return result

    except Exception as exc:
        logger.error("English coach sentence error: %s", exc)
        return {"ok": False, "sentence": "Please describe your daily morning routine in detail.", "error": str(exc)}


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
