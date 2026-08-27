'use client';

import { useEffect, useRef } from 'react';
import { Video, VideoOff, Mic, MicOff, Volume2, PhoneOff } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useCallStore, formatCallDuration } from '@/stores/call-store';

export function CallScreen() {
  const {
    status,
    type,
    remoteUser,
    duration,
    isMuted,
    isVideoOff,
    isSpeakerOn,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    endCall,
  } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Get local video stream
  useEffect(() => {
    if (type === 'video' && status === 'connected' && !isVideoOff) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch(console.error);
    }
  }, [type, status, isVideoOff]);

  if (status === 'idle' || status === 'ended' || status === 'declined' || status === 'missed') {
    return null;
  }

  const isVideo = type === 'video';
  const showVideo = isVideo && !isVideoOff;

  const remoteUserData = remoteUser ? {
    id: remoteUser.id,
    display_name: remoteUser.displayName,
    avatar_url: remoteUser.avatarUrl || null,
    status: null,
  } : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Remote Video or Avatar */}
      <div className="relative flex-1 w-full flex items-center justify-center">
        {showVideo ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-slate-700 animate-pulse flex items-center justify-center">
              <span className="text-4xl font-bold text-white">
                {remoteUser?.displayName?.charAt(0) || '?'}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <Avatar user={remoteUserData!} size="xl" className="ring-4 ring-white/20" />
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-white">
                {remoteUser?.displayName || 'Unknown'}
              </h1>
              <p className="text-slate-400 mt-2">
                {status === 'calling' && 'Calling...'}
                {status === 'ringing' && 'Ringing...'}
                {status === 'connected' && formatCallDuration(duration)}
              </p>
            </div>
          </div>
        )}

        {/* Local Video Preview (Picture-in-Picture) */}
        {showVideo && (
          <div className="absolute bottom-24 right-4 w-32 h-40 rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/30 bg-slate-800">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                <VideoOff className="w-8 h-8 text-slate-400" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Call Controls */}
      <div className="flex items-center justify-center gap-4 pb-12">
        {isVideo && (
          <ControlButton
            icon={showVideo ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
            label={showVideo ? 'Turn off camera' : 'Turn on camera'}
            active={!isVideoOff}
            onClick={toggleVideo}
            variant="secondary"
          />
        )}

        <ControlButton
          icon={<Mic className="w-6 h-6" />}
          active={!isMuted}
          onClick={toggleMute}
          label={isMuted ? 'Unmute' : 'Mute'}
          variant="secondary"
        />

        <ControlButton
          icon={<Volume2 className="w-6 h-6" />}
          active={isSpeakerOn}
          onClick={toggleSpeaker}
          label={isSpeakerOn ? 'Speaker off' : 'Speaker on'}
          variant="secondary"
        />

        <ControlButton
          icon={<PhoneOff className="w-6 h-6" />}
          onClick={endCall}
          label="End call"
          variant="danger"
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
}

function ControlButton({
  icon,
  label,
  active = true,
  onClick,
  variant = 'secondary',
}: ControlButtonProps) {
  const baseClasses = `
    w-14 h-14 rounded-full flex items-center justify-center
    transition-all duration-200 hover:scale-105 active:scale-95
  `;

  const variantClasses = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-600',
    secondary: active
      ? 'bg-white/10 text-white hover:bg-white/20'
      : 'bg-red-500 text-white hover:bg-red-600',
    danger: 'bg-red-500 text-white hover:bg-red-600',
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
