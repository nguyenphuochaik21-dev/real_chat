'use client'

import { create } from 'zustand'

export type CallType = 'voice' | 'video'
export type CallStatus =
  | 'idle'
  | 'calling' // Outgoing - waiting for answer
  | 'ringing' // Incoming - waiting for accept
  | 'connecting' // WebRTC connecting
  | 'connected' // WebRTC connected
  | 'ended' // Call ended normally
  | 'declined' // Recipient declined
  | 'missed' // Recipient didn't answer
  | 'failed' // Technical error

interface CallParticipant {
  id: string
  displayName: string
  avatarUrl?: string
}

interface CallState {
  status: CallStatus
  type: CallType | null

  currentUser: CallParticipant | null
  remoteUser: CallParticipant | null

  // DB session id (call_sessions.id) - used as signaling channel name
  sessionId: string | null
  // Conversation the call belongs to
  conversationId: string | null

  startedAt: Date | null
  duration: number

  isMuted: boolean
  isVideoOff: boolean
  isSpeakerOn: boolean

  error: string | null
}

interface CallActions {
  initiateCall: (
    conversationId: string,
    sessionId: string,
    remoteUser: CallParticipant,
    type: CallType
  ) => void

  receiveCall: (
    sessionId: string,
    conversationId: string,
    remoteUser: CallParticipant,
    type: CallType
  ) => void

  acceptCall: () => void
  declineCall: () => void
  endCall: () => void
  setConnected: () => void
  setConnecting: () => void

  toggleMute: () => void
  toggleVideo: () => void
  toggleSpeaker: () => void

  updateDuration: () => void

  setError: (error: string | null) => void
  reset: () => void
}

const initialState: CallState = {
  status: 'idle',
  type: null,
  currentUser: null,
  remoteUser: null,
  sessionId: null,
  conversationId: null,
  startedAt: null,
  duration: 0,
  isMuted: false,
  isVideoOff: false,
  isSpeakerOn: true,
  error: null,
}

export const useCallStore = create<CallState & CallActions>((set, get) => ({
  ...initialState,

  initiateCall: (conversationId, sessionId, remoteUser, type) => {
    set({
      status: 'calling',
      type,
      conversationId,
      sessionId,
      remoteUser,
      startedAt: null,
      duration: 0,
      isMuted: false,
      isVideoOff: type === 'voice',
      isSpeakerOn: true,
      error: null,
    })

    // Auto-end as missed if no answer after 60s
    setTimeout(() => {
      const current = get()
      if (current.status === 'calling' && current.sessionId === sessionId) {
        set({ status: 'missed', error: 'No answer' })
        setTimeout(() => {
          const latest = get()
          if (latest.status === 'missed' && latest.sessionId === sessionId) set(initialState)
        }, 2000)
      }
    }, 60000)
  },

  receiveCall: (sessionId, conversationId, remoteUser, type) => {
    set({
      status: 'ringing',
      type,
      sessionId,
      conversationId,
      remoteUser,
      isVideoOff: type === 'voice',
      isSpeakerOn: true,
      error: null,
    })
  },

  acceptCall: () => {
    set({
      status: 'connecting',
      startedAt: new Date(),
      duration: 0,
      error: null,
    })
  },

  setConnecting: () => {
    set({ status: 'connecting' })
  },

  setConnected: () => {
    const current = get()
    if (
      current.status === 'calling' ||
      current.status === 'ringing' ||
      current.status === 'connecting'
    ) {
      set({
        status: 'connected',
        startedAt: current.startedAt ?? new Date(),
        error: null,
      })
    }
  },

  declineCall: () => {
    const sessionId = get().sessionId
    set({ status: 'declined' })
    setTimeout(() => {
      const current = get()
      if (current.status === 'declined' && current.sessionId === sessionId) set(initialState)
    }, 2000)
  },

  endCall: () => {
    const sessionId = get().sessionId
    set({ status: 'ended' })
    setTimeout(() => {
      const current = get()
      if (current.status === 'ended' && current.sessionId === sessionId) set(initialState)
    }, 2000)
  },

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleVideo: () => set((s) => ({ isVideoOff: !s.isVideoOff })),
  toggleSpeaker: () => set((s) => ({ isSpeakerOn: !s.isSpeakerOn })),

  updateDuration: () => {
    if (get().status === 'connected') {
      set((s) => ({ duration: s.duration + 1 }))
    }
  },

  setError: (error) => {
    const sessionId = get().sessionId
    set({ error })
    if (error) {
      set({ status: 'failed' })
      setTimeout(() => {
        const current = get()
        if (current.status === 'failed' && current.sessionId === sessionId) set(initialState)
      }, 3000)
    }
  },

  reset: () => set(initialState),
}))

export function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
