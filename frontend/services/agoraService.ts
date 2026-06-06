import logger from '@/utils/logger';
import { Platform } from 'react-native';

let AgoraRTC: any = null;

class AgoraService {
  private client: any = null;
  private localAudioTrack: any = null;
  private localVideoTrack: any = null;
  private onRemoteUserJoined: ((user: any) => void) | null = null;
  private onRemoteUserLeft: ((user: any) => void) | null = null;
  private initialized: boolean = false;

  isSupported(): boolean {
    return Platform.OS === 'web';
  }

  private async init(): Promise<boolean> {
    if (!this.isSupported()) return false;
    if (this.initialized && AgoraRTC) return true;
    try {
      const module = await import('agora-rtc-sdk-ng');
      AgoraRTC = module.default || module;
      AgoraRTC.setLogLevel(3);
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to load Agora SDK:', error);
      return false;
    }
  }

  async joinVoiceCall(appId: string, channel: string, token: string, uid: number): Promise<boolean> {
    if (!(await this.init())) return false;
    try {
      this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this.setupRemoteHandlers();
      await this.client.join(appId, channel, token, uid);
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await this.client.publish([this.localAudioTrack]);
      return true;
    } catch (error) {
      logger.error('Agora voice join error:', error);
      return false;
    }
  }

  async joinVideoCall(appId: string, channel: string, token: string, uid: number): Promise<{ audioTrack: any; videoTrack: any }> {
    if (!(await this.init())) return { audioTrack: null, videoTrack: null };
    try {
      this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this.setupRemoteHandlers();
      await this.client.join(appId, channel, token, uid);
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      this.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      await this.client.publish([this.localAudioTrack, this.localVideoTrack]);
      return { audioTrack: this.localAudioTrack, videoTrack: this.localVideoTrack };
    } catch (error) {
      logger.error('Agora video join error:', error);
      return { audioTrack: null, videoTrack: null };
    }
  }

  private setupRemoteHandlers() {
    if (!this.client) return;
    this.client.on('user-published', async (user: any, mediaType: string) => {
      await this.client!.subscribe(user, mediaType);
      if (mediaType === 'audio') {
        user.audioTrack?.play();
      }
      if (mediaType === 'video') {
        this.onRemoteUserJoined?.(user);
      }
    });
    this.client.on('user-unpublished', (user: any, mediaType: string) => {
      if (mediaType === 'video') {
        this.onRemoteUserLeft?.(user);
      }
    });
    this.client.on('user-left', (user: any) => {
      this.onRemoteUserLeft?.(user);
    });
  }

  setRemoteUserHandlers(onJoined: (user: any) => void, onLeft: (user: any) => void) {
    this.onRemoteUserJoined = onJoined;
    this.onRemoteUserLeft = onLeft;
  }

  async toggleMute(muted: boolean): Promise<void> {
    if (this.localAudioTrack) {
      await this.localAudioTrack.setEnabled(!muted);
    }
  }

  async toggleCamera(off: boolean): Promise<void> {
    if (this.localVideoTrack) {
      await this.localVideoTrack.setEnabled(!off);
    }
  }

  async switchCamera(): Promise<void> {
    if (this.localVideoTrack && AgoraRTC) {
      try {
        const devices = await AgoraRTC.getCameras();
        if (devices.length > 1) {
          const currentLabel = this.localVideoTrack.getTrackLabel();
          const currentIndex = devices.findIndex((d: any) => d.label === currentLabel);
          const nextDevice = devices[(currentIndex + 1) % devices.length];
          await this.localVideoTrack.setDevice(nextDevice.deviceId);
        }
      } catch (e) {
        logger.log('Camera switch not supported:', e);
      }
    }
  }

  async leave(): Promise<void> {
    try {
      if (this.localAudioTrack) {
        this.localAudioTrack.stop();
        this.localAudioTrack.close();
        this.localAudioTrack = null;
      }
      if (this.localVideoTrack) {
        this.localVideoTrack.stop();
        this.localVideoTrack.close();
        this.localVideoTrack = null;
      }
      if (this.client) {
        await this.client.leave();
        this.client = null;
      }
    } catch (error) {
      logger.error('Agora leave error:', error);
    }
    this.onRemoteUserJoined = null;
    this.onRemoteUserLeft = null;
  }

  getLocalVideoTrack(): any {
    return this.localVideoTrack;
  }
}

export default new AgoraService();
