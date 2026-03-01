<div align="center">

<br/>

<img src="https://img.shields.io/badge/Cognivise-AI%20Learning%20Agent-8b5cf6?style=for-the-badge&logo=openai&logoColor=white" alt="Cognivise" height="42"/>

<h1>
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=28&pause=1000&color=8B5CF6&center=true&vCenter=true&width=600&lines=Cognivise+%E2%80%94+AI+Learning+Agent;Real-Time+Adaptive+Tutoring;Watch.+Listen.+Understand.+Teach." alt="Cognivise Typing SVG" />
</h1>

<p align="center">
  <strong>A closed-loop cognitive intelligence system that watches, listens, and adapts to every learner in real time.</strong><br/>
  Not a chatbot. Not a summariser. A genuine AI tutor that <em>understands</em> you.
</p>

<br/>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black"/>
  <img src="https://img.shields.io/badge/Gemini-Realtime-4285F4?style=flat-square&logo=google&logoColor=white"/>
  <img src="https://img.shields.io/badge/Stream-WebRTC-005FFF?style=flat-square&logo=stream&logoColor=white"/>
  <img src="https://img.shields.io/badge/MediaPipe-FaceMesh-FF6F00?style=flat-square&logo=google&logoColor=white"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql&logoColor=white"/>
  <img src="https://img.shields.io/badge/License-Apache_2.0-22c55e?style=flat-square"/>
</p>

<p align="center">
  <em>Built with <a href="https://github.com/GetStream/Vision-Agents">Stream Vision Agents SDK</a> · WeMakeDevs × Vision Agents — Hack All February</em>
</p>

<br/>

---

</div>

## 📖 About the Project

<table>
<tr>
<td width="50%" valign="top">

### The Problem

Every learner has a different pace. But every lecture moves at the same speed.

When a student zones out at minute 4, no one notices. When a concept causes confusion, the video keeps playing. When mastery is achieved, the difficulty never increases.

**The result:** passive watching that feels productive but leaves knowledge gaps.

</td>
<td width="50%" valign="top">

### The Solution — Cognivise

Cognivise is a **real-time AI tutor** that runs alongside any learning content. It monitors the learner through their webcam and microphone, detects cognitive state every 15 seconds, and intervenes with precision — asking questions, simplifying concepts, or challenging the learner — exactly when needed.

Think of it as a **1-on-1 human tutor**, available 24/7, at zero cost.

</td>
</tr>
</table>

### 🧠 What makes it different

<div align="center">

| Traditional EdTech | Cognivise |
|---|---|
| Passive video watching | Closed-loop cognitive monitoring |
| One-size-fits-all pacing | Adapts every 15 seconds per learner |
| Fixed quizzes at the end | Live questions when confusion is detected |
| Static difficulty | Mastery-calibrated question difficulty |
| No memory between sessions | Persistent topic mastery + spaced repetition |
| Generic AI chatbot | Named agent (Algsoch) that knows your name |

</div>

---

## 🏗 Architecture

<div align="center">

<!-- ═══════════════════  LAYER 1 — BROWSER  ═══════════════════ -->

<table>
<tr>
<td align="center" colspan="3">
<img src="https://img.shields.io/badge/LEARNER'S%20BROWSER-React%2018%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black"/>
</td>
</tr>
<tr>
<td align="center" width="33%">

**📹 Webcam Feed**

`getUserMedia`\
`WebRTC track`\
👤 Learner face

</td>
<td align="center" width="33%">

**📺 Learning Content**

`YouTube iframe`\
`Screen Share`\
`getDisplayMedia`

</td>
<td align="center" width="33%">

**📊 Live Metrics Panel**

`Engagement score`\
`Attention waveform`\
`Mastery tracker`

</td>
</tr>
</table>

<br/>

```
          │ WebRTC (audio + video)        │ WebSocket (50ms metrics push)
          ▼                              ▼
```

<!-- ═══════════════════  LAYER 2 — FASTAPI BACKEND  ═══════════════════ -->

<table>
<tr>
<td align="center" colspan="3">
<img src="https://img.shields.io/badge/FASTAPI%20BACKEND-port%208001-009688?style=for-the-badge&logo=fastapi&logoColor=white"/>
</td>
</tr>
<tr>
<td align="center" colspan="3">
<img src="https://img.shields.io/badge/Vision%20Agents%20SDK-Stream%20Edge%20WebRTC-8b5cf6?style=for-the-badge&logo=google&logoColor=white"/>
</td>
</tr>
<tr>
<td align="center" width="33%">

**👁 EngagementProcessor**

`MediaPipe FaceMesh`\
`EAR blink rate`\
`Iris gaze estimation`\
`Restlessness score`

</td>
<td align="center" width="33%">

**🎯 AttentionProcessor**

`Focus duration timer`\
`Distraction detection`\
`Debounced events`\
`Score 0–100`

</td>
<td align="center" width="33%">

**🧠 CognitiveLoadProcessor**

`Response latency`\
`Rolling error window`\
`Confusion NLP markers`\
`YOLO11 pose posture`

</td>
</tr>
</table>

<br/>

```
                    └──────────────────────────────┘
                                  │  LearningStateSnapshot
                                  ▼
```

<!-- ═══════════════════  LAYER 3 — REASONING LOOP  ═══════════════════ -->

<table>
<tr>
<td align="center">
<img src="https://img.shields.io/badge/Reasoning%20Loop-15s%20Cognitive%20Cycle-f59e0b?style=for-the-badge&logo=clockify&logoColor=white"/>
</td>
</tr>
<tr>
<td align="center">

`focused` → **Active Recall** &nbsp;|&nbsp; `distracted` → **Check-in** &nbsp;|&nbsp; `overloaded` → **Simplify**

`struggling` → **Break it down** &nbsp;|&nbsp; `mastering` → **Increase difficulty**

<br/>

<img src="https://img.shields.io/badge/Gemini%202.5%20Flash-Question%20Gen%20%2B%20Eval-4285F4?style=flat-square&logo=google&logoColor=white"/>
<img src="https://img.shields.io/badge/Gemini%20Realtime-Voice%20%2B%20Video%20Agent-34a853?style=flat-square&logo=google&logoColor=white"/>

</td>
</tr>
</table>

<br/>

```
              │ Voice + Video (WebRTC)           │ Intervention decision
              ▼                                 ▼
```

<!-- ═══════════════════  LAYER 4 — AGENT + DB  ═══════════════════ -->

<table>
<tr>
<td align="center" width="50%">
<img src="https://img.shields.io/badge/Algsoch%20Agent-Gemini%20Realtime%20Voice-8b5cf6?style=for-the-badge&logo=google&logoColor=white"/>

`Speaks to learner in real time`\
`Watches webcam + screen`\
`Name: Algsoch`

</td>
<td align="center" width="50%">
<img src="https://img.shields.io/badge/PostgreSQL%2016-Session%20%2B%20Mastery-336791?style=for-the-badge&logo=postgresql&logoColor=white"/>

`Async SQLAlchemy`\
`Topic mastery scores`\
`Spaced repetition log`

</td>
</tr>
</table>

</div>

### SDK Alignment — Vision Agents Primitives

<div align="center">

| Cognivise Component | Vision Agents Primitive | Role |
|---|---|---|
| `EngagementProcessor` | `VideoProcessor` + `add_frame_handler` | FaceMesh, EAR blink, iris gaze, restlessness |
| `AttentionProcessor` | `VideoProcessor` + event subscription | Focus duration, distraction detection |
| `BehaviorProcessor` | `VideoProcessor` + YOLO11 pose | Body posture, head movement |
| `CognitiveLoadProcessor` | Event-driven `VideoProcessor` | Response latency, error rate, confusion NLP |
| `ReasoningLoop` | Background `asyncio.Task` on `Agent` | 15s decision cycle, intervention dispatch |
| `Algsoch` (agent) | `Agent(edge=getstream.Edge(), llm=gemini.Realtime)` | Voice + video real-time AI tutor |
| `MemoryManager` | Custom async service | Topic mastery, spaced repetition, PostgreSQL |

</div>

---

## ✨ Features

<table>
<tr>
<td width="33%" valign="top">

### 👁 Real-Time Vision
- **FaceMesh** (468 landmarks)
- **EAR** blink rate tracking
- **Iris landmark** gaze estimation
- **Head pose** yaw confidence
- **Frame-delta** restlessness score
- **YOLO11** pose estimation

</td>
<td width="33%" valign="top">

### 🧠 Adaptive Intelligence
- 7 learning states classified per tick
- 8 intervention types (recall, simplify, challenge…)
- 2-minute pending-question guard
- 60-second intervention cooldown
- Video-pause → auto comprehension question
- Screen topic auto-detection via Gemini Flash

</td>
<td width="33%" valign="top">

### 🎯 Mastery & Memory
- Per-topic mastery score (0–100)
- Semantic answer evaluation (not keywords)
- Corrective feedback with encouragement
- Spaced repetition scheduling
- Cross-session knowledge graph
- PostgreSQL + MongoDB persistence

</td>
</tr>
<tr>
<td width="33%" valign="top">

### 🖥 Session Interface
- YouTube / uploaded video / screen share
- Live Q&A conversation log (chat bubbles)
- Learner speech overlay on webcam
- Volume ducking when Algsoch speaks
- Animated spring toast notifications
- Agent activity panel + visual thumbnail

</td>
<td width="33%" valign="top">

### 📊 Analytics Dashboard
- Radar chart: learning profile (5 axes)
- Area chart: engagement + attention trend
- Topic mastery progress bars
- Full conversation replay
- Intervention log with relative timestamps
- Session duration stats

</td>
<td width="33%" valign="top">

### 🔊 Voice Interaction
- Gemini Realtime WebRTC audio
- Browser SpeechSynthesis TTS fallback
- Agent named **Algsoch**
- Personalised greeting by learner's name
- Volume auto-duck during agent speech
- 20s heartbeat to keep Gemini WS alive

</td>
</tr>
</table>

---

## 🛠 Tech Stack

<div align="center">

| Layer | Technology | Purpose |
|---|---|---|
| **Agent SDK** | Vision Agents 0.3.x | WebRTC + processor pipeline + event bus |
| **Edge / WebRTC** | Stream Video (getstream.io) | Real-time audio/video transport |
| **Primary LLM** | Gemini 2.5 Flash Realtime | Voice + video real-time conversation |
| **Reasoning Brain** | Gemini 2.5 Flash | Question generation + answer evaluation |
| **Vision** | MediaPipe FaceMesh + YOLO11 Pose | Face landmarks, blink, gaze, posture |
| **STT** | Gemini Realtime VAD | Learner speech transcription |
| **TTS** | Gemini Realtime + Browser SpeechSynthesis | Agent voice (dual-layer fallback) |
| **Primary DB** | PostgreSQL 16 (SQLAlchemy async) | Sessions, mastery, interaction log |
| **Optional DB** | MongoDB 7 (motor) | Unstructured transcript store |
| **Frontend** | React 18 + Vite + Tailwind CSS | Learner-facing interface |
| **Charts** | Recharts | Real-time metrics, radar, area charts |
| **State** | Zustand | Cross-component session state |
| **Animations** | Framer Motion | Spring toasts, metric transitions |
| **Backend** | FastAPI + uvicorn | REST + WebSocket API on port 8001 |

</div>

---

## 🎬 Demo

### Session Flow

```
1. Landing page  →  Enter name + paste YouTube URL / upload video / share screen
2. Session starts → Algsoch greeting:
                    "Hey Vicky! I'm Algsoch, your AI tutor!
                     I see you're watching 'Python Decorators'. Let's learn it together!"

3. Learner watches video  →  Engagement 78/100 | Attention 91/100 | Cognitive Load: Optimal

4. Learner looks away     →  Attention drops
                             Algsoch: "Still with me? What have you learned so far?"

5. Learner hesitates      →  Cognitive load rises
                             Algsoch simplifies the concept

6. Learner answers well   →  Mastery: Python Decorators 72%
                             Algsoch asks harder question

7. Video pauses           →  Auto comprehension:
                             "Tell me one real-world use case for decorators"

8. Session ends           →  Dashboard: radar profile, mastery progress, conversation replay
```

### What judges see in 60 seconds

| Second | Action | What happens |
|---|---|---|
| 0–5 | Open session page | Metrics panels light up, Algsoch connects |
| 6–10 | Look at camera | Engagement score rises to ~80 |
| 11–20 | Look away | Attention drops → agent check-in fires |
| 21–35 | Answer a question correctly | Mastery score increments, feedback given |
| 36–50 | Deliberately hesitate | Cognitive load rises → agent simplifies |
| 51–60 | End session | Dashboard: full profile, mastery bars, log |

---

## 🚀 Quick Start

### Prerequisites

- Python **3.12**
- Node **20+**
- PostgreSQL **16** running locally
- [Stream account](https://getstream.io) *(free tier: 333k min/month)*
- Google AI Studio API key *(Gemini)*

### 1 — Clone

```bash
git clone https://github.com/algsoch/Cognivise.git
cd Cognivise
```

### 2 — Configure environment

```bash
cp .env.example .env   # or copy .env and update
```

Fill in `.env`:

```env
# Stream (getstream.io)
STREAM_API_KEY=your_stream_key
STREAM_API_SECRET=your_stream_secret

# Google AI (Gemini)
GOOGLE_API_KEY=your_gemini_key

# PostgreSQL
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/vision_agent
```

### 3 — Backend

```bash
# Install deps
pip install uv
uv pip install -r requirements.txt

# Create the database
createdb vision_agent

# Start backend
PYTHONPATH=. .venv/bin/python -W ignore backend/main.py run
# → API ready at http://localhost:8001
```

### 4 — Frontend

```bash
cd frontend
npm install
npm run dev
# → App at http://localhost:5173
```

### 5 — Start learning

Open `http://localhost:5173`, enter your name, paste a YouTube URL, and click **Start Learning**. Algsoch will greet you by name within ~5 seconds.

---

## 📁 Project Structure

```
Cognivise/
├── backend/
│   ├── main.py                              ← Vision Agents Runner entry point
│   └── app/
│       ├── agent/
│       │   ├── main_agent.py                ← Agent factory + call handler + Gemini reconnect
│       │   ├── reasoning_loop.py            ← 15s cognitive reasoning engine
│       │   ├── memory_manager.py            ← PostgreSQL + MongoDB persistence
│       │   └── tutor.md                     ← Algsoch system prompt
│       ├── processors/
│       │   ├── engagement_processor.py      ← MediaPipe FaceMesh + EAR + iris gaze
│       │   ├── attention_processor.py       ← Focus/distraction timing
│       │   ├── behavior_processor.py        ← YOLO11 pose estimation
│       │   └── cognitive_load_processor.py  ← Latency + error + confusion NLP
│       ├── llm/
│       │   ├── gemini_engine.py             ← Question gen + topic extraction
│       │   └── claude_engine.py             ← Legacy fallback (Gemini handles eval)
│       ├── api/
│       │   ├── server.py                    ← FastAPI routes (/join, /session/config)
│       │   └── broadcaster.py               ← WebSocket metrics push to frontend
│       ├── db/
│       │   └── postgres.py                  ← Async SQLAlchemy schema + engine
│       └── models/
│           ├── learning_state.py            ← State machine + LearningStateSnapshot
│           └── user_session.py              ← Session + mastery knowledge graph
└── frontend/
    └── src/
        ├── pages/
        │   ├── LandingPage.jsx              ← Name + content source setup
        │   ├── SessionPage.jsx              ← Main learning interface
        │   └── DashboardPage.jsx            ← Post-session analytics
        ├── components/
        │   ├── AIAgentPanel.jsx             ← Agent connection status
        │   ├── EngagementMeter.jsx          ← Circular + compact gauge
        │   ├── AttentionWaveform.jsx        ← Live attention waveform
        │   ├── CognitiveLoadIndicator.jsx   ← Load band display
        │   ├── MasteryTracker.jsx           ← Topic mastery progress bars
        │   ├── InterventionFeed.jsx         ← Live intervention log
        │   └── FaceMonitorOverlay.jsx       ← Webcam CV overlay
        └── hooks/
            ├── useSessionStore.js           ← Zustand global state
            ├── useBackendConnection.js      ← WebSocket metrics + conversation log
            └── useStreamAudio.js            ← Stream WebRTC audio hook
```

---

## ⚡ Performance Profile

<div align="center">

| Stage | Target Latency |
|---|---|
| WebRTC join | ~500ms (Stream edge) |
| Audio/video transmission | < 30ms (WebRTC) |
| Vision processor FPS | 10 fps (100ms batches) |
| Reasoning cycle | 15s (configurable) |
| Gemini Flash question gen | ~400ms |
| Gemini answer evaluation | ~400–700ms |
| Gemini Realtime voice round-trip | < 1s |
| WebSocket metric push to frontend | < 50ms |
| SpeechSynthesis TTS fallback | ~0ms (browser native) |

</div>

---

## 🌱 Learning & Growth

Building Cognivise pushed significantly beyond my comfort zone in several areas:

### Technical challenges overcome

<details>
<summary><strong>1. Gemini Realtime session management</strong></summary>

The hardest problem in the project. Gemini Live WebSocket drops with `1011 "Deadline expired"` after ~2 minutes of learner silence (e.g. quietly watching a video). Solved with:
- 20-second silent PCM heartbeat probes (100ms of zeroed 16kHz audio)
- Proactive 2-minute reconnect loop (using `asyncio.timeout`)
- 50-retry resilience with exponential backoff
- `_tts_ready` flag to gate all speech until reconnect fully completes

</details>

<details>
<summary><strong>2. Closed-loop cognitive detection without ground truth</strong></summary>

There's no labelled dataset of "confused" or "disengaged" learners. Built a signal fusion system combining EAR blink rate, gaze stability, head pose confidence, response latency, and answer error rate into a composite `LearningStateSnapshot` — calibrated empirically across real study sessions.

</details>

<details>
<summary><strong>3. Screen content understanding across origin boundaries</strong></summary>

Gemini cannot see inside a YouTube iframe (cross-origin security). Built a workaround: capture the learner's screen via `getDisplayMedia`, pass frames to Gemini Flash every 30s for topic extraction, and detect video pauses via lightweight frame hash comparison to trigger comprehension questions automatically.

</details>

<details>
<summary><strong>4. React StrictMode double-invoke and WebRTC permission loop</strong></summary>

React 18 StrictMode double-invokes effects in development, causing `getDisplayMedia` to fire twice — prompting the user for screen share permission on every render. Fixed with a `hasCapturedRef` guard that ensures the permission dialog is shown exactly once per session regardless of re-renders.

</details>

<details>
<summary><strong>5. Vision Agents framework internals</strong></summary>

Working directly with the Vision Agents SDK required reading source code to understand `send_client_content` vs `send_realtime_input`, how `agent.events.subscribe` works differently from a standard observer, and the correct `AsyncSessionLocal` factory pattern inside the framework's async lifecycle.

</details>

### Skills built

- Real-time CV pipeline design (FaceMesh + YOLO11 at 10fps in a background processor)
- WebRTC audio/video synchronisation under real network conditions
- Async Python architecture with `asyncio.timeout`, task lifecycle, reconnect patterns
- Large state machine design for adaptive learning (7 states × 8 interventions)
- React performance optimisation for 10fps UI updates (Zustand + AnimatePresence)
- Structured prompt engineering for educational question generation + semantic evaluation

### What I'd do differently next time

- Add confidence intervals to all processor signals (current design uses deterministic thresholds)
- Build a synthetic learner simulator for automated testing of the cognitive loop
- Add a learner feedback mechanism ("Was that helpful?") to improve intervention quality
- Implement multi-learner group session support with per-person attention tracking

---

## 🤝 Contributing

Pull requests are welcome! Open an issue first for major changes.

**Areas needing help:**
- Better emotion detection models (current EAR-based system misses subtle confusion)
- Multi-language learner speech support
- Mobile-responsive session layout
- More sophisticated mastery models (IRT / knowledge tracing)

---

## 📄 License

[Apache 2.0](LICENSE)

---

<div align="center">

---

### 👨‍💻 Built by

<br/>

<img src="https://avatars.githubusercontent.com/algsoch" width="90" style="border-radius:50%" />

<br/>

**Vicky Kumar**

<a href="https://github.com/algsoch">
  <img src="https://img.shields.io/badge/GitHub-algsoch-181717?style=for-the-badge&logo=github&logoColor=white"/>
</a>
&nbsp;
<a href="mailto:kandpdimagine@gmail.com">
  <img src="https://img.shields.io/badge/Email-kandpdimagine%40gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white"/>
</a>

<br/><br/>

<img src="https://img.shields.io/badge/Made_with-Vision_Agents_SDK-8b5cf6?style=for-the-badge&logo=google&logoColor=white"/>
&nbsp;
<img src="https://img.shields.io/badge/Powered_by-Gemini_Realtime-4285F4?style=for-the-badge&logo=google&logoColor=white"/>
&nbsp;
<img src="https://img.shields.io/badge/License-Apache_2.0-22c55e?style=for-the-badge"/>

<br/><br/>

*Because everyone deserves a tutor who never gets tired.*

<br/>

[⭐ Star](https://github.com/algsoch/Cognivise) &nbsp;·&nbsp;
[🐛 Bug report](https://github.com/algsoch/Cognivise/issues/new?labels=bug) &nbsp;·&nbsp;
[💡 Feature request](https://github.com/algsoch/Cognivise/issues/new?labels=enhancement) &nbsp;·&nbsp;
[📬 Contact](mailto:kandpdimagine@gmail.com)

<br/>

<sub>© 2026 <a href="https://github.com/algsoch">algsoch</a> · Apache 2.0 License</sub>

</div>
