import logger from '@/utils/logger';

import { io, Socket } from 'socket.io-client';
import { getSocketUrl } from '@/constants/config';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private isManualDisconnect: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionCallbacks: Array<() => void> = [];
  private activeRetries: Set<ReturnType<typeof setInterval>> = new Set();

  connect(token: string) {
    if (this.socket?.connected) return;

    this.isManualDisconnect = false;
    const socketUrl = getSocketUrl();
    logger.log('Connecting to socket:', socketUrl);

    this.socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 60000,
      autoConnect: true,
      forceNew: true,
      query: {
        token
      }
    });

    this.socket.on('connect', () => {
      logger.log('Socket connected');
      this.reconnectAttempts = 0;
      
      this.reattachListeners();
      
      this.connectionCallbacks.forEach(cb => cb());
    });

    this.socket.on('disconnect', (reason) => {
      logger.log('Socket disconnected:', reason);
      
      if (this.isManualDisconnect) {
        return;
      }

      if (reason === 'io server disconnect') {
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      if (this.reconnectAttempts <= 3) {
        logger.warn(`Socket connection error (attempt ${this.reconnectAttempts}):`, error.message || (error as any).type || error);
      }
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (this.reconnectAttempts === this.maxReconnectAttempts) {
          logger.log('Socket: Running in offline mode (real-time features unavailable)');
        }
        this.scheduleReconnect();
      }
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      logger.log(`Reconnecting... attempt ${attemptNumber}`);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      logger.log(`Reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = 0;
    });

    this.socket.on('reconnect_failed', () => {
      logger.error('Socket reconnection failed after all attempts');
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(120000, 30000 * Math.floor(this.reconnectAttempts / 10));

    this.reconnectTimer = setTimeout(() => {
      if (!this.socket?.connected && !this.isManualDisconnect) {
        logger.log('Attempting manual reconnection...');
        this.socket?.connect();
      }
    }, delay);
  }

  private reattachListeners() {
    this.listeners.forEach((callbacks, event) => {
      // Remove all existing socket-level listeners for this event before
      // re-adding them. Without this, every reconnect multiplies the handlers
      // which causes duplicate chat messages, missed incoming calls (busy
      // response on the second handler), and other ghost events.
      this.socket?.off(event);
      callbacks.forEach(callback => {
        if (this.socket) {
          this.socket.on(event, (...args) => callback(...args));
        }
      });
    });
  }

  onConnect(callback: () => void) {
    this.connectionCallbacks.push(callback);
    if (this.socket?.connected) {
      callback();
    }
  }

  /** One-shot onConnect — fires once then removes itself from the queue.
   *  Use this for call-accept / call-decline events that must not repeat
   *  on every subsequent socket reconnect during the same session. */
  onConnectOnce(callback: () => void) {
    if (this.socket?.connected) {
      callback();
      return;
    }
    const fireOnce = () => {
      const idx = this.connectionCallbacks.indexOf(fireOnce);
      if (idx >= 0) this.connectionCallbacks.splice(idx, 1);
      callback();
    };
    this.connectionCallbacks.push(fireOnce);
  }

  disconnect() {
    this.activeRetries.forEach(id => clearInterval(id));
    this.activeRetries.clear();

    if (this.socket) {
      this.isManualDisconnect = true;
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
      this.connectionCallbacks = [];

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  emit(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }
  
  async emitWithRetry(event: string, data: any, retries: number = 3) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
      return;
    }
    
    logger.log(`Socket not connected, attempting to reconnect for ${event}...`);
    
    const connected = await this.ensureConnected();
    if (connected && this.socket?.connected) {
      this.socket.emit(event, data);
      logger.log(`Successfully emitted ${event} after reconnection`);
      return;
    }
    
    if (this.socket) {
      this.socket.connect();
    }
    
    let attempts = 0;
    const retryInterval = setInterval(() => {
      attempts++;
      if (this.socket?.connected) {
        this.activeRetries.delete(retryInterval);
        clearInterval(retryInterval);
        this.socket.emit(event, data);
        logger.log(`Successfully emitted ${event} after ${attempts} retry attempts`);
      } else if (attempts >= retries) {
        this.activeRetries.delete(retryInterval);
        clearInterval(retryInterval);
        logger.error(`Failed to emit ${event} after ${retries} attempts`);
      } else {
        this.socket?.connect();
      }
    }, 2000);
    this.activeRetries.add(retryInterval);
  }
  
  ensureConnected(token?: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.socket?.connected) {
        resolve(true);
        return;
      }
      
      if (token && !this.socket) {
        this.connect(token);
      } else if (this.socket) {
        this.socket.connect();
      }
      
      let attempts = 0;
      const maxAttempts = 10;
      const checkInterval = setInterval(() => {
        attempts++;
        if (this.socket?.connected) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 500);
    });
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);

    if (this.socket) {
      this.socket.on(event, (...args) => callback(...args));
    }
  }

  off(event: string, callback?: Function) {
    if (callback) {
      // Remove only the specific callback from the internal Map.
      const eventListeners = this.listeners.get(event) || [];
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
      // socket.off(event) removes ALL socket.io listeners for the event, not
      // just the one we want to remove.  We therefore clear all socket-level
      // handlers and re-register the remaining ones so other components that
      // share the same event (e.g. IncomingCallHandler + VoiceCallScreen both
      // listening to 'call:ended') are not silently destroyed.
      if (this.socket) {
        this.socket.off(event);
        const remaining = this.listeners.get(event) || [];
        remaining.forEach(cb => {
          this.socket?.on(event, (...args) => cb(...args));
        });
      }
    } else {
      // No specific callback — remove everything for this event.
      this.listeners.delete(event);
      if (this.socket) {
        this.socket.off(event);
      }
    }
  }

  joinChat(chatId: string) {
    this.emitWithRetry('chat:join', chatId, 5);
  }

  sendMessage(data: { chatId: string; text: string; senderId: string; receiverId?: string }) {
    this.emit('chat:message', data);
  }

  markMessagesRead(data: { chatId: string; userId: string; messageId?: string }) {
    this.emitWithRetry('chat:mark-read', data, 3);
  }

  onMessageStatus(callback: (data: { messageId: string; status: string }) => void) {
    this.on('chat:message-status', callback);
  }

  onMessageRead(callback: (data: { chatId: string; userId: string; readAt: string }) => void) {
    this.on('chat:message-read', callback);
  }

  onNewMessage(callback: (message: any) => void) {
    this.on('chat:new-message', callback);
  }

  sendTyping(data: { chatId: string; userId: string; isTyping: boolean }) {
    this.emit('chat:typing', data);
  }

  onTyping(callback: (data: { userId: string; isTyping: boolean }) => void) {
    this.on('chat:user-typing', callback);
  }

  setUserOnline(userId: string) {
    if (this.socket?.connected) {
      this.emit('user:online', userId);
    } else {
      this.onConnect(() => {
        this.emit('user:online', userId);
      });
    }
  }

  /** Tell the server the app moved to the background.
   *  The socket stays alive but the user cannot see messages, so the server
   *  must still deliver push notifications even though the socket is connected. */
  setUserBackground() {
    if (this.socket?.connected) {
      this.emit('user:background', undefined);
    }
  }

  /** Tell the server the app returned to the foreground.
   *  Push notifications should stop being sent because the user can now see
   *  incoming messages directly in the UI. */
  setUserForeground() {
    if (this.socket?.connected) {
      this.emit('user:foreground', undefined);
    }
  }

  onUserStatus(callback: (data: { userId: string; status: string }) => void) {
    this.on('user:status', callback);
  }

  initiateCall(data: { targetUserId: string; callData: any; callerInfo: { name: string; photo: string; id: string } }) {
    this.emitWithRetry('call:initiate', data, 5);
  }

  acceptCall(data: { callerId: string; callData: any }) {
    this.emitWithRetry('call:accept', data, 3);
  }

  declineCall(data: { callerId: string; callType?: string }) {
    this.emitWithRetry('call:decline', data, 3);
  }

  busyCall(data: { callerId: string; callType?: string }) {
    this.emitWithRetry('call:busy', data, 3);
  }

  endCall(data: { targetUserId: string; callType?: string; duration?: number; wasAnswered?: boolean }) {
    this.emitWithRetry('call:end', data, 3);
  }
  
  missedCall(data: { targetUserId: string; callType?: string }) {
    this.emitWithRetry('call:missed', data, 3);
  }

  onIncomingCall(callback: (data: { callData: any; callerInfo: { name: string; photo: string; id: string }; callerId: string }) => void) {
    this.on('call:incoming', callback);
  }

  onCallAccepted(callback: (data: { acceptedBy: string; callData: any }) => void) {
    this.on('call:accepted', callback);
  }

  onCallDeclined(callback: (data: { declinedBy: string }) => void) {
    this.on('call:declined', callback);
  }

  onCallBusy(callback: (data: { targetUserId: string }) => void) {
    this.on('call:busy', callback);
  }

  onCallEnded(callback: (data: { endedBy: string }) => void) {
    this.on('call:ended', callback);
  }
}

export default new SocketService();
