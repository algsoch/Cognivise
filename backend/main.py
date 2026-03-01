"""
main.py — Application entry point.

Usage:
  python -W ignore backend/main.py run            # Start agent service (waits for /api/join)
  python -W ignore backend/main.py run <call_id>  # Join a specific call immediately
"""

from __future__ import annotations

import asyncio
import logging
import sys

from dotenv import load_dotenv

load_dotenv()

from vision_agents.core import AgentLauncher

from backend.app.agent.main_agent import create_agent, join_call
from backend.app.api.server import start_api_server, set_launcher, get_pending_session_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


async def _main() -> None:
    """Async entry: warm up launcher, register with API, serve forever."""

    launcher = AgentLauncher(
        create_agent=create_agent,
        join_call=join_call,
        agent_idle_timeout=120.0,   # leave idle call after 2 min
    )

    # Warmup LLM/TTS/STT/processors before accepting any calls
    await launcher.start()
    logger.info("AgentLauncher ready — listening for /api/join requests on port 8001")

    # Register launcher so the API /api/join endpoint can call start_session()
    loop = asyncio.get_event_loop()
    set_launcher(launcher, loop)

    # Also check if a call_id was queued before the launcher was ready
    # (frontend may have POSTed /api/join while we were still warming up)
    cfg = get_pending_session_config()
    queued_call_id   = cfg.pop("pending_call_id",   None)
    queued_call_type = cfg.pop("pending_call_type", "default")
    if queued_call_id:
        logger.info("Processing queued call_id: %s", queued_call_id)
        await launcher.start_session(queued_call_id, queued_call_type)

    # If a call_id was supplied directly on the command line, join it now
    # e.g.  python main.py run my_call_123
    if len(sys.argv) >= 3:
        cli_call_id = sys.argv[2].strip()
        if cli_call_id:
            logger.info("Joining CLI call_id: %s", cli_call_id)
            await launcher.start_session(cli_call_id, "default")

    # Keep running forever — agent joins calls triggered by /api/join
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        await launcher.stop()


if __name__ == "__main__":
    # Start the metrics/control HTTP API on port 8001 (daemon thread)
    start_api_server(port=8001)

    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        logger.info("Shutting down")

