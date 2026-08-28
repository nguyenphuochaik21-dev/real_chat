'use client';

import { useEffect, useRef, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, Volume2, PhoneOff, RefreshCw } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useCallStore, formatCallDuration } from '@/stores/call-store';

interface CallScreenProps {
  remoteStream?: MediaStream | null;
  localStream?: MediaStream | null;
}

export function CallScreen({ remoteStream, localStream }: CallScreenProps) {
  const {
    status,
    type,
    remoteUser,
    duration,
    isMuted,
    isVideoOff,
    isSpeakerOn,
    error,
    endCall,
  } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connectionState, setConnectionState] = useState<string>('connecting');

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video/audio elements
  useEffect(() => {
    if (remoteStream) {
      const isVideoCall = type === 'video';

      if (isVideoCall && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        setConnectionState('connected');
      } else if (!isVideoCall && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(console.error);
        setConnectionState('connected');
      }

      // Update connection state based on stream
      remoteStream.getTracks().forEach(track => {
        track.onended = () => {
          setConnectionState('disconnected');
        };
      });
    }
  }, [remoteStream, type]);

  // Start duration timer when connected
  useEffect(() => {
    if (status === 'connected') {
      intervalRef.current = setInterval(() => {
        useCallStore.getState().updateDuration();
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [status]);

  if (status === 'idle' || status === 'ended' || status === 'declined' || status === 'missed') {
    return null;
  }

  const isVideo = type === 'video';
  const showLocalVideo = isVideo && !isVideoOff;
  const showRemoteVideo = isVideo && remoteStream;

  const remoteUserData = remoteUser ? {
    id: remoteUser.id,
    display_name: remoteUser.displayName,
    avatar_url: remoteUser.avatarUrl || null,
    status: null,
  } : null;

  const getStatusText = () => {
    if (error) return error;
    switch (status) {
      case 'calling':
        return 'Calling...';
      case 'ringing':
        return 'Ringing...';
      case 'connected':
        return formatCallDuration(duration);
      case 'failed':
        return 'Connection failed';
      default:
        return '';
    }
  };

  const handleEndCall = () => {
    window.dispatchEvent(new CustomEvent('call:end'));
    endCall();
  };

  const handleToggleMute = () => {
    const newState = !isMuted;
    window.dispatchEvent(new CustomEvent('call:mute', { detail: newState }));
  };

  const handleToggleVideo = () => {
    const newState = !isVideoOff;
    window.dispatchEvent(new CustomEvent('call:video', { detail: newState }));
  };

  const handleToggleSpeaker = () => {
    window.dispatchEvent(new CustomEvent('call:speaker', { detail: !isSpeakerOn }));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Hidden remote audio element for voice calls */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Remote Video (full screen background) */}
      {showRemoteVideo ? (
        <div className="absolute inset-0">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
        </div>
      ) : (
        // Avatar fallback
        <div className="absolute inset-0 flex items-center justify-center">
          {remoteUser && (
            <div className="relative">
              <Avatar
                user={remoteUserData!}
                size="2xl"
                className="ring-4 ring-white/20"
              />
              {/* Pulse animation while connecting */}
              {connectionState !== 'connected' && (
                <>
                  <div className="absolute inset-0 rounded-full bg-indigo-500/30 animate-ping" />
                  <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-pulse" />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Top section: Remote user info */}
      <div className="relative z-10 flex flex-col items-center gap-4 pt-16">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-white drop-shadow-lg">
            {remoteUser?.displayName || 'Unknown'}
          </h1>
          <p className={`mt-2 text-lg ${status === 'connected' ? 'text-emerald-400' : 'text-slate-300'}`}>
            {getStatusText()}
          </p>
        </div>

        {/* Call type badge */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
          {isVideo ? (
            <Video className="w-4 h-4 text-indigo-300" />
          ) : (
            <Mic className="w-4 h-4 text-indigo-300" />
          )}
          <span className="text-sm text-white/80 capitalize">{type} call</span>
        </div>
      </div>

      {/* Local Video Preview (Picture-in-Picture) */}
      {showLocalVideo && (
        <div className="absolute bottom-28 right-4 w-40 h-52 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/30 bg-slate-800">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          {isVideoOff && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
              <VideoOff className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-xs text-slate-500">Camera off</span>
            </div>
          )}
          {/* Camera switch button */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute bottom-2 right-2 bg-black/40 hover:bg-black/60 text-white"
            onClick={() => {
              // TODO: Implement camera switch
            }}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Call Controls */}
      <div className="relative z-10 flex items-center justify-center gap-4 pb-16">
        {/* Mute Button */}
        <ControlButton
          icon={isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          label={isMuted ? 'Unmute' : 'Mute'}
          active={!isMuted}
          onClick={handleToggleMute}
          variant={isMuted ? 'danger' : 'secondary'}
        />

        {/* Video Toggle (only for video calls) */}
        {isVideo && (
          <ControlButton
            icon={isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            label={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
            active={!isVideoOff}
            onClick={handleToggleVideo}
            variant={isVideoOff ? 'danger' : 'secondary'}
          />
        )}

        {/* Speaker Toggle */}
        <ControlButton
          icon={<Volume2 className="w-6 h-6" />}
          label={isSpeakerOn ? 'Speaker off' : 'Speaker on'}
          active={isSpeakerOn}
          onClick={handleToggleSpeaker}
          variant={isSpeakerOn ? 'secondary' : 'secondary'}
        />

        {/* End Call Button */}
        <ControlButton
          icon={<PhoneOff className="w-6 h-6" />}
          label="End call"
          onClick={handleEndCall}
          variant="danger"
          className="w-16 h-16"
        />
      </div>
    </div>
  );
}

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
}

function ControlButton({
  icon,
  label,
  active = true,
  onClick,
  variant = 'secondary',
  className = 'w-14 h-14',
}: ControlButtonProps) {
  const baseClasses = `
    rounded-full flex items-center justify-center
    transition-all duration-200 hover:scale-105 active:scale-95
    ${className}
  `;

  const variantClasses = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-600',
    secondary: active
      ? 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
      : 'bg-red-500/90 text-white hover:bg-red-600',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-lg',
  };

  return (
    <Button
      variant="ghost"
      className={`${baseClasses} ${variantClasses[variant]}`}
      onClick={onClick}
      title={label}
    >
      {icon}
    </Button>
  );
}
