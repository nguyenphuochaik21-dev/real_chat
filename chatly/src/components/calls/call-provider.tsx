'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWebRTCCall } from '@/hooks/use-webrtc-call';
import { useCallStore } from '@/stores/call-store';
import { CallScreen } from './call-screen';
import { IncomingCallModal } from './incoming-call-modal';

interface CallProviderProps {
  userId: string;
  children: React.ReactNode;
}

export function CallProvider({ userId, children }: CallProviderProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const store = useCallStore();

  // Initialize WebRTC hook
  const webrtc = useWebRTCCall({
    userId,
    onCallStarted: () => {
      console.log('Call started');
      // Get local stream after connection
      const stream = webrtc.getLocalStream();
      if (stream) {
        setLocalStream(stream);
      }
    },
    onCallEnded: (duration) => {
      console.log('Call ended, duration:', duration);
      setLocalStream(null);
    },
    onError: (error) => {
      console.error('Call error:', error);
      store.setError(error.message);
    },
  });

  // Connect store actions to WebRTC
  useEffect(() => {
    const handleInitiate = (e: CustomEvent<{
      conversationId: string;
      remoteUser: { id: string; displayName: string; avatarUrl?: string };
      type: 'voice' | 'video';
    }>) => {
      webrtc.initiateCall(e.detail.conversationId, e.detail.remoteUser, e.detail.type);
    };

    const handleAccept = () => {
      webrtc.acceptCall();
      // Get local stream after accepting
      const stream = webrtc.getLocalStream();
      if (stream) {
        setLocalStream(stream);
      }
    };

    const handleDecline = () => {
      webrtc.declineCall();
    };

    const handleEnd = () => {
      webrtc.endCall();
      setLocalStream(null);
    };

    const handleMute = (e: CustomEvent<boolean>) => {
      webrtc.toggleMute(e.detail);
    };

    const handleVideo = (e: CustomEvent<boolean>) => {
      webrtc.toggleVideo(e.detail);
    };

    const handleSpeaker = (e: CustomEvent<boolean>) => {
      webrtc.toggleSpeaker(e.detail);
    };

    window.addEventListener('call:initiate', handleInitiate as EventListener);
    window.addEventListener('call:accept', handleAccept);
    window.addEventListener('call:decline', handleDecline);
    window.addEventListener('call:end', handleEnd);
    window.addEventListener('call:mute', handleMute as EventListener);
    window.addEventListener('call:video', handleVideo as EventListener);
    window.addEventListener('call:speaker', handleSpeaker as EventListener);

    return () => {
      window.removeEventListener('call:initiate', handleInitiate as EventListener);
      window.removeEventListener('call:accept', handleAccept);
      window.removeEventListener('call:decline', handleDecline);
      window.removeEventListener('call:end', handleEnd);
      window.removeEventListener('call:mute', handleMute as EventListener);
      window.removeEventListener('call:video', handleVideo as EventListener);
      window.removeEventListener('call:speaker', handleSpeaker as EventListener);
    };
  }, [webrtc]);

  return (
    <>
      {children}
      <IncomingCallModal />
      <CallScreen
        remoteStream={webrtc.remoteStream}
        localStream={localStream}
      />
    </>
  );
}
