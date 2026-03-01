"""
learning_state.py — Pure-Python dataclasses for in-memory learning state.

These are the runtime objects passed between processors and the agent loop.
They are NOT ORM models — persistence is handled in db/postgres.py.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional


# ── Enums ─────────────────────────────────────────────────────────────────────
class LearnerState(str, Enum):
    FOCUSED   = "focused"           # High engagement + attention, normal load
    DRIFTING  = "drifting"          # Moderate engagement, decent attention
    DISTRACTED = "distracted"       # Low attention, decent engagement
    DISENGAGED = "disengaged"       # Both attention and engagement low
    OVERLOADED = "overloaded"       # High cognitive load
    MASTERING  = "mastering"        # Strong performance, ready for harder content
    STRUGGLING = "struggling"       # Repeated errors / high load + low performance
    NEUTRAL    = "neutral"          # Baseline, not enough signal yet


class InterventionType(str, Enum):
    ASK_QUESTION = "ask_question"
    SIMPLIFY = "simplify"         # Re-explain in simpler terms
    BREAK_DOWN = "break_down"     # Decompose concept further
    INCREASE_DIFFICULTY = "increase_difficulty"
    ACTIVE_RECALL = "active_recall"
    ENCOURAGEMENT = "encouragement"
    CHECK_IN = "check_in"
    ENGAGE  = "engage"            # Prompt to start / pick a topic
    NONE = "none"


# ── Core signals ───────────────────────────────────────────────────────────────
@dataclass
class EngagementSignal:
    """Raw engagement metrics from vision processors."""
    face_detected: bool = False
    gaze_on_screen: bool = True
    blink_rate: float = 15.0          # blinks/min — normal ~15-20
    restlessness_score: float = 0.0   # 0-1, estimated motion variance
    head_pose_confidence: float = 1.0
    head_yaw: float = 0.0             # degrees, negative=left, positive=right
    head_pitch: float = 0.0           # degrees, negative=up, positive=down
    timestamp: float = field(default_factory=time.time)

    def to_score(self) -> float:
        """Heuristic engagement score 0-100."""
        if not self.face_detected:
            return 10.0
        score = 60.0
        if self.gaze_on_screen:
            score += 20.0
        # Penalise restlessness
        score -= self.restlessness_score * 30.0
        # Abnormal blink rate → fatigue/stress
        blink_deviation = abs(self.blink_rate - 17.0)
        score -= min(blink_deviation * 0.8, 15.0)
        return max(0.0, min(100.0, score))


@dataclass
class AttentionSignal:
    """Continuous attention tracking."""
    focus_duration_seconds: float = 0.0   # Uninterrupted on-screen time
    last_distraction_at: Optional[float] = None
    distraction_count: int = 0
    timestamp: float = field(default_factory=time.time)

    def to_score(self) -> float:
        """Attention score 0-100."""
        # Reward sustained focus; penalise frequent distractions
        base = min(self.focus_duration_seconds / 60.0, 1.0) * 70.0
        penalty = min(self.distraction_count * 8.0, 40.0)
        return max(0.0, min(100.0, base + 30.0 - penalty))


@dataclass
class CognitiveLoadSignal:
    """Cognitive overload estimation from response behaviour."""
    response_delay_ms: float = 0.0          # Latency before answering
    recent_mistake_count: int = 0           # Errors in last N questions
    confusion_indicators: int = 0           # "I don't know", long pauses, etc.
    timestamp: float = field(default_factory=time.time)

    def to_score(self) -> float:
        """Cognitive load score 0-100 (higher = more overloaded)."""
        delay_factor = min(self.response_delay_ms / 5000.0, 1.0) * 35.0
        mistake_factor = min(self.recent_mistake_count * 12.0, 40.0)
        confusion_factor = min(self.confusion_indicators * 8.0, 25.0)
        return max(0.0, min(100.0, delay_factor + mistake_factor + confusion_factor))


# ── Composite learning state ──────────────────────────────────────────────────
@dataclass
class LearningStateSnapshot:
    """Aggregated snapshot of the learner at a point in time."""
    session_id: str
    user_id: str
    engagement: EngagementSignal = field(default_factory=EngagementSignal)
    attention: AttentionSignal = field(default_factory=AttentionSignal)
    cognitive_load: CognitiveLoadSignal = field(default_factory=CognitiveLoadSignal)
    performance_score: float = 50.0   # 0-100, running quiz accuracy
    timestamp: float = field(default_factory=time.time)

    # Derived
    engagement_score: float = 50.0
    attention_score: float = 50.0
    cognitive_load_score: float = 50.0
    learner_state: LearnerState = LearnerState.NEUTRAL
    recommended_intervention: InterventionType = InterventionType.NONE

    def compute(self) -> "LearningStateSnapshot":
        """Derive scores and state from raw signals. Returns self for chaining."""
        self.engagement_score = self.engagement.to_score()
        self.attention_score = self.attention.to_score()
        self.cognitive_load_score = self.cognitive_load.to_score()
        self.learner_state = _classify_state(self)
        self.recommended_intervention = _recommend_intervention(self)
        return self


def _classify_state(s: LearningStateSnapshot) -> LearnerState:
    eng = s.engagement_score
    att = s.attention_score
    load = s.cognitive_load_score
    perf = s.performance_score

    # ── No-face case: user is watching the screen, not directly at camera ──────
    # Instead of firing DISTRACTED → CHECK_IN spam, treat as DRIFTING so the
    # agent asks topic-related questions rather than "are you still with me?"
    if not s.engagement.face_detected:
        if load > 75:
            return LearnerState.OVERLOADED
        # If they've been actively correct recently, they're engaged even without face
        if perf > 70:
            return LearnerState.FOCUSED
        # Default no-face → DRIFTING (triggers ASK_QUESTION, not CHECK_IN)
        return LearnerState.DRIFTING

    if load > 75:
        return LearnerState.OVERLOADED
    if eng < 30 and att < 30:
        return LearnerState.DISENGAGED
    if att < 35:
        return LearnerState.DISTRACTED
    if perf < 30 and load > 55:
        return LearnerState.STRUGGLING
    if perf > 80 and eng > 70:
        return LearnerState.MASTERING
    # Lowered from 65 → 45 so typical "face detected, looking at screen" registers as FOCUSED
    if eng > 45 and att > 60 and load < 60:
        return LearnerState.FOCUSED
    # Partially present: reasonable attention but lower engagement
    if att > 50 and eng > 25:
        return LearnerState.DRIFTING
    # Catch-all for face-detected sessions with moderate signals (closes the NEUTRAL gap):
    # att in [35..50] or eng that didn't fit above thresholds → learner is present but unfocused
    if att > 32 or eng > 40:
        return LearnerState.DRIFTING
    # No session / truly no signal yet
    return LearnerState.NEUTRAL


def _recommend_intervention(s: LearningStateSnapshot) -> InterventionType:
    state = s.learner_state
    mapping = {
        LearnerState.DISENGAGED:           InterventionType.ASK_QUESTION,
        LearnerState.DISTRACTED:           InterventionType.CHECK_IN,
        # DRIFTING (incl. no-face / watching screen) → ask topic question, not check-in
        LearnerState.DRIFTING:             InterventionType.ASK_QUESTION,
        LearnerState.OVERLOADED:           InterventionType.SIMPLIFY,
        LearnerState.STRUGGLING:           InterventionType.BREAK_DOWN,
        LearnerState.MASTERING:            InterventionType.INCREASE_DIFFICULTY,
        LearnerState.FOCUSED:              InterventionType.ACTIVE_RECALL,
        # NEUTRAL = very start of session — prompt them to begin
        LearnerState.NEUTRAL:              InterventionType.ENGAGE,
    }
    return mapping.get(state, InterventionType.CHECK_IN)
