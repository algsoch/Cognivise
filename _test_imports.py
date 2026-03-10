"""Quick import sanity check — run from project root."""
import os, sys

os.environ.setdefault("STREAM_API_KEY", "test")
os.environ.setdefault("STREAM_API_SECRET", "test")
os.environ.setdefault("GEMINI_API_KEY", "test")
os.environ.setdefault("GOOGLE_API_KEY", "test")

steps = [
    ("settings", "from backend.app.config.settings import settings"),
    ("postgres", "from backend.app.db.postgres import init_db"),
    ("models", "from backend.app.models.learning_state import LearnerState"),
    ("engagement_proc", "from backend.app.processors.engagement_processor import EngagementProcessor"),
    ("attention_proc", "from backend.app.processors.attention_processor import AttentionProcessor"),
    ("behavior_proc", "from backend.app.processors.behavior_processor import BehaviorProcessor"),
    ("cognitive_proc", "from backend.app.processors.cognitive_load_processor import CognitiveLoadProcessor"),
    ("claude_engine", "from backend.app.llm.claude_engine import ClaudeEngine"),
    ("gemini_engine", "from backend.app.llm.gemini_engine import GeminiEngine"),
    ("main_agent", "from backend.app.agent.main_agent import create_agent, join_call"),
]

all_ok = True
for label, stmt in steps:
    try:
        exec(stmt)
        print(f"  ✓ {label}")
    except Exception as e:
        print(f"  ✗ {label}: {e}")
        all_ok = False

print()
print("ALL OK" if all_ok else "SOME IMPORTS FAILED")
sys.exit(0 if all_ok else 1)
