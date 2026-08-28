'use client';

import { createClient } from '@/lib/supabase/client';

export type CallType = 'voice' | 'video';

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accept' | 'call-decline' | 'call-end';
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit | Record<string, unknown>;
  timestamp?: number;
}

export interface WebRTCConfig {
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onError: (error: Error) => void;
}

// ICE Servers configuration
// STUN: Google's free STUN servers
// TURN: Free TURN server from metered.ca (500MB/month free)
// For production, use Twilio TURN or Xirsys
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // Free TURN server (Metered.ca) - no credentials needed for basic usage
  {
    urls: 'turn:a.production.metered.ca:80',
    username: 'webrtc',
    credential: 'turn',
  },
  {
    urls: 'turn:a.production.metered.ca:443',
    username: 'webrtc',
    credential: 'turn',
  },
];

// TURN server configuration - can be configured via environment variables
// NEXT_PUBLIC_TURN_URL, NEXT_PUBLIC_TURN_USERNAME, NEXT_PUBLIC_TURN_CREDENTIAL
export function getIceServers(): RTCIceServer[] {
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;

  if (turnUrl) {
    const customServers: RTCIceServer[] = [
      { urls: turnUrl },
    ];

    const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

    if (username && credential) {
      customServers[0] = { urls: turnUrl, username, credential };
    }

    return [
      { urls: 'stun:stun.l.google.com:19302' },
      ...customServers,
    ];
  }

  return ICE_SERVERS;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: WebRTCConfig;
  private callType: CallType;
  private isInitiator: boolean;
  private supabase = createClient();
  private channelName: string;
  private channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;
  private userId: string;
  private remoteUserId: string;
  private sessionId: string;

  constructor(
    userId: string,
    remoteUserId: string,
    sessionId: string,
    callType: CallType,
    isInitiator: boolean,
    config: WebRTCConfig
  ) {
    this.userId = userId;
    this.remoteUserId = remoteUserId;
    this.sessionId = sessionId;
    this.callType = callType;
    this.isInitiator = isInitiator;
    this.config = config;
    this.channelName = `call-signaling-${sessionId}`;
  }

  async initialize(): Promise<void> {
    try {
      // Get local media stream
      await this.acquireLocalStream();

      // Create peer connection
      this.createPeerConnection();

      // Setup signaling channel
      this.setupSignaling();

    } catch (error) {
      this.config.onError(error instanceof Error ? error : new Error('Failed to initialize WebRTC'));
      throw error;
    }
  }

  private async acquireLocalStream(): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: this.callType === 'video',
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (error) {
      // Try audio only if video fails
      if (this.callType === 'video') {
        console.warn('Video not available, switching to audio-only');
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return this.localStream;
      }
      throw error;
    }
  }

  private createPeerConnection(): void {
    this.peerConnection = new RTCPeerConnection({ iceServers: getIceServers() });

    // Add local tracks to connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    // Handle incoming tracks
    this.peerConnection.ontrack = (event) => {
      if (event.streams[0]) {
        this.config.onRemoteStream(event.streams[0]);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          sessionId: this.sessionId,
          fromUserId: this.userId,
          toUserId: this.remoteUserId,
          payload: event.candidate.toJSON(),
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        this.config.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };

    // Handle ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.peerConnection?.iceConnectionState);
    };
  }

  private setupSignaling(): void {
    this.channel = this.supabase.channel(this.channelName, {
      config: {
        broadcast: { self: false },
      },
    });

    this.channel.on('broadcast', { event: '*' }, (payload) => {
      this.handleSignalingMessage(payload.payload as SignalingMessage);
    });

    this.channel.subscribe();
  }

  private handleSignalingMessage(message: SignalingMessage): void {
    // Ignore messages from self
    if (message.fromUserId === this.userId) return;

    // Ignore messages for other sessions
    if (message.sessionId !== this.sessionId) return;

    switch (message.type) {
      case 'offer':
        this.handleOffer(message.payload as RTCSessionDescriptionInit);
        break;
      case 'answer':
        this.handleAnswer(message.payload as RTCSessionDescriptionInit);
        break;
      case 'ice-candidate':
        this.handleIceCandidate(message.payload as RTCIceCandidateInit);
        break;
      case 'call-end':
        this.handleRemoteEnd();
        break;
    }
  }

  private sendSignalingMessage(message: SignalingMessage): void {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: { ...message, timestamp: Date.now() },
      });
    }
  }

  async createOffer(): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.sendSignalingMessage({
      type: 'offer',
      sessionId: this.sessionId,
      fromUserId: this.userId,
      toUserId: this.remoteUserId,
      payload: offer,
    });
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.sendSignalingMessage({
      type: 'answer',
      sessionId: this.sessionId,
      fromUserId: this.userId,
      toUserId: this.remoteUserId,
      payload: answer,
    });
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  private handleRemoteEnd(): void {
    this.cleanup();
  }

  // Media controls
  toggleMicrophone(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  toggleCamera(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  async switchCamera(): Promise<void> {
    if (!this.localStream || this.callType !== 'video') return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    // Get all video devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    if (videoDevices.length < 2) return;

    // Find current device and switch to next
    const currentDeviceId = videoTrack.getSettings().deviceId;
    const currentIndex = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex];

    // Get new stream from next camera
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: nextDevice.deviceId } },
      audio: false,
    });

    const newVideoTrack = newStream.getVideoTracks()[0];

    // Replace track in peer connection
    const sender = this.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      await sender.replaceTrack(newVideoTrack);
    }

    // Update local stream
    this.localStream.removeTrack(videoTrack);
    this.localStream.addTrack(newVideoTrack);
    videoTrack.stop();
  }

  async setSpeaker(enabled: boolean): Promise<void> {
    // This is handled at the audio element level, not in WebRTC
    // We'll return this info to the UI layer
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  sendEndCall(): void {
    this.sendSignalingMessage({
      type: 'call-end',
      sessionId: this.sessionId,
      fromUserId: this.userId,
      toUserId: this.remoteUserId,
    });
  }

  cleanup(): void {
    // Stop all tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Remove signaling channel
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

// Utility function to check browser support
export function isWebRTCSupported(): boolean {
  return typeof window !== 'undefined' && !!(
    window.RTCPeerConnection &&
    navigator.mediaDevices?.getUserMedia
  );
}

// Utility function to request microphone/camera permissions
export async function requestMediaPermissions(): Promise<{
  audio: boolean;
  video: boolean;
}> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    stream.getTracks().forEach(track => track.stop());
    return { audio: true, video: true };
  } catch (error) {
    console.error('Error checking permissions:', error);
    return { audio: false, video: false };
  }
}
