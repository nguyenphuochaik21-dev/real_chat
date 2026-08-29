'use client';

import { useEffect, useRef, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, Volume2, PhoneOff, RefreshCw } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
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
    error,
    endCall,
  } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream
  useEffect(() => {
    if (!remoteStream) return;
    const isVideoCall = type === 'video';

    if (isVideoCall && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(console.error);
    } else if (!isVideoCall && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(console.error);
    }
  }, [remoteStream, type]);

  // Duration timer
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
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status]);

  // Only render for active call states
  const visibleStatuses = ['calling', 'connecting', 'connected'];
  if (!visibleStatuses.includes(status)) return null;

  const isVideo = type === 'video';
  const showLocalVideo = isVideo && localStream;
  const showRemoteVideo = isVideo && remoteStream;

  const remoteUserData = remoteUser ? {
    id: remoteUser.id,
    display_name: remoteUser.displayName,
    avatar_url: remoteUser.avatarUrl || null,
    status: null,
  } : null;

  const getStatusText = (): string => {
    if (error) return error;
    switch (status) {
      case 'calling':
        return 'Calling...';
      case 'ringing':
        return 'Ringing...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatCallDuration(duration);
      default:
        return '';
    }
  };

  const handleEndCall = () => {
    window.dispatchEvent(new CustomEvent('call:end'));
  };

  const handleToggleMute = () => {
    window.dispatchEvent(new CustomEvent('call:mute', { detail: !isMuted }));
  };

  const handleToggleVideo = () => {
    window.dispatchEvent(new CustomEvent('call:video', { detail: !isVideoOff }));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Hidden audio element for voice calls */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Remote video (full screen) or avatar fallback */}
      {showRemoteVideo ? (
        <div className="absolute inset-0">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          {remoteUserData && (
            <div className="relative">
              <Avatar
                user={remoteUserData}
                size="2xl"
                className="ring-4 ring-white/20"
              />
              {status !== 'connected' && (
                <>
                  <div className="absolute inset-0 animate-ping rounded-full bg-indigo-500/30" />
                  <div className="absolute inset-0 animate-pulse rounded-full bg-indigo-500/20" />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Top info section */}
      <div className="relative z-10 flex flex-col items-center gap-4 pt-16">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-white drop-shadow-lg">
            {remoteUser?.displayName || 'Unknown'}
          </h1>
          <p className={`mt-2 text-lg ${
            status === 'connected' ? 'text-emerald-400' : 'text-slate-300'
          }`}>
            {getStatusText()}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 backdrop-blur-sm">
          {isVideo ? (
            <Video className="h-4 w-4 text-indigo-300" />
          ) : (
            <Mic className="h-4 w-4 text-indigo-300" />
          )}
          <span className="text-sm capitalize text-white/80">
            {isVideo ? 'Video call' : 'Voice call'}
          </span>
        </div>
      </div>

      {/* Local video preview */}
      {showLocalVideo && (
        <div className="absolute bottom-28 right-4 h-52 w-40 overflow-hidden rounded-2xl bg-slate-800 shadow-2xl ring-2 ring-white/30">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          {isVideoOff && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
              <VideoOff className="mb-2 h-8 w-8 text-slate-400" />
              <span className="text-xs text-slate-500">Camera off</span>
            </div>
          )}
          <button
            className="absolute bottom-2 right-2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
            onClick={() => window.dispatchEvent(new CustomEvent('call:video', { detail: !isVideoOff }))}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Call controls */}
      <div className="relative z-10 mt-auto flex items-center justify-center gap-4 pb-12">
        <ControlButton
          icon={isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          label={isMuted ? 'Unmute' : 'Mute'}
          onClick={handleToggleMute}
          variant={isMuted ? 'danger' : 'secondary'}
        />

        {isVideo && (
          <ControlButton
            icon={isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
            label={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
            onClick={handleToggleVideo}
            variant={isVideoOff ? 'danger' : 'secondary'}
          />
        )}

        <ControlButton
          icon={<Volume2 className="h-6 w-6" />}
          label="Speaker"
          onClick={() => window.dispatchEvent(new CustomEvent('call:speaker', { detail: true }))}
          variant="secondary"
        />

        <ControlButton
          icon={<PhoneOff className="h-6 w-6" />}
          label="End call"
          onClick={handleEndCall}
          variant="danger"
          className="h-16 w-16 shadow-lg"
        />
      </div>
    </div>
  );
}

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
}

function ControlButton({ icon, label, onClick, variant = 'secondary', className = 'h-14 w-14' }: ControlButtonProps) {
  const base = `rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ${className}`;

  const variants = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-600',
    secondary: 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm',
    danger: 'bg-red-500 text-white hover:bg-red-600',
  };

  return (
    <button
      className={`${base} ${variants[variant]}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
