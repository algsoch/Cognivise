"""
mongodb_optional.py — Optional MongoDB client for unstructured vision metadata.

If MONGODB_URI is not set in .env this module degrades gracefully:
all public functions become no-ops and `enabled` is False.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from backend.app.config.settings import settings

logger = logging.getLogger(__name__)

enabled: bool = False
_client = None
_db = None

if settings.mongodb_enabled:
    try:
        from motor.motor_asyncio import AsyncIOMotorClient  # type: ignore

        _client = AsyncIOMotorClient(settings.mongodb_uri)
        _db = _client["vision_agent"]
        enabled = True
        logger.info("MongoDB connected: %s", settings.mongodb_uri)
    except ImportError:
        logger.warning(
            "motor package not installed — MongoDB disabled. "
            "Run: pip install motor"
        )
    except Exception as exc:
        logger.warning("MongoDB connection failed (%s) — continuing without it", exc)


async def insert_vision_event(event: Dict[str, Any]) -> Optional[str]:
    """Store a raw vision metadata event. No-op when MongoDB is disabled."""
    if not enabled or _db is None:
        return None
    result = await _db["vision_events"].insert_one(event)
    return str(result.inserted_id)


async def insert_engagement_snapshot(snapshot: Dict[str, Any]) -> Optional[str]:
    """Store an engagement analytics snapshot."""
    if not enabled or _db is None:
        return None
    result = await _db["engagement_snapshots"].insert_one(snapshot)
    return str(result.inserted_id)


async def get_recent_events(
    session_id: str, limit: int = 50
) -> list[Dict[str, Any]]:
    """Return recent vision events for a session."""
    if not enabled or _db is None:
        return []
    cursor = (
        _db["vision_events"]
        .find({"session_id": session_id})
        .sort("timestamp", -1)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


async def close_mongo() -> None:
    if _client is not None:
        _client.close()
        logger.info("MongoDB connection closed")
