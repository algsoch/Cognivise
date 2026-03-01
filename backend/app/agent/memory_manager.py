"""
memory_manager.py — Persists and retrieves learning state from PostgreSQL.

Acts as the bridge between in-memory UserSession objects and the DB.
Also posts vision metadata to MongoDB when available.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.db.postgres import (
    get_async_session_factory,
    EngagementHistoryRecord,
    InteractionLogRecord,
    LearningStateRecord,
    MasteryRecord,
    UserSessionRecord,
)
from backend.app.db import mongodb_optional as mongo
from backend.app.models.user_session import UserSession
from backend.app.models.learning_state import LearningStateSnapshot

logger = logging.getLogger(__name__)


class MemoryManager:
    """
    Stateless service — all methods are async and create their own DB sessions.
    """

    # ── Session lifecycle ─────────────────────────────────────────────────────
    async def create_session(self, session: UserSession) -> None:
        async with get_async_session_factory()() as db:
            record = UserSessionRecord(
                session_id=session.session_id,
                user_id=session.user_id,
                call_id=session.call_id,
                topic=session.current_topic,
                is_active=True,
            )
            db.add(record)
            await db.commit()
            logger.info("Session created: %s", session.session_id)

    async def close_session(self, session: UserSession) -> None:
        async with get_async_session_factory()() as db:
            stmt = (
                update(UserSessionRecord)
                .where(UserSessionRecord.session_id == session.session_id)
                .values(is_active=False, ended_at=_now())
            )
            await db.execute(stmt)
            await db.commit()

    # ── Learning state snapshot ───────────────────────────────────────────────
    async def save_state_snapshot(self, snap: LearningStateSnapshot) -> None:
        async with get_async_session_factory()() as db:
            record = LearningStateRecord(
                session_id=snap.session_id,
                user_id=snap.user_id,
                engagement_score=snap.engagement_score,
                attention_score=snap.attention_score,
                cognitive_load_score=snap.cognitive_load_score,
                performance_score=snap.performance_score,
                learning_state=snap.learner_state.value,
                intervention_fired=snap.recommended_intervention.value != "none",
                intervention_type=snap.recommended_intervention.value,
            )
            db.add(record)
            await db.commit()

    # ── Mastery tracking ──────────────────────────────────────────────────────
    async def save_mastery(
        self, user_id: str, topic: str, mastery_score: float,
        attempts: int, correct: int
    ) -> None:
        async with get_async_session_factory()() as db:
            result = await db.execute(
                select(MasteryRecord).where(
                    MasteryRecord.user_id == user_id,
                    MasteryRecord.topic == topic,
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.mastery_score = mastery_score
                existing.attempts = attempts
                existing.correct_answers = correct
            else:
                db.add(MasteryRecord(
                    user_id=user_id,
                    topic=topic,
                    mastery_score=mastery_score,
                    attempts=attempts,
                    correct_answers=correct,
                ))
            await db.commit()

    async def load_mastery(self, user_id: str) -> dict:
        """Returns {topic: mastery_score} for all topics for a user."""
        async with get_async_session_factory()() as db:
            result = await db.execute(
                select(MasteryRecord).where(MasteryRecord.user_id == user_id)
            )
            records = result.scalars().all()
            return {r.topic: r.mastery_score for r in records}

    # ── Interaction log ───────────────────────────────────────────────────────
    async def log_interaction(
        self,
        session_id: str,
        user_id: str,
        event_type: str,
        content: str,
        agent_response: str = "",
        score: Optional[float] = None,
    ) -> None:
        async with get_async_session_factory()() as db:
            db.add(InteractionLogRecord(
                session_id=session_id,
                user_id=user_id,
                event_type=event_type,
                content=content,
                agent_response=agent_response,
                score=score,
            ))
            await db.commit()

    # ── Engagement history ────────────────────────────────────────────────────
    async def save_engagement_history(
        self,
        session_id: str,
        user_id: str,
        snap: LearningStateSnapshot,
    ) -> None:
        async with get_async_session_factory()() as db:
            db.add(EngagementHistoryRecord(
                session_id=session_id,
                user_id=user_id,
                engagement_score=snap.engagement_score,
                attention_score=snap.attention_score,
                cognitive_load_score=snap.cognitive_load_score,
                face_detected=snap.engagement.face_detected,
                gaze_on_screen=snap.engagement.gaze_on_screen,
                blink_rate=snap.engagement.blink_rate,
                restlessness_score=snap.engagement.restlessness_score,
            ))
            await db.commit()

        # Also post to MongoDB if enabled
        await mongo.insert_engagement_snapshot({
            "session_id": session_id,
            "user_id": user_id,
            "engagement_score": snap.engagement_score,
            "attention_score": snap.attention_score,
            "cognitive_load_score": snap.cognitive_load_score,
            "timestamp": time.time(),
        })


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)
