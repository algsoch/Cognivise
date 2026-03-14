/**
 * useSessionStore — global Zustand store for live session state.
 * Holds real-time metrics fed from WebSocket / Stream events.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const initialMetrics = {
  engagementScore: 50,
  attentionScore: 50,
  cognitiveLoadScore: 50,
  performanceScore: 50,
  learnerState: 'neutral',
  faceDetected: false,
  gazeOnScreen: true,
  blinkRate: 15,
  restlessness: 0,
  headPoseConfidence: 1,
  focusDuration: 0,
  distractionCount: 0,
  // Eye tracking
  headYaw: 0,
  headPitch: 0,
  eyeAR: 0.3,            // Eye Aspect Ratio (0 = closed, ~0.3 = open)
  fixationDuration: 0,   // seconds eyes have been fixated on screen
  eyeClosureDuration: 0, // seconds this blink lasted
  backgroundMovement: 0, // restlessness 0–1
  peopleCount: 0,        // number of faces detected in frame
  gazeDirection: 'center', // center | left | right | up | down | away
  frameHash: '',         // short hash of last analyzed frame (backend)
  mouthOpenRatio: 0,     // normalized jaw openness from face blendshapes
  mouthMovement: 0,      // short-term mouth movement intensity
  speakingDetected: false, // inferred speaking state from lip activity
  tongueScore: 0,        // heuristic tongue visibility confidence
  tongueVisible: false,  // coarse boolean signal from blendshape
  mpLandmarksOn: false,  // real MediaPipe landmarks currently detected
  noddingLikely: false,  // stricter nodding event signal from pitch dynamics
  // Latency tracking (milliseconds)
  userResponseMs: 0,     // how fast learner responded to last question
  aiResponseMs: 0,       // how fast AI answered learner's input
  // Webcam analysis FPS
  frameFps: 0,           // frames per second successfully analyzed
  // Video playback progress
  videoCurrentTime: 0,   // seconds elapsed in current video
  videoDuration: 0,      // total video duration in seconds
}

export const useSessionStore = create(
  persist(
    (set, get) => ({
  // Auth / identity — default to 'learner' so stream audio can connect immediately
  _lastConvEntry: null,   // dedup: { role, text, ts } — prevent StrictMode double-add
  userId: 'learner',
  userName: null,
  userEmail: null,
  setUser: (id, name, email = null) => set({ userId: id, userName: name, userEmail: email }),

  // Session
  sessionId: null,
  callId: null,
  topic: '',
  isInSession: false,
  sessionStartedAt: null,

  // Content source: { type: 'youtube'|'upload'|'screenshare', url: string, label: string }
  contentSource: null,
  setContentSource: (src) => set({ contentSource: src }),

  // Live screen-share MediaStream (set by SessionPage once getDisplayMedia succeeds)
  // useStreamAudio reads this to publish the track to the Stream call
  screenStream: null,
  setScreenStream: (stream) => set({ screenStream: stream }),

  startSession: (sessionId, callId, topic) =>
    set({
      sessionId, callId, topic, isInSession: true, sessionStartedAt: Date.now(),
      // Reset per-session data so dashboard always shows current session
      interventions: [],
      mastery: {},
      conversationLog: [],
      metricsHistory: [],
      agentSpeech: '',
      agentAction: null,
      learnerSpeech: '',
      signalFreshness: {
        frameAt: 0,
        learnerSpeechAt: 0,
        agentSpeechAt: 0,
        faceSignalAt: 0,
      },
    }),

  endSession: () => set({ isInSession: false }),

  // Update topic mid-session (e.g. from backend screen auto-detection)
  setTopic: (t) => set({ topic: t }),

  // Live metrics (updated by RealtimeMetricsProvider)
  metrics: { ...initialMetrics },
  signalFreshness: {
    frameAt: 0,
    learnerSpeechAt: 0,
    agentSpeechAt: 0,
    faceSignalAt: 0,
  },
  metricsHistory: [],   // [{timestamp, ...metrics}] — last 120 ticks

  updateMetrics: (patch) =>
    set((state) => {
      const updated = { ...state.metrics, ...patch }
      const history = [
        ...state.metricsHistory.slice(-119),
        { timestamp: Date.now(), ...updated },
      ]
      return { metrics: updated, metricsHistory: history }
    }),

  setSignalFreshness: (field, ts = Date.now()) =>
    set((state) => ({
      signalFreshness: {
        ...state.signalFreshness,
        [field]: ts,
      },
    })),

  // Interventions log
  interventions: [],
  addIntervention: (intervention) =>
    set((state) => ({
      interventions: [
        { ...intervention, timestamp: Date.now() },
        ...state.interventions.slice(0, 49),
      ],
    })),

  // Mastery
  mastery: {},   // { topic: score }
  updateMastery: (topic, score) =>
    set((state) => ({ mastery: { ...state.mastery, [topic]: score } })),

  // Conversation log: alternating AI questions / learner answers
  conversationLog: [],   // [{role:'ai'|'user', text:string, timestamp:number, action?:string}]
  addConversationEntry: (role, text, action = null) =>
    set((state) => {
      // Deduplicate: React StrictMode double-mounts can cause two WS connections
      // that each receive the same broadcast. Skip if same role+text within 3s.
      const last = state._lastConvEntry
      const now = Date.now()
      if (last && last.role === role && last.text === text && now - last.ts < 3000) {
        return {} // duplicate within 3s — skip
      }
      return {
        _lastConvEntry: { role, text, ts: now },
        conversationLog: [
          ...state.conversationLog.slice(-39),
          { role, text, action, timestamp: now },
        ],
      }
    }),

  // Agent connection state
  agentStatus: 'disconnected',   // disconnected | connecting | connected
  setAgentStatus: (s) => set({ agentStatus: s }),

  // Agent speech — text the AI just said (broadcast via WebSocket for SpeechSynthesis)
  agentSpeech: '',                // last spoken text
  agentTranscript: '',            // Gemini's actual transcription of what it said
  agentAction: null,              // { type, topic, timestamp } — last intervention type fired
  setAgentSpeech: (text) => set({ agentSpeech: text }),
  setAgentTranscript: (text) => set({ agentTranscript: text }),
  setAgentAction: (action) => set({ agentAction: action }),

  // Learner's last spoken utterance (broadcast from backend _on_speech → learner_speech WS msg)
  learnerSpeech: '',
  setLearnerSpeech: (text) => set({ learnerSpeech: text }),

  // Stream WebRTC call ID received from backend broadcaster
  // (the actual call the agent is in — frontend must join this to hear audio)
  streamCallId:   null,
  streamCallType: 'default',
  setStreamCall: (id, type = 'default') => set({ streamCallId: id, streamCallType: type }),

  // Typed message sender — set by useBackendConnection when WS is open, null when disconnected
  sendMessage: null,
  setSendMessage: (fn) => set({ sendMessage: fn }),

  // Raw JSON sender — for structured payloads (e.g. face_metrics from browser MediaPipe)
  sendRaw: null,
  setSendRaw: (fn) => set({ sendRaw: fn }),

  // Derived helpers
  get overallHealth() {
    const { engagementScore, attentionScore, cognitiveLoadScore } = get().metrics
    return Math.round((engagementScore + attentionScore + (100 - cognitiveLoadScore)) / 3)
  },
}),
{
  name: 'cognivise-session',
  storage: createJSONStorage(() => sessionStorage),
  // Only persist the fields needed to survive a page refresh.
  // MediaStreams, live metrics, and history are intentionally excluded.
  partialize: (state) => ({
    isInSession: state.isInSession,
    userId: state.userId,
    userName: state.userName,
    userEmail: state.userEmail,
    callId: state.callId,
    sessionId: state.sessionId,
    streamCallId: state.streamCallId,
    streamCallType: state.streamCallType,
    topic: state.topic,
    contentSource: state.contentSource,
  }),
}
)
)
