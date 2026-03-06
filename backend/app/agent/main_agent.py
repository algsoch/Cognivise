"""
main_agent.py — The Vision Agents Agent definition.

Wires together:
  - Stream Edge (WebRTC)
  - Gemini Realtime (voice + video)
  - All 4 custom processors
  - Deepgram STT + ElevenLabs TTS
  - ReasoningLoop (background task)
  - MemoryManager
  - DB init

Entry points:
  create_agent(**kwargs) → Agent  (called by AgentLauncher)
  join_call(agent, call_type, call_id, user_id, topic)  (called by AgentLauncher)
"""

from __future__ import annotations

import logging
import os
import time
import asyncio
from typing import Optional

from google.genai.types import Blob as _GeminiBlob

from dotenv import load_dotenv

load_dotenv()

from vision_agents.core import Agent, AgentLauncher, User, Runner
from vision_agents.plugins import gemini, getstream

from backend.app.config.settings import settings
from backend.app.db.postgres import init_db, close_db
from backend.app.models.user_session import UserSession
from vision_agents.core.llm.events import (
    RealtimeUserSpeechTranscriptionEvent,
    RealtimeAgentSpeechTranscriptionEvent,
)
from backend.app.agent.memory_manager import MemoryManager
from backend.app.agent.reasoning_loop import ReasoningLoop, _is_generic_label
from backend.app.llm.claude_engine import ClaudeEngine
from backend.app.llm.gemini_engine import GeminiEngine
from backend.app.api.broadcaster import MetricsBroadcaster
from backend.app.processors.engagement_processor import EngagementProcessor
from backend.app.processors.attention_processor import AttentionProcessor
from backend.app.processors.behavior_processor import BehaviorProcessor
from backend.app.processors.cognitive_load_processor import CognitiveLoadProcessor

logger = logging.getLogger(__name__)

# Instructions are in tutor.md — resolved by vision_agents Instructions class
# from the cwd (project root) at startup.
_INSTRUCTIONS = "Read @backend/app/agent/tutor.md"


# ── Agent factory ─────────────────────────────────────────────────────────────
async def create_agent(**kwargs) -> Agent:
    """Called once per agent instance by AgentLauncher."""
    # Initialise DB inside the Vision Agents event loop so asyncpg connections
    # are bound to the same loop as all subsequent async DB calls.
    await init_db()
    logger.info("Database initialised")

    engagement_proc = EngagementProcessor(fps=settings.processor_fps)
    attention_proc = AttentionProcessor()
    behavior_proc = BehaviorProcessor(fps=5)
    cognitive_proc = CognitiveLoadProcessor(window_size=5)

    agent = Agent(
        edge=getstream.Edge(),
        agent_user=User(
            name="Algsoch",
            id="learning_agent",
            image="https://ui-avatars.com/api/?name=A&background=8b5cf6&color=fff",
        ),
        instructions=_INSTRUCTIONS,
        # Use library default model (gemini-2.5-flash-native-audio-preview-*) on
        # v1alpha — the ONLY API version that has a Live/BidiGenerateContent endpoint.
        # The 1011 "Deadline expired" errors were caused by the 15s greeting sleep
        # (idle session → Gemini kills it). Fixed: sleep reduced to 3s above.
        llm=gemini.Realtime(fps=settings.agent_fps),
        processors=[
            engagement_proc,
            attention_proc,
            behavior_proc,
            cognitive_proc,
        ],
    )

    # Increase Stream API HTTP timeout from 6s → 30s to avoid ReadTimeout on
    # slower connections or when Stream's API takes a moment to respond.
    agent.edge.client.timeout = 30.0

    return agent


# ── Call handler ───────────────────────────────────────────────────────────────
async def join_call(
    agent: Agent,
    call_type: str,
    call_id: str,
    user_id: str = "learner",
    topic: Optional[str] = None,
    **kwargs,
) -> None:
    """Executed when the agent joins a call."""

    # Grab processor instances from the agent
    eng_proc = next((p for p in agent.processors if isinstance(p, EngagementProcessor)), None)
    att_proc = next((p for p in agent.processors if isinstance(p, AttentionProcessor)), None)
    cog_proc = next((p for p in agent.processors if isinstance(p, CognitiveLoadProcessor)), None)

    # Build session + services
    memory = MemoryManager()
    claude = ClaudeEngine()
    gemini_engine = GeminiEngine()
    # Grab email + user_name from pending session config before creating session
    from backend.app.api.server import get_pending_session_config
    cfg = get_pending_session_config()
    user_email = cfg.pop("user_email", None) or None
    stored_name = cfg.pop("user_name", None) or None

    session = UserSession(user_id=user_id, call_id=call_id, current_topic=topic, email=user_email)
    await memory.create_session(session)

    # If no topic passed via framework kwargs, check the session config posted by the frontend
    if not topic:
        topic = cfg.pop("topic", None) or None   # pop so stale topic doesn't leak into next session
        if topic:
            session.current_topic = topic
            logger.info("Using topic from session config: %s", topic)
    if user_email:
        logger.info("Session email: %s", user_email)

    # Publish call info so the frontend can join via Stream WebRTC
    MetricsBroadcaster.instance().push({"call_id": call_id, "call_type": call_type})
    logger.info("Published call_id=%s to broadcaster", call_id)

    # Track whether Gemini TTS is available (False during Stream reconnects)
    _tts_ready = [False]   # list so inner async closure can mutate

    # Create and start reasoning loop
    async def _speak(text: str) -> None:
        """Make the agent speak `text` aloud via Gemini Realtime.

        send_realtime_input(text=X) delivers X as *user* speech, so we must
        send an *instruction* that prompts Gemini to speak, not the raw text.
        We use send_client_content (turn-based) which always triggers a model
        response — unlike send_realtime_input which can be swallowed by VAD
        when there is no active audio activity window.
        """
        if not _tts_ready[0]:
            logger.warning("⚠️  _speak SKIPPED — TTS not ready. Text was: %.80s", text)
            return
        logger.info("🔊 Agent speaking: %.100s", text)
        # Broadcast spoken text to frontend WebSocket so SpeechSynthesis fallback
        # can read it aloud in the browser (guaranteed, no Stream audio needed)
        MetricsBroadcaster.instance().push({"agent_speech": text})
        try:
            from google.genai.types import Content, Part as _Part
            _sess = getattr(agent.llm, '_real_session', None)
            if _sess is None:
                raise RuntimeError("Gemini session not established")
            # send_client_content guarantees a model reply regardless of VAD state
            await _sess.send_client_content(
                turns=Content(
                    role="user",
                    parts=[_Part(text=f"Say the following to the learner: {text}")],
                ),
                turn_complete=True,
            )
        except Exception as exc1:
            logger.warning("send_client_content failed (%s) — falling back to simple_response", exc1)
            try:
                await agent.llm.simple_response(text=f"Say the following to the learner: {text}")
            except Exception as exc2:
                logger.error("agent.say also failed — agent is mute: %s", exc2)

    reasoning = ReasoningLoop(
        session=session,
        claude=claude,
        gemini=gemini_engine,
        memory=memory,
        agent_speak_fn=_speak,
        agent_events=agent.events,
    )
    reasoning.set_processors(eng_proc, att_proc, cog_proc)

    # Register reasoning loop with server so typed frontend messages reach it
    from backend.app.api.server import set_reasoning_loop, clear_reasoning_loop
    set_reasoning_loop(reasoning)

    # Register transcript events so subscribe() can find them
    agent.events.register(
        RealtimeUserSpeechTranscriptionEvent,
        RealtimeAgentSpeechTranscriptionEvent,
        ignore_not_compatible=True,
    )

    # Register STT callback to feed transcript into the reasoning loop
    # Using agent.events.subscribe() with type hints — RealtimeUserSpeechTranscriptionEvent
    # fires when Gemini Realtime STT transcribes the learner
    @agent.events.subscribe
    async def _on_speech(event: RealtimeUserSpeechTranscriptionEvent):
        participant_id = event.user_id() or ""
        if participant_id != "learning_agent" and event.text:
            delay_ms = (time.time() - reasoning._question_asked_at) * 1000 if reasoning._question_asked_at else 0.0
            await reasoning.handle_learner_answer(event.text, delay_ms)
            session.add_transcript(f"Learner: {event.text}")
            # Broadcast so the frontend activity panel shows "You said:"
            MetricsBroadcaster.instance().push({"learner_speech": event.text})

    # Register for agent's spoken output (transcription of what Gemini actually said)
    # This fires AFTER Gemini speaks via WebRTC — used for display/transcript only.
    # TTS fallback uses agent_speech pushed from _speak() and greeting below.
    @agent.events.subscribe
    async def _on_agent_speech(event: RealtimeAgentSpeechTranscriptionEvent):
        if event.text:
            session.add_transcript(f"Agent: {event.text}")
            # Push transcript for display only (agent_transcript, not agent_speech)
            MetricsBroadcaster.instance().push({"agent_transcript": event.text})

    # create_user must be called before create_call so the Stream transport
    # has agent_user_id set (it is normally set inside agent.join() but we
    # need it earlier to create/get the call first).
    await agent.create_user()

    call = None
    for attempt in range(1, 4):
        try:
            call = await agent.create_call(call_type, call_id)
            break
        except Exception as e:
            if attempt < 3:
                logger.warning("create_call attempt %d failed (%s), retrying in 3s…", attempt, e)
                await asyncio.sleep(3)
            else:
                raise

    assert call is not None, "create_call should have raised before reaching here"

    # ── Gemini session reconnect loop ─────────────────────────────────────────
    _GEMINI_DROP_HINTS = (
        "1006", "1011", "1012", "1013", "1014",
        "abnormal closure", "keepalive ping timeout",
        "ConnectionClosed", "timed out while closing",
        "Deadline expired",   # Gemini idle session killed server-side
    )
    MAX_RECONNECTS = 50   # more retries — sessions can reconnect indefinitely
    _reconnect_delay = 2  # start fast; backoff only on repeated drops
    _first_join = True
    _reasoning_started = False    # start once; persists across Gemini drops

    # Gemini Live disconnects with 1011 "keepalive ping timeout" after ~2 min
    # of learner silence (no audio flowing). Reconnect proactively every 2 min
    # AND send silent-audio heartbeats every 45 s to keep the WS alive during
    # a video-watching/silent learner session.
    PROACTIVE_RECONNECT = 120   # 2 min — safely before Gemini's idle timeout

    for _attempt in range(MAX_RECONNECTS):
        try:
            async with asyncio.timeout(PROACTIVE_RECONNECT):
                async with agent.join(call):
                    # Start reasoning loop only after WebRTC is established.
                    if not _reasoning_started:
                        await reasoning.start()
                        _reasoning_started = True
                        logger.info("✅ ReasoningLoop started — agent is now active")

                    # Allow _speak to work now that Gemini is connected
                    _tts_ready[0] = True
                    logger.info("✅ _tts_ready = True (Gemini live, attempt %d)", _attempt)

                    # ── Heartbeat: keep Gemini WS alive during learner silence ──
                    # Gemini drops with 1011 if no audio for ~2 min.  Send 100ms
                    # of zeroed PCM every 20s as an inaudible keepalive probe.
                    # IMPORTANT: first probe fires IMMEDIATELY to warm the WS before
                    # the greeting wait period (not after a long sleep).
                    async def _gemini_heartbeat():
                        _silence = bytes(3200)   # 100ms @ 16kHz mono 16-bit
                        first = True
                        while _tts_ready[0]:
                            # First beat immediately (no wait) — keeps WS warm during join
                            if first:
                                first = False
                            else:
                                await asyncio.sleep(20)
                            if not _tts_ready[0]:
                                break
                            try:
                                _sess = getattr(agent.llm, '_real_session', None)
                                if _sess:
                                    await _sess.send_realtime_input(
                                        audio=_GeminiBlob(
                                            data=_silence,
                                            mime_type="audio/pcm;rate=16000",
                                        )
                                    )
                                    logger.debug("💓 Gemini heartbeat OK")
                            except asyncio.CancelledError:
                                break
                            except Exception as _hb_exc:
                                logger.debug("Gemini heartbeat stopped: %s", _hb_exc)
                                break   # session gone — outer loop will reconnect
                    _hb_task = asyncio.create_task(_gemini_heartbeat())

                    if _first_join:
                        # Wait up to 12s for learner's browser to connect,
                        # get a Stream token, join the call, and publish video.
                        # Short-circuit as soon as the processor sees their face.
                        for _w in range(12):
                            await asyncio.sleep(1)
                            if (
                                eng_proc
                                and getattr(eng_proc, 'latest_signal', None) is not None
                                and eng_proc.latest_signal.face_detected
                            ):
                                logger.info("👤 Learner face detected after %ds — sending greeting", _w + 1)
                                break
                        logger.info("⏱  Finished waiting for learner (12s max)")

                        # Re-read topic + learner name in case they were posted via /api/session/config
                        _live_topic = session.current_topic
                        _learner_name = None
                        try:
                            from backend.app.api.server import get_pending_session_config
                            _cfg = get_pending_session_config()
                            if not _live_topic or _is_generic_label(_live_topic):
                                _candidate = _cfg.pop("topic", None) or None
                                if not _is_generic_label(_candidate):
                                    _live_topic = _candidate
                                    session.current_topic = _live_topic
                            _learner_name = _cfg.get("user_name") or None
                        except Exception:
                            pass

                        # Treat generic mode labels as "no topic known yet"
                        if _is_generic_label(_live_topic):
                            _live_topic = None

                        # Personal greeting: use learner's real name if available
                        _name_part = f"{_learner_name}! " if _learner_name else "! "

                        # Greeting: send an INSTRUCTION to Gemini so it generates
                        # its own spoken greeting. send_client_content guarantees
                        # a model reply even when the learner hasn't spoken yet.
                        _greeting_prompt = (
                            f"A learner named {_learner_name or 'the student'} just joined your tutoring session. "
                            f"Greet them by name warmly. Introduce yourself as Algsoch, their AI learning tutor. "
                            f"Tell them you're watching their video about '{_live_topic}' and you'll ask questions "
                            f"to help them understand it deeper. Keep it under 2 sentences."
                            if _live_topic else
                            f"A learner named {_learner_name or 'the student'} just joined your tutoring session. "
                            f"Greet them by name warmly. Introduce yourself as Algsoch, their AI learning tutor. "
                            f"Ask what topic or video they're studying today. Keep it under 2 sentences."
                        )
                        # Also push a short speech text so the TTS fallback fires in the browser
                        _greet_speech = (
                            f"Hey{_name_part}I'm Algsoch, your AI tutor! I see you're watching '{_live_topic}'. Let's learn it together!"
                            if _live_topic else
                            f"Hey{_name_part}I'm Algsoch, your AI tutor! What are you studying today?"
                        )
                        MetricsBroadcaster.instance().push({"agent_speech": _greet_speech, "agent_action": "greeting"})
                        logger.info("🎙️  Sending greeting prompt (topic=%s)", _live_topic or 'none')
                        try:
                            from google.genai.types import Content, Part as _Part
                            _gsess = getattr(agent.llm, '_real_session', None)
                            if _gsess:
                                await _gsess.send_client_content(
                                    turns=Content(
                                        role="user",
                                        parts=[_Part(text=_greeting_prompt)],
                                    ),
                                    turn_complete=True,
                                )
                            else:
                                await agent.llm.simple_response(text=_greeting_prompt)
                        except Exception as exc:
                            logger.warning("Greeting send_client_content failed (%s) — using simple_response", exc)
                            try:
                                await agent.llm.simple_response(text=_greeting_prompt)
                            except Exception as exc2:
                                logger.error("Greeting failed entirely: %s", exc2)
                        _first_join = False
                    else:
                        # Proactive reconnect — session refreshed silently
                        logger.info("🔄 Gemini proactively reconnected (attempt %d)", _attempt)
                        _reconnect_delay = 2   # reset backoff after successful reconnect
                        # No "I'm back" message — reconnects happen silently every 2 min

                    try:
                        await agent.finish()
                    finally:
                        _hb_task.cancel()
                        try:
                            await _hb_task
                        except asyncio.CancelledError:
                            pass

            # Clean exit from agent.join (shouldn't normally happen — proactive reconnect
            # fires via TimeoutError above). Treat as session end.
            _tts_ready[0] = False
            logger.info("agent.join exited cleanly — session complete")
            break

        except asyncio.TimeoutError:
            # Normal proactive reconnect at 8-minute mark (or stuck join watchdog)
            _tts_ready[0] = False
            logger.info(
                "🔄 Proactive Gemini reconnect at %ds (attempt %d) — recreating call",
                PROACTIVE_RECONNECT, _attempt + 1,
            )
            # No backoff for proactive reconnects — just recreate immediately
            try:
                call = await agent.create_call(call_type, call_id)
            except Exception as e2:
                logger.error("Failed to recreate call after proactive reconnect: %s", e2)
                if _attempt < MAX_RECONNECTS - 1:
                    await asyncio.sleep(5)
                    try:
                        call = await agent.create_call(call_type, call_id)
                    except Exception:
                        break
                else:
                    break

        except Exception as exc:
            _tts_ready[0] = False
            err_str = str(exc)
            is_gemini_drop = any(hint in err_str for hint in _GEMINI_DROP_HINTS)

            if is_gemini_drop and _attempt < MAX_RECONNECTS - 1:
                logger.warning(
                    "⚠️  Gemini session dropped (attempt %d/%d): %s — reconnecting in %ds",
                    _attempt + 1, MAX_RECONNECTS, type(exc).__name__, _reconnect_delay,
                )
                await asyncio.sleep(_reconnect_delay)
                _reconnect_delay = min(_reconnect_delay * 2, 15)  # cap at 15s not 30s
                try:
                    call = await agent.create_call(call_type, call_id)
                except Exception as e2:
                    logger.error("Failed to recreate call after Gemini drop: %s", e2)
                    break
            else:
                logger.error("Unhandled error in join loop: %s", exc, exc_info=True)
                raise

    await reasoning.stop()
    await memory.close_session(session)

    # Flush mastery to DB
    for t, m in session.mastery.items():
        await memory.save_mastery(
            user_id=user_id,
            topic=t,
            mastery_score=m.mastery_score,
            attempts=m.attempts,
            correct=m.correct,
        )

    logger.info("Session %s ended — total interventions: %d", session.session_id, session.total_interventions)
