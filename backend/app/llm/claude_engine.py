"""
claude_engine.py — Anthropic Claude for structured reasoning + question generation.

Claude is used for:
  1. Adaptive question generation (based on topic + mastery level)
  2. Evaluating learner answers (semantic correctness)
  3. Generating simplified explanations
  4. Concept breakdown for overloaded learners
  5. Spaced-repetition revision scheduling

Uses the native Anthropic Python SDK directly (not vision-agents LLM plugin)
because we need structured JSON responses and batch processing — not real-time
speech-to-speech.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import anthropic

from backend.app.config.settings import settings

logger = logging.getLogger(__name__)

_MODEL = "claude-3-5-haiku-20241022"   # fast, cheap for real-time
_MODEL_SMART = "claude-opus-4-5"       # for complex reasoning when latency allows


class ClaudeEngine:
    """
    Structured Claude calls for adaptive pedagogy.

    When CLAUDE_API_KEY is empty the engine runs in FALLBACK mode:
    every method returns a sensible hardcoded / Gemini-delegated response
    so the rest of the system keeps working without Claude.
    """

    def __init__(self):
        key = settings.claude_api_key
        # Treat missing key OR placeholder value as disabled
        _placeholder = not key or key.strip().lower() in (
            "your_claude_api_key_here", "none", "", "false", "<your_key>",
        )
        if key and not _placeholder:
            self._client: Optional[anthropic.AsyncAnthropic] = anthropic.AsyncAnthropic(api_key=key)
            self._enabled = True
            logger.info("ClaudeEngine: Claude API enabled")
        else:
            self._client = None
            self._enabled = False
            logger.info(
                "ClaudeEngine: CLAUDE_API_KEY not configured — Claude disabled. "
                "Using Gemini for all question generation (set CLAUDE_API_KEY to enable Claude)."
            )

    # ── Question generation ───────────────────────────────────────────────────
    async def generate_question(
        self,
        topic: str,
        mastery_score: float,
        recent_context: str,
        question_type: str = "recall",  # recall | comprehension | application
    ) -> Dict[str, Any]:
        """
        Returns: { "question": str, "expected_answer_points": list[str], "difficulty": str }
        """
        if not self._enabled:
            difficulty = _mastery_to_difficulty(mastery_score)
            return {
                "question": f"Can you explain the key concept of {topic} in your own words?",
                "expected_answer_points": [f"core definition of {topic}", "at least one example"],
                "difficulty": difficulty,
                "hint": f"Think about what {topic} is used for.",
            }

        difficulty = _mastery_to_difficulty(mastery_score)
        prompt = f"""
You are an adaptive learning assistant. Generate ONE {question_type} question about:
Topic: {topic}
Difficulty: {difficulty}
Recent session context:
{recent_context}

Return ONLY valid JSON:
{{
  "question": "<question text>",
  "expected_answer_points": ["<key point 1>", "<key point 2>"],
  "difficulty": "{difficulty}",
  "hint": "<optional 1-sentence hint>"
}}
""".strip()

        response = await self._client.messages.create(
            model=_MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json(response.content[0].text)

    # ── Answer evaluation ─────────────────────────────────────────────────────
    async def evaluate_answer(
        self,
        question: str,
        expected_points: List[str],
        learner_answer: str,
        topic: str,
    ) -> Dict[str, Any]:
        """
        Returns: { "correct": bool, "score": float (0-1), "feedback": str, "missing_points": list }
        """
        if not self._enabled:
            # Naive fallback: any answer longer than 10 chars counts as partially correct
            answered = len(learner_answer.strip()) > 10
            return {
                "correct": answered,
                "score": 0.6 if answered else 0.1,
                "feedback": "Good effort! Keep going." if answered else "Try to give a bit more detail.",
                "missing_points": [],
            }

        prompt = f"""
Evaluate this learner's answer for the topic "{topic}".

Question: {question}
Expected key points: {json.dumps(expected_points)}
Learner's answer: "{learner_answer}"

Be lenient on phrasing, strict on conceptual accuracy.
Return ONLY valid JSON:
{{
  "correct": true/false,
  "score": 0.0-1.0,
  "feedback": "<brief supportive feedback>",
  "missing_points": ["<missed concept>"]
}}
""".strip()

        response = await self._client.messages.create(
            model=_MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json(response.content[0].text)

    # ── Simplified explanation ────────────────────────────────────────────────
    async def simplify_explanation(
        self, concept: str, current_explanation: str
    ) -> str:
        if not self._enabled:
            return f"Let me put {concept} in simpler terms: {current_explanation[:120]}..."

        prompt = f"""
A learner is cognitively overloaded. Re-explain this concept much more simply.
Concept: {concept}
Current explanation: {current_explanation}

Use an analogy if possible. Max 3 sentences. Plain language only.
""".strip()

        response = await self._client.messages.create(
            model=_MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip()

    # ── Concept breakdown ─────────────────────────────────────────────────────
    async def break_down_concept(self, concept: str, context: str) -> List[str]:
        """Returns a list of smaller sub-concepts to teach sequentially."""
        if not self._enabled:
            return [
                f"What is {concept}?",
                f"Why does {concept} matter?",
                f"How is {concept} used in practice?",
            ]

        prompt = f"""
Break down "{concept}" into 3-5 bite-sized sub-concepts for a struggling learner.
Context: {context}
Return ONLY a JSON array of strings: ["sub1", "sub2", ...]
""".strip()

        response = await self._client.messages.create(
            model=_MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        try:
            return json.loads(response.content[0].text)
        except Exception:
            return [concept]

    # ── Intervention message ──────────────────────────────────────────────────
    async def generate_intervention(
        self,
        intervention_type: str,
        topic: str,
        learner_state: str,
        context: str,
    ) -> str:
        if not self._enabled:
            _fallback_messages = {
                "ask_question": f"Quick check — can you summarise what we just covered about {topic}?",
                "simplify": f"Let me re-explain {topic} more simply for you.",
                "break_down": f"Let's slow down and go through {topic} step by step.",
                "check_in": "Are you still with me? Let me know if anything is unclear.",
                "encouragement": "You're doing great — keep going!",
                "active_recall": f"Without looking, can you tell me the main idea of {topic}?",
                "increase_difficulty": f"Let's push further — here's a harder question on {topic}.",
            }
            return _fallback_messages.get(intervention_type.lower(), "Great work so far!")

        prompt = f"""
You are a supportive AI tutor. The learner is in state: {learner_state}.
Intervention needed: {intervention_type}
Topic: {topic}
Recent context: {context}

Write ONE short spoken sentence for the agent to say (max 25 words).
Be encouraging, direct, and specific. Do NOT use filler phrases.
""".strip()

        response = await self._client.messages.create(
            model=_MODEL,
            max_tokens=128,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip().strip('"')


# ── Helpers ───────────────────────────────────────────────────────────────────
def _mastery_to_difficulty(score: float) -> str:
    if score < 25:
        return "beginner"
    if score < 55:
        return "intermediate"
    if score < 80:
        return "advanced"
    return "expert"


def _parse_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Could not parse JSON from Claude: %s", text[:200])
        return {}
