"""
cognitive_load_processor.py — Estimates cognitive overload from behavioural signals.

Sources:
  - Response latency (measured in the agent's interaction loop)
  - Recent error count from the session mastery model
  - Confusion language markers detected via STT

Does NOT process video frames directly.
Subscribes to agent interactions via the events system.
Provides a CognitiveLoadSignal that the reasoning loop reads.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from vision_agents.core.events import BaseEvent
from vision_agents.core.processors import VideoProcessor

from backend.app.models.learning_state import CognitiveLoadSignal
from backend.app.api.broadcaster import MetricsBroadcaster

logger = logging.getLogger(__name__)

# Language markers that suggest confusion / overload
_CONFUSION_MARKERS = [
    "i don't know",
    "i'm not sure",
    "confused",
    "don't understand",
    "what do you mean",
    "can you explain",
    "i forgot",
    "lost",
    "wait",
    "huh",
    "what?",
]


@dataclass
class CognitiveLoadUpdatedEvent(BaseEvent):
    type: str = "processor.cognitive_load.updated"
    signal: Optional[CognitiveLoadSignal] = None
    cognitive_load_score: float = 0.0


@dataclass
class LearnerResponseEvent(BaseEvent):
    """Fired by the agent reasoning loop when the learner speaks."""
    type: str = "processor.learner.response"
    text: str = ""
    response_delay_ms: float = 0.0
    was_correct: Optional[bool] = None


class CognitiveLoadProcessor(VideoProcessor):
    """
    Listens for learner response events and maintains a cognitive load estimate.
    """

    name = "cognitive_load_processor"

    def __init__(self, window_size: int = 5):
        """
        window_size: number of recent answers to consider for mistake counting.
        """
        self._window: list[bool] = []  # True = correct
        self._window_size = window_size
        self._signal = CognitiveLoadSignal()
        self._events = None

    def attach_agent(self, agent) -> None:
        self._events = agent.events
        self._events.register(CognitiveLoadUpdatedEvent)
        self._events.register(LearnerResponseEvent)
        # subscribe() uses type hints on handler to determine event type
        agent.events.subscribe(self._on_response)

    async def process_video(self, track, participant_id, shared_forwarder=None) -> None:
        pass  # no raw video needed

    async def stop_processing(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def _on_response(self, event: LearnerResponseEvent):
        self._signal.response_delay_ms = event.response_delay_ms
        self._signal.timestamp = time.time()

        # Confusion language check
        text_lower = event.text.lower()
        if any(marker in text_lower for marker in _CONFUSION_MARKERS):
            self._signal.confusion_indicators = min(
                10, self._signal.confusion_indicators + 1
            )
        else:
            # Decay over time
            self._signal.confusion_indicators = max(
                0, self._signal.confusion_indicators - 1
            )

        # Mistake tracking
        if event.was_correct is not None:
            self._window.append(event.was_correct)
            if len(self._window) > self._window_size:
                self._window = self._window[-self._window_size:]
            self._signal.recent_mistake_count = sum(1 for c in self._window if not c)

        score = self._signal.to_score()

        if self._events:
            self._events.send(
                CognitiveLoadUpdatedEvent(
                    signal=self._signal,
                    cognitive_load_score=score,
                )
            )

        MetricsBroadcaster.instance().push({
            "cognitive_load_score": round(score, 1),
            "confusion_indicators": self._signal.confusion_indicators,
            "recent_mistakes": self._signal.recent_mistake_count,
        })

    def record_answer(self, correct: bool) -> None:
        """Called externally by the reasoning loop after evaluating an answer."""
        self._window.append(correct)
        if len(self._window) > self._window_size:
            self._window = self._window[-self._window_size:]
        self._signal.recent_mistake_count = sum(1 for c in self._window if not c)

    @property
    def latest_signal(self) -> CognitiveLoadSignal:
        return self._signal
