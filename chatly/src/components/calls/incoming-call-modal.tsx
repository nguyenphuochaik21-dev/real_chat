'use client';

import { Phone, Video, PhoneOff } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useCallStore } from '@/stores/call-store';

export function IncomingCallModal() {
  const { status, type, remoteUser, acceptCall, declineCall } = useCallStore();

  if (status !== 'ringing') {
    return null;
  }

  const isVideo = type === 'video';

  const remoteUserData = remoteUser ? {
    id: remoteUser.id,
    display_name: remoteUser.displayName,
    avatar_url: remoteUser.avatarUrl || null,
    status: null,
  } : null;

  const handleAccept = () => {
    window.dispatchEvent(new CustomEvent('call:accept'));
    acceptCall();
  };

  const handleDecline = () => {
    window.dispatchEvent(new CustomEvent('call:decline'));
    declineCall();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 shadow-2xl w-80 text-center animate-in fade-in zoom-in duration-300">
        {/* Avatar with pulse animation */}
        <div className="mb-6">
          <div className="relative inline-block">
            <Avatar user={remoteUserData!} size="2xl" className="ring-4 ring-indigo-500/50" />
            {/* Pulse animation */}
            <div className="absolute inset-0 rounded-full bg-indigo-500/30 animate-ping" />
            <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-pulse" />
          </div>
        </div>

        {/* Name and call type */}
        <h2 className="text-xl font-semibold text-white mb-1">
          {remoteUser?.displayName || 'Unknown'}
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          {isVideo ? 'Incoming video call' : 'Incoming voice call'}
        </p>

        {/* Call type indicator */}
        <div className="flex justify-center gap-4 mb-8">
          <div className="flex flex-col items-center">
            {isVideo ? (
              <Video className="w-5 h-5 text-indigo-400" />
            ) : (
              <Phone className="w-5 h-5 text-indigo-400" />
            )}
            <span className="text-xs text-slate-500 mt-1">
              {isVideo ? 'Video' : 'Voice'}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-center gap-8">
          {/* Decline Button */}
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white mb-2 transition-all hover:scale-105 active:scale-95"
              onClick={handleDecline}
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
            <span className="text-xs text-slate-400">Decline</span>
          </div>

          {/* Accept Button */}
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white mb-2 transition-all hover:scale-105 active:scale-95"
              onClick={handleAccept}
            >
              <Phone className="w-6 h-6" />
            </Button>
            <span className="text-xs text-slate-400">Accept</span>
          </div>
        </div>

        {/* Ringing animation dots */}
        <div className="mt-6 flex justify-center gap-1">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
