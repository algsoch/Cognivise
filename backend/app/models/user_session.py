"""
user_session.py — In-memory user session + mastery knowledge graph.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from backend.app.models.learning_state import LearningStateSnapshot, LearnerState


@dataclass
class TopicMastery:
    topic: str
    mastery_score: float = 0.0      # 0-100
    attempts: int = 0
    correct: int = 0
    weak_subtopics: List[str] = field(default_factory=list)
    last_reviewed: float = field(default_factory=time.time)
    next_review: Optional[float] = None   # spaced-repetition timestamp

    @property
    def accuracy(self) -> float:
        if self.attempts == 0:
            return 0.0
        return (self.correct / self.attempts) * 100.0

    def update(self, correct: bool, subtopic: Optional[str] = None) -> None:
        self.attempts += 1
        if correct:
            self.correct += 1
            self.mastery_score = min(100.0, self.mastery_score + 5.0)
        else:
            self.mastery_score = max(0.0, self.mastery_score - 8.0)
            if subtopic and subtopic not in self.weak_subtopics:
                self.weak_subtopics.append(subtopic)
        self.last_reviewed = time.time()
        # Simple spaced repetition: next review based on mastery
        interval_hours = max(1.0, (self.mastery_score / 100.0) * 72.0)
        self.next_review = time.time() + interval_hours * 3600


@dataclass
class UserSession:
    """Full runtime session for one learner."""
    user_id: str
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    call_id: Optional[str] = None
    current_topic: Optional[str] = None
    started_at: float = field(default_factory=time.time)

    # Live state
    current_state: Optional[LearningStateSnapshot] = None
    state_history: List[LearningStateSnapshot] = field(default_factory=list)

    # Knowledge graph: topic → TopicMastery
    mastery: Dict[str, TopicMastery] = field(default_factory=dict)

    # Interaction counters
    questions_asked: int = 0
    questions_answered_correctly: int = 0
    total_interventions: int = 0
    last_intervention_at: float = 0.0

    # Transcript buffer for context
    transcript_buffer: List[str] = field(default_factory=list)

    def record_state(self, snapshot: LearningStateSnapshot) -> None:
        self.current_state = snapshot
        self.state_history.append(snapshot)
        # Keep last 200 snapshots
        if len(self.state_history) > 200:
            self.state_history = self.state_history[-200:]

    def get_topic_mastery(self, topic: str) -> TopicMastery:
        if topic not in self.mastery:
            self.mastery[topic] = TopicMastery(topic=topic)
        return self.mastery[topic]

    def record_answer(self, topic: str, correct: bool, subtopic: Optional[str] = None) -> None:
        self.questions_asked += 1
        if correct:
            self.questions_answered_correctly += 1
        self.get_topic_mastery(topic).update(correct, subtopic)

    @property
    def overall_performance(self) -> float:
        if self.questions_asked == 0:
            return 50.0
        return (self.questions_answered_correctly / self.questions_asked) * 100.0

    @property
    def weak_topics(self) -> List[str]:
        return [
            t for t, m in self.mastery.items() if m.mastery_score < 40.0
        ]

    def add_transcript(self, text: str) -> None:
        self.transcript_buffer.append(text)
        if len(self.transcript_buffer) > 100:
            self.transcript_buffer = self.transcript_buffer[-100:]

    def get_recent_transcript(self, n: int = 10) -> str:
        return "\n".join(self.transcript_buffer[-n:])
