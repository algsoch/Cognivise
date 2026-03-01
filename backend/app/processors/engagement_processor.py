"""
engagement_processor.py — Vision Agents VideoProcessor for real-time engagement estimation.

Runs at PROCESSOR_FPS (default 10 fps).
Uses MediaPipe FaceMesh (lightweight, CPU-friendly) for:
  - Face detection presence
  - Eye-landmark based gaze estimation
  - Blink rate (EAR method)
  - Head pose (yaw/pitch via landmarks)
  - Restlessness from frame-delta motion

Emits EngagementUpdatedEvent which the agent reasoning loop subscribes to.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, Optional, Tuple

import av
import numpy as np

from vision_agents.core.events import BaseEvent
from vision_agents.core.processors import VideoProcessor
from vision_agents.core.utils.video_forwarder import VideoForwarder

from backend.app.config.settings import settings
from backend.app.models.learning_state import EngagementSignal
from backend.app.api.broadcaster import MetricsBroadcaster

logger = logging.getLogger(__name__)

# ── MediaPipe import (Tasks API for 0.10.x) ─────────────────────────────────
try:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions as _MPBaseOptions
    from mediapipe.tasks.python.vision import (
        FaceLandmarker,
        FaceLandmarkerOptions,
        RunningMode as _FaceRunningMode,
    )
    _MP_AVAILABLE = True
except Exception:
    _MP_AVAILABLE = False
    logger.warning("mediapipe Tasks API not available — using OpenCV fallback for face detection")

# ── OpenCV fallback ───────────────────────────────────────────────────────────
try:
    import cv2 as _cv2
    _HAAR_CASCADE = _cv2.CascadeClassifier(_cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    _HAAR_EYE   = _cv2.CascadeClassifier(_cv2.data.haarcascades + "haarcascade_eye.xml")
    _CV2_AVAILABLE = True
except Exception:
    _CV2_AVAILABLE = False

# ── Model path for FaceLandmarker ─────────────────────────────────────────────
import pathlib as _pathlib
import urllib.request as _urlrequest

_MODEL_DIR = _pathlib.Path(__file__).parent.parent.parent.parent / "models"
_FACE_MODEL = _MODEL_DIR / "face_landmarker.task"
_FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"


def _ensure_face_model() -> bool:
    """Download FaceLandmarker model if not present. Returns True if ready."""
    if not _MP_AVAILABLE:
        return False
    try:
        _MODEL_DIR.mkdir(parents=True, exist_ok=True)
        if not _FACE_MODEL.exists():
            logger.info("Downloading FaceLandmarker model (~4MB)...")
            _urlrequest.urlretrieve(_FACE_MODEL_URL, _FACE_MODEL)
            logger.info("FaceLandmarker model downloaded.")
        return True
    except Exception as exc:
        logger.warning("Could not download FaceLandmarker model: %s", exc)
        return False


# ── EAR (Eye-Aspect-Ratio) landmark indices for MediaPipe 478-pt Tasks mesh ─
# Left eye: 362, 385, 387, 263, 373, 380
# Right eye: 33, 160, 158, 133, 153, 144
_LEFT_EYE = [362, 385, 387, 263, 373, 380]
_RIGHT_EYE = [33, 160, 158, 133, 153, 144]
_EAR_THRESHOLD = 0.2   # below this → eye closed (blink)
_EAR_CONSEC_FRAMES = 2


# ── Events ────────────────────────────────────────────────────────────────────
@dataclass
class EngagementUpdatedEvent(BaseEvent):
    type: str = "processor.engagement.updated"
    signal: Optional[EngagementSignal] = None
    engagement_score: float = 0.0


# ── Processor ────────────────────────────────────────────────────────────────
class EngagementProcessor(VideoProcessor):
    """
    Stateful VideoProcessor that estimates learner engagement per-frame.

    Usage in Agent constructor:
        processors=[EngagementProcessor(fps=10)]
    """

    name = "engagement_processor"

    def __init__(self, fps: int = 10):
        self.fps = fps
        self._forwarder: Optional[VideoForwarder] = None
        self._events = None

        # Blink tracking
        self._ear_below_thresh_count: int = 0
        self._blink_count: int = 0
        self._blink_window_start: float = time.time()
        self._blink_rate: float = 15.0  # blinks/min

        # Motion / restlessness
        self._prev_gray: Optional[np.ndarray] = None
        self._motion_buffer: Deque[float] = deque(maxlen=30)

        # FaceLandmarker (Tasks API) with fallback to OpenCV Haar
        self._face_landmarker = None
        self._haar_cascade = None
        self._use_tasks_api = False

        if _MP_AVAILABLE and _ensure_face_model():
            try:
                # Build kwargs dynamically — min_face_presence_confidence was added
                # in mediapipe 0.10.8; older builds only know min_face_detection_confidence
                _opts_kwargs = dict(
                    base_options=_MPBaseOptions(model_asset_path=str(_FACE_MODEL)),
                    running_mode=_FaceRunningMode.IMAGE,
                    num_faces=1,
                    output_face_blendshapes=True,
                    output_facial_transformation_matrixes=False,
                    min_face_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                try:
                    opts = FaceLandmarkerOptions(**_opts_kwargs,
                                                min_face_presence_confidence=0.5)
                except TypeError:
                    opts = FaceLandmarkerOptions(**_opts_kwargs)
                self._face_landmarker = FaceLandmarker.create_from_options(opts)
                self._use_tasks_api = True
                logger.info("EngagementProcessor: FaceLandmarker (Tasks API) ready")
            except Exception as exc:
                logger.warning("FaceLandmarker init failed: %s — falling back to OpenCV", exc)

        if not self._use_tasks_api and _CV2_AVAILABLE:
            self._haar_cascade = _HAAR_CASCADE
            logger.info("EngagementProcessor: using OpenCV Haar cascade fallback")

        self._latest_signal = EngagementSignal()
        self._latest_frame: Optional[np.ndarray] = None

    # ── Vision Agents lifecycle ───────────────────────────────────────────
    def attach_agent(self, agent) -> None:
        self._events = agent.events
        self._events.register(EngagementUpdatedEvent)

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
            name="engagement_forwarder",
        )
        self._forwarder.add_frame_handler(
            self._process_frame,
            fps=float(self.fps),
            name="engagement_processor",
        )

    async def _process_frame(self, frame: av.VideoFrame) -> None:
        try:
            img_rgb = frame.to_ndarray(format="rgb24")
            self._latest_frame = img_rgb          # store for screen analysis
            signal = self._analyse(img_rgb)
            self._latest_signal = signal
            score = signal.to_score()

            if self._events:
                self._events.send(
                    EngagementUpdatedEvent(signal=signal, engagement_score=score)
                )

            # Push rich face data to metrics broadcaster → frontend
            MetricsBroadcaster.instance().push({
                "face_detected": signal.face_detected,
                "gaze_on_screen": signal.gaze_on_screen,
                "blink_rate": round(signal.blink_rate, 1),
                "restlessness": round(signal.restlessness_score, 3),
                "head_pose_confidence": round(signal.head_pose_confidence, 2),
                "engagement_score": round(score, 1),
                "head_yaw": round(signal.head_yaw, 1),
                "head_pitch": round(signal.head_pitch, 1),
            })
        except Exception as exc:
            logger.debug("EngagementProcessor frame error: %s", exc)

    async def stop_processing(self) -> None:
        if self._forwarder:
            await self._forwarder.remove_frame_handler(self._process_frame)
            self._forwarder = None

    async def close(self) -> None:
        await self.stop_processing()
        if self._face_landmarker:
            self._face_landmarker.close()

    # ── Analysis ──────────────────────────────────────────────────────────
    def _analyse(self, img_rgb: np.ndarray) -> EngagementSignal:
        h, w = img_rgb.shape[:2]

        # Motion / restlessness via frame difference
        gray = np.mean(img_rgb, axis=2).astype(np.uint8)
        restlessness = 0.0
        if self._prev_gray is not None and gray.shape == self._prev_gray.shape:
            diff = np.abs(gray.astype(float) - self._prev_gray.astype(float))
            motion = float(np.mean(diff)) / 255.0
            self._motion_buffer.append(motion)
            restlessness = float(np.mean(self._motion_buffer)) * 5.0
            restlessness = min(1.0, restlessness)
        self._prev_gray = gray

        # Route to correct analysis path
        if self._use_tasks_api and self._face_landmarker is not None:
            return self._analyse_tasks(img_rgb, h, w, restlessness)
        if self._haar_cascade is not None:
            return self._analyse_haar(img_rgb, restlessness)
        return EngagementSignal(face_detected=False, restlessness_score=restlessness)

    def _ear_tasks(self, lm, w: int, h: int) -> float:
        """Eye Aspect Ratio using Tasks API landmarks (NormalizedLandmark list)."""
        def _pts(indices):
            return np.array([[lm[i].x * w, lm[i].y * h] for i in indices])

        def _single_ear(pts):
            A = np.linalg.norm(pts[1] - pts[5])
            B = np.linalg.norm(pts[2] - pts[4])
            C = np.linalg.norm(pts[0] - pts[3])
            return (A + B) / (2.0 * C + 1e-6)

        try:
            left = _single_ear(_pts(_LEFT_EYE))
            right = _single_ear(_pts(_RIGHT_EYE))
            return (left + right) / 2.0
        except Exception:
            return 0.3  # neutral

    def _ear(self, lm, w: int, h: int) -> float:
        """Legacy alias — same as _ear_tasks."""
        return self._ear_tasks(lm, w, h)

    def _estimate_gaze_tasks(self, lm) -> bool:
        """Rough gaze-on-screen check via iris vs eye corners."""
        try:
            l_iris_x = lm[473].x
            r_iris_x = lm[468].x
            l_outer = lm[33].x
            l_inner = lm[133].x
            r_inner = lm[362].x
            r_outer = lm[263].x
            l_ratio = (l_iris_x - l_outer) / (l_inner - l_outer + 1e-6)
            r_ratio = (r_iris_x - r_inner) / (r_outer - r_inner + 1e-6)
            return 0.2 < l_ratio < 0.8 and 0.2 < r_ratio < 0.8
        except Exception:
            return True

    def _analyse_tasks(self, img_rgb: np.ndarray, h: int, w: int, restlessness: float) -> EngagementSignal:
        """Full analysis using MediaPipe FaceLandmarker Tasks API."""
        import mediapipe as mp
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        result = self._face_landmarker.detect(mp_image)

        if not result.face_landmarks:
            return EngagementSignal(face_detected=False, restlessness_score=restlessness)

        lm = result.face_landmarks[0]
        face_detected = True

        # ── EAR blink ─────────────────────────────────────────────────────
        ear = self._ear_tasks(lm, w, h)
        now = time.time()
        if ear < _EAR_THRESHOLD:
            self._ear_below_thresh_count += 1
        else:
            if self._ear_below_thresh_count >= _EAR_CONSEC_FRAMES:
                self._blink_count += 1
            self._ear_below_thresh_count = 0

        elapsed = now - self._blink_window_start
        if elapsed >= 10.0:
            self._blink_rate = (self._blink_count / elapsed) * 60.0
            self._blink_count = 0
            self._blink_window_start = now

        # ── Gaze ──────────────────────────────────────────────────────────
        gaze_on_screen = self._estimate_gaze_tasks(lm)

        # ── Head pose (yaw / pitch) via nose tip vs eye midpoint ──────────
        # Landmark 1 = nose tip, 33 = left eye outer, 263 = right eye outer
        # 10 = forehead (approx)
        try:
            nose = lm[1]
            l_eye = lm[33]
            r_eye = lm[263]
            face_cx = (l_eye.x + r_eye.x) / 2.0
            face_cy = (l_eye.y + r_eye.y) / 2.0
            head_yaw = (nose.x - face_cx) * 200.0      # rough degrees
            head_pitch = (nose.y - face_cy) * 200.0    # rough degrees
            head_pose_confidence = 1.0
        except Exception:
            head_yaw = 0.0
            head_pitch = 0.0
            head_pose_confidence = 0.5

        return EngagementSignal(
            face_detected=face_detected,
            gaze_on_screen=gaze_on_screen,
            blink_rate=self._blink_rate,
            restlessness_score=restlessness,
            head_pose_confidence=head_pose_confidence,
            head_yaw=head_yaw,
            head_pitch=head_pitch,
        )

    def _analyse_haar(self, img_rgb: np.ndarray, restlessness: float) -> EngagementSignal:
        """Fallback using OpenCV Haar cascade with eye detection + gaze estimate."""
        import cv2
        h, w = img_rgb.shape[:2]
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        gray_eq = cv2.equalizeHist(gray)

        faces = self._haar_cascade.detectMultiScale(
            gray_eq, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )

        if len(faces) == 0:
            return EngagementSignal(
                face_detected=False,
                gaze_on_screen=False,   # no face → not looking
                blink_rate=self._blink_rate,
                restlessness_score=restlessness,
                head_pose_confidence=0.0,
            )

        # Use the largest face
        fx, fy, fw, fh = max(faces, key=lambda r: r[2] * r[3])

        # ── Gaze estimate: is face roughly centred horizontally? ──────────
        face_cx = fx + fw / 2.0
        face_cy = fy + fh / 2.0
        # If face centre is within 40% of frame centre on both axes → on screen
        cx_ratio = abs(face_cx / w - 0.5)
        cy_ratio = abs(face_cy / h - 0.5)
        gaze_on_screen = (cx_ratio < 0.40 and cy_ratio < 0.45)

        # ── Head yaw from face x offset ────────────────────────────────────
        head_yaw = (face_cx / w - 0.5) * 60.0   # ±30° range
        head_pitch = (face_cy / h - 0.4) * 40.0  # rough pitch

        # ── Blink via eye detection in upper-half of face ROI ─────────────
        roi_y = fy
        roi_h = int(fh * 0.55)
        roi_gray = gray_eq[roi_y:roi_y + roi_h, fx:fx + fw]
        eyes = _HAAR_EYE.detectMultiScale(roi_gray, scaleFactor=1.1,
                                          minNeighbors=3, minSize=(15, 15))
        eyes_open = len(eyes) >= 1
        now = time.time()
        if not eyes_open:
            self._ear_below_thresh_count += 1
        else:
            if self._ear_below_thresh_count >= 2:
                self._blink_count += 1
            self._ear_below_thresh_count = 0
        elapsed = now - self._blink_window_start
        if elapsed >= 10.0:
            self._blink_rate = (self._blink_count / elapsed) * 60.0
            self._blink_count = 0
            self._blink_window_start = now

        return EngagementSignal(
            face_detected=True,
            gaze_on_screen=gaze_on_screen,
            blink_rate=self._blink_rate,
            restlessness_score=restlessness,
            head_pose_confidence=0.5,
            head_yaw=head_yaw,
            head_pitch=head_pitch,
        )

    @property
    def latest_signal(self) -> EngagementSignal:
        return self._latest_signal

    @property
    def latest_frame(self) -> Optional[np.ndarray]:
        """Most recent video frame as RGB numpy array, or None if not yet received."""
        return self._latest_frame
