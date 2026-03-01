/**
 * useSessionStore — global Zustand store for live session state.
 * Holds real-time metrics fed from WebSocket / Stream events.
 */

import { create } from 'zustand'

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
}

export const useSessionStore = create((set, get) => ({
  // Auth / identity — default to 'learner' so stream audio can connect immediately
  userId: 'learner',
  userName: null,
  setUser: (id, name) => set({ userId: id, userName: name }),

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
    }),

  endSession: () => set({ isInSession: false }),

  // Update topic mid-session (e.g. from backend screen auto-detection)
  setTopic: (t) => set({ topic: t }),

  // Live metrics (updated by RealtimeMetricsProvider)
  metrics: { ...initialMetrics },
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
    set((state) => ({
      conversationLog: [
        ...state.conversationLog.slice(-39),
        { role, text, action, timestamp: Date.now() },
      ],
    })),

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

  // Derived helpers
  get overallHealth() {
    const { engagementScore, attentionScore, cognitiveLoadScore } = get().metrics
    return Math.round((engagementScore + attentionScore + (100 - cognitiveLoadScore)) / 3)
  },
}))
