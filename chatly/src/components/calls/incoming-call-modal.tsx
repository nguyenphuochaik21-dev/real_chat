'use client';

import { Phone, Video, PhoneOff } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useCallStore } from '@/stores/call-store';

export function IncomingCallModal() {
  const { status, type, remoteUser, acceptCall, declineCall } = useCallStore();

  if (status !== 'ringing') return null;

  const isVideo = type === 'video';

  const remoteUserData = remoteUser ? {
    id: remoteUser.id,
    display_name: remoteUser.displayName,
    avatar_url: remoteUser.avatarUrl || null,
    status: null,
  } : null;

  const handleAccept = () => {
    acceptCall();
  };

  const handleDecline = () => {
    declineCall();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="w-80 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-8 text-center shadow-2xl ring-1 ring-white/10">
        {/* Avatar */}
        <div className="mb-6">
          <div className="relative inline-block">
            {remoteUserData && (
              <Avatar user={remoteUserData} size="2xl" className="ring-4 ring-indigo-500/50" />
            )}
            <div className="absolute inset-0 animate-ping rounded-full bg-indigo-500/30" />
            <div className="absolute inset-0 animate-pulse rounded-full bg-indigo-500/20" />
          </div>
        </div>

        {/* Name */}
        <h2 className="mb-1 text-xl font-semibold text-white">
          {remoteUser?.displayName || 'Unknown'}
        </h2>
        <p className="mb-6 text-sm text-slate-400">
          {isVideo ? 'Incoming video call' : 'Incoming voice call'}
        </p>

        {/* Type indicator */}
        <div className="mb-8 flex justify-center">
          <div className="flex flex-col items-center">
            {isVideo ? (
              <Video className="h-5 w-5 text-indigo-400" />
            ) : (
              <Phone className="h-5 w-5 text-indigo-400" />
            )}
            <span className="mt-1 text-xs text-slate-500">
              {isVideo ? 'Video' : 'Voice'}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-center gap-8">
          <div className="flex flex-col items-center">
            <button
              className="mb-2 h-16 w-16 rounded-full bg-red-500 text-white transition-all hover:scale-105 hover:bg-red-600 active:scale-95"
              onClick={handleDecline}
              aria-label="Decline"
            >
              <PhoneOff className="mx-auto h-6 w-6" />
            </button>
            <span className="text-xs text-slate-400">Decline</span>
          </div>

          <div className="flex flex-col items-center">
            <button
              className="mb-2 h-16 w-16 rounded-full bg-emerald-500 text-white transition-all hover:scale-105 hover:bg-emerald-600 active:scale-95"
              onClick={handleAccept}
              aria-label="Accept"
            >
              <Phone className="mx-auto h-6 w-6" />
            </button>
            <span className="text-xs text-slate-400">Accept</span>
          </div>
        </div>

        {/* Ringing dots */}
        <div className="mt-6 flex justify-center gap-1">
          <div
            className="h-2 w-2 animate-bounce rounded-full bg-indigo-500"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="h-2 w-2 animate-bounce rounded-full bg-indigo-500"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="h-2 w-2 animate-bounce rounded-full bg-indigo-500"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  );
}
