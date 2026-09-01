'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WebRTCService, type CallType, isWebRTCSupported } from '@/lib/webrtc'
import { useCallStore } from '@/stores/call-store'

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
              if (state === 'connected') {
                useCallStore.getState().setConnected()
                onCallStartedRef.current?.()
              } else if (state === 'failed' || state === 'closed') {
                const cur = useCallStore.getState()
                if (cur.status === 'connected' || cur.status === 'connecting') {
                  webrtcRef.current?.cleanup()
                  webrtcRef.current = null
                  setRemoteStream(null)
                  setLocalStream(null)
                  useCallStore.getState().endCall()
                }
              }
            },
            onError: (error) => {
              console.error('[WebRTC error]', error)
              onErrorRef.current?.(error)
            },
          }
        )

        webrtcRef.current = webrtc
        await webrtc.initialize()
        const ls = webrtc.getLocalStream()
        if (ls) setLocalStream(ls)
        return true
      } catch (error) {
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
    [userId]
  )

  // Keep ref updated
  useEffect(() => {
    startWebRTCRef.current = startWebRTC
  }, [startWebRTC])

  // Subscribe to call sessions (incoming calls + status changes)
  useEffect(() => {
    if (!userId) return

    interface IncomingSession {
      id: string
      caller_id: string
      call_type: CallType
      conversation_id: string
    }

    const receiveIncomingCall = async (session: IncomingSession) => {
      const current = useCallStore.getState()
      if (current.sessionId === session.id) return
      if (['calling', 'ringing', 'connecting', 'connected'].includes(current.status)) return

      const { data: caller } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', session.caller_id)
        .single()

      if (caller) {
        useCallStore.getState().receiveCall(
          session.id,
          session.conversation_id,
          {
            id: caller.id,
            displayName: caller.display_name,
            avatarUrl: caller.avatar_url || undefined,
          },
          session.call_type
        )
      }
    }

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
        void supabase
          .from('call_sessions')
          .select('id, caller_id, call_type, conversation_id')
          .eq('callee_id', userId)
          .in('status', ['pending', 'ringing'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.call_type && data.conversation_id) {
              void receiveIncomingCall(data as IncomingSession)
            }
          })
      })

    return () => {
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

    const { error } = await supabase.rpc('update_call_status', {
      p_session_id: s.sessionId,
      p_status: 'answered',
    })
    if (error) {
      webrtcRef.current?.cleanup()
      webrtcRef.current = null
      setLocalStream(null)
      useCallStore.getState().setError(error.message)
    }
  }, [supabase, startWebRTC])

  // Caller initiates an outgoing call
  const initiateCall = useCallback(
    async (
      conversationId: string,
      remoteUser: { id: string; displayName: string; avatarUrl?: string },
      type: CallType
    ) => {
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
      } catch (error) {
        console.error('[initiateCall]', error)
        onErrorRef.current?.(error instanceof Error ? error : new Error('Failed to initiate call'))
        useCallStore
          .getState()
          .setError(error instanceof Error ? error.message : 'Failed to initiate call')
      }
    },
    [supabase]
  )

  // Decline an incoming call
  const declineCall = useCallback(async () => {
    const s = useCallStore.getState()
    if (s.sessionId) {
      try {
        await supabase.rpc('update_call_status', {
          p_session_id: s.sessionId,
          p_status: 'declined',
        })
      } catch (err) {
        console.error('[declineCall] DB update failed', err)
      }
    }
    useCallStore.getState().declineCall()
  }, [supabase])

  // End an active call
  const endCall = useCallback(async () => {
    const s = useCallStore.getState()

    if (s.sessionId) {
      try {
        await supabase.rpc('end_call', {
          p_session_id: s.sessionId,
          p_status: 'ended',
        })
      } catch (err) {
        console.error('[endCall] DB update failed', err)
      }
    }

    await webrtcRef.current?.sendEndCall()
    webrtcRef.current?.cleanup()
    webrtcRef.current = null
    setRemoteStream(null)
    setLocalStream(null)

    onCallEndedRef.current?.(s.duration)
    useCallStore.getState().endCall()
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
