'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  WebRTCService,
  type CallType,
  isWebRTCSupported,
  requestMediaPermissions,
} from '@/lib/webrtc'
import { useCallStore } from '@/stores/call-store'

export interface UseWebRTCCallOptions {
  userId: string
  onCallStarted?: () => void
  onCallEnded?: (duration: number) => void
  onError?: (error: Error) => void
}

export function useWebRTCCall(options: UseWebRTCCallOptions) {
  const { userId, onCallStarted, onCallEnded, onError } = options
  const supabase = createClient()

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [hasPermissions, setHasPermissions] = useState<boolean | null>(null)

  const webrtcRef = useRef<WebRTCService | null>(null)
  // Ref so the useEffect closure can call startWebRTC without circular deps
  const startWebRTCRef = useRef<((isInitiator: boolean) => Promise<void>) | null>(null)
  const onCallStartedRef = useRef(onCallStarted)
  const onCallEndedRef = useRef(onCallEnded)
  const onErrorRef = useRef(onError)

  const store = useCallStore()

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

  // Initial permission check
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!isWebRTCSupported()) {
        setHasPermissions(false)
        return
      }
      requestMediaPermissions('video')
        .then((p) => setHasPermissions(p.audio))
        .catch(() => setHasPermissions(false))
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  /**
   * Start WebRTC peer connection.
   * isInitiator=true → we create offer (caller after callee answers).
   * isInitiator=false → we wait for offer (callee after accepting).
   */
  const startWebRTC = useCallback(
    async (isInitiator: boolean) => {
      const s = useCallStore.getState()
      if (!s.remoteUser || !s.sessionId || !s.type) return

      try {
        const perms = await requestMediaPermissions(s.type)
        if (!perms.audio) throw new Error('Microphone permission denied')

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
              } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                const cur = useCallStore.getState()
                if (cur.status === 'connected' || cur.status === 'connecting') {
                  webrtcRef.current?.cleanup()
                  webrtcRef.current = null
                  setRemoteStream(null)
                  setLocalStream(null)
                  store.endCall()
                }
              }
            },
            onError: (error) => {
              console.error('[WebRTC error]', error)
              onErrorRef.current?.(error)
            },
          }
        )

        await webrtc.initialize()
        const ls = webrtc.getLocalStream()
        if (ls) setLocalStream(ls)
        webrtcRef.current = webrtc
      } catch (error) {
        console.error('[startWebRTC failed]', error)
        onErrorRef.current?.(error instanceof Error ? error : new Error('Failed to start WebRTC'))
        webrtcRef.current?.cleanup()
        webrtcRef.current = null
        store.setError(error instanceof Error ? error.message : 'Failed to start call')
      }
    },
    [userId, store]
  )

  // Keep ref updated
  useEffect(() => {
    startWebRTCRef.current = startWebRTC
  }, [startWebRTC])

  // Subscribe to call sessions (incoming calls + status changes)
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`call-sessions-${userId}`)
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
          const session = payload.new as {
            id: string
            caller_id: string
            call_type: CallType
            conversation_id: string
          }

          const current = useCallStore.getState()
          if (current.sessionId === session.id) return

          const { data: caller } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .eq('id', session.caller_id)
            .single()

          if (caller) {
            store.receiveCall(
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
            store.endCall()
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
            store.setConnecting()
            await startWebRTCRef.current?.(true)
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
            store.endCall()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase, store])

  // Callee accepts the incoming call
  const acceptCall = useCallback(async () => {
    const s = useCallStore.getState()
    if (s.status !== 'ringing' || !s.sessionId) return

    try {
      await supabase.rpc('update_call_status', {
        p_session_id: s.sessionId,
        p_status: 'answered',
      })
    } catch (err) {
      console.error('[acceptCall] DB update failed', err)
    }

    store.acceptCall()
    await startWebRTC(false)
  }, [supabase, store, startWebRTC])

  // Caller initiates an outgoing call
  const initiateCall = useCallback(
    async (
      conversationId: string,
      remoteUser: { id: string; displayName: string; avatarUrl?: string },
      type: CallType
    ) => {
      try {
        if (hasPermissions === false) {
          throw new Error('Microphone permission denied')
        }

        const perms = await requestMediaPermissions(type)
        if (!perms.audio) {
          throw new Error('Microphone permission denied')
        }

        const { data: sessionId, error } = await supabase.rpc('initiate_call', {
          p_callee_id: remoteUser.id,
          p_conversation_id: conversationId,
          p_call_type: type,
        })

        if (error) throw error
        if (!sessionId) throw new Error('No session id returned')

        store.initiateCall(conversationId, sessionId, remoteUser, type)
      } catch (error) {
        console.error('[initiateCall]', error)
        onErrorRef.current?.(error instanceof Error ? error : new Error('Failed to initiate call'))
        store.setError(error instanceof Error ? error.message : 'Failed to initiate call')
      }
    },
    [hasPermissions, supabase, store]
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
    store.declineCall()
  }, [supabase, store])

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
    store.endCall()
  }, [supabase, store])

  const toggleMute = useCallback(
    (enabled: boolean) => {
      webrtcRef.current?.toggleMicrophone(enabled)
      store.toggleMute()
    },
    [store]
  )

  const toggleVideo = useCallback(
    (enabled: boolean) => {
      webrtcRef.current?.toggleCamera(enabled)
      store.toggleVideo()
    },
    [store]
  )

  const toggleSpeaker = useCallback(
    (enabled: boolean) => {
      if (store.isSpeakerOn !== enabled) store.toggleSpeaker()
    },
    [store]
  )

  const switchCamera = useCallback(async () => {
    await webrtcRef.current?.switchCamera()
  }, [])

  const getLocalStream = useCallback(() => webrtcRef.current?.getLocalStream() ?? null, [])

  return {
    remoteStream,
    localStream,
    hasPermissions,
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
