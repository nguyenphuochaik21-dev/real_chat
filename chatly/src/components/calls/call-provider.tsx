'use client';

import { useEffect } from 'react';
import { useWebRTCCall } from '@/hooks/use-webrtc-call';
import { useCallStore } from '@/stores/call-store';
import { CallScreen } from './call-screen';
import { IncomingCallModal } from './incoming-call-modal';

interface CallProviderProps {
  userId: string;
  children: React.ReactNode;
}

export function CallProvider({ userId, children }: CallProviderProps) {
  const store = useCallStore();

  const webrtc = useWebRTCCall({
    userId,
    onError: (error) => {
      console.error('[CallProvider] error:', error);
      store.setError(error.message);
    },
    onCallStarted: () => {
      console.log('[CallProvider] call connected');
    },
    onCallEnded: (duration) => {
      console.log('[CallProvider] call ended, duration:', duration);
    },
  });

  // Wire up window events from chat UI → webrtc actions
  useEffect(() => {
    const handleInitiate = (e: Event) => {
      const ce = e as CustomEvent<{
        conversationId: string;
        remoteUser: { id: string; displayName: string; avatarUrl?: string };
        type: 'voice' | 'video';
      }>;
      webrtc.initiateCall(ce.detail.conversationId, ce.detail.remoteUser, ce.detail.type);
    };

    const handleAccept = () => webrtc.acceptCall();
    const handleDecline = () => webrtc.declineCall();
    const handleEnd = () => webrtc.endCall();

    const handleMute = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      webrtc.toggleMute(ce.detail);
    };
    const handleVideo = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      webrtc.toggleVideo(ce.detail);
    };
    const handleSpeaker = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      webrtc.toggleSpeaker(ce.detail);
    };

    window.addEventListener('call:initiate', handleInitiate);
    window.addEventListener('call:accept', handleAccept);
    window.addEventListener('call:decline', handleDecline);
    window.addEventListener('call:end', handleEnd);
    window.addEventListener('call:mute', handleMute);
    window.addEventListener('call:video', handleVideo);
    window.addEventListener('call:speaker', handleSpeaker);

    return () => {
      window.removeEventListener('call:initiate', handleInitiate);
      window.removeEventListener('call:accept', handleAccept);
      window.removeEventListener('call:decline', handleDecline);
      window.removeEventListener('call:end', handleEnd);
      window.removeEventListener('call:mute', handleMute);
      window.removeEventListener('call:video', handleVideo);
      window.removeEventListener('call:speaker', handleSpeaker);
    };
  }, [webrtc]);

  return (
    <>
      {children}
      <IncomingCallModal />
      <CallScreen
        remoteStream={webrtc.remoteStream}
        localStream={webrtc.localStream}
      />
    </>
  );
}
