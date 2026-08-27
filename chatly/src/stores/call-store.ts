'use client';

import { create } from 'zustand';

export type CallType = 'voice' | 'video';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended' | 'declined' | 'missed';

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
  startedAt: Date | null;
  duration: number; // seconds

  // Media states
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
}

interface CallActions {
  // Initiate a call
  initiateCall: (conversationId: string, remoteUser: CallParticipant, type: CallType) => void;

  // Handle incoming call
  receiveCall: (conversationId: string, remoteUser: CallParticipant, type: CallType) => void;

  // Call actions
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;

  // Media controls
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;

  // Update duration (called every second when connected)
  updateDuration: () => void;

  // Reset state
  reset: () => void;
}

const initialState: CallState = {
  status: 'idle',
  type: null,
  currentUser: null,
  remoteUser: null,
  conversationId: null,
  startedAt: null,
  duration: 0,
  isMuted: false,
  isVideoOff: false,
  isSpeakerOn: true,
};

export const useCallStore = create<CallState & CallActions>((set, get) => ({
  ...initialState,

  initiateCall: (conversationId, remoteUser, type) => {
    set({
      status: 'calling',
      type,
      conversationId,
      remoteUser,
      startedAt: null,
      duration: 0,
      isMuted: false,
      isVideoOff: type === 'voice',
    });

    // Simulate remote user answering after 3 seconds (for demo)
    // In real implementation, this would be triggered by WebRTC signaling
    setTimeout(() => {
      if (get().status === 'calling') {
        set({
          status: 'ringing',
        });
      }
    }, 2000);
  },

  receiveCall: (conversationId, remoteUser, type) => {
    set({
      status: 'ringing',
      type,
      conversationId,
      remoteUser,
      isVideoOff: type === 'voice',
    });
  },

  acceptCall: () => {
    set({
      status: 'connected',
      startedAt: new Date(),
      duration: 0,
    });
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
