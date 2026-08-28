'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { WebRTCService, type CallType, isWebRTCSupported, requestMediaPermissions } from '@/lib/webrtc';
import { useCallStore } from '@/stores/call-store';

export interface UseWebRTCCallOptions {
  userId: string;
  onCallStarted?: () => void;
  onCallEnded?: (duration: number) => void;
  onError?: (error: Error) => void;
}

export function useWebRTCCall(options: UseWebRTCCallOptions) {
  const { userId, onCallStarted, onCallEnded, onError } = options;
  const supabase = createClient();

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [hasPermissions, setHasPermissions] = useState<boolean | null>(null);

  const webrtcRef = useRef<WebRTCService | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  const store = useCallStore();

  // Check permissions on mount
  useEffect(() => {
    if (!isWebRTCSupported()) {
      setHasPermissions(false);
      onError?.(new Error('WebRTC is not supported in this browser'));
      return;
    }

    requestMediaPermissions()
      .then(perms => setHasPermissions(perms.audio))
      .catch(() => setHasPermissions(false));
  }, [onError]);

  // Subscribe to incoming calls
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`incoming-calls-${userId}`)
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
            id: string;
            caller_id: string;
            call_type: CallType;
            conversation_id: string;
            offer_sdp?: string;
          };

          // Get caller info
          const { data: caller } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .eq('id', session.caller_id)
            .single();

          if (caller) {
            // Update store with incoming call
            store.receiveCall(session.conversation_id, {
              id: caller.id,
              displayName: caller.display_name,
              avatarUrl: caller.avatar_url || undefined,
            }, session.call_type);

            // Store session info for later use
            useCallStore.setState({
              conversationId: session.conversation_id,
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, supabase, store]);

  // Handle call acceptance - this watches the store and initiates WebRTC
  useEffect(() => {
    if (store.status !== 'connected' || !userId || !store.remoteUser) return;

    const initiateWebRTC = async () => {
      try {
        // Check permissions
        const perms = await requestMediaPermissions();
        if (!perms.audio) {
          throw new Error('Microphone permission denied');
        }

        const webrtc = new WebRTCService(
          userId,
          store.remoteUser!.id,
          store.conversationId || 'temp-session',
          store.type || 'voice',
          true, // Current user initiated
          {
            onRemoteStream: (stream) => {
              setRemoteStream(stream);
            },
            onConnectionStateChange: (state) => {
              setConnectionState(state);

              if (state === 'connected') {
                onCallStarted?.();
              } else if (state === 'failed' || state === 'disconnected') {
                handleCallEnd();
              }
            },
            onIceCandidate: (candidate) => {
              // ICE candidates are sent via WebRTC service
            },
            onError: (error) => {
              console.error('WebRTC error:', error);
              onError?.(error);
            },
          }
        );

        await webrtc.initialize();
        webrtcRef.current = webrtc;

        // Create and send offer
        await webrtc.createOffer();

      } catch (error) {
        console.error('Failed to initialize WebRTC:', error);
        onError?.(error instanceof Error ? error : new Error('Failed to start call'));
        store.endCall();
      }
    };

    initiateWebRTC();

    return () => {
      webrtcRef.current?.cleanup();
      webrtcRef.current = null;
    };
  }, [store.status, userId, store.remoteUser?.id, store.conversationId, store.type, onCallStarted, onError]);

  const handleCallEnd = useCallback(() => {
    webrtcRef.current?.sendEndCall();
    webrtcRef.current?.cleanup();
    webrtcRef.current = null;
    setRemoteStream(null);
    setConnectionState('closed');

    onCallEnded?.(store.duration);
    store.endCall();
  }, [store, onCallEnded]);

  const initiateCall = useCallback(async (
    conversationId: string,
    remoteUser: { id: string; displayName: string; avatarUrl?: string },
    type: CallType
  ) => {
    try {
      // Check permissions first
      if (hasPermissions === false) {
        throw new Error('Microphone permission denied. Please enable microphone access.');
      }

      // Create call session in database
      const { data: session, error } = await supabase.rpc('initiate_call', {
        p_callee_id: remoteUser.id,
        p_conversation_id: conversationId,
        p_call_type: type,
      });

      if (error) {
        console.error('Failed to create call session:', error);
        throw error;
      }

      // Update store
      store.initiateCall(conversationId, remoteUser, type);

      // Store session ID
      if (session) {
        useCallStore.setState({ conversationId: session.id });
      }

    } catch (error) {
      console.error('Failed to initiate call:', error);
      onError?.(error instanceof Error ? error : new Error('Failed to initiate call'));
      store.reset();
    }
  }, [hasPermissions, supabase, store, onError]);

  const acceptCall = useCallback(async () => {
    const currentStore = useCallStore.getState();
    if (currentStore.status !== 'ringing') return;

    try {
      // Update database
      await supabase.rpc('update_call_status', {
        p_session_id: currentStore.conversationId,
        p_status: 'answered',
      });

      // Update local store
      store.acceptCall();

    } catch (error) {
      console.error('Failed to accept call:', error);
      onError?.(error instanceof Error ? error : new Error('Failed to accept call'));
    }
  }, [supabase, store, onError]);

  const declineCall = useCallback(async () => {
    const currentStore = useCallStore.getState();

    try {
      // Update database
      await supabase.rpc('update_call_status', {
        p_session_id: currentStore.conversationId,
        p_status: 'declined',
      });

      store.declineCall();

    } catch (error) {
      console.error('Failed to decline call:', error);
      store.declineCall();
    }
  }, [supabase, store]);

  const endCall = useCallback(async () => {
    const currentStore = useCallStore.getState();

    try {
      // End call in database
      await supabase.rpc('end_call', {
        p_session_id: currentStore.conversationId,
        p_status: 'ended',
      });
    } catch (error) {
      console.error('Failed to end call in database:', error);
    }

    // End WebRTC
    handleCallEnd();
  }, [supabase, handleCallEnd]);

  const toggleMute = useCallback((enabled: boolean) => {
    webrtcRef.current?.toggleMicrophone(enabled);
    store.toggleMute();
  }, [store]);

  const toggleVideo = useCallback((enabled: boolean) => {
    webrtcRef.current?.toggleCamera(enabled);
    store.toggleVideo();
  }, [store]);

  const toggleSpeaker = useCallback((enabled: boolean) => {
    // Speaker is handled at audio element level
    store.toggleSpeaker();
  }, [store]);

  const switchCamera = useCallback(async () => {
    await webrtcRef.current?.switchCamera();
  }, []);

  const getLocalStream = useCallback(() => {
    return webrtcRef.current?.getLocalStream() || null;
  }, []);

  return {
    // State
    remoteStream,
    connectionState,
    hasPermissions,

    // Call actions
    initiateCall,
    acceptCall,
    declineCall,
    endCall,

    // Media controls
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    switchCamera,
    getLocalStream,
  };
}
