"""
attention_processor.py — Tracks continuous focus duration and distraction events.

Subscribes to EngagementUpdatedEvent from the engagement processor.
Maintains an AttentionSignal and emits AttentionUpdatedEvent.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

from vision_agents.core.events import BaseEvent
from vision_agents.core.processors import VideoProcessor

from backend.app.models.learning_state import AttentionSignal
from backend.app.processors.engagement_processor import EngagementUpdatedEvent
from backend.app.api.broadcaster import MetricsBroadcaster

logger = logging.getLogger(__name__)

# Threshold: engagement score below this = distraction event
_DISTRACTION_THRESHOLD = 40.0
# Debounce: minimum gap between distraction events (seconds)
_DISTRACTION_DEBOUNCE = 5.0


@dataclass
class AttentionUpdatedEvent(BaseEvent):
    type: str = "processor.attention.updated"
    signal: Optional[AttentionSignal] = None
    attention_score: float = 0.0


class AttentionProcessor(VideoProcessor):
    """
    Stateful processor that derives attention from engagement signal history.

    Does NOT process raw video frames directly — subscribes to
    EngagementUpdatedEvent instead.  Still registered as a processor so Vision
    Agents initialises it via attach_agent().
    """

    name = "attention_processor"

    def __init__(self):
        self._signal = AttentionSignal()
        self._focus_start: float = time.time()
        self._last_distraction: float = 0.0
        self._currently_distracted: bool = False
        self._events = None

    def attach_agent(self, agent) -> None:
        self._events = agent.events
        self._events.register(AttentionUpdatedEvent)
        # Subscribe to engagement events (subscribe() uses type hints on handler)
        agent.events.subscribe(self._on_engagement)

    async def process_video(self, track, participant_id, shared_forwarder=None) -> None:
        # Attention processor does not process raw video frames
        pass

    async def stop_processing(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def _on_engagement(self, event: EngagementUpdatedEvent):
        now = time.time()
        score = event.engagement_score
        sig   = getattr(event, 'signal', None)
        debounce_ok = (now - self._last_distraction) > _DISTRACTION_DEBOUNCE

        # Only flag as a distraction when the face IS physically detected but
        # engagement is low (e.g. looking away, fidgeting).
        # face_detected=False means the learner is watching their content —
        # NOT a distraction, just video-mode learning.
        face_present = sig.face_detected if sig is not None else (score > 15.0)

        if face_present and score < _DISTRACTION_THRESHOLD:
            if not self._currently_distracted and debounce_ok:
                # Distraction started
                self._signal.distraction_count += 1
                self._signal.last_distraction_at = now
                self._last_distraction = now
                self._currently_distracted = True
                self._focus_start = now  # reset focus timer
        else:
            if self._currently_distracted:
                # Recovered from distraction — restart focus timer
                self._focus_start = now
            self._currently_distracted = False

        # Update focus duration
        if not self._currently_distracted:
            self._signal.focus_duration_seconds = now - self._focus_start
        else:
            self._signal.focus_duration_seconds = 0.0

        self._signal.timestamp = now
        att_score = self._signal.to_score()

        if self._events:
            self._events.send(
                AttentionUpdatedEvent(signal=self._signal, attention_score=att_score)
            )

        MetricsBroadcaster.instance().push({
            "attention_score": round(att_score, 1),
            "focus_duration": round(self._signal.focus_duration_seconds, 1),
            "distraction_count": self._signal.distraction_count,
        })

    @property
    def latest_signal(self) -> AttentionSignal:
        return self._signal
