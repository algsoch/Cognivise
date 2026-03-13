/**
 * useHistoryStore — persisted (localStorage) session history.
 * Each entry is a snapshot saved when the learner ends a session.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const useHistoryStore = create(
  persist(
    (set, get) => ({
      sessions: [], // newest first

      /**
       * Save a completed session snapshot.
       * Called from SessionPage handleEnd() before navigating away.
       */
      addSession: (entry) =>
        set((state) => ({
          sessions: [entry, ...state.sessions].slice(0, 100),
        })),

      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
        })),

      clearHistory: () => set({ sessions: [] }),
    }),
    {
      name: 'cognivise-history',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
