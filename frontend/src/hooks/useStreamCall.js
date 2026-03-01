/**
 * useStreamCall — wraps @stream-io/video-react-sdk for WebRTC call management.
 */

import { useEffect, useRef, useState } from 'react'
import { useSessionStore } from './useSessionStore'

export function useStreamCall({ apiKey }) {
  const [client, setClient] = useState(null)
  const [call, setCall] = useState(null)
  const { userId, userName, callId, setAgentStatus } = useSessionStore()
  const clientRef = useRef(null)

  useEffect(() => {
    if (!userId || !apiKey) return

    let mounted = true

    const init = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const { StreamVideoClient } = await import('@stream-io/video-react-sdk')

        const tokenResponse = await fetch(`/api/token?user_id=${userId}`)
        const { token } = await tokenResponse.json()

        const c = new StreamVideoClient({
          apiKey,
          user: { id: userId, name: userName || userId },
          token,
        })

        if (mounted) {
          clientRef.current = c
          setClient(c)
        }
      } catch (err) {
        console.error('StreamVideoClient init failed:', err)
      }
    }

    init()

    return () => {
      mounted = false
      clientRef.current?.disconnectUser().catch(() => {})
    }
  }, [userId, apiKey])

  const joinCall = async (type = 'default', id) => {
    if (!client) return null
    try {
      setAgentStatus('connecting')
      const c = client.call(type, id || callId)
      await c.join({ create: true })
      setCall(c)
      setAgentStatus('connected')
      return c
    } catch (err) {
      console.error('Join call failed:', err)
      setAgentStatus('disconnected')
      return null
    }
  }

  const leaveCall = async () => {
    if (!call) return
    await call.leave()
    setCall(null)
    setAgentStatus('disconnected')
  }

  return { client, call, joinCall, leaveCall }
}
