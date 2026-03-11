"""
gemini_engine.py — Google Gemini for multimodal realtime reasoning.

Gemini serves two roles in this architecture:

1. REALTIME (via vision-agents gemini.Realtime plugin):
   - The primary LLM of the Agent — watches video, listens to audio
   - Handles turn-based voice interaction with the learner
   - Uses gemini-2.0-flash-live for low latency

2. ANALYSIS (via google-generativeai SDK directly):
   - Used by the reasoning loop for frame-level scene analysis
   - Detects lecture slides, whiteboard content, diagrams
   - Extracts topic context from screen content

This file wraps the analysis API. The realtime plugin is configured in main_agent.py.
"""

from __future__ import annotations

import base64
import logging
from typing import Any, Dict, List, Optional

import numpy as np

from backend.app.config.settings import settings

logger = logging.getLogger(__name__)

try:
    from google import genai  # type: ignore
    from google.genai import types as genai_types  # type: ignore
    _GENAI_AVAILABLE = True
except ImportError:
    _GENAI_AVAILABLE = False
    logger.warning("google-genai not installed. Gemini analysis disabled.")


_FLASH_MODEL = "gemini-2.0-flash"
_FLASH_FALLBACK = "gemini-1.5-flash"   # higher free-tier quota fallback

# Simple in-process cache to reduce Gemini API calls
# key: (topic, difficulty, question_type) → question dict + timestamp
import threading as _threading
_QUESTION_CACHE: dict = {}
_CACHE_TTL = 600   # 10 min — reuse same question for same topic+difficulty
_CACHE_LOCK = _threading.Lock()

# Global rate limiter: maximum 1 Gemini text call per 4 seconds
# Free tier = 15 RPM = 1 req / 4s. Realtime WS uses a separate quota.
_LAST_GEMINI_CALL_AT: float = 0.0
_MIN_CALL_GAP = 4.0   # seconds between any two back-end Gemini text calls


def _mastery_to_difficulty(score: float) -> str:
    if score < 25: return "beginner"
    if score < 55: return "intermediate"
    if score < 80: return "advanced"
    return "expert"


# Rich fallback question bank — varied templates so the agent doesn't always
# say the same thing when Gemini is rate-limited.
import random as _random

_FALLBACK_TEMPLATES = [
    ("recall",       "What's one key thing you've understood about {topic} so far?"),
    ("recall",       "Can you explain {topic} in your own words?"),
    ("comprehension","Why is {topic} important? Give me one reason."),
    ("comprehension","What's the main idea behind {topic}?"),
    ("application",  "How would you use your knowledge of {topic} in a real-world situation?"),
    ("application",  "Can you give a practical example of {topic}?"),
    ("analysis",     "What surprised you most about {topic}?"),
    ("analysis",     "How does {topic} connect to something you already knew?"),
    ("synthesis",    "If you had to teach {topic} to a friend, where would you start?"),
    ("evaluation",   "What part of {topic} do you find most confusing? Let's work through it."),
]


def _question_fallback(topic: str, difficulty: str) -> dict:
    """Return a varied, natural-sounding fallback question for when Gemini is unavailable."""
    # Pick a different template each time (deterministic-ish from topic length)
    _templates_for_type = _FALLBACK_TEMPLATES
    _template_pair = _random.choice(_templates_for_type)
    question = _template_pair[1].format(topic=topic)
    return {
        "question": question,
        "expected_answer_points": [f"core understanding of {topic}"],
        "difficulty": difficulty,
        "hint": "",
    }


class GeminiEngine:
    """
    Gemini for multimodal frame analysis — NOT the realtime voice path.
    """

    def __init__(self):
        if not _GENAI_AVAILABLE:
            self._client = None
        else:
            _api_key = settings.gemini_api_key or settings.google_api_key
            self._client = genai.Client(api_key=_api_key)

    async def analyse_screen_content(
        self, frame: np.ndarray, prompt: str = "What topic is being taught on screen?"
    ) -> str:
        """
        Send a video frame to Gemini for content analysis.
        Returns a short description of what's visible.
        """
        if not self._client:
            return ""

        import asyncio, time as _time
        global _LAST_GEMINI_CALL_AT

        jpg = _encode_frame_jpg(frame)
        if not jpg:
            return ""

        # Enforce global rate limit
        _gap = _time.time() - _LAST_GEMINI_CALL_AT
        if _gap < _MIN_CALL_GAP:
            await asyncio.sleep(_MIN_CALL_GAP - _gap)

        img_part = genai_types.Part.from_bytes(data=jpg, mime_type="image/jpeg")

        try:
            loop = asyncio.get_event_loop()
            _LAST_GEMINI_CALL_AT = _time.time()
            response = await loop.run_in_executor(
                None,
                lambda: self._client.models.generate_content(
                    model=_FLASH_MODEL,
                    contents=[img_part, prompt],
                    config=genai_types.GenerateContentConfig(
                        max_output_tokens=256,
                        temperature=0.0,
                    ),
                ),
            )
            return response.text.strip()
        except Exception as exc:
            logger.debug("Gemini frame analysis error: %s", exc)
            return ""

    async def extract_topic_from_slide(self, frame: np.ndarray) -> Optional[str]:
        """
        Extract the primary academic/learning topic from a screen frame.
        Returns the actual subject being studied, or None if undeterminable.
        """
        prompt = (
            "You are looking at a learner's screen. "
            "Identify the specific academic topic or concept they are studying — "
            "for example: 'Python decorators', 'Newton's laws of motion', "
            "'photosynthesis', 'gradient descent', 'React hooks', etc. "
            "Be specific — if you see a video title, document heading, code content, "
            "or course material, extract the subject from THAT content. "
            "Do NOT say 'Screen Share', 'YouTube', 'video', 'presentation', or any "
            "generic mode name — only the actual learning topic. "
            "If you genuinely cannot determine a learning topic from what's visible, "
            "reply with exactly: null\n"
            "Reply with only the topic phrase (max 10 words) or the word null."
        )
        result = await self.analyse_screen_content(frame, prompt)
        if not result or result.strip().lower() in ("null", "none", "unknown", ""):
            return None
        return result.strip()

    async def extract_topic_from_title(self, title: str) -> Optional[str]:
        """
        Extract the real academic subject from a video title / filename.
        E.g.  "Android just changed the whole game for developers"
              → "Android development" or "Android app development changes"
        Returns None if the title gives no useful learning topic.
        """
        if not title or not title.strip():
            return None
        clean = title.strip()
        # Guard: single-word titles (< 20 chars, no spaces) are almost always channel
        # names or brand identifiers — NOT learning topics. Skip Gemini call entirely.
        if ' ' not in clean and len(clean) < 20:
            logger.debug("extract_topic_from_title: '%s' looks like a brand/channel name — skipping", clean)
            return None
        prompt = (
            f'A learner is watching a video titled: "{clean}".\n'
            "What is the specific academic or technical topic they are studying?\n"
            "Examples of good answers: 'Android development', 'React hooks', "
            "'machine learning fundamentals', 'photosynthesis', 'Newton\'s laws'.\n"
            "Do NOT echo the full title back verbatim. Do NOT say 'YouTube', 'video', 'screen share'.\n"
            "If the title is just a channel/brand name with no real topic, reply: null\n"
            "Reply with only the topic phrase (max 8 words) or the word null."
        )
        result = await self._text(prompt, max_tokens=32)
        if not result:
            return None
        result = result.strip()
        if result.lower() in ("null", "none", "unknown", ""):
            return None
        # If Gemini echoes the title back verbatim, it didn't understand — return None
        if result.lower() == clean.lower():
            logger.debug("extract_topic_from_title: Gemini echoed input — treating as brand name")
            return None
        return result

    async def check_learner_confusion_from_face(
        self, face_frame: np.ndarray
    ) -> bool:
        """
        Ask Gemini to assess visible confusion from facial expression.
        Estimation only — treat as soft signal.
        """
        prompt = (
            "Look at this person's face. "
            "Do they appear confused, frustrated, or lost? "
            "Reply with only: YES or NO"
        )
        result = await self.analyse_screen_content(face_frame, prompt)
        return result.strip().upper().startswith("YES")

    # ── Pedagogy methods (used by ReasoningLoop when Claude is disabled) ───────

    async def _text(self, prompt: str, max_tokens: int = 512) -> str:
        """Run a text-only prompt through gemini-2.0-flash and return the response.
        Retries with exponential backoff on 429, then tries gemini-1.5-flash as fallback."""
        if not self._client:
            return ""
        import asyncio, time as _time
        global _LAST_GEMINI_CALL_AT

        # Enforce minimum gap between calls to avoid hammering the free-tier quota
        _gap = _time.time() - _LAST_GEMINI_CALL_AT
        if _gap < _MIN_CALL_GAP:
            await asyncio.sleep(_MIN_CALL_GAP - _gap)

        _models_to_try = [_FLASH_MODEL, _FLASH_FALLBACK]
        _delays = [5, 12, 25]   # seconds between retries

        for _model in _models_to_try:
            for _attempt in range(len(_delays) + 1):
                try:
                    loop = asyncio.get_event_loop()
                    _LAST_GEMINI_CALL_AT = _time.time()
                    response = await loop.run_in_executor(
                        None,
                        lambda m=_model: self._client.models.generate_content(
                            model=m,
                            contents=prompt,
                            config=genai_types.GenerateContentConfig(
                                max_output_tokens=max_tokens,
                                temperature=0.7,
                            ),
                        ),
                    )
                    return (response.text or "").strip()
                except Exception as exc:
                    _msg = str(exc).lower()
                    if ("429" in _msg or "quota" in _msg or "resource_exhausted" in _msg):
                        if _attempt < len(_delays):
                            delay = _delays[_attempt]
                            logger.warning("Gemini 429 on %s — retrying in %ds (attempt %d)...", _model, delay, _attempt + 1)
                            await asyncio.sleep(delay)
                            continue
                        # All retries exhausted for this model — try fallback model
                        logger.warning("Gemini 429 persists on %s — trying fallback model", _model)
                        break
                    logger.debug("Gemini text generation error (%s): %s", _model, exc)
                    return ""
        logger.warning("All Gemini models rate-limited — returning empty")
        return ""

    async def generate_question(
        self,
        topic: str,
        mastery_score: float,
        recent_context: str,
        question_type: str = "recall",
        learner_name: Optional[str] = None,
        video_transcript: Optional[str] = None,
    ) -> dict:
        """Generate an adaptive question via Gemini. Returns same shape as ClaudeEngine.
        Caches up to 5 per (topic, difficulty, question_type) to provide variety."""
        import json as _json, time as _time, random as _random
        difficulty = _mastery_to_difficulty(mastery_score)

        # Check cache — keep up to 5 different questions per key, rotate randomly
        _cache_key = (topic.lower()[:50], difficulty, question_type)
        with _CACHE_LOCK:
            if _cache_key in _QUESTION_CACHE:
                _variants, _cached_at = _QUESTION_CACHE[_cache_key]
                if _time.time() - _cached_at < _CACHE_TTL and len(_variants) >= 3:
                    return _random.choice(_variants)

        _name_hint = f" Address the learner as '{learner_name}'." if learner_name else ""
        # Use video transcript as the primary knowledge source if available
        _transcript_hint = ""
        if video_transcript:
            # Give Gemini a snippet of the actual video content so questions are content-based
            _snippet = video_transcript[:1500]
            _transcript_hint = (
                f"\nVideo content (ask about what is actually discussed):\n{_snippet}\n"
                "Questions MUST be based on the above video content, not just the topic title."
            )

        prompt = (
            f"You are an adaptive learning tutor. Generate ONE {question_type} question about {topic}.\n"
            f"Difficulty: {difficulty}\n"
            f"Recent conversation: {recent_context[-400:] if recent_context else 'none'}\n"
            f"{_transcript_hint}"
            f"Make the question feel natural and conversational, not like a formal exam.{_name_hint}\n"
            "Generate a UNIQUE question — different from any you have asked before.\n\n"
            "Return ONLY valid JSON (no markdown):\n"
            '{"question": "<question text>", "expected_answer_points": ["<key point>"], '
            '"difficulty": "' + difficulty + '", "hint": "<optional hint>"}'
        )
        raw = await self._text(prompt, max_tokens=300)
        if not raw:
            return _question_fallback(topic, difficulty)
        try:
            text = raw.strip().lstrip("`").split("```")[0] if "```" in raw else raw.strip()
            if text.startswith("```"):
                text = "\n".join(text.split("\n")[1:-1])
            result = _json.loads(text)
            # Cache: store up to 5 variants per key so questions are varied
            with _CACHE_LOCK:
                if _cache_key in _QUESTION_CACHE:
                    _variants, _at = _QUESTION_CACHE[_cache_key]
                    if result not in _variants:
                        _variants.append(result)
                        if len(_variants) > 5:
                            _variants.pop(0)
                        _QUESTION_CACHE[_cache_key] = (_variants, _at)
                else:
                    _QUESTION_CACHE[_cache_key] = ([result], _time.time())
            return result
        except Exception:
            # If JSON fails, use the raw text as the question (still cache it)
            if raw and len(raw) > 15:
                result = {"question": raw.split("\n")[0][:200], "expected_answer_points": [], "difficulty": difficulty, "hint": ""}
                with _CACHE_LOCK:
                    _QUESTION_CACHE[_cache_key] = (result, _time.time())
                return result
            return _question_fallback(topic, difficulty)

    async def evaluate_answer(
        self,
        question: str,
        expected_points: list,
        learner_answer: str,
        topic: str,
    ) -> dict:
        """Evaluate a learner's answer. Returns same shape as ClaudeEngine."""
        import json as _json
        if not learner_answer or len(learner_answer.strip()) < 5:
            return {"correct": False, "score": 0.0, "feedback": "Could you elaborate a bit more?", "missing_points": expected_points}
        prompt = (
            f'Evaluate this learner answer for topic "{topic}".\n'
            f"Question: {question}\n"
            f"Expected key points: {expected_points}\n"
            f'Learner said: "{learner_answer}"\n\n'
            "Be lenient on phrasing, strict on conceptual accuracy.\n"
            "Return ONLY valid JSON (no markdown):\n"
            '{"correct": true/false, "score": 0.0-1.0, "feedback": "<brief supportive feedback>", "missing_points": []}'
        )
        raw = await self._text(prompt, max_tokens=256)
        if not raw:
            answered = len(learner_answer.strip()) > 10
            return {"correct": answered, "score": 0.6 if answered else 0.1, "feedback": "Good effort! Keep going.", "missing_points": []}
        try:
            text = raw.strip()
            if text.startswith("```"):
                text = "\n".join(text.split("\n")[1:-1])
            return _json.loads(text)
        except Exception:
            answered = len(learner_answer.strip()) > 10
            return {"correct": answered, "score": 0.6 if answered else 0.1, "feedback": raw[:120] if raw else "Good effort!", "missing_points": []}

    async def simplify_explanation(self, concept: str, current_explanation: str) -> str:
        """Return a simpler explanation of a concept."""
        prompt = (
            f"A student is confused. Re-explain '{concept}' in very simple terms (max 3 sentences).\n"
            f"Original: {current_explanation[:300]}\n"
            "Use an analogy if helpful. Plain language only, no jargon."
        )
        result = await self._text(prompt, max_tokens=200)
        return result or f"Think of {concept} as a simple tool — let me walk through it step by step."

    async def break_down_concept(self, concept: str, context: str) -> list:
        """Break a concept into 3-5 sub-topics. Returns list of strings."""
        import json as _json
        prompt = (
            f"Break '{concept}' into 3-5 bite-sized sub-topics for a struggling learner.\n"
            f"Context: {context[:200]}\n"
            "Return ONLY a JSON array of strings, e.g.: [\"sub1\", \"sub2\", \"sub3\"]"
        )
        raw = await self._text(prompt, max_tokens=150)
        if not raw:
            return [f"What is {concept}?", f"How is {concept} used?", f"Examples of {concept}"]
        try:
            text = raw.strip()
            if text.startswith("```"):
                text = "\n".join(text.split("\n")[1:-1])
            return _json.loads(text)
        except Exception:
            return [f"What is {concept}?", f"How is {concept} used?", f"Examples of {concept}"]


# ── Helpers ────────────────────────────────────────────────────────────────────
def _encode_frame_jpg(frame: np.ndarray) -> Optional[bytes]:
    try:
        import cv2
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
        return buf.tobytes()
    except Exception:
        return None
