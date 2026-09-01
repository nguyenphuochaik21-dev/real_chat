'use client'

import { useEffect } from 'react'
import { useWebRTCCall } from '@/hooks/use-webrtc-call'
import { useCallStore } from '@/stores/call-store'
import { CallScreen } from './call-screen'
import { IncomingCallModal } from './incoming-call-modal'

interface CallProviderProps {
  userId: string
  children: React.ReactNode
}

export function CallProvider({ userId, children }: CallProviderProps) {
  const setCallError = useCallStore((state) => state.setError)
  const {
    remoteStream,
    localStream,
    initiateCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    switchCamera,
  } = useWebRTCCall({
    userId,
    onError: (error) => setCallError(error.message),
  })

  useEffect(() => {
    const handleInitiate = (event: Event) => {
      const callEvent = event as CustomEvent<{
        conversationId: string
        remoteUser: { id: string; displayName: string; avatarUrl?: string }
        type: 'voice' | 'video'
      }>
      void initiateCall(
        callEvent.detail.conversationId,
        callEvent.detail.remoteUser,
        callEvent.detail.type
      )
    }

    const handleAccept = () => void acceptCall()
    const handleDecline = () => void declineCall()
    const handleEnd = () => void endCall()
    const handleMute = (event: Event) => toggleMute((event as CustomEvent<boolean>).detail)
    const handleVideo = (event: Event) => toggleVideo((event as CustomEvent<boolean>).detail)
    const handleSpeaker = (event: Event) => toggleSpeaker((event as CustomEvent<boolean>).detail)
    const handleSwitchCamera = () => void switchCamera()

    window.addEventListener('call:initiate', handleInitiate)
    window.addEventListener('call:accept', handleAccept)
    window.addEventListener('call:decline', handleDecline)
    window.addEventListener('call:end', handleEnd)
    window.addEventListener('call:mute', handleMute)
    window.addEventListener('call:video', handleVideo)
    window.addEventListener('call:speaker', handleSpeaker)
    window.addEventListener('call:switch-camera', handleSwitchCamera)

    return () => {
      window.removeEventListener('call:initiate', handleInitiate)
      window.removeEventListener('call:accept', handleAccept)
      window.removeEventListener('call:decline', handleDecline)
      window.removeEventListener('call:end', handleEnd)
      window.removeEventListener('call:mute', handleMute)
      window.removeEventListener('call:video', handleVideo)
      window.removeEventListener('call:speaker', handleSpeaker)
      window.removeEventListener('call:switch-camera', handleSwitchCamera)
    }
  }, [
    acceptCall,
    declineCall,
    endCall,
    initiateCall,
    switchCamera,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
  ])

  return (
    <>
      {children}
      <IncomingCallModal />
      <CallScreen remoteStream={remoteStream} localStream={localStream} />
    </>
  )
}
