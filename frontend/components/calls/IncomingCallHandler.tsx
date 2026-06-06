import logger from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Platform,
  Vibration,
  AppState,
} from 'react-native';
import { SafeImage } from '@/components/SafeImage';
import { ThemedText } from '@/components/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Audio } from '../../utils/expoAvCompat';
import { useAuth } from '@/hooks/useAuth';
import socketService from '@/services/socket';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallContext } from '@/contexts/CallContext';
import {
  displayIncomingCall,
  endCallKeepCall,
  reportCallEnded,
  setupCallKeepListeners,
  removeCallKeepListeners,
  setCallActive,
} from '@/services/callkeep';
import {
  displayMissedCallNotification,
  stopCallForegroundService,
  cancelIncomingCallNotification,
} from '@/services/notifeeService';
import { callStateRef } from '@/utils/callStateRef';
import { navigateToCallScreen } from '@/utils/navigateToCallScreen';

interface IncomingCallData {
  callData: any;
  callerInfo: {
    name: string;
    photo: string;
  };
  callerId: string;
}

const AUTO_DISMISS_MS = 30000;

export default function IncomingCallHandler() {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const { setActiveCall, clearCall, activeCall } = useCallContext();

  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const isVisibleRef = useRef(false);
  const activeCallRef = useRef(activeCall);
  const incomingCallRef = useRef<IncomingCallData | null>(null);
  /* Timestamp of the most recent call:ended / dismissal so we can ignore a
   * call:incoming that arrives within a brief window of a call just ending.
   * Without this guard, the async useEffect that syncs activeCallRef can lag
   * behind clearCall(), causing a false-busy response to the next caller. */
  const callEndedAtRef = useRef<number>(0);
  /* Holds a stable reference to consumePendingCall so the globals useEffect
   * can expose __injectPendingCall without depending on the cold-start
   * useEffect's closure. */
  const consumePendingCallRef = useRef<((pending: any) => void) | null>(null);

  useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  const slideAnim   = useRef(new Animated.Value(-300)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const ringtoneRef = useRef<Audio.Sound | null>(null);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDismissRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseLoopRef      = useRef<any>(null);

  /* ── ringtone ── */
  const stopRingtone = useCallback(async () => {
    if (hapticIntervalRef.current) {
      clearInterval(hapticIntervalRef.current);
      hapticIntervalRef.current = null;
    }
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
    if (pulseLoopRef.current) {
      pulseLoopRef.current.stop();
      pulseLoopRef.current = null;
    }
    Vibration.cancel();
    try {
      if (ringtoneRef.current) {
        const s = ringtoneRef.current;
        ringtoneRef.current = null;
        await s.stopAsync().catch(() => {});
        await s.unloadAsync().catch(() => {});
      }
    } catch {}
    /* Use speaker (default) routing here, NOT earpiece. Setting
     * playThroughEarpieceAndroid: true puts the system into MODE_IN_CALL,
     * which blocks the WebView WebRTC mic and silences both sides of voice
     * calls after accept. The call screen manages its own audio mode. */
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });
    } catch {}
  }, []);

  const playRingtone = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/mixkit-waiting-ringtone-1354.wav'),
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      ringtoneRef.current = sound;
      Vibration.vibrate([500, 1000, 500], true);
    } catch (err) {
      logger.log('Ringtone error:', err);
      Vibration.vibrate([500, 1000, 500], true);
    }
  }, []);

  /* ── dismiss UI ── */
  const dismissModal = useCallback(() => {
    // Clear the busy-check refs IMMEDIATELY — before the animation starts.
    // Without this, a new call:incoming socket event arriving during the
    // 280 ms animation would see isVisibleRef.current = true and incorrectly
    // send call:busy, even though the user has already accepted or the call
    // has already ended.
    isVisibleRef.current = false;
    incomingCallRef.current = null;
    logger.log('[IncomingCallHandler] dismissModal: refs cleared immediately');

    // Stop the foreground service on every dismissal path (answer, decline,
    // remote ended/declined, auto-dismiss, notification tap).
    // Fire-and-forget — dismissal must not block the animation.
    stopCallForegroundService().catch(() => {});

    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -300, duration: 280, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => {
      setIsVisible(false);
      setIncomingCall(null);
    });
  }, [slideAnim, opacityAnim]);

  /* ── dismiss any presented "Incoming call" notifications for this caller ────
   *    Uses Notifee's cancel API (the call notification was posted by Notifee,
   *    not expo-notifications, so expo-notifications APIs can't find it).
   *    Also falls back to expo-notifications for any residual Expo-posted call
   *    banners so all paths are covered. ── */
  const dismissCallNotificationsForCaller = useCallback(async (callerId?: string) => {
    // Primary: cancel the Notifee call notification (the full-screen one).
    if (callerId && Platform.OS === 'android') {
      try {
        await cancelIncomingCallNotification(callerId);
        logger.log('[IncomingCallHandler] Notifee call notification cancelled for caller:', callerId);
      } catch (err) {
        logger.warn('[IncomingCallHandler] Notifee cancelIncomingCallNotification failed:', err);
      }
    }
    // Fallback: also dismiss any expo-notifications call banners.
    // Match all call-related types — the backend may send 'voice_call',
    // 'video_call', 'call', 'incoming_call', or 'INCOMING_CALL'.
    try {
      const CALL_NOTIF_TYPES = new Set(['call', 'voice_call', 'video_call', 'incoming_call', 'INCOMING_CALL']);
      const presented = await Notifications.getPresentedNotificationsAsync();
      await Promise.all(
        presented
          .filter((n) => {
            const d: any = n.request?.content?.data || {};
            if (!CALL_NOTIF_TYPES.has(d.type)) return false;
            if (callerId && d.callerId && d.callerId !== callerId) return false;
            return true;
          })
          .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
      );
    } catch (err) {
      logger.warn('[IncomingCallHandler] expo-notifications dismiss failed (non-fatal):', err);
    }
  }, []);

  /* ── present a local "Missed {voice|video} call from {name}" notification
   *    on the callee's own device. Used when the auto-dismiss timer fires
   *    (the callee never answered) so the lock-screen "Incoming call…" banner
   *    is replaced by an actionable missed-call entry that survives even if
   *    the backend's missed-call push is delayed or lost in transit. ── */
  const presentLocalMissedCallNotification = useCallback(
    async (data: IncomingCallData) => {
      try {
        const callerName = data.callerInfo?.name || 'Unknown';
        const callType = data.callData?.callType || 'audio';
        const isVideo = callType === 'video';
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Missed ${isVideo ? 'video' : 'voice'} call`,
            body: `from ${callerName}`,
            data: {
              type: 'missed_call',
              screen: 'ChatDetail',
              callerId: data.callerId,
              senderId: data.callerId,
              senderName: callerName,
              senderPhoto: data.callerInfo?.photo || '',
              callType,
            },
            sound: 'default',
          },
          trigger: null,
        });
      } catch (err) {
        logger.warn('[Notifications] present local missed-call failed:', err);
      }
    },
    [],
  );

  const showCallUI = useCallback(async (data: IncomingCallData) => {
    logger.log('[IncomingCallHandler] showCallUI — callerId:', data.callerId,
      'callerName:', data.callerInfo?.name, 'callType:', data.callData?.callType,
      'appState:', AppState.currentState);

    setIncomingCall(data);
    setIsVisible(true);

    // Fire-and-forget — must NOT be awaited and must have .catch() so a
    // rejection (e.g. haptics not supported on device) never becomes an
    // unhandled promise rejection that crashes the Hermes runtime.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

    const callerName = data.callerInfo?.name || 'Unknown';
    const hasVideo   = data.callData?.callType === 'video';
    // Per product requirement: when the app is in the FOREGROUND, do not
    // trigger the native CallKit / ConnectionService full-screen takeover —
    // the in-app banner card (this Modal) is enough. The native screen is
    // still required when the app is backgrounded or killed, otherwise the
    // user has no way to know a call is coming in.
    const isForeground = AppState.currentState === 'active';
    logger.log('[IncomingCallHandler] showCallUI — isForeground:', isForeground,
      '— will trigger CallKeep native UI:', !isForeground && Platform.OS !== 'web');
    if (Platform.OS !== 'web' && !isForeground) {
      // Also fire-and-forget with catch — a CallKeep rejection must not
      // propagate as an unhandled rejection and crash the app.
      Promise.resolve(displayIncomingCall(data.callerId, callerName, hasVideo)).catch(() => {});
    }

    await playRingtone();
    logger.log('[IncomingCallHandler] showCallUI — ringtone started, auto-dismiss in', AUTO_DISMISS_MS, 'ms');

    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 55, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current = loop;
    loop.start();

    hapticIntervalRef.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }, 2200);

    autoDismissRef.current = setTimeout(async () => {
      await stopRingtone();
      reportCallEnded(data.callerId);
      socketService.missedCall?.({ targetUserId: data.callerId, callType: data.callData?.callType || 'audio' });
      dismissModal();
      // Replace the "Incoming call…" lock-screen banner with a "Missed call
      // from X" notification on THIS device. Without this, the callee's
      // original ringing notification just disappeared silently and no
      // lock-screen entry replaced it (the backend's missed-call push only
      // fires for the *caller*'s timeout, not the callee's).
      await dismissCallNotificationsForCaller(data.callerId);
      await presentLocalMissedCallNotification(data);
    }, AUTO_DISMISS_MS);
  }, [
    playRingtone,
    slideAnim,
    opacityAnim,
    pulseAnim,
    stopRingtone,
    dismissModal,
    dismissCallNotificationsForCaller,
    presentLocalMissedCallNotification,
  ]);

  /* ── Early CallKeep initialization ── */
  /* Initialize CallKeep as soon as IncomingCallHandler mounts — before any
   * call event could arrive — so the native ConnectionService is ready.
   * Without this, CallKeep is only initialized lazily inside displayIncomingCall
   * which is too late when a call arrives while the module hasn't loaded yet. */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    import('@/services/callkeep').then(({ initCallKeep }) => {
      initCallKeep('Emorii').then(() => {
        logger.log('[IncomingCallHandler] CallKeep early init complete');
      }).catch((err) => {
        logger.warn('[IncomingCallHandler] CallKeep early init failed (non-fatal):', err);
      });
    }).catch(() => {});
  }, []);

  /* ── CallKeep native UI event listeners ── */
  useEffect(() => {
    if (Platform.OS === 'web') return;

    setupCallKeepListeners({
      onAnswer: (callerId) => {
        logger.log('[CallKeep] Native answer pressed — callerId:', callerId);

        /* Cold-start path: the user pressed "Answer" on the native
         * CallKit / ConnectionService screen before the app had time to mount
         * IncomingCallHandler and process global.__pendingVoipCall through the
         * socket useEffect. incomingCallRef.current is null at this point, so
         * fall back to the global pending call data directly. */
        let call = incomingCallRef.current;
        if (!call) {
          const pending = (global as any).__pendingVoipCall;
          if (pending) {
            call = {
              callerId:   pending.callerId,
              callerInfo: { name: pending.callerName ?? 'Unknown', photo: pending.callerPhoto ?? '' },
              callData:   { callType: pending.callType ?? 'voice', ...pending.callData },
            };
            (global as any).__pendingVoipCall = null;
          }
        }

        if (!call) {
          logger.warn('[CallKeep] onAnswer: no call data — cannot navigate.');
          return;
        }

        stopRingtone();

        /* Use onConnectOnce so that if the socket hasn't connected yet on cold
         * start we still deliver the accept once the connection is ready.
         * onConnectOnce (not onConnect) removes itself after firing, so the
         * stale accept is not re-sent on every subsequent socket reconnect. */
        const doAccept = () =>
          socketService.acceptCall({ callerId: call!.callerId, callData: call!.callData });
        if (socketService.isConnected()) {
          doAccept();
        } else {
          socketService.onConnectOnce(doAccept);
        }
        setCallActive(call.callerId);

        const callTypeFromData = call.callData?.callType === 'video' ? 'video' : 'voice';
        setActiveCall({
          userId:     call.callerId,
          userName:   call.callerInfo?.name || 'Unknown',
          userPhoto:  call.callerInfo?.photo,
          isIncoming: true,
          callStatus: 'connected',
          callType:   callTypeFromData,
          duration:   0,
        });

        setIsVisible(false);
        setIncomingCall(null);

        navigateToCallScreen(callTypeFromData === 'video' ? 'VideoCall' : 'VoiceCall', {
          userId:       call.callerId,
          userName:     call.callerInfo?.name || 'Unknown',
          userPhoto:    call.callerInfo?.photo || '',
          isIncoming:   true,
          callData:     call.callData,
          callerId:     call.callerId,
          callAccepted: true,
        });
      },
      onEnd: (callerId) => {
        logger.log('[CallKeep] Native end/decline pressed — callerId:', callerId);
        /* Also check global pending call on cold start for decline */
        const call = incomingCallRef.current ?? (() => {
          const pending = (global as any).__pendingVoipCall;
          if (pending) {
            (global as any).__pendingVoipCall = null;
            return { callerId: pending.callerId } as any;
          }
          return null;
        })();
        if (!call) return;
        stopRingtone();
        socketService.declineCall({ callerId: call.callerId });
        dismissModal();
      },
    });

    return () => {
      removeCallKeepListeners();
    };
  }, []);

  /* ── Early cold-start pending VoIP call (before auth loads) ── */
  /* This effect runs once on mount — before the socket useEffect (which is
   * gated on auth loading). By populating incomingCallRef immediately we
   * ensure the CallKeep onAnswer handler has call data available even if the
   * native "Answer" button was pressed the moment the app opened.
   *
   * If answeredFromNotification is true, the user already tapped "Answer"
   * on the Notifee full-screen notification. Skip the in-app ringing UI
   * and go straight to the call screen so they aren't presented with a
   * second "Answer / Decline" prompt. */
  useEffect(() => {
    // Helper: consume a resolved pending call object regardless of how it
    // was recovered (global or AsyncStorage).
    const consumePendingCall = (pending: any) => {
      // Auto-accept when EITHER:
      //  a) The push payload already marked the notification as answered, OR
      //  b) __pendingAnswerFromNotification was set by __answerCallFromNotification
      //     when it fired before ICH had loaded the call data from AsyncStorage.
      const pendingAnswerFlag = !!(global as any).__pendingAnswerFromNotification;
      const notifAnswered = pending.answeredFromNotification || pendingAnswerFlag;
      if (pendingAnswerFlag) {
        (global as any).__pendingAnswerFromNotification = null;
      }
      if (notifAnswered) {
        // User already pressed "Answer" on the notification — go straight
        // to the call screen without showing the in-app ringing banner.
        logger.log('[IncomingCallHandler] cold-start: auto-answering',
          '| answeredFromNotif:', pending.answeredFromNotification,
          '| pendingAnswerFlag:', pendingAnswerFlag,
          '| callerId:', pending.callerId, '| callType:', pending.callType);

        const callTypeFromData = pending.callType === 'video' ? 'video' : 'voice';
        const callData = { callType: pending.callType ?? 'voice', ...pending.callData };
        const photo = pending.callerPhoto ?? '';

        // CRITICAL: stop the foreground service that was keeping the headless
        // JS process alive. The Notifee background handler also calls this,
        // but they run in separate JS contexts on cold-start so the key may
        // not have been written yet by the time IncomingCallHandler mounts.
        // Writing it here guarantees it is set in the main app's context.
        stopCallForegroundService().catch(() => {});

        stopRingtone();

        const doAccept = () => {
          logger.log('[IncomingCallHandler] cold-start: emitting call:accept for callerId:', pending.callerId);
          socketService.acceptCall({ callerId: pending.callerId, callData });
        };
        if (socketService.isConnected()) {
          doAccept();
        } else {
          logger.log('[IncomingCallHandler] cold-start: socket not connected yet — queuing accept via onConnectOnce');
          socketService.onConnectOnce(doAccept);
        }

        setActiveCall({
          userId:     pending.callerId,
          userName:   pending.callerName ?? 'Unknown',
          userPhoto:  photo,
          isIncoming: true,
          callStatus: 'connected',
          callType:   callTypeFromData,
          duration:   0,
        });

        logger.log('[IncomingCallHandler] cold-start: navigating to', callTypeFromData === 'video' ? 'VideoCall' : 'VoiceCall');
        navigateToCallScreen(callTypeFromData === 'video' ? 'VideoCall' : 'VoiceCall', {
          userId:       pending.callerId,
          userName:     pending.callerName ?? 'Unknown',
          userPhoto:    photo,
          isIncoming:   true,
          callData,
          callerId:     pending.callerId,
          callAccepted: true,
        });
      } else {
        logger.log('[IncomingCallHandler] cold-start: showing in-app ringing UI for callerId:', pending.callerId);
        showCallUI({
          callerId:   pending.callerId,
          callerInfo: { name: pending.callerName ?? 'Unknown', photo: pending.callerPhoto ?? '' },
          callData:   { callType: pending.callType ?? 'voice', ...pending.callData },
        }).catch((err) => {
          logger.error('[IncomingCallHandler] consumePendingCall showCallUI threw:', err);
        });
      }
    };

    // Store a stable ref so the globals useEffect can call consumePendingCall
    // via __injectPendingCall even after this closure has already returned.
    consumePendingCallRef.current = consumePendingCall;

    // 1. Fast path — global is set when the FCM/Notifee handler and the app
    //    share the same JS context (e.g. app was backgrounded, not killed).
    const pending = (global as any).__pendingVoipCall;
    if (pending && !incomingCallRef.current) {
      logger.log('[IncomingCallHandler] mount: found global.__pendingVoipCall, consuming');
      (global as any).__pendingVoipCall = null;
      consumePendingCall(pending);
      return;
    }

    // 2. AsyncStorage fallback — each headless task (FCM background handler,
    //    Notifee background event) runs in its own isolated JS context.  When
    //    the app cold-starts from a killed state the global set by those
    //    handlers is NOT visible here.  We persist call data to AsyncStorage
    //    in both handlers so it survives the context boundary.
    if (!incomingCallRef.current) {
      logger.log('[IncomingCallHandler] mount: checking AsyncStorage for pending call');
      AsyncStorage.getItem('@emorii_pending_call').then(async (raw) => {
        if (!raw) {
          logger.log('[IncomingCallHandler] mount: no pending call in AsyncStorage');
          return;
        }
        let saved: any;
        try { saved = JSON.parse(raw); } catch { return; }
        // Discard stale entries (caller gave up more than 2 minutes ago).
        const age = Date.now() - (saved.timestamp || 0);
        if (age > 120_000) {
          logger.log('[IncomingCallHandler] mount: discarding stale pending call (age:', age, 'ms)');
          await AsyncStorage.removeItem('@emorii_pending_call').catch(() => {});
          return;
        }
        logger.log('[IncomingCallHandler] mount: found pending call in AsyncStorage, callerId:', saved.callerId,
          'answeredFromNotification:', saved.answeredFromNotification, 'age:', age, 'ms');
        await AsyncStorage.removeItem('@emorii_pending_call').catch(() => {});
        if (!incomingCallRef.current) {
          consumePendingCall(saved);
        }
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Register global FCM foreground call handler ── */
  /* IncomingCallHandler is the only component that owns the call UI state,
   * so we expose showCallUI and the cancel path as globals that the foreground
   * FCM listener (notifications.ts) can invoke without a direct import.
   * These are set on mount and cleared on unmount so stale references are
   * never kept alive beyond this component's lifetime. */
  useEffect(() => {
    // ── Called by navigateFromNotification (App.tsx Path C) when the app
    // cold-starts from a killed state and the push payload has no Agora params.
    // By the time Path C fires (auth must be loaded), IncomingCallHandler is
    // already mounted and this global is set — so we can consume the pending
    // call directly rather than relying on the already-completed mount effect.
    (global as any).__injectPendingCall = (pending: any) => {
      logger.log('[IncomingCallHandler] __injectPendingCall triggered — callerId:', pending?.callerId);
      if (incomingCallRef.current) {
        logger.log('[IncomingCallHandler] __injectPendingCall: already showing a call — ignoring');
        return;
      }
      consumePendingCallRef.current?.(pending);
    };

    (global as any).__showIncomingCallFromFCM = (data: IncomingCallData) => {
      logger.log('[IncomingCallHandler] __showIncomingCallFromFCM triggered — callerId:', data.callerId);
      const currentActiveCall = activeCallRef.current;
      const currentlyVisible  = isVisibleRef.current;
      const inActiveCall = currentActiveCall && (
        currentActiveCall.callStatus === 'connected' ||
        currentActiveCall.callStatus === 'ringing'   ||
        currentActiveCall.callStatus === 'connecting'
      );
      // Check BOTH the local socket-event ref and the module-level ref that
      // VoiceCallScreen/VideoCallScreen updates when they clear the call.
      // This covers the case where the RECEIVER hung up: socket call:ended
      // only goes to the caller, so callEndedAtRef is never set here.
      const lastEndedAt = Math.max(callEndedAtRef.current, callStateRef.lastCallEndedAt);
      const msSinceCallEnded = Date.now() - lastEndedAt;
      const withinEndGrace = msSinceCallEnded < 3000;
      logger.log('[IncomingCallHandler] __showIncomingCallFromFCM busy-check — inActiveCall:', inActiveCall,
        'withinEndGrace:', withinEndGrace, 'msSince:', msSinceCallEnded, 'currentlyVisible:', currentlyVisible);
      if ((inActiveCall && !withinEndGrace) || currentlyVisible) {
        logger.log('[IncomingCallHandler] __showIncomingCallFromFCM: already in call — sending busy');
        socketService.busyCall({
          callerId: data.callerId,
          callType: data.callData?.callType || 'audio',
        });
        return;
      }
      showCallUI(data).catch((err) => {
        logger.error('[IncomingCallHandler] __showIncomingCallFromFCM showCallUI threw:', err);
      });
    };

    (global as any).__cancelIncomingCallFromFCM = (callerId: string) => {
      logger.log('[IncomingCallHandler] __cancelIncomingCallFromFCM triggered — callerId:', callerId);
      const call = incomingCallRef.current;
      if (!call || call.callerId !== callerId) return;
      stopRingtone().catch(() => {});
      dismissModal();
    };

    // ── Called by the Notifee FOREGROUND event handler when the user taps
    // "Answer" on the call notification while the app is already in the
    // foreground (e.g. opened by fullScreenAction, then user swipes down
    // the shade and taps the action button). This mirrors handleAccept but
    // is invoked from outside the component tree.
    (global as any).__answerCallFromNotification = () => {
      logger.log('[IncomingCallHandler] __answerCallFromNotification triggered');
      const call = incomingCallRef.current;
      if (!call) {
        // ICH hasn't loaded call data yet (AsyncStorage read still in flight on
        // cold start, or socket was disconnected while backgrounded).
        // Set a flag so consumePendingCall auto-accepts as soon as it resolves.
        // Return false so navigateFromNotification knows to fall through to
        // Path B / Path C, which will inject the call data with Agora params.
        (global as any).__pendingAnswerFromNotification = true;
        logger.warn('[IncomingCallHandler] __answerCallFromNotification: call data not ready yet — queuing auto-accept via __pendingAnswerFromNotification');
        return false;
      }
      socketService.acceptCall({ callerId: call.callerId, callData: call.callData });
      setCallActive(call.callerId);
      // Clear busy-check refs immediately before any animation/state update.
      isVisibleRef.current    = false;
      incomingCallRef.current = null;
      setIsVisible(false);
      stopRingtone().catch(() => {});
      stopCallForegroundService().catch(() => {});
      if (Platform.OS === 'android') {
        cancelIncomingCallNotification(call.callerId).catch(() => {});
      }
      const callTypeFromData = call.callData?.callType === 'video' ? 'video' : 'voice';
      setActiveCall({
        userId:     call.callerId,
        userName:   call.callerInfo?.name || 'Unknown',
        userPhoto:  call.callerInfo?.photo,
        isIncoming: true,
        callStatus: 'connected',
        callType:   callTypeFromData,
        duration:   0,
      });
      setIncomingCall(null);
      navigateToCallScreen(callTypeFromData === 'video' ? 'VideoCall' : 'VoiceCall', {
        userId:       call.callerId,
        userName:     call.callerInfo?.name || 'Unknown',
        userPhoto:    call.callerInfo?.photo || '',
        isIncoming:   true,
        callData:     call.callData,
        callerId:     call.callerId,
        callAccepted: true,
      });
      return true;
    };

    // ── Called by the Notifee FOREGROUND event handler when the user taps
    // "Decline" on the call notification while the app is already in the
    // foreground. Mirrors handleDecline but invoked from outside the tree.
    (global as any).__declineCallFromNotification = () => {
      logger.log('[IncomingCallHandler] __declineCallFromNotification triggered');
      const call = incomingCallRef.current;
      if (!call) {
        logger.warn('[IncomingCallHandler] __declineCallFromNotification: no active call — ignoring');
        return;
      }
      stopRingtone().catch(() => {});
      endCallKeepCall(call.callerId);
      socketService.declineCall({ callerId: call.callerId });
      dismissModal();
    };

    return () => {
      (global as any).__injectPendingCall              = null;
      (global as any).__showIncomingCallFromFCM        = null;
      (global as any).__cancelIncomingCallFromFCM      = null;
      (global as any).__answerCallFromNotification     = null;
      (global as any).__declineCallFromNotification    = null;
      // Clear any lingering pending-answer flag so it doesn't bleed into the
      // next call attempt after ICH unmounts and remounts.
      (global as any).__pendingAnswerFromNotification  = null;
    };
  }, [showCallUI, stopRingtone, dismissModal, setActiveCall, setIncomingCall]);

  /* ── Socket listeners ── */
  useEffect(() => {
    const myUserId = (user as any)?._id || user?.id;
    if (!myUserId || !token) return;

    const handleIncomingCall = async (data: IncomingCallData) => {
      try {
        logger.log('[IncomingCallHandler] socket call:incoming received — callerId:', data.callerId,
          'callType:', data.callData?.callType);

        const currentActiveCall = activeCallRef.current;
        const currentlyVisible = isVisibleRef.current;

        const inActiveCall = currentActiveCall && (
          currentActiveCall.callStatus === 'connected' ||
          currentActiveCall.callStatus === 'ringing' ||
          currentActiveCall.callStatus === 'connecting'
        );

        // Grace window: ignore call:incoming that arrives within 3 s of a call
        // ending. Two sources of truth:
        //  1. callEndedAtRef — set when THIS device receives a call:ended socket
        //     event (i.e. the CALLER hung up on us).
        //  2. callStateRef.lastCallEndedAt — set by VoiceCallScreen when WE hung
        //     up (the socket call:ended goes to the OTHER side, so callEndedAtRef
        //     never updates in that case). This fixes the "false busy" that occurs
        //     when the receiver presses End and immediately gets another call.
        const lastEndedAt = Math.max(callEndedAtRef.current, callStateRef.lastCallEndedAt);
        const msSinceCallEnded = Date.now() - lastEndedAt;
        const withinEndGrace = msSinceCallEnded < 3000;

        logger.log('[IncomingCallHandler] call:incoming busy-check — inActiveCall:', inActiveCall,
          'withinEndGrace:', withinEndGrace, 'msSince:', msSinceCallEnded, 'currentlyVisible:', currentlyVisible);

        if ((inActiveCall && !withinEndGrace) || currentlyVisible) {
          logger.log('[IncomingCallHandler] busy — sending call:busy for callerId:', data.callerId);
          socketService.busyCall({
            callerId: data.callerId,
            callType: data.callData?.callType || 'audio',
          });
          return;
        }

        await showCallUI(data);
      } catch (err) {
        // A crash inside handleIncomingCall would be an unhandled promise
        // rejection on Hermes, which terminates the process. Catch everything
        // here so a bad call payload or a native module error never closes
        // the app for user B while they are in the foreground.
        logger.error('[IncomingCallHandler] handleIncomingCall threw unexpectedly:', err);
      }
    };

    const handleCallEnded = async (data?: any) => {
      logger.log('[IncomingCallHandler] socket call:ended received — data:', JSON.stringify(data));
      // Stamp BOTH refs so the grace window is consistent regardless of which
      // component reads it next.
      callEndedAtRef.current = Date.now();
      callStateRef.lastCallEndedAt = callEndedAtRef.current;
      await stopRingtone();
      const call = incomingCallRef.current;
      const cId = call?.callerId || data?.endedBy || data?.callerId;
      if (call) reportCallEnded(call.callerId);
      await dismissCallNotificationsForCaller(cId);

      /* If the call was never answered (we were still ringing when the caller
       * hung up), show a styled "Missed call from X" notification with a
       * "Call Back" button. The backend's sendMissedCallPush covers the killed
       * app case; this covers the foreground/background socket path. */
      if (call) {
        logger.log('[IncomingCallHandler] call ended before answer — showing missed call notification for:', call.callerInfo?.name);
        displayMissedCallNotification({
          callerId:    call.callerId,
          callerName:  call.callerInfo?.name || 'Unknown',
          callerPhoto: call.callerInfo?.photo || '',
          callType:    call.callData?.callType || 'voice',
        }).catch(() => {});
      }

      dismissModal();
    };

    const handleCallDeclined = async (data?: any) => {
      logger.log('[IncomingCallHandler] socket call:declined received — data:', JSON.stringify(data));
      await stopRingtone();
      const call = incomingCallRef.current;
      const cId = call?.callerId || data?.callerId;
      if (call) reportCallEnded(call.callerId);
      await dismissCallNotificationsForCaller(cId);
      dismissModal();
    };

    socketService.onIncomingCall(handleIncomingCall);
    socketService.on('call:ended', handleCallEnded);
    socketService.on('call:declined', handleCallDeclined);

    /* Note: global.__pendingVoipCall is consumed by the early cold-start
     * effect (useEffect([], [])) which runs before this auth-gated effect.
     * No need to re-check it here. */

    return () => {
      // IMPORTANT: use specific-callback removal to avoid wiping VoiceCallScreen's
      // own 'call:ended' listener (which uses cbEndedRef). socketService.off()
      // without a callback nukes ALL listeners for the event, including ones
      // registered by other components that may be mounted simultaneously.
      socketService.off('call:incoming', handleIncomingCall);
      socketService.off('call:ended', handleCallEnded);
      socketService.off('call:declined', handleCallDeclined);
      stopRingtone();
    };
  }, [(user as any)?._id || user?.id, token]);

  /* ── Accept (in-app button) ── */
  const handleAccept = useCallback(async () => {
    // incomingCallRef is updated via a useEffect after the state update that
    // shows the banner, so it is always set by the time the user can tap.
    // We log explicitly so that a null ref (unexpected early tap) is visible.
    const call = incomingCallRef.current;
    if (!call) {
      logger.warn('[IncomingCallHandler] handleAccept: incomingCallRef is null — ignoring tap');
      return;
    }

    logger.log('[IncomingCallHandler] handleAccept — callerId:', call.callerId,
               'callType:', call.callData?.callType);

    // Emit call:accept to the server FIRST — before any async audio operations.
    // This is the critical path: every millisecond of delay here is extra
    // ringing the caller hears after the receiver tapped "Answer". The socket
    // emit is synchronous (queued instantly on the socket transport), so the
    // server receives it before stopRingtone() has even started its awaits.
    socketService.acceptCall({
      callerId: call.callerId,
      callData: call.callData,
    });
    logger.log('[IncomingCallHandler] accept event sent to caller:', call.callerId);

    // Mark the native ConnectionService / CallKit call as answered.
    setCallActive(call.callerId);
    // Clear busy-check refs IMMEDIATELY (same principle as dismissModal) so
    // that any call:incoming event that races with our accept path cannot
    // accidentally send call:busy while we are transitioning to the call screen.
    isVisibleRef.current    = false;
    incomingCallRef.current = null;
    setIsVisible(false);

    // Kill the ring guard synchronously, then unload audio concurrently.
    // Do NOT await stopRingtone() before navigating — the UI transition and
    // Agora join should not be gated on audio teardown.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopRingtone().catch(() => {});

    const callTypeFromData = call.callData?.callType === 'video' ? 'video' : 'voice';
    setActiveCall({
      userId:      call.callerId,
      userName:    call.callerInfo?.name || 'Unknown',
      userPhoto:   call.callerInfo?.photo,
      isIncoming:  true,
      callStatus:  'connected',
      callType:    callTypeFromData,
      duration:    0,
    });

    // Stop the foreground service and dismiss the Notifee call notification
    // before navigating.  If the user answered from the in-app banner while
    // the app was backgrounded, a Notifee full-screen notification may still
    // be posted; cancel it so the OS doesn't re-surface it after the nav.
    stopCallForegroundService().catch(() => {});
    if (Platform.OS === 'android') {
      cancelIncomingCallNotification(call.callerId).catch(() => {});
    }

    const targetScreen = callTypeFromData === 'video' ? 'VideoCall' : 'VoiceCall';
    logger.log('[IncomingCallHandler] handleAccept: navigating via navigateToCallScreen to', targetScreen);

    // Use navigateToCallScreen (retry loop) instead of navigation.navigate so
    // that if the navigator is not yet ready (app was backgrounded and the
    // route stack is still mounting after fullScreenAction brings it forward)
    // we keep retrying every 300 ms for up to 30 s rather than failing silently.
    navigateToCallScreen(targetScreen, {
      userId:       call.callerId,
      userName:     call.callerInfo?.name || 'Unknown',
      userPhoto:    call.callerInfo?.photo || '',
      isIncoming:   true,
      callData:     call.callData,
      callerId:     call.callerId,
      callAccepted: true,
    });

    setIncomingCall(null);
  }, [stopRingtone, setActiveCall]);

  /* ── Decline (in-app button) ── */
  const handleDecline = useCallback(async () => {
    const call = incomingCallRef.current;
    if (!call) return;
    await stopRingtone();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    endCallKeepCall(call.callerId);

    socketService.declineCall({ callerId: call.callerId });
    dismissModal();
  }, [stopRingtone, dismissModal]);

  if (!isVisible || !incomingCall) return null;

  const callType   = incomingCall.callData?.callType || 'voice';
  const isVideo    = callType === 'video';
  const callerName = incomingCall.callerInfo?.name || 'Unknown';

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDecline}
    >
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <Animated.View
          style={[
            styles.card,
            { marginTop: insets.top + 8, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <LinearGradient
            colors={['#16213e', '#0f3460', '#1a1a2e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          >
            <View style={styles.headerPill}>
              <Ionicons
                name={isVideo ? 'videocam' : 'call'}
                size={11}
                color="#a78bfa"
              />
              <ThemedText style={styles.headerPillText}>
                Incoming {isVideo ? 'Video' : 'Voice'} Call
              </ThemedText>
            </View>

            <View style={styles.callerRow}>
              <Animated.View style={[styles.avatarWrap, { transform: [{ scale: pulseAnim }] }]}>
                <SafeImage
                  source={{ uri: incomingCall.callerInfo?.photo || 'https://via.placeholder.com/80' }}
                  style={styles.avatar}
                />
                <View style={styles.liveIndicator} />
              </Animated.View>

              <View style={styles.callerText}>
                <ThemedText style={styles.callerName} numberOfLines={1}>
                  {callerName}
                </ThemedText>
                <ThemedText style={styles.callerSubtext}>
                  {isVideo ? '📹 Wants to video call…' : '📞 Wants to voice call…'}
                </ThemedText>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.actions}>
              <View style={styles.actionWrap}>
                <Pressable style={styles.declineBtn} onPress={handleDecline}>
                  <Ionicons
                    name="call"
                    size={26}
                    color="#FFF"
                    style={{ transform: [{ rotate: '135deg' }] }}
                  />
                </Pressable>
                <ThemedText style={styles.actionLabel}>Decline</ThemedText>
              </View>

              <View style={styles.actionWrap}>
                <Pressable style={styles.acceptBtn} onPress={handleAccept}>
                  <Ionicons
                    name={isVideo ? 'videocam' : 'call'}
                    size={26}
                    color="#FFF"
                  />
                </Pressable>
                <ThemedText style={styles.actionLabel}>Accept</ThemedText>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
  },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  gradient: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },

  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    marginBottom: 16,
  },
  headerPillText: { fontSize: 12, color: '#a78bfa', fontWeight: '600' },

  callerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  liveIndicator: {
    position: 'absolute',
    bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 2, borderColor: '#16213e',
  },
  callerText: { flex: 1 },
  callerName: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  callerSubtext: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 3 },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 18 },

  actions: { flexDirection: 'row', justifyContent: 'space-evenly' },
  actionWrap: { alignItems: 'center', gap: 8 },
  declineBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#dc2626',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  acceptBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#16a34a',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#16a34a', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  actionLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
});
