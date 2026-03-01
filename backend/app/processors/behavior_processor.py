"""
behavior_processor.py — Observes broader behavioural patterns:
  - Leaning in/out (proximity to camera → interest level)
  - Body posture stability
  - Notable gestures (hand-to-face = thinking/confused)

Uses YOLO pose estimation (ultralytics) when available.
Falls back to frame-difference heuristics without it.

Emits BehaviorUpdatedEvent for the reasoning loop.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import av
import numpy as np

from vision_agents.core.events import BaseEvent
from vision_agents.core.processors import VideoProcessor
from vision_agents.core.utils.video_forwarder import VideoForwarder

logger = logging.getLogger(__name__)

# Lazy import of ultralytics
try:
    from ultralytics import YOLO as _YOLO  # type: ignore
    _YOLO_AVAILABLE = True
except ImportError:
    _YOLO_AVAILABLE = False
    logger.info("ultralytics not installed — behavior processor using simplified mode")


@dataclass
class BehaviorSignal:
    proximity_score: float = 0.5       # 0=far/disengaged, 1=close/engaged
    posture_stable: bool = True
    hand_to_face: bool = False         # thinking/confused gesture
    body_orientation: str = "forward"  # forward | sideways | away
    timestamp: float = field(default_factory=time.time)


@dataclass
class BehaviorUpdatedEvent(BaseEvent):
    type: str = "processor.behavior.updated"
    signal: Optional[BehaviorSignal] = None


class BehaviorProcessor(VideoProcessor):
    name = "behavior_processor"

    def __init__(self, fps: int = 5, pose_model: str = "yolo11n-pose.pt"):
        self.fps = fps
        self._forwarder: Optional[VideoForwarder] = None
        self._events = None
        self._signal = BehaviorSignal()
        self._pose_model = None

        if _YOLO_AVAILABLE:
            try:
                self._pose_model = _YOLO(pose_model)
            except Exception as exc:
                logger.warning("YOLO pose model load failed (%s), using fallback", exc)

        self._prev_frame: Optional[np.ndarray] = None

    def attach_agent(self, agent) -> None:
        self._events = agent.events
        self._events.register(BehaviorUpdatedEvent)

    async def process_video(
        self,
        track,
        participant_id: Optional[str],
        shared_forwarder: Optional[VideoForwarder] = None,
    ) -> None:
        self._forwarder = shared_forwarder or VideoForwarder(
            track,
            max_buffer=self.fps,
            fps=self.fps,
            name="behavior_forwarder",
        )
        self._forwarder.add_frame_handler(
            self._process_frame,
            fps=float(self.fps),
            name="behavior_processor",
        )

    async def _process_frame(self, frame: av.VideoFrame) -> None:
        try:
            img = frame.to_ndarray(format="rgb24")
            if self._pose_model:
                signal = await self._yolo_analyse(img)
            else:
                signal = self._simple_analyse(img)

            self._signal = signal
            if self._events:
                self._events.send(BehaviorUpdatedEvent(signal=signal))
        except Exception as exc:
            logger.debug("BehaviorProcessor error: %s", exc)

    async def _yolo_analyse(self, img: np.ndarray) -> BehaviorSignal:
        """Use YOLO11 pose keypoints to estimate proximity + posture."""
        results = self._pose_model(img, verbose=False)
        signal = BehaviorSignal()

        if not results or not results[0].keypoints:
            return signal

        kpts = results[0].keypoints.xy.cpu().numpy()
        if kpts.shape[0] == 0:
            return signal

        # Person keypoints (first person)
        person = kpts[0]  # shape (17, 2)

        # Proximity: bounding box height relative to frame height as proxy
        boxes = results[0].boxes
        if boxes is not None and len(boxes) > 0:
            h_frame = img.shape[0]
            box_h = float(boxes.xywh[0][3])
            signal.proximity_score = min(1.0, box_h / h_frame)

        # Posture stability: shoulder-hip alignment
        # COCO keypoints: 5=LShoulder, 6=RShoulder, 11=LHip, 12=RHip
        shoulder_mid_x = (person[5][0] + person[6][0]) / 2.0
        hip_mid_x = (person[11][0] + person[12][0]) / 2.0
        lean = abs(shoulder_mid_x - hip_mid_x) / (img.shape[1] + 1e-6)
        signal.posture_stable = lean < 0.05

        # Hand-to-face: wrists near face landmarks (nose ~0)
        nose = person[0]
        l_wrist = person[9]
        r_wrist = person[10]
        dist_l = np.linalg.norm(nose - l_wrist)
        dist_r = np.linalg.norm(nose - r_wrist)
        signal.hand_to_face = bool(dist_l < 80 or dist_r < 80)

        # Body orientation: check if shoulders visible (forward-facing)
        ls_visible = person[5][0] > 0 and person[5][1] > 0
        rs_visible = person[6][0] > 0 and person[6][1] > 0
        if ls_visible and rs_visible:
            signal.body_orientation = "forward"
        elif ls_visible or rs_visible:
            signal.body_orientation = "sideways"
        else:
            signal.body_orientation = "away"

        return signal

    def _simple_analyse(self, img: np.ndarray) -> BehaviorSignal:
        """Frame difference heuristic fallback."""
        signal = BehaviorSignal()
        gray = np.mean(img, axis=2)
        if self._prev_frame is not None and gray.shape == self._prev_frame.shape:
            diff = np.mean(np.abs(gray - self._prev_frame)) / 255.0
            # High motion → restlessness; very low → possibly away
            signal.posture_stable = diff < 0.03
            signal.proximity_score = 0.5  # unknown
        self._prev_frame = gray
        return signal

    async def stop_processing(self) -> None:
        if self._forwarder:
            await self._forwarder.remove_frame_handler(self._process_frame)
            self._forwarder = None

    async def close(self) -> None:
        await self.stop_processing()
