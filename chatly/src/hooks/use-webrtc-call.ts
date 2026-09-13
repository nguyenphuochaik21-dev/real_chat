'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WebRTCService, type CallType, isWebRTCSupported } from '@/lib/webrtc'
import { useCallStore } from '@/stores/call-store'
import { queueCallPushNotification } from '@/lib/push'

const CALL_RING_TIMEOUT_MS = 45_000

export interface UseWebRTCCallOptions {
  userId: string
  onCallStarted?: () => void
  onCallEnded?: (duration: number) => void
  onError?: (error: Error) => void
}

export function useWebRTCCall(options: UseWebRTCCallOptions) {
  const { userId, onCallStarted, onCallEnded, onError } = options
  const [supabase] = useState(() => createClient())

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)

  const webrtcRef = useRef<WebRTCService | null>(null)
  const initiatingRef = useRef(false)
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref so the useEffect closure can call startWebRTC without circular deps
  const startWebRTCRef = useRef<((isInitiator: boolean) => Promise<boolean>) | null>(null)
  const onCallStartedRef = useRef(onCallStarted)
  const onCallEndedRef = useRef(onCallEnded)
  const onErrorRef = useRef(onError)

  // Keep callbacks in refs to avoid stale closures
  useEffect(() => {
    onCallStartedRef.current = onCallStarted
  }, [onCallStarted])
  useEffect(() => {
    onCallEndedRef.current = onCallEnded
  }, [onCallEnded])
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ringTimerRef.current) clearTimeout(ringTimerRef.current)
      webrtcRef.current?.cleanup()
      webrtcRef.current = null
    }
  }, [])

  /**
   * Start WebRTC peer connection.
   * isInitiator=true → we create offer (caller after callee answers).
   * isInitiator=false → we wait for offer (callee after accepting).
   */
  const startWebRTC = useCallback(
    async (isInitiator: boolean) => {
      const s = useCallStore.getState()
      if (!s.remoteUser || !s.sessionId || !s.type) return false

      try {
        if (!isWebRTCSupported()) throw new Error('WebRTC is not supported in this browser')

        webrtcRef.current?.cleanup()

        const webrtc = new WebRTCService(
          userId,
          s.remoteUser.id,
          s.sessionId,
          s.type,
          isInitiator,
          {
            onRemoteStream: (stream) => setRemoteStream(stream),
            onConnectionStateChange: (state) => {
              if (useCallStore.getState().sessionId !== s.sessionId) return
              if (state === 'connected') {
                useCallStore.getState().setConnected()
                onCallStartedRef.current?.()
              } else if (state === 'failed' || state === 'closed') {
                const cur = useCallStore.getState()
                if (cur.status === 'connected' || cur.status === 'connecting') {
                  useCallStore.getState().endCall()
                  void supabase.rpc('end_call', {
                    p_session_id: s.sessionId!,
                    p_status: state === 'failed' ? 'failed' : 'ended',
                  })
                  webrtcRef.current?.cleanup()
                  webrtcRef.current = null
                  setRemoteStream(null)
                  setLocalStream(null)
                }
              }
            },
            onError: (error) => {
              if (useCallStore.getState().sessionId !== s.sessionId) return
              webrtcRef.current?.cleanup()
              webrtcRef.current = null
              setRemoteStream(null)
              setLocalStream(null)
              void supabase.rpc('end_call', { p_session_id: s.sessionId!, p_status: 'failed' })
              console.error('[WebRTC error]', error)
              onErrorRef.current?.(error)
            },
          }
        )

        webrtcRef.current = webrtc
        await webrtc.initialize()
        if (
          useCallStore.getState().sessionId !== s.sessionId ||
          !['connecting', 'connected'].includes(useCallStore.getState().status)
        ) {
          webrtc.cleanup()
          return false
        }
        const ls = webrtc.getLocalStream()
        if (ls) setLocalStream(ls)
        return true
      } catch (error) {
        void supabase.rpc('end_call', { p_session_id: s.sessionId, p_status: 'failed' })
        if (
          useCallStore.getState().sessionId !== s.sessionId ||
          !['connecting', 'connected'].includes(useCallStore.getState().status)
        )
          return false
        console.error('[startWebRTC failed]', error)
        onErrorRef.current?.(error instanceof Error ? error : new Error('Failed to start WebRTC'))
        webrtcRef.current?.cleanup()
        webrtcRef.current = null
        useCallStore
          .getState()
          .setError(error instanceof Error ? error.message : 'Failed to start call')
        return false
      }
    },
    [userId, supabase]
  )

  // Keep ref updated
  useEffect(() => {
    startWebRTCRef.current = startWebRTC
  }, [startWebRTC])

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useCallStore.subscribe((state, previous) => {
      if (state.status === previous.status && state.sessionId === previous.sessionId) return
      clearTimeout(timeout)
      if (state.status !== 'connecting' || !state.sessionId) return
      const sessionId = state.sessionId
      timeout = setTimeout(() => {
        const active = useCallStore.getState()
        if (active.sessionId !== sessionId || active.status !== 'connecting') return
        active.setError('Không kết nối được cuộc gọi. Vui lòng thử lại.')
        webrtcRef.current?.cleanup()
        webrtcRef.current = null
        setLocalStream(null)
        setRemoteStream(null)
        void supabase.rpc('end_call', { p_session_id: sessionId, p_status: 'failed' })
      }, 30_000)
    })
    return () => {
      clearTimeout(timeout)
      unsubscribe()
    }
  }, [supabase])

  // Subscribe to call sessions (incoming calls + status changes)
  useEffect(() => {
    if (!userId) return

    interface IncomingSession {
      id: string
      caller_id: string
      call_type: CallType
      conversation_id: string
      created_at: string
    }

    let disposed = false

    const receiveIncomingCall = async (session: IncomingSession) => {
      const createdAt = Date.parse(session.created_at)
      const remainingRingTime = CALL_RING_TIMEOUT_MS - (Date.now() - createdAt)
      if (!Number.isFinite(createdAt) || remainingRingTime <= 0) return

      const current = useCallStore.getState()
      if (current.sessionId === session.id) return
      if (['calling', 'ringing', 'connecting', 'connected'].includes(current.status)) return

      const { data: caller } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', session.caller_id)
        .single()

      const { data: confirmed } = await supabase
        .from('call_sessions')
        .select('status')
        .eq('id', session.id)
        .maybeSingle()
      const latest = useCallStore.getState()
      if (
        disposed ||
        !confirmed ||
        !['pending', 'ringing'].includes(confirmed.status ?? '') ||
        ['calling', 'ringing', 'connecting', 'connected'].includes(latest.status) ||
        Date.now() >= createdAt + CALL_RING_TIMEOUT_MS
      )
        return

      useCallStore.getState().receiveCall(
        session.id,
        session.conversation_id,
        {
          id: caller?.id || session.caller_id,
          displayName: caller?.display_name || 'Chatly user',
          avatarUrl: caller?.avatar_url || undefined,
        },
        session.call_type
      )

      if (ringTimerRef.current) clearTimeout(ringTimerRef.current)
      ringTimerRef.current = setTimeout(
        () => {
          const latest = useCallStore.getState()
          if (latest.sessionId !== session.id || latest.status !== 'ringing') return

          void supabase
            .rpc('end_call', { p_session_id: session.id, p_status: 'missed' })
            .abortSignal(AbortSignal.timeout(3000))
            .then(({ data }) => {
              const active = useCallStore.getState()
              const answered =
                data && typeof data === 'object' && 'status' in data && data.status === 'answered'
              if (!answered && active.sessionId === session.id && active.status === 'ringing') {
                active.markMissed()
              }
            })
        },
        Math.max(0, createdAt + CALL_RING_TIMEOUT_MS - Date.now())
      )
    }

    const recoverIncomingCall = async (sessionId?: string) => {
      await supabase.rpc('expire_stale_calls_for_current_user')
      if (disposed) return
      const current = useCallStore.getState()
      if (
        current.sessionId &&
        ['calling', 'ringing', 'connecting', 'connected'].includes(current.status)
      ) {
        const { data: active } = await supabase
          .from('call_sessions')
          .select('status, caller_id')
          .eq('id', current.sessionId)
          .maybeSingle()
        if (disposed || useCallStore.getState().sessionId !== current.sessionId) return
        if (active && ['declined', 'missed', 'ended', 'failed'].includes(active.status ?? '')) {
          useCallStore.getState().endCall()
          webrtcRef.current?.cleanup()
          webrtcRef.current = null
          setRemoteStream(null)
          setLocalStream(null)
        } else if (
          active?.status === 'answered' &&
          useCallStore.getState().status === 'calling' &&
          active.caller_id === userId
        ) {
          useCallStore.getState().setConnecting()
          await startWebRTCRef.current?.(true)
        } else if (active?.status === 'answered' && useCallStore.getState().status === 'ringing') {
          useCallStore.getState().endCall()
        }
      }
      const cutoff = new Date(Date.now() - CALL_RING_TIMEOUT_MS).toISOString()
      const baseQuery = supabase
        .from('call_sessions')
        .select('id, caller_id, call_type, conversation_id, created_at')
        .eq('callee_id', userId)
        .in('status', ['pending', 'ringing'])
        .gte('created_at', cutoff)

      const { data } = sessionId
        ? await baseQuery.eq('id', sessionId).maybeSingle()
        : await baseQuery.order('created_at', { ascending: false }).limit(1).maybeSingle()

      if (data?.call_type && data.conversation_id && data.created_at) {
        await receiveIncomingCall(data as IncomingSession)
      }
    }

    const handleIncomingCallPush = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string }>).detail
      void recoverIncomingCall(detail?.sessionId)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void recoverIncomingCall()
    }
    const handleResume = () => void recoverIncomingCall()

    window.addEventListener('chatly:incoming-call', handleIncomingCallPush)
    window.addEventListener('focus', handleResume)
    window.addEventListener('online', handleResume)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const reconcileTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void recoverIncomingCall()
    }, 15_000)

    const channel = supabase
      .channel(`call-sessions:${userId}:${crypto.randomUUID()}`)
      // New incoming call (we are the callee)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_sessions',
          filter: `callee_id=eq.${userId}`,
        },
        async (payload) => {
          await receiveIncomingCall(payload.new as IncomingSession)
        }
      )
      // Updates as callee (caller ends the call while we're ringing/connected)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `callee_id=eq.${userId}`,
        },
        (payload) => {
          const session = payload.new as { id: string; status: string }
          const current = useCallStore.getState()
          if (current.sessionId !== session.id) return

          if (session.status === 'answered' && current.status === 'ringing') current.endCall()

          const terminal = ['declined', 'missed', 'ended', 'failed']
          if (terminal.includes(session.status)) {
            webrtcRef.current?.cleanup()
            webrtcRef.current = null
            setRemoteStream(null)
            setLocalStream(null)
            useCallStore.getState().endCall()
          }
        }
      )
      // Updates as caller (callee accepts/declines/ends)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `caller_id=eq.${userId}`,
        },
        async (payload) => {
          const session = payload.new as { id: string; status: string }
          const current = useCallStore.getState()
          if (current.sessionId !== session.id) return

          if (current.status === 'calling' && session.status === 'answered') {
            useCallStore.getState().setConnecting()
            const started = await startWebRTCRef.current?.(true)
            if (!started) {
              await supabase.rpc('update_call_status', {
                p_session_id: session.id,
                p_status: 'failed',
              })
            }
          }

          const terminal = ['declined', 'missed', 'ended', 'failed']
          if (
            (current.status === 'calling' ||
              current.status === 'connected' ||
              current.status === 'connecting') &&
            terminal.includes(session.status)
          ) {
            webrtcRef.current?.cleanup()
            webrtcRef.current = null
            setRemoteStream(null)
            setLocalStream(null)
            useCallStore.getState().endCall()
          }
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        void recoverIncomingCall()
      })

    return () => {
      disposed = true
      window.clearInterval(reconcileTimer)
      window.removeEventListener('chatly:incoming-call', handleIncomingCallPush)
      window.removeEventListener('focus', handleResume)
      window.removeEventListener('online', handleResume)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  // Callee accepts the incoming call
  const acceptCall = useCallback(async () => {
    const s = useCallStore.getState()
    if (s.status !== 'ringing' || !s.sessionId) return

    useCallStore.getState().acceptCall()
    const started = await startWebRTC(false)
    if (!started) return

    const { data, error } = await supabase.rpc('update_call_status', {
      p_session_id: s.sessionId,
      p_status: 'answered',
    })
    if (useCallStore.getState().sessionId !== s.sessionId) return
    const answered =
      data && typeof data === 'object' && 'status' in data && data.status === 'answered'
    if (error || !answered) {
      webrtcRef.current?.cleanup()
      webrtcRef.current = null
      setLocalStream(null)
      useCallStore
        .getState()
        .setError(error ? 'Không thể nhận cuộc gọi. Vui lòng thử lại.' : 'Cuộc gọi đã kết thúc.')
    }
  }, [supabase, startWebRTC])

  // Caller initiates an outgoing call
  const initiateCall = useCallback(
    async (
      conversationId: string,
      remoteUser: { id: string; displayName: string; avatarUrl?: string },
      type: CallType
    ) => {
      if (
        initiatingRef.current ||
        ['calling', 'ringing', 'connecting', 'connected'].includes(useCallStore.getState().status)
      )
        return
      initiatingRef.current = true
      try {
        if (!isWebRTCSupported()) throw new Error('WebRTC is not supported in this browser')

        const { data: session, error } = await supabase.rpc('initiate_call', {
          p_callee_id: remoteUser.id,
          p_conversation_id: conversationId,
          p_call_type: type,
        })

        if (error) throw error
        const sessionId =
          typeof session === 'string'
            ? session
            : session && typeof session === 'object' && 'id' in session
              ? String(session.id)
              : null
        if (!sessionId) throw new Error('No session id returned')

        useCallStore.getState().initiateCall(conversationId, sessionId, remoteUser, type)
        queueCallPushNotification(sessionId)
        if (ringTimerRef.current) clearTimeout(ringTimerRef.current)
        const createdAt =
          session && typeof session === 'object' && 'created_at' in session
            ? Date.parse(String(session.created_at))
            : Date.now()
        ringTimerRef.current = setTimeout(
          () => {
            const current = useCallStore.getState()
            if (current.sessionId !== sessionId || current.status !== 'calling') return

            void supabase
              .rpc('end_call', { p_session_id: sessionId, p_status: 'missed' })
              .abortSignal(AbortSignal.timeout(3000))
              .then(({ data }) => {
                const active = useCallStore.getState()
                const answered =
                  data && typeof data === 'object' && 'status' in data && data.status === 'answered'
                if (answered && active.sessionId === sessionId && active.status === 'calling') {
                  active.setConnecting()
                  void startWebRTCRef.current?.(true)
                } else if (active.sessionId === sessionId && active.status === 'calling') {
                  active.markMissed()
                }
              })
          },
          Math.max(0, CALL_RING_TIMEOUT_MS - (Date.now() - createdAt))
        )
      } catch (error) {
        console.error('[initiateCall]', error)
        onErrorRef.current?.(error instanceof Error ? error : new Error('Failed to initiate call'))
        useCallStore
          .getState()
          .setError(error instanceof Error ? error.message : 'Failed to initiate call')
      } finally {
        initiatingRef.current = false
      }
    },
    [supabase]
  )

  // Decline an incoming call
  const declineCall = useCallback(async () => {
    const s = useCallStore.getState()
    if (s.status !== 'ringing') return
    useCallStore.getState().declineCall()
    if (s.sessionId) {
      try {
        const { error } = await supabase.rpc('update_call_status', {
          p_session_id: s.sessionId,
          p_status: 'declined',
        })
        if (error) throw error
      } catch (err) {
        console.error('[declineCall] DB update failed', err)
      }
    }
  }, [supabase])

  // End an active call
  const endCall = useCallback(async () => {
    const s = useCallStore.getState()

    useCallStore.getState().endCall()
    void webrtcRef.current?.sendEndCall()
    webrtcRef.current?.cleanup()
    webrtcRef.current = null
    setRemoteStream(null)
    setLocalStream(null)

    if (s.sessionId) {
      try {
        const { error } = await supabase.rpc('end_call', {
          p_session_id: s.sessionId,
          p_status: 'ended',
        })
        if (error) throw error
      } catch (err) {
        console.error('[endCall] DB update failed', err)
      }
    }

    onCallEndedRef.current?.(s.duration)
  }, [supabase])

  const toggleMute = useCallback((muted: boolean) => {
    webrtcRef.current?.toggleMicrophone(!muted)
    if (useCallStore.getState().isMuted !== muted) useCallStore.getState().toggleMute()
  }, [])

  const toggleVideo = useCallback((videoOff: boolean) => {
    webrtcRef.current?.toggleCamera(!videoOff)
    if (useCallStore.getState().isVideoOff !== videoOff) useCallStore.getState().toggleVideo()
  }, [])

  const toggleSpeaker = useCallback((enabled: boolean) => {
    if (useCallStore.getState().isSpeakerOn !== enabled) {
      useCallStore.getState().toggleSpeaker()
    }
  }, [])

  const switchCamera = useCallback(async () => {
    await webrtcRef.current?.switchCamera()
  }, [])

  const getLocalStream = useCallback(() => webrtcRef.current?.getLocalStream() ?? null, [])

  return {
    remoteStream,
    localStream,
    initiateCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    switchCamera,
    getLocalStream,
  }
}
