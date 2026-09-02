'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export type CallType = 'voice' | 'video'

export type SignalType = 'offer' | 'answer' | 'ice-candidate' | 'call-end'

export interface SignalingMessage {
  type: SignalType
  sessionId: string
  fromUserId: string
  toUserId: string
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit | null
  timestamp?: number
}

export interface WebRTCConfig {
  onRemoteStream: (stream: MediaStream) => void
  onConnectionStateChange: (state: RTCPeerConnectionState) => void
  onIceCandidate?: (candidate: RTCIceCandidate) => void
  onError: (error: Error) => void
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

function getIceServers(): RTCIceServer[] {
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL

  if (turnUrl) {
    const username = process.env.NEXT_PUBLIC_TURN_USERNAME
    const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL
    const customServer: RTCIceServer =
      username && credential ? { urls: turnUrl, username, credential } : { urls: turnUrl }
    return [{ urls: 'stun:stun.l.google.com:19302' }, customServer]
  }

  return ICE_SERVERS
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private config: WebRTCConfig
  private callType: CallType
  private isInitiator: boolean
  private channel: RealtimeChannel | null = null
  private channelName: string
  private pendingIceCandidates: RTCIceCandidateInit[] = []

  private userId: string
  private remoteUserId: string
  private sessionId: string

  constructor(
    userId: string,
    remoteUserId: string,
    sessionId: string,
    callType: CallType,
    isInitiator: boolean,
    config: WebRTCConfig
  ) {
    this.userId = userId
    this.remoteUserId = remoteUserId
    this.sessionId = sessionId
    this.callType = callType
    this.isInitiator = isInitiator
    this.config = config
    this.channelName = `call-signaling-${sessionId}`
  }

  async initialize(): Promise<void> {
    try {
      await this.acquireLocalStream()
      this.createPeerConnection()
      await this.connectSignaling()
      if (this.isInitiator) await this.createOffer()
    } catch (error) {
      this.config.onError(error instanceof Error ? error : new Error('Failed to initialize WebRTC'))
      throw error
    }
  }

  private async acquireLocalStream(): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: this.callType === 'video' ? { width: 1280, height: 720 } : false,
    }

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
    return this.localStream
  }

  private createPeerConnection(): void {
    this.peerConnection = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10,
    })

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!)
      })
    }

    this.peerConnection.ontrack = (event) => {
      if (event.streams[0]) {
        this.config.onRemoteStream(event.streams[0])
      }
    }

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          sessionId: this.sessionId,
          fromUserId: this.userId,
          toUserId: this.remoteUserId,
          payload: event.candidate.toJSON(),
        })
      }
    }

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        this.config.onConnectionStateChange(this.peerConnection.connectionState)
      }
    }
  }

  /**
   * Use Supabase Realtime broadcast for signaling.
   * The channel name is unique per call session, both peers subscribe.
   */
  private async connectSignaling(): Promise<void> {
    const supabase = createClient()

    const channel = supabase.channel(this.channelName, {
      config: {
        broadcast: { self: false, ack: false },
      },
    })

    channel.on('broadcast', { event: 'signal' }, (payload) => {
      void this.handleSignal(payload.payload as SignalingMessage).catch((error: unknown) => {
        this.config.onError(
          error instanceof Error ? error : new Error('Failed to process WebRTC signal')
        )
      })
    })

    this.channel = channel
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`WebRTC signaling channel failed: ${status}`))
        }
      })
    })
  }

  private async handleSignal(message: SignalingMessage): Promise<void> {
    if (!message || message.fromUserId === this.userId) return
    if (message.toUserId !== this.userId) return
    if (message.sessionId !== this.sessionId) return

    switch (message.type) {
      case 'offer':
        await this.handleOffer(message.payload as RTCSessionDescriptionInit)
        break
      case 'answer':
        await this.handleAnswer(message.payload as RTCSessionDescriptionInit)
        break
      case 'ice-candidate':
        await this.handleIceCandidate(message.payload as RTCIceCandidateInit)
        break
      case 'call-end':
        this.config.onConnectionStateChange('closed')
        break
    }
  }

  private async sendSignal(message: SignalingMessage): Promise<void> {
    const channel = this.channel
    if (!channel) return
    await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...message, timestamp: Date.now() },
    })
  }

  async createOffer(): Promise<void> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized')

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.callType === 'video',
    })
    await this.peerConnection.setLocalDescription(offer)

    await this.sendSignal({
      type: 'offer',
      sessionId: this.sessionId,
      fromUserId: this.userId,
      toUserId: this.remoteUserId,
      payload: offer,
    })
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized')

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    await this.flushPendingIceCandidates()
    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)

    await this.sendSignal({
      type: 'answer',
      sessionId: this.sessionId,
      fromUserId: this.userId,
      toUserId: this.remoteUserId,
      payload: answer,
    })
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized')
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    await this.flushPendingIceCandidates()
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return
    if (!this.peerConnection.remoteDescription) {
      this.pendingIceCandidates.push(candidate)
      return
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      console.error('Error adding ICE candidate:', error)
    }
  }

  private async flushPendingIceCandidates(): Promise<void> {
    if (!this.peerConnection?.remoteDescription) return
    const candidates = this.pendingIceCandidates.splice(0)
    for (const candidate of candidates) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  toggleMicrophone(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled))
  }

  toggleCamera(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = enabled))
  }

  async switchCamera(): Promise<void> {
    if (!this.localStream || this.callType !== 'video') return
    const videoTrack = this.localStream.getVideoTracks()[0]
    if (!videoTrack) return

    const devices = await navigator.mediaDevices.enumerateDevices()
    const cams = devices.filter((d) => d.kind === 'videoinput')
    if (cams.length < 2) return

    const currentId = videoTrack.getSettings().deviceId
    const idx = cams.findIndex((d) => d.deviceId === currentId)
    const nextCam = cams[(idx + 1) % cams.length]

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: nextCam.deviceId } },
      audio: false,
    })
    const newTrack = newStream.getVideoTracks()[0]

    const sender = this.peerConnection?.getSenders().find((s) => s.track?.kind === 'video')
    if (sender) await sender.replaceTrack(newTrack)

    this.localStream.removeTrack(videoTrack)
    this.localStream.addTrack(newTrack)
    videoTrack.stop()
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  async sendEndCall(): Promise<void> {
    await this.sendSignal({
      type: 'call-end',
      sessionId: this.sessionId,
      fromUserId: this.userId,
      toUserId: this.remoteUserId,
      payload: null,
    })
  }

  cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }

    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }

    const channel = this.channel
    if (channel) {
      void createClient().removeChannel(channel)
      this.channel = null
    }
    this.pendingIceCandidates = []
  }
}

export function isWebRTCSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.RTCPeerConnection !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}
