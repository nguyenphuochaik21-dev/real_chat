'use client';

export type CallType = 'voice' | 'video';

export type SignalType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'call-end';

export interface SignalingMessage {
  type: SignalType;
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit | null;
  timestamp?: number;
}

export interface WebRTCConfig {
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onError: (error: Error) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export function getIceServers(): RTCIceServer[] {
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;

  if (turnUrl) {
    const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
    const customServer: RTCIceServer = username && credential
      ? { urls: turnUrl, username, credential }
      : { urls: turnUrl };
    return [{ urls: 'stun:stun.l.google.com:19302' }, customServer];
  }

  return ICE_SERVERS;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: WebRTCConfig;
  private callType: CallType;
  private isInitiator: boolean;

  private channelName: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

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
      await this.acquireLocalStream();
      this.createPeerConnection();
      this.connectSignaling();
    } catch (error) {
      this.config.onError(error instanceof Error ? error : new Error('Failed to initialize WebRTC'));
      throw error;
    }
  }

  private async acquireLocalStream(): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: this.callType === 'video' ? { width: 1280, height: 720 } : false,
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (error) {
      if (this.callType === 'video') {
        // Fallback to audio only
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return this.localStream;
      }
      throw error;
    }
  }

  private createPeerConnection(): void {
    this.peerConnection = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10,
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    this.peerConnection.ontrack = (event) => {
      if (event.streams[0]) {
        this.config.onRemoteStream(event.streams[0]);
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          sessionId: this.sessionId,
          fromUserId: this.userId,
          toUserId: this.remoteUserId,
          payload: event.candidate.toJSON(),
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        this.config.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };
  }

  /**
   * Use Supabase Realtime broadcast for signaling.
   * The channel name is unique per call session, both peers subscribe.
   */
  private async connectSignaling(): Promise<void> {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const channel = supabase.channel(this.channelName, {
      config: {
        broadcast: { self: false, ack: false },
      },
    });

    channel.on('broadcast', { event: 'signal' }, (payload) => {
      this.handleSignal(payload.payload as SignalingMessage);
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Once subscribed, the initiator can create the offer
        if (this.isInitiator) {
          // small delay to ensure both peers are subscribed
          setTimeout(() => this.createOffer(), 500);
        }
      }
    });

    // Save for cleanup
    (this as any)._channel = channel;
  }

  private handleSignal(message: SignalingMessage): void {
    if (!message || message.fromUserId === this.userId) return;
    if (message.toUserId !== this.userId) return;
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
        this.config.onConnectionStateChange('disconnected');
        break;
    }
  }

  private async sendSignal(message: SignalingMessage): Promise<void> {
    const channel = (this as any)._channel;
    if (!channel) return;
    await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...message, timestamp: Date.now() },
    });
  }

  async createOffer(): Promise<void> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.callType === 'video',
    });
    await this.peerConnection.setLocalDescription(offer);

    await this.sendSignal({
      type: 'offer',
      sessionId: this.sessionId,
      fromUserId: this.userId,
      toUserId: this.remoteUserId,
      payload: offer,
    });
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    await this.sendSignal({
      type: 'answer',
      sessionId: this.sessionId,
      fromUserId: this.userId,
      toUserId: this.remoteUserId,
      payload: answer,
    });
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) throw new Error('Peer connection not initialized');
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  toggleMicrophone(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => (t.enabled = enabled));
  }

  toggleCamera(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach(t => (t.enabled = enabled));
  }

  async switchCamera(): Promise<void> {
    if (!this.localStream || this.callType !== 'video') return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    if (cams.length < 2) return;

    const currentId = videoTrack.getSettings().deviceId;
    const idx = cams.findIndex(d => d.deviceId === currentId);
    const nextCam = cams[(idx + 1) % cams.length];

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: nextCam.deviceId } },
      audio: false,
    });
    const newTrack = newStream.getVideoTracks()[0];

    const sender = this.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(newTrack);

    this.localStream.removeTrack(videoTrack);
    this.localStream.addTrack(newTrack);
    videoTrack.stop();
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  async sendEndCall(): Promise<void> {
    await this.sendSignal({
      type: 'call-end',
      sessionId: this.sessionId,
      fromUserId: this.userId,
      toUserId: this.remoteUserId,
      payload: null,
    });
  }

  cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    const channel = (this as any)._channel;
    if (channel) {
      // Fire and forget - remove channel
      import('@/lib/supabase/client').then(({ createClient }) => {
        const supabase = createClient();
        supabase.removeChannel(channel);
      });
      (this as any)._channel = null;
    }
  }
}

export function isWebRTCSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.RTCPeerConnection !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export async function requestMediaPermissions(type: CallType = 'voice'): Promise<{
  audio: boolean;
  video: boolean;
}> {
  try {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: type === 'video',
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const audio = stream.getAudioTracks().length > 0;
    const video = stream.getVideoTracks().length > 0;
    stream.getTracks().forEach(t => t.stop());
    return { audio, video };
  } catch (error) {
    console.error('Permission request failed:', error);
    return { audio: false, video: false };
  }
}
