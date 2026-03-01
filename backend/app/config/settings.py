"""
settings.py — Central configuration via pydantic-settings.
All values are loaded from .env (or environment) automatically.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Stream ────────────────────────────────────────────────
    stream_api_key: str = Field(..., description="Stream API key")
    stream_api_secret: str = Field(..., description="Stream API secret")

    # ── LLMs ─────────────────────────────────────────────────
    claude_api_key: str = Field("", description="Anthropic Claude API key (optional — degrades gracefully)")
    gemini_api_key: str = Field(..., description="Google Gemini API key")
    google_api_key: str = Field("", description="Alias for Gemini used by vision-agents")

    # ── Speech ────────────────────────────────────────────────
    deepgram_api_key: str = Field("", description="Deepgram STT key")
    elevenlabs_api_key: str = Field("", description="ElevenLabs TTS key")

    # ── PostgreSQL ────────────────────────────────────────────
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "vision_agent"
    postgres_user: str = "postgres"
    postgres_password: str = ""

    # ── MongoDB (optional) ────────────────────────────────────
    mongodb_uri: Optional[str] = None

    # ── App ───────────────────────────────────────────────────
    app_env: str = "development"
    debug: bool = True
    log_level: str = "INFO"

    # ── Agent tuning ─────────────────────────────────────────
    agent_fps: int = 3
    processor_fps: int = 10
    engagement_check_interval: int = 15  # seconds between state checks
    intervention_cooldown_seconds: int = 60  # minimum gap between interventions (avoids spamming)

    # ── Derived ───────────────────────────────────────────────
    @property
    def postgres_dsn(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def postgres_dsn_sync(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def mongodb_enabled(self) -> bool:
        return bool(self.mongodb_uri)

    @field_validator("google_api_key", mode="before")
    @classmethod
    def _sync_google_key(cls, v: str, info) -> str:
        # Allow GOOGLE_API_KEY to fall back to GEMINI_API_KEY
        return v or ""


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
