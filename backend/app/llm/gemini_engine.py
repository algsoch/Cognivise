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


def _mastery_to_difficulty(score: float) -> str:
    if score < 25: return "beginner"
    if score < 55: return "intermediate"
    if score < 80: return "advanced"
    return "expert"


def _question_fallback(topic: str, difficulty: str) -> dict:
    return {
        "question": f"Can you explain what you know about {topic} so far?",
        "expected_answer_points": [f"core idea of {topic}"],
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

        import asyncio

        jpg = _encode_frame_jpg(frame)
        if not jpg:
            return ""

        import base64 as _b64
        img_part = genai_types.Part.from_bytes(data=jpg, mime_type="image/jpeg")

        try:
            loop = asyncio.get_event_loop()
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
        Extract the primary topic / heading from a lecture slide.
        """
        prompt = (
            "This is a lecture slide or screen. "
            "What is the main topic or concept being taught? "
            "Reply with just the topic name or phrase (max 10 words)."
        )
        result = await self.analyse_screen_content(frame, prompt)
        return result if result else None

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
        Retries once after 3s on 429 rate-limit errors."""
        if not self._client:
            return ""
        import asyncio
        for _attempt in range(2):  # 2 attempts total (original + 1 retry)
            try:
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    lambda: self._client.models.generate_content(
                        model=_FLASH_MODEL,
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
                if "429" in _msg or "quota" in _msg or "resource_exhausted" in _msg:
                    if _attempt == 0:
                        logger.warning("Gemini 429 rate-limit — retrying in 3s...")
                        await asyncio.sleep(3)
                        continue
                    logger.warning("Gemini rate-limit persists — using question fallback")
                else:
                    logger.debug("Gemini text generation error: %s", exc)
                return ""

    async def generate_question(
        self,
        topic: str,
        mastery_score: float,
        recent_context: str,
        question_type: str = "recall",
    ) -> dict:
        """Generate an adaptive question via Gemini. Returns same shape as ClaudeEngine."""
        import json as _json
        difficulty = _mastery_to_difficulty(mastery_score)
        prompt = (
            f"You are an adaptive learning tutor. Generate ONE {question_type} question about {topic}.\n"
            f"Difficulty: {difficulty}\n"
            f"Recent context: {recent_context[-500:] if recent_context else 'none'}\n\n"
            "Return ONLY valid JSON (no markdown):\n"
            '{"question": "<question text>", "expected_answer_points": ["<key point>"], '
            '"difficulty": "' + difficulty + '", "hint": "<optional hint>"}'
        )
        raw = await self._text(prompt, max_tokens=300)
        if not raw:
            return _question_fallback(topic, difficulty)
        try:
            text = raw.strip().lstrip("`").split("```")[0] if "```" in raw else raw.strip()
            # strip json fences
            if text.startswith("```"):
                text = "\n".join(text.split("\n")[1:-1])
            return _json.loads(text)
        except Exception:
            # If JSON fails, use the raw text as the question
            if raw and len(raw) > 15:
                return {"question": raw.split("\n")[0][:200], "expected_answer_points": [], "difficulty": difficulty, "hint": ""}
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
