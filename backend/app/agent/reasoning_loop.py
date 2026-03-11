"""
reasoning_loop.py — The closed-loop cognitive intelligence engine.

This runs as a background asyncio task alongside the Vision Agents realtime loop.
Every ENGAGEMENT_CHECK_INTERVAL seconds it:

  1. Reads current engagement, attention, cognitive load signals
  2. Computes the composite LearningStateSnapshot
  3. Determines the appropriate intervention
  4. Generates and delivers the intervention via the agent (TTS / text)
  5. Persists everything to PostgreSQL

The loop deliberately does NOT interrupt when the learner is speaking
(respects VAD / turn detection).
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from backend.app.config.settings import settings
from backend.app.llm.claude_engine import ClaudeEngine
from backend.app.llm.gemini_engine import GeminiEngine
from backend.app.models.learning_state import (
    CognitiveLoadSignal,
    EngagementSignal,
    AttentionSignal,
    InterventionType,
    LearnerState,
    LearningStateSnapshot,
)
from backend.app.models.user_session import UserSession
from backend.app.agent.memory_manager import MemoryManager
from backend.app.processors.cognitive_load_processor import LearnerResponseEvent
from backend.app.api.broadcaster import MetricsBroadcaster

logger = logging.getLogger(__name__)

# Labels sent by the frontend that describe the *mode* of content delivery,
# not the actual learning topic. We must never use these as topics for
# questions, greetings, or mastery tracking.
_GENERIC_LABELS: frozenset[str] = frozenset({
    "screen share", "screenshare", "youtube", "upload",
    "video", "screen", "webcam", "camera", "stream",
    "presentation", "slide", "unknown", "none", "",
})


def _is_generic_label(label: str | None) -> bool:
    """Return True if *label* is a content-mode name rather than a real topic."""
    if not label:
        return True
    return label.strip().lower() in _GENERIC_LABELS


class ReasoningLoop:
    """
    Background task that monitors learner state and fires adaptive interventions.

    Attach processors before starting:
        loop.set_processors(eng, att, cog)
    """

    def __init__(
        self,
        session: UserSession,
        claude: ClaudeEngine,
        gemini: GeminiEngine,
        memory: MemoryManager,
        agent_speak_fn,   # async callable: (text: str) -> None
        agent_events,     # vision-agents Events bus
    ):
        self._session = session
        self._claude = claude
        self._gemini = gemini
        self._memory = memory
        self._speak = agent_speak_fn
        self._events = agent_events

        # Processor handles (set via set_processors)
        self._eng_processor = None
        self._att_processor = None
        self._cog_processor = None

        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._pending_question: Optional[dict] = None
        self._question_asked_at: Optional[float] = None

        # Subscribe to STT transcripts to track learner speech
        self._last_learner_speech_at: float = time.time()  # init to now so silence check doesn't fire immediately
        self._last_silence_checkin_at: float = 0.0         # tracks last time silence msg was sent
        self._speech_start_time: float = 0.0

        # Screen content analysis state
        self._last_screen_analysis_at: float = 0.0    # epoch seconds
        self._last_screen_topic: Optional[str] = None  # topic extracted from last frame
        self._prev_frame_hash: Optional[int] = None    # hash of last frame for pause detection
        self._stable_frame_since: Optional[float] = None  # when current frame became stable
        self._screen_question_cooldown: float = 0.0    # don't ask screen questions too often

        # 2-minute periodic comprehension check
        self._last_periodic_question_at: float = time.time()   # tracks 2-min timer
        self._periodic_question_interval: float = 120.0        # fire every 2 minutes

    def set_processors(self, engagement, attention, cognitive_load) -> None:
        self._eng_processor = engagement
        self._att_processor = attention
        self._cog_processor = cognitive_load

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("ReasoningLoop started for session %s", self._session.session_id)

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    # ── Main loop ─────────────────────────────────────────────────────────────
    async def _loop(self) -> None:
        interval = settings.engagement_check_interval        # First tick fires immediately so that the frontend shows real state
        # right away instead of waiting for the first interval to elapse.
        try:
            await self._tick()
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.error("ReasoningLoop initial tick error: %s", exc, exc_info=True)

        while self._running:
            try:
                await asyncio.sleep(interval)
                await self._tick()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("ReasoningLoop tick error: %s", exc, exc_info=True)

    async def _tick(self) -> None:
        """Single reasoning cycle."""
        session = self._session

        # Safety guard: if topic was accidentally set to the user's own name
        # (happens when a YouTube channel URL is used instead of a content URL),
        # clear it so the extraction logic can try again.
        if session.current_topic and session.user_name:
            if session.current_topic.strip().lower() == session.user_name.strip().lower():
                session.current_topic = None
                logger.info("Topic reset — was same as user_name '%s'", session.user_name)

        # Sync topic from session config if not yet set (user may have posted it
        # via /api/session/config after the agent already joined)
        if not session.current_topic or _is_generic_label(session.current_topic):
            try:
                from backend.app.api.server import get_pending_session_config
                cfg = get_pending_session_config()
                _t = cfg.pop("topic", None)   # pop to avoid stale topic leaking into next session
                if _is_generic_label(_t):
                    _t = None
                if not _t:
                    # content_label is the raw YouTube title / filename — extract the real
                    # academic subject from it using Gemini text rather than using it verbatim.
                    _candidate = cfg.get("content_label")
                    if _candidate and not _is_generic_label(_candidate):
                        try:
                            _extracted = await asyncio.wait_for(
                                self._gemini.extract_topic_from_title(_candidate),
                                timeout=8.0,
                            )
                            if _extracted and not _is_generic_label(_extracted):
                                _t = _extracted
                                logger.info("Topic extracted from content_label '%s' → '%s'", _candidate, _t)
                        except asyncio.TimeoutError:
                            logger.debug("Topic extraction timed out — using raw label")
                            # Fall back to using the raw label directly rather than skipping
                            _t = _candidate
                        except Exception as _ex:
                            logger.debug("Topic title extraction failed: %s", _ex)
                            _t = _candidate  # fall back to raw label
                if _t:
                    session.current_topic = _t
                    MetricsBroadcaster.instance().push({"current_topic": _t})
                    logger.info("Topic set from session config: %s", session.current_topic)
            except Exception:
                pass

        # Collect current signals
        eng_signal = self._eng_processor.latest_signal if self._eng_processor else EngagementSignal()
        att_signal = self._att_processor.latest_signal if self._att_processor else AttentionSignal()
        cog_signal = self._cog_processor.latest_signal if self._cog_processor else CognitiveLoadSignal()

        # ── Screen content analysis (every 90s) ──────────────────────────────
        # Grabs the latest video frame, extracts the on-screen topic via Gemini Flash,
        # and detects video pauses to fire comprehension questions automatically.
        # 90s interval because the free-tier Gemini quota is shared with question gen.
        _now = time.time()
        if self._eng_processor and (_now - self._last_screen_analysis_at) >= 90.0:
            frame = getattr(self._eng_processor, "latest_frame", None)
            if frame is not None:
                # 1. Extract topic from what's on screen via Gemini Vision
                # This always takes priority over generic content_label values.
                try:
                    topic_from_screen = await self._gemini.extract_topic_from_slide(frame)
                    if topic_from_screen and not _is_generic_label(topic_from_screen):
                        self._last_screen_topic = topic_from_screen
                        # Always override with the frame-extracted topic — Gemini
                        # vision reading the actual screen beats any title heuristic.
                        if topic_from_screen != session.current_topic:
                            session.current_topic = topic_from_screen
                            logger.info("Topic updated from screen frame: %s", topic_from_screen)
                            MetricsBroadcaster.instance().push({"current_topic": topic_from_screen})
                except Exception as _exc:
                    logger.debug("Screen topic extraction failed: %s", _exc)

                # 2. Video-pause detection via lightweight frame hash
                try:
                    import numpy as np
                    small = frame[::10, ::10, 0]   # 10× downsample — fast
                    fhash = hash(small.tobytes())
                    if fhash == self._prev_frame_hash:
                        if self._stable_frame_since is None:
                            self._stable_frame_since = _now
                        elif (
                            _now - self._stable_frame_since >= 5.0          # stable ≥5s
                            and _now - self._screen_question_cooldown >= 30.0  # 30s cooldown
                            and not self._pending_question
                            and (self._last_screen_topic or session.current_topic)
                        ):
                            # Video is paused — fire a comprehension question
                            screen_topic = self._last_screen_topic or session.current_topic
                            logger.info("Video paused ≥5s — asking about: %s", screen_topic)
                            try:
                                q_data = await self._claude.generate_question(
                                    topic=screen_topic,
                                    mastery_score=session.get_topic_mastery(screen_topic).mastery_score,
                                    recent_context=session.get_recent_transcript(n=4),
                                    question_type="comprehension",
                                )
                                qt = q_data.get(
                                    "question",
                                    f"You've been looking at {screen_topic} — "
                                    f"what's your understanding so far?",
                                )
                                await self._speak(qt)
                                self._pending_question = q_data
                                self._question_asked_at = _now
                                self._screen_question_cooldown = _now
                                session.last_intervention_at = _now
                            except Exception as _exc:
                                logger.debug("Screen-pause question failed: %s", _exc)
                    else:
                        self._stable_frame_since = None
                    self._prev_frame_hash = fhash
                except Exception as _exc:
                    logger.debug("Frame hash error: %s", _exc)

            self._last_screen_analysis_at = _now

        # Update performance from session
        perf = session.overall_performance

        snap = LearningStateSnapshot(
            session_id=session.session_id,
            user_id=session.user_id,
            engagement=eng_signal,
            attention=att_signal,
            cognitive_load=cog_signal,
            performance_score=perf,
        ).compute()

        session.record_state(snap)

        logger.info(
            "State tick — eng=%.1f att=%.1f load=%.1f state=%s → %s",
            snap.engagement_score,
            snap.attention_score,
            snap.cognitive_load_score,
            snap.learner_state.value,
            snap.recommended_intervention.value,
        )

        # Push full snapshot to frontend via broadcaster
        MetricsBroadcaster.instance().push({
            "engagement_score": round(snap.engagement_score, 1),
            "attention_score": round(snap.attention_score, 1),
            "cognitive_load_score": round(snap.cognitive_load_score, 1),
            "performance_score": round(snap.performance_score, 1),
            "learner_state": snap.learner_state.value,
            "face_detected": snap.engagement.face_detected,
            "gaze_on_screen": snap.engagement.gaze_on_screen,
            # Broadcast current topic (may be auto-detected from screen)
            "current_topic": session.current_topic,
        })

        # Persist (async fire-and-forget, don't block the loop)
        asyncio.create_task(self._memory.save_state_snapshot(snap))
        asyncio.create_task(self._memory.save_engagement_history(
            session.session_id, session.user_id, snap
        ))

        # Guard 1: Don't re-ask while a question is still pending an answer (45s grace)
        # This is THE main fix for repeated same-question spam when learner doesn't respond.
        if self._pending_question and self._question_asked_at:
            since_asked = time.time() - self._question_asked_at
            if since_asked < 45:   # 45s — give the learner time to respond
                logger.debug("Pending question unanswered (%.0fs/45s) — skipping intervention", since_asked)
                return
            else:
                # Grace period expired — clear the stale question so we can move on
                logger.info("Pending question timed out after %.0fs — will ask a new one", since_asked)
                self._pending_question = None

        # Guard 0: Silence check — if learner hasn't spoken in 40s+, fire a check-in
        # Only fires ONCE per silence period (reset when learner speaks).
        _silence = time.time() - self._last_learner_speech_at
        _since_last_silence = time.time() - self._last_silence_checkin_at
        if _silence > 40.0 and _since_last_silence > 60.0:
            topic = self._last_screen_topic or session.current_topic
            _name = session.user_name or ""
            _name_addr = f" {_name}," if _name else ""
            silence_msg = (
                f"Hey{_name_addr} you've gone quiet. Are you following so far?"
                if not topic or _is_generic_label(topic)
                else f"Hey{_name_addr} you've gone quiet — tell me one thing you understand about {topic} so far."
            )
            await self._speak(silence_msg)
            session.last_intervention_at = time.time()
            self._last_silence_checkin_at = time.time()
            MetricsBroadcaster.instance().push({"intervention_type": "check_in"})
            return

        # ── 2-minute periodic comprehension check ────────────────────────────
        # Every 2 minutes, ask a question specifically about what the learner
        # is currently watching, regardless of learner state.  This is the
        # "stay engaged and prove you're following" feature.
        _now_t = time.time()
        _since_periodic = _now_t - self._last_periodic_question_at
        if _since_periodic >= self._periodic_question_interval and not self._pending_question:
            topic = self._last_screen_topic or session.current_topic
            if topic and not _is_generic_label(topic):
                _name = session.user_name or ""
                _name_addr = f" {_name}" if _name else ""
                logger.info("⏱️  2-min periodic check — asking about: %s", topic)
                try:
                    context = session.get_recent_transcript(n=6)
                    mastery = session.get_topic_mastery(topic).mastery_score
                    q_data = await self._gemini.generate_question(
                        topic=topic,
                        mastery_score=mastery,
                        recent_context=context,
                        question_type="comprehension",
                        learner_name=_name or None,
                        video_transcript=session.video_transcript or None,
                    )
                    question_text = q_data.get("question") or f"Quick check{_name_addr} — what's one key thing you've learned about {topic} just now?"
                    await self._speak(question_text)
                    self._pending_question = q_data
                    self._question_asked_at = _now_t
                    self._last_periodic_question_at = _now_t
                    session.last_intervention_at = _now_t
                    MetricsBroadcaster.instance().push({
                        "intervention_type": "periodic_check",
                        "intervention_message": "Periodic comprehension check",
                    })
                    return
                except Exception as _exc:
                    logger.debug("Periodic question failed: %s", _exc)
            # Reset timer even if no topic yet to avoid hammering on empty topic
            self._last_periodic_question_at = _now_t

        # Guard 2: Cooldown between any two interventions
        since_last = time.time() - session.last_intervention_at
        _cooldown = getattr(settings, 'intervention_cooldown_seconds', 60)
        if since_last < _cooldown:
            logger.debug("Throttled — last intervention %.0fs ago (min %ds)", since_last, _cooldown)
            return   # Too soon

        # Fire intervention if warranted
        intervention = snap.recommended_intervention
        if intervention == InterventionType.NONE:
            return

        logger.info("🎯 Firing intervention: %s (state=%s, topic=%s)", intervention.value, snap.learner_state.value, session.current_topic)
        await self._fire_intervention(snap, intervention)

    async def _fire_intervention(
        self, snap: LearningStateSnapshot, intervention: InterventionType
    ) -> None:
        session = self._session
        # Use screen-detected topic if available; fall back to session topic.
        topic = self._last_screen_topic or session.current_topic

        # Learner name for personalized messages
        _name = session.user_name or ""
        _name_addr = f" {_name}" if _name else ""

        # For ENGAGE and CHECK_IN, fire even without a topic.
        # For content-specific interventions (ASK_QUESTION, etc), need a topic.
        needs_topic = intervention not in (
            InterventionType.ENGAGE,
            InterventionType.CHECK_IN,
            InterventionType.ENCOURAGEMENT,
        )
        if needs_topic and _is_generic_label(topic):
            logger.info(
                "No topic yet — converting %s → CHECK_IN", intervention.value
            )
            intervention = InterventionType.CHECK_IN
            topic = None

        # Safe fallback label for topic-referencing strings
        topic = topic or "the current topic"

        # Broadcast the agent's intent so the frontend activity panel updates immediately
        from backend.app.api.broadcaster import MetricsBroadcaster as _MB
        _MB.instance().push({
            "agent_action": intervention.value,
            "agent_action_topic": topic if topic != "the current topic" else None,
        })

        context = session.get_recent_transcript(n=8)

        # Use Gemini as the primary question engine; fall back to Claude only if
        # it is explicitly configured with a real API key.
        _primary = self._gemini   # always available (same Gemini key as Realtime)
        _claude_ok = getattr(self._claude, '_enabled', False)

        try:
            if intervention == InterventionType.ASK_QUESTION:
                mastery = session.get_topic_mastery(topic).mastery_score
                q_data = await _primary.generate_question(
                    topic=topic,
                    mastery_score=mastery,
                    recent_context=context,
                    question_type="recall",
                    learner_name=_name or None,
                    video_transcript=session.video_transcript or None,
                )
                question_text = q_data.get("question") or f"Hey{_name_addr} — can you explain what you know about {topic}?"
                self._pending_question = q_data
                self._question_asked_at = time.time()
                await self._speak(question_text)

            elif intervention == InterventionType.SIMPLIFY:
                msg = await _primary.simplify_explanation(concept=topic, current_explanation=context)
                await self._speak(f"Let me break that down for you{_name_addr}. {msg}")

            elif intervention == InterventionType.BREAK_DOWN:
                sub_concepts = await _primary.break_down_concept(topic, context)
                parts = ", ".join(sub_concepts[:3])
                await self._speak(f"Let's take this step by step{_name_addr}. We'll look at: {parts}.")

            elif intervention == InterventionType.INCREASE_DIFFICULTY:
                q_data = await _primary.generate_question(
                    topic=topic,
                    mastery_score=90.0,
                    recent_context=context,
                    question_type="application",
                    learner_name=_name or None,
                    video_transcript=session.video_transcript or None,
                )
                self._pending_question = q_data
                self._question_asked_at = time.time()
                await self._speak(q_data.get("question") or f"Nice work{_name_addr}! Here's a more challenging question.")

            elif intervention == InterventionType.ACTIVE_RECALL:
                # Prefer screen-detected topic if available
                recall_topic = self._last_screen_topic or topic
                await self._speak(
                    f"Quick recall check{_name_addr} — tell me in your own words what "
                    f"{recall_topic} means to you so far."
                )
                self._question_asked_at = time.time()
                self._pending_question = {
                    "question": f"Explain {recall_topic} in your own words.",
                    "expected_answer_points": [],
                    "difficulty": "recall",
                }

            elif intervention == InterventionType.CHECK_IN:
                # Use topic-aware message instead of generic "are you with me?"
                if session.current_topic and not _is_generic_label(session.current_topic):
                    await self._speak(
                        f"How's it going{_name_addr}? How's your understanding of "
                        f"{session.current_topic} — any parts that feel tricky?"
                    )
                else:
                    await self._speak(
                        f"How are you finding this so far{_name_addr}? "
                        f"Let me know if you want anything explained differently."
                    )

            elif intervention == InterventionType.ENCOURAGEMENT:
                await self._speak(f"You're doing great{_name_addr} — keep it up! Stay focused.")

            elif intervention == InterventionType.ENGAGE:
                # This fires when state = NEUTRAL (very start of session)
                # Only fires if intervention was NOT blocked by the cooldown guard
                # (joining creates last_intervention_at = now, so this will be
                # suppressed for the first cooldown_seconds after session start)
                topic_str = session.current_topic
                if topic_str and not _is_generic_label(topic_str):
                    await self._speak(
                        f"Hey{_name_addr}! I can see you're here to learn about {topic_str}. "
                        f"Let's get started — what do you already know about it?"
                    )
                else:
                    await self._speak(
                        f"Hey{_name_addr}! I'm your AI tutor. "
                        f"Tell me — what topic or video are you studying today?"
                    )

            session.last_intervention_at = time.time()
            session.total_interventions += 1

            # Push intervention to frontend
            MetricsBroadcaster.instance().push({
                "intervention_type": intervention.value,
                "intervention_message": f"Adaptive response: {intervention.value.replace('_', ' ').title()}",
            })

            await self._memory.log_interaction(
                session_id=session.session_id,
                user_id=session.user_id,
                event_type=f"intervention:{intervention.value}",
                content=f"state={snap.learner_state.value}",
                agent_response=intervention.value,
            )

        except Exception as exc:
            logger.error("Intervention error (%s): %s", intervention.value, exc)

    # ── Answer evaluation ─────────────────────────────────────────────────────
    async def handle_learner_answer(self, text: str, response_delay_ms: float) -> None:
        """
        Called by the agent when the learner finishes speaking.
        Fires a LearnerResponseEvent and evaluates pending question if any.
        """
        session = self._session
        session.add_transcript(f"Learner: {text}")
        self._last_learner_speech_at = time.time()  # reset silence timer
        self._last_silence_checkin_at = 0.0          # allow next silence check fresh

        # Send for cognitive load processor (send() is synchronous)
        if self._events:
            self._events.send(LearnerResponseEvent(
                text=text,
                response_delay_ms=response_delay_ms,
            ))

        if not self._pending_question:
            return

        q = self._pending_question
        topic = session.current_topic or "general"

        # Use Gemini as primary evaluator (same key as Realtime — no extra cost)
        _primary = self._gemini
        _eval_start = time.time()
        eval_result = await _primary.evaluate_answer(
            question=q.get("question", ""),
            expected_points=q.get("expected_answer_points", []),
            learner_answer=text,
            topic=topic,
        )
        _ai_response_ms = round((time.time() - _eval_start) * 1000)

        correct = eval_result.get("correct", False)
        feedback = eval_result.get("feedback", "")
        score = eval_result.get("score", 0.5)

        session.record_answer(topic, correct)
        self._pending_question = None

        if self._cog_processor:
            self._cog_processor.record_answer(correct)

        # Deliver feedback
        if feedback:
            await self._speak(feedback)

        # Log
        await self._memory.log_interaction(
            session_id=session.session_id,
            user_id=session.user_id,
            event_type="answer_evaluated",
            content=text,
            agent_response=feedback,
            score=score,
        )

        # Update mastery in DB and broadcast to frontend
        tm = session.get_topic_mastery(topic)
        await self._memory.save_mastery(
            user_id=session.user_id,
            topic=topic,
            mastery_score=tm.mastery_score,
            attempts=tm.attempts,
            correct=tm.correct,
        )
        # Push mastery update so the frontend MasteryTracker refreshes
        _latency_patch = {"mastery": {topic: round(tm.mastery_score, 1)},
                          "ai_response_ms": _ai_response_ms}
        # Only send user latency if it was actually measured (>0)
        if response_delay_ms > 0:
            _latency_patch["user_response_ms"] = round(response_delay_ms)
        MetricsBroadcaster.instance().push(_latency_patch)
