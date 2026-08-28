'use client';

import { create } from 'zustand';

export type CallType = 'voice' | 'video';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended' | 'declined' | 'missed' | 'failed';

interface CallParticipant {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface CallState {
  // Call state
  status: CallStatus;
  type: CallType | null;

  // Participants
  currentUser: CallParticipant | null;
  remoteUser: CallParticipant | null;

  // Call metadata
  conversationId: string | null;
  sessionId: string | null; // WebRTC session ID from database
  startedAt: Date | null;
  duration: number; // seconds

  // Media states
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;

  // Error state
  error: string | null;
}

interface CallActions {
  // Initiate a call
  initiateCall: (conversationId: string, remoteUser: CallParticipant, type: CallType, sessionId?: string) => void;

  // Handle incoming call
  receiveCall: (sessionId: string, remoteUser: CallParticipant, type: CallType) => void;

  // Call actions
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  setConnected: () => void;

  // Media controls
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;

  // Update duration (called every second when connected)
  updateDuration: () => void;

  // Error handling
  setError: (error: string | null) => void;

  // Reset state
  reset: () => void;
}

const initialState: CallState = {
  status: 'idle',
  type: null,
  currentUser: null,
  remoteUser: null,
  conversationId: null,
  sessionId: null,
  startedAt: null,
  duration: 0,
  isMuted: false,
  isVideoOff: false,
  isSpeakerOn: true,
  error: null,
};

export const useCallStore = create<CallState & CallActions>((set, get) => ({
  ...initialState,

  initiateCall: (conversationId, remoteUser, type, sessionId) => {
    set({
      status: 'calling',
      type,
      conversationId,
      sessionId: sessionId || null,
      remoteUser,
      startedAt: null,
      duration: 0,
      isMuted: false,
      isVideoOff: type === 'voice',
      error: null,
    });

    // Auto-end if no response after 60 seconds (handled by server, but backup)
    setTimeout(() => {
      if (get().status === 'calling' || get().status === 'ringing') {
        set({
          status: 'missed',
          error: 'No answer',
        });
        setTimeout(() => set(initialState), 2000);
      }
    }, 60000);
  },

  receiveCall: (sessionId, remoteUser, type) => {
    set({
      status: 'ringing',
      type,
      sessionId,
      remoteUser,
      isVideoOff: type === 'voice',
      error: null,
    });
  },

  acceptCall: () => {
    set({
      status: 'connected',
      startedAt: new Date(),
      duration: 0,
      error: null,
    });
  },

  setConnected: () => {
    const current = get();
    if (current.status === 'calling' || current.status === 'ringing') {
      set({
        status: 'connected',
        startedAt: new Date(),
        duration: 0,
        error: null,
      });
    }
  },

  declineCall: () => {
    set({
      status: 'declined',
    });

    // Reset after showing declined state
    setTimeout(() => {
      set(initialState);
    }, 2000);
  },

  endCall: () => {
    set({
      status: 'ended',
    });

    // Reset after showing ended state
    setTimeout(() => {
      set(initialState);
    }, 2000);
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  },

  toggleVideo: () => {
    set((state) => ({ isVideoOff: !state.isVideoOff }));
  },

  toggleSpeaker: () => {
    set((state) => ({ isSpeakerOn: !state.isSpeakerOn }));
  },

  updateDuration: () => {
    if (get().status === 'connected') {
      set((state) => ({ duration: state.duration + 1 }));
    }
  },

  setError: (error) => {
    set({ error });
    if (error) {
      set({ status: 'failed' });
      setTimeout(() => set(initialState), 3000);
    }
  },

  reset: () => {
    set(initialState);
  },
}));

// Helper to format duration
export function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
