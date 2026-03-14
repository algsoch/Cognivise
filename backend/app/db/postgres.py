"""
postgres.py — Async PostgreSQL connection + schema bootstrap via SQLAlchemy.

Tables created on first run:
  - user_sessions
  - learning_states
  - mastery_records
  - interaction_logs
  - engagement_history
  - speech_archives
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from backend.app.config.settings import settings

logger = logging.getLogger(__name__)

import asyncio

# ── Engine (initialised lazily per loop) ───────────────────────────────────
_engines = {}
_session_factories = {}

def _get_loop_id():
    try:
        return id(asyncio.get_running_loop())
    except RuntimeError:
        return None

def get_async_session_factory():
    """Return the current session factory for this event loop (must have called init_db first)."""
    loop_id = _get_loop_id()
    if loop_id not in _session_factories:
        raise RuntimeError("Database not initialised for this loop — call init_db() first")
    return _session_factories[loop_id]


# ── Base ────────────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── ORM Models ───────────────────────────────────────────────────────────────
class UserSessionRecord(Base):
    __tablename__ = "user_sessions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(128), unique=True, nullable=False, index=True)
    user_id = Column(String(128), nullable=False, index=True)
    call_id = Column(String(256), nullable=True)
    topic = Column(String(512), nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    metadata_ = Column("metadata", JSONB, default=dict)


class LearningStateRecord(Base):
    __tablename__ = "learning_states"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(128), nullable=False, index=True)
    user_id = Column(String(128), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    engagement_score = Column(Float, default=50.0)
    attention_score = Column(Float, default=50.0)
    cognitive_load_score = Column(Float, default=50.0)
    performance_score = Column(Float, default=50.0)
    learning_state = Column(String(64), default="neutral")  # e.g. focused, overloaded
    intervention_fired = Column(Boolean, default=False)
    intervention_type = Column(String(128), nullable=True)


class MasteryRecord(Base):
    __tablename__ = "mastery_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(String(128), nullable=False, index=True)
    topic = Column(String(512), nullable=False, index=True)
    subtopic = Column(String(512), nullable=True)
    mastery_score = Column(Float, default=0.0)   # 0-100
    attempts = Column(Integer, default=0)
    correct_answers = Column(Integer, default=0)
    last_reviewed_at = Column(DateTime(timezone=True), server_default=func.now())
    next_review_at = Column(DateTime(timezone=True), nullable=True)
    knowledge_graph = Column(JSONB, default=dict)


class InteractionLogRecord(Base):
    __tablename__ = "interaction_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(128), nullable=False, index=True)
    user_id = Column(String(128), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    event_type = Column(String(64), nullable=False)   # question, answer, recall, etc.
    content = Column(Text, nullable=True)
    agent_response = Column(Text, nullable=True)
    score = Column(Float, nullable=True)
    metadata_ = Column("metadata", JSONB, default=dict)


class EngagementHistoryRecord(Base):
    __tablename__ = "engagement_history"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(String(128), nullable=False, index=True)
    user_id = Column(String(128), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    engagement_score = Column(Float)
    attention_score = Column(Float)
    cognitive_load_score = Column(Float)
    face_detected = Column(Boolean, default=False)
    gaze_on_screen = Column(Boolean, default=True)
    blink_rate = Column(Float, nullable=True)
    restlessness_score = Column(Float, nullable=True)


class SpeechArchiveRecord(Base):
    __tablename__ = "speech_archives"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(String(128), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    transcript = Column(Text, nullable=True)
    score = Column(Float, nullable=True)
    tone = Column(String(64), nullable=True)
    follow_up_relevance_score = Column(Float, nullable=True)
    how_you_should_say_it = Column(Text, nullable=True)
    overall_feedback = Column(Text, nullable=True)
    speaking_style_notes = Column(JSONB, default=list)
    audio_data_url = Column(Text, nullable=True)  # Large data URL for audio
    video_data_url = Column(Text, nullable=True)  # Large data URL for raw video
    analysis_video_data_url = Column(Text, nullable=True) # Large data URL for face overlaid video
    audio_features = Column(JSONB, nullable=True)  # JSON with duration, volume, etc.


# ── Lifecycle ────────────────────────────────────────────────────────────────
async def init_db() -> None:
    """Create all tables if they don't exist.

    Safe to call multiple times. Creates the engine per-loop,
    bound to the current asyncio event loop so all asyncpg connections
    are loop-consistent.
    """
    global _engines, _session_factories
    loop_id = _get_loop_id()

    if loop_id not in _engines:
        engine = create_async_engine(
            settings.postgres_dsn,
            echo=settings.debug,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
        )
        _engines[loop_id] = engine
        _session_factories[loop_id] = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    engine = _engines[loop_id]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info(f"PostgreSQL schema initialised for loop {loop_id}")


async def close_db() -> None:
    global _engines, _session_factories
    loop_id = _get_loop_id()
    
    if loop_id in _engines:
        engine = _engines[loop_id]
        await engine.dispose()
        del _engines[loop_id]
        if loop_id in _session_factories:
            del _session_factories[loop_id]
        logger.info(f"PostgreSQL connection pool closed for loop {loop_id}")


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_async_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
