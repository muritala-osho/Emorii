import logger from '@/utils/logger';
import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  StatusBar,
  Vibration,
  Platform,
  Alert,
  Dimensions,
  BackHandler,
} from "react-native";
import { SafeImage } from "@/components/SafeImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "../utils/expoAvCompat";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import socketService from "@/services/socket";
import agoraService from "@/services/agoraService";
import { ensureMicPermission } from "@/utils/callPermissions";
import { useCallContext, CallStatus } from "@/contexts/CallContext";
import CallQualityRating from "@/components/calls/CallQualityRating";
import { callStateRef } from "@/utils/callStateRef";

import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
} from "@/utils/agoraNative";

/* Detect Expo Go — native modules unavailable there */
const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

const { width: SW } = Dimensions.get("window");
const AVATAR_SIZE = Math.min(SW * 0.42, 170);

/* ─────────────────────────────────────────────────────────────────
   Pulse ring — one animated ring, rendered 3x with staggered delay
───────────────────────────────────────────────────────────────── */
function PulseRing({ anim, size }: { anim: Animated.Value; size: number }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: "#10b981",
        transform: [{ scale: anim }],
        opacity: anim.interpolate({ inputRange: [1, 1.28], outputRange: [0.6, 0] }),
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────
   Audio wave bars — 5 bars that animate when not muted
───────────────────────────────────────────────────────────────── */
function WaveBars({ active }: { active: boolean }) {
  const bars = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3)),
  ).current;

  useEffect(() => {
    if (!active) {
      bars.forEach((b) => b.setValue(0.3));
      return;
    }
    const anims = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 70),
          Animated.timing(bar, { toValue: 1, duration: 320 + i * 50, useNativeDriver: true }),
          Animated.timing(bar, { toValue: 0.25, duration: 320 + i * 50, useNativeDriver: true }),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [active]);

  return (
    <View style={wave.row}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[wave.bar, { transform: [{ scaleY: bar }], opacity: active ? 0.9 : 0.2 }]}
        />
      ))}
    </View>
  );
}
const wave = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, height: 26 },
  bar: { width: 4, height: 22, borderRadius: 3, backgroundColor: "#34d399" },
});

function qualityToBars(q: number): { bars: number; color: string; label: string } {
  if (q === 0 || q === 8) return { bars: 0, color: "rgba(255,255,255,0.4)", label: "" };
  if (q === 1) return { bars: 4, color: "#34d399", label: "Excellent" };
  if (q === 2) return { bars: 3, color: "#34d399", label: "Good" };
  if (q === 3) return { bars: 2, color: "#fbbf24", label: "Fair" };
  if (q === 4) return { bars: 2, color: "#fbbf24", label: "Weak" };
  if (q === 5) return { bars: 1, color: "#f87171", label: "Poor" };
  return { bars: 0, color: "#f87171", label: "No signal" };
}

function SignalBars({ quality }: { quality: number }) {
  const { bars, color } = qualityToBars(quality);
  const heights = [4, 7, 10, 13];
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 13 }}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 1,
            backgroundColor: i < bars ? color : "rgba(255,255,255,0.2)",
          }}
        />
      ))}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Control button — circle icon + label
───────────────────────────────────────────────────────────────── */
function CtrlBtn({
  icon,
  label,
  active = false,
  danger = false,
  large = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  danger?: boolean;
  large?: boolean;
  onPress?: () => void;
}) {
  const size = large ? 68 : 56;
  const iconSize = large ? 30 : 24;
  const bg = danger
    ? "#dc2626"
    : active
    ? "#10b981"
    : "rgba(255,255,255,0.12)";

  return (
    <Pressable style={ctrl.wrap} onPress={onPress}>
      <View
        style={[
          ctrl.btn,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bg,
            shadowColor: danger ? "#dc2626" : active ? "#10b981" : "transparent",
            shadowOpacity: danger || active ? 0.45 : 0,
            shadowRadius: 12,
            elevation: danger || active ? 8 : 0,
          },
        ]}
      >
        <Ionicons name={icon} size={iconSize} color="#fff" />
      </View>
      <Text style={ctrl.label}>{label}</Text>
    </Pressable>
  );
}
const ctrl = StyleSheet.create({
  wrap: { alignItems: "center", gap: 6 },
  btn: { alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: "500" },
});

/* ─────────────────────────────────────────────────────────────────
   Module-level Agora engine singleton — survives minimize/unmount
   ─────────────────────────────────────────────────────────────────
   When the user minimizes a voice call, `handleMinimize` moves the
   live Agora engine out of `engineRef` (a component-local ref) into
   these module-level variables BEFORE calling navigation.goBack().
   The cleanup effect on unmount finds `engineRef.current === null`
   and skips leaveChannel / release, so the Agora session stays
   alive while the FloatingCallBar is visible.
   When the user taps the FloatingCallBar (navigate with returnToCall:true),
   the screen remounts and the setup effect restores the engine from
   the singleton, so the call continues seamlessly with no re-join.
───────────────────────────────────────────────────────────────── */
let _savedVoiceEngine: any = null;
let _savedVoiceEngineJoined = false;

/* ─────────────────────────────────────────────────────────────────
   Main VoiceCallScreen
───────────────────────────────────────────────────────────────── */
export default function VoiceCallScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const {
    userId,
    userName,
    userPhoto,
    isIncoming,
    callData: incomingCallData,
    callerId,
    callAccepted,
    returnToCall,
  } = route.params || {};

  const { token: authToken, user } = useAuth();
  const { post, get } = useApi();
  const {
    setActiveCall,
    updateCallStatus,
    startGlobalTimer,
    stopGlobalTimer,
    minimizeCall,
    maximizeCall,
    clearCall,
    activeCall,
    setIsOnCallScreen,
  } = useCallContext();

  /* ── State ── */
  const [callStatus, setCallStatus] = useState<CallStatus>(
    callAccepted ? "connected" : "connecting",
  );
  const [activeCallData, setActiveCallData] = useState<any>(incomingCallData || null);
  const [isMuted, setIsMuted] = useState(false);
  // Voice calls default to earpiece (like WhatsApp/Telegram). User can tap Speaker to toggle.
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [networkQuality, setNetworkQuality] = useState(0);

  /* ── Animated values ── */
  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const pulseAnim1  = useRef(new Animated.Value(1)).current;
  const pulseAnim2  = useRef(new Animated.Value(1)).current;
  const pulseAnim3  = useRef(new Animated.Value(1)).current;
  const endBtnScale = useRef(new Animated.Value(1)).current;

  /* ── Refs ── */
  const ringtoneRef       = useRef<Audio.Sound | null>(null);
  const shouldRingRef     = useRef(false);
  const ringingTimeout    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineRef         = useRef<any>(null);
  const agoraJoined       = useRef(false);
  const joinInProgressRef = useRef(false);
  const activeCallDataRef = useRef<any>(incomingCallData || null);
  const callStatusRef     = useRef<CallStatus>(callAccepted ? "connected" : "connecting");
  const micDeniedRef      = useRef(false);
  const wasConnectedRef   = useRef(false);
  const [showRating, setShowRating] = useState(false);
  /* Named socket-callback refs so cleanup can remove only our listeners */
  const cbAcceptedRef = useRef<Function | null>(null);
  const cbDeclinedRef = useRef<Function | null>(null);
  const cbBusyRef     = useRef<Function | null>(null);
  const cbEndedRef    = useRef<Function | null>(null);

  const duration = activeCall?.duration || 0;

  /* ── setStatus helper ── */
  const setStatus = useCallback(
    (s: CallStatus) => {
      callStatusRef.current = s;
      setCallStatus(s);
      updateCallStatus(s);
    },
    [updateCallStatus],
  );

  /* ── Stop ringtone ── */
  const stopRingtone = useCallback(async () => {
    shouldRingRef.current = false;
    Vibration.cancel();
    try {
      if (ringtoneRef.current) {
        const snd = ringtoneRef.current;
        ringtoneRef.current = null;
        await snd.stopAsync().catch(() => {});
        await snd.unloadAsync().catch(() => {});
      }
    } catch {}
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });
    } catch {}
  }, []);

  /* ── Play ringtone ── */
  const playRingtone = useCallback(async () => {
    await stopRingtone();
    shouldRingRef.current = true;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });
      if (!shouldRingRef.current) return;
      const source = isIncoming
        ? require("../assets/sounds/mixkit-waiting-ringtone-1354.wav")
        : require("../assets/sounds/phone-calling-1b.mp3");
      const { sound } = await Audio.Sound.createAsync(source, {
        shouldPlay: false,
        isLooping: true,
        volume: 1.0,
      });
      if (!shouldRingRef.current) {
        await sound.unloadAsync().catch(() => {});
        return;
      }
      ringtoneRef.current = sound;
      if (!shouldRingRef.current) {
        ringtoneRef.current = null;
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
        return;
      }
      await sound.playAsync().catch(() => {});
      if (isIncoming) Vibration.vibrate([500, 1000, 500], true);
    } catch (err) {
      logger.error("Ringtone error:", err);
      if (isIncoming && shouldRingRef.current) Vibration.vibrate([500, 1000, 500], true);
    }
  }, [isIncoming, stopRingtone]);

  /* ── Init native Agora engine (audio-only) ── */
  const initEngine = useCallback((callDataObj: any) => {
    if (engineRef.current || Platform.OS === "web" || isExpoGo || !createAgoraRtcEngine) return;
    try {
      if (!callDataObj?.appId) {
        logger.error('[VoiceCall] initEngine: appId is missing — Agora engine will not initialize correctly.',
          'callDataObj:', JSON.stringify(callDataObj ?? null));
        // Do not proceed without an appId; an empty-string appId causes a
        // native Agora crash on some OEM builds (Samsung in particular).
        return;
      }
      logger.log('[VoiceCall] initEngine — appId present, initializing engine');

      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId: callDataObj.appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      /* Audio-only — disable video capture entirely */
      engine.disableVideo();
      engine.enableAudio();
      engine.enableLocalAudio(true);
      engine.muteLocalAudioStream(false);
      /* Voice calls default to earpiece — user can tap Speaker to switch */
      engine.setDefaultAudioRouteToSpeakerphone(false);

      // onJoinChannelSuccess fires once the local user is confirmed in the
      // channel. Setting agoraJoined here (rather than speculatively before
      // joinChannel) gives the call:ended grace-period guard an accurate
      // timestamp and prevents it from dismissing the screen prematurely.
      engine.addListener("onJoinChannelSuccess", (_conn: any, elapsed: any) => {
        agoraJoined.current = true;
        logger.log("[VoiceCall] Agora joined channel, elapsed:", elapsed, "ms");
      });

      engine.addListener("onUserJoined", (_conn: any, _uid: any) => {
        logger.log("[VoiceCall] Remote user joined, uid:", _uid);
      });

      engine.addListener("onUserOffline", (_conn: any, _uid: any, _reason: any) => {
        logger.log("[VoiceCall] Remote user offline, uid:", _uid);
        if (callStatusRef.current === "connected") {
          handleEngineEndCall();
        }
      });

      engine.addListener("onConnectionStateChanged", (_conn: any, state: any, _reason: any) => {
        logger.log("[VoiceCall] Connection state:", state);
      });

      engine.addListener("onNetworkQuality", (_conn: any, uid: any, txQ: any, rxQ: any) => {
        if (uid === 0) setNetworkQuality(Math.max(txQ, rxQ));
      });

      engine.addListener("onError", (_conn: any, err: any) => {
        logger.warn("[VoiceCall] Engine error:", err);
      });

    } catch (e) {
      logger.error("[VoiceCall] Engine init error:", e);
    }
  }, []);

  /* ── Internal end-call triggered by engine ── */
  const handleEngineEndCall = useCallback(() => {
    try { engineRef.current?.leaveChannel(); } catch {}
    const wasConn = callStatusRef.current === "connected";
    logger.log("[VoiceCall] handleEngineEndCall — wasConnected:", wasConn);
    callStateRef.lastCallEndedAt = Date.now();
    setStatus("ended");
    stopGlobalTimer();
    clearCall();
    if (wasConn) {
      wasConnectedRef.current = true;
      setShowRating(true);
    } else {
      setTimeout(() => navigation.canGoBack() && navigation.goBack(), 600);
    }
  }, [navigation, setStatus, stopGlobalTimer, clearCall]);

  /* ── Join Agora voice channel via native engine ── */
  const joinAgoraVoice = useCallback(
    async (callDataObj: any) => {
      // Guard against double-join: agoraJoined is only set in onJoinChannelSuccess;
      // joinInProgressRef prevents concurrent calls to joinAgoraVoice.
      if (agoraJoined.current || joinInProgressRef.current) return;
      joinInProgressRef.current = true;

      // Null guard: callDataObj must exist and have a channelName. If missing
      // (e.g. answered from a notification before the full callData was stored),
      // fail gracefully instead of crashing the native Agora engine.
      if (!callDataObj || !callDataObj.channelName) {
        logger.error('[VoiceCall] joinAgoraVoice: callDataObj is missing or has no channelName — aborting join',
          JSON.stringify(callDataObj ?? null));
        joinInProgressRef.current = false;
        setStatus('failed');
        setTimeout(() => navigation.canGoBack() && navigation.goBack(), 2000);
        return;
      }

      // Normalize token field names: backend sends callData.token; background
      // accept handler may store it as agoraToken. Ensure both are populated so
      // we use whichever is non-empty.
      if (callDataObj.token && !callDataObj.agoraToken) callDataObj = { ...callDataObj, agoraToken: callDataObj.token };
      if (callDataObj.agoraToken && !callDataObj.token) callDataObj = { ...callDataObj, token: callDataObj.agoraToken };

      logger.log('[VoiceCall] joinAgoraVoice — channelName:', callDataObj.channelName,
        'hasToken:', !!(callDataObj.token), 'hasAppId:', !!callDataObj.appId,
        'isIncoming:', isIncoming);

      const hasPerm = await ensureMicPermission();
      if (!hasPerm) {
        joinInProgressRef.current = false;
        micDeniedRef.current = true;
        if (callStatusRef.current === "connected") {
          const otherId = isIncoming ? callerId : userId;
          socketService.endCall({
            targetUserId: otherId,
            callType: "voice",
            duration: 0,
            wasAnswered: false,
          });
          stopGlobalTimer();
          clearCall();
        }
        setStatus("failed");
        setTimeout(() => navigation.canGoBack() && navigation.goBack(), 2000);
        return;
      }

      /* Web platform falls back to the JS agoraService */
      if (Platform.OS === "web") {
        agoraService.joinVoiceCall(callDataObj.appId, callDataObj.channelName, callDataObj.token, callDataObj.uid || 0);
        return;
      }

      /* Expo Go: no native module available */
      if (isExpoGo || !createAgoraRtcEngine) return;

      if (!engineRef.current) initEngine(callDataObj);

      /* Ensure audio capture is active (re-join safety) */
      try {
        engineRef.current?.enableLocalAudio(true);
        engineRef.current?.muteLocalAudioStream(false);
      } catch {}

      let joinToken = callDataObj.token;
      let joinUid   = callDataObj.uid || 0;

      /* Callee fetches a fresh token from the backend */
      if (isIncoming && authToken) {
        try {
          const res = await get<{ token: string; uid: number }>(
            `/agora/token`,
            { channelName: callDataObj.channelName, uid: 0, role: "publisher" },
            authToken,
          );
          if (res.success && res.data?.token) {
            joinToken = res.data.token;
            joinUid   = 0;
          }
        } catch {
          logger.log("[VoiceCall] Token fallback — using shared token");
        }
      }

      try {
        engineRef.current?.joinChannel(joinToken || null, callDataObj.channelName, joinUid, {
          clientRoleType:         ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack:     false,
          autoSubscribeAudio:     true,
          autoSubscribeVideo:     false,
        });
        logger.log("[VoiceCall] joinChannel called for:", callDataObj.channelName);
        // Note: agoraJoined.current is only set true inside onJoinChannelSuccess.
        // joinInProgressRef stays true to prevent double-calls; it is reset if join fails.
      } catch (e) {
        logger.error("[VoiceCall] joinChannel error:", e);
        joinInProgressRef.current = false;
        setStatus("failed");
      }
    },
    [isIncoming, authToken, get, initEngine,
     callerId, userId, stopGlobalTimer, clearCall, setStatus, navigation],
  );

  /* ── End call ── */
  const handleEndCall = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const wasConnected = callStatusRef.current === "connected";
    const dur = activeCall?.duration || 0;
    logger.log("[VoiceCall] handleEndCall — wasConnected:", wasConnected, "duration:", dur);
    // Stamp the end time BEFORE clearCall() so IncomingCallHandler's grace
    // window check sees a fresh timestamp even when React state lags.
    callStateRef.lastCallEndedAt = Date.now();
    setStatus("ended");
    await stopRingtone();
    stopGlobalTimer();
    if (ringingTimeout.current) clearTimeout(ringingTimeout.current);

    if (Platform.OS === "web") {
      agoraService.leave();
    } else if (!isExpoGo && engineRef.current) {
      try { engineRef.current.leaveChannel(); } catch {}
    }

    socketService.endCall({
      targetUserId: isIncoming ? callerId : userId,
      callType: "voice",
      duration: dur,
      wasAnswered: wasConnected,
    });
    logger.log("[VoiceCall] call:end emitted to targetUserId:", isIncoming ? callerId : userId);
    clearCall();
    if (wasConnected) {
      wasConnectedRef.current = true;
      setShowRating(true);
    } else {
      setTimeout(() => navigation.canGoBack() && navigation.goBack(), 600);
    }
  }, [callerId, userId, isIncoming, stopRingtone, clearCall, navigation, setStatus, activeCall, stopGlobalTimer]);

  /* ── Minimize ── */
  const handleMinimize = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Save the live Agora engine to the module-level singleton BEFORE goBack()
    // unmounts this component. The cleanup effect checks engineRef.current and
    // skips leaveChannel / release when it is null, keeping the Agora session
    // alive behind the FloatingCallBar.
    if (engineRef.current) {
      _savedVoiceEngine = engineRef.current;
      _savedVoiceEngineJoined = agoraJoined.current;
      engineRef.current = null; // signal cleanup to skip teardown
      logger.log('[VoiceCall] handleMinimize: engine saved to singleton, agoraJoined:', _savedVoiceEngineJoined);
    }
    minimizeCall();
    if (navigation.canGoBack()) navigation.goBack();
  }, [minimizeCall, navigation]);

  /* ── Accept incoming (VoiceCallScreen ringing UI → accept button) ── */
  const handleAccept = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    logger.log("[VoiceCall] handleAccept — emitting call:accept immediately for callerId:", callerId);

    // Emit call:accept to the server FIRST — before any async audio operations.
    // Every millisecond saved here reduces the caller's "ringing after accept"
    // delay. stopRingtone() can run concurrently.
    socketService.acceptCall({ callerId, callData: activeCallData });
    logger.log("[VoiceCall] accept event sent to caller:", callerId);

    // Kill the ring guard synchronously so no further playback can start.
    shouldRingRef.current = false;
    if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
    // Unload audio in background — do not block the permission check on it.
    stopRingtone().catch(() => {});

    const hasPerm = await ensureMicPermission();
    if (!hasPerm) {
      micDeniedRef.current = true;
      socketService.declineCall({ callerId, callType: "voice" });
      setStatus("failed");
      callStateRef.lastCallEndedAt = Date.now();
      clearCall();
      setTimeout(() => navigation.canGoBack() && navigation.goBack(), 2000);
      return;
    }

    setStatus("connected");
    startGlobalTimer();
    logger.log("[VoiceCall] handleAccept — joining Agora channel");
    if (activeCallData) joinAgoraVoice(activeCallData);
  }, [callerId, activeCallData, stopRingtone, joinAgoraVoice, startGlobalTimer, setStatus, clearCall, navigation]);

  /* ── Decline incoming ── */
  const handleDecline = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await stopRingtone();
    if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
    socketService.declineCall({ callerId, callType: "voice" });
    if (authToken && isIncoming) {
      post("/call/decline", { callerId, type: "audio" }, authToken).catch(() => {});
    }
    setStatus("declined");
    clearCall();
    setTimeout(() => navigation.canGoBack() && navigation.goBack(), 900);
  }, [callerId, isIncoming, authToken, post, stopRingtone, clearCall, navigation, setStatus]);

  /* ── Unified back press handler (UI button + Android hardware back) ── */
  const handleBackPress = useCallback(() => {
    const status = callStatusRef.current;
    if (status === "connected") {
      handleMinimize();
    } else if (isIncoming && status === "ringing") {
      handleDecline();
    } else if (["ended", "declined", "missed", "failed", "busy"].includes(status)) {
      clearCall();
      if (navigation.canGoBack()) navigation.goBack();
    } else {
      handleEndCall();
    }
    return true;
  }, [isIncoming, handleMinimize, handleDecline, handleEndCall, clearCall, navigation]);

  /* ── Android hardware back button ── */
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", handleBackPress);
      return () => sub.remove();
    }, [handleBackPress])
  );

  /* ── Toggle mute ── */
  const toggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsMuted((prev) => {
      const next = !prev;
      if (Platform.OS === "web") {
        agoraService.toggleMute(next);
      } else if (!isExpoGo && engineRef.current) {
        try { engineRef.current.muteLocalAudioStream(next); } catch {}
      }
      return next;
    });
  }, []);

  /* ── Toggle speaker ── */
  const toggleSpeaker = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: !next,
      });
    } catch (e) {
      logger.log("[VoiceCall] Speaker error:", e);
    }
    if (!isExpoGo && engineRef.current) {
      try { engineRef.current.setDefaultAudioRouteToSpeakerphone(next); } catch {}
    }
  }, [isSpeakerOn]);

  /* ── Initiate outgoing call ── */
  const initiateCall = useCallback(async () => {
    if (!authToken || !userId) return setStatus("failed");
    const hasPerm = await ensureMicPermission();
    if (!hasPerm) { micDeniedRef.current = true; setStatus("failed"); return; }

    try {
      const response = await post<any>(
        "/agora/call/initiate",
        { targetUserId: userId, callType: "voice" },
        authToken,
      );
      if (response.success && response.data?.callData) {
        const cd = response.data.callData;
        setActiveCallData(cd);
        activeCallDataRef.current = cd;
        setStatus("ringing");
        logger.log("[VoiceCall] Call initiated — channel:", cd.channelName, "targetUserId:", userId);

        const photoVal = user?.photos?.[0];
        const photoUrl = typeof photoVal === "string" ? photoVal : (photoVal as any)?.url || "";
        socketService.initiateCall({
          targetUserId: userId,
          callData: cd,
          callerInfo: { name: user?.name || "User", photo: photoUrl, id: user?.id || "" },
        });

        ringingTimeout.current = setTimeout(() => {
          if (callStatusRef.current === "ringing") {
            setStatus("missed");
            socketService.missedCall?.({ targetUserId: userId, callType: "voice" });
            clearCall();
            setTimeout(() => navigation.canGoBack() && navigation.goBack(), 2000);
          }
        }, 30000);
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    }
  }, [authToken, userId, post, user, navigation, setStatus, clearCall]);

  /* ── Setup effect ── */
  useEffect(() => {
    logger.log(
      '[VoiceCall] Screen mounted',
      '| callAccepted:', callAccepted,
      '| isIncoming:', isIncoming,
      '| callerId:', callerId,
      '| userId:', userId,
      '| hasChannelName:', !!(incomingCallData?.channelName),
      '| hasAppId:', !!(incomingCallData?.appId),
      '| socketConnected:', socketService.isConnected(),
      '| returnToCall:', returnToCall,
    );

    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    setIsOnCallScreen(true);
    maximizeCall();

    setActiveCall({
      userId: userId || callerId || "",
      userName: userName || "Unknown",
      userPhoto,
      isIncoming: !!isIncoming,
      callStatus: callAccepted ? "connected" : "connecting",
      callType: "voice",
      duration: 0,
    });

    // Restore the Agora engine saved by handleMinimize, if any.
    // This runs before the callAccepted / returnToCall branches so the
    // restored engine is available when joinAgoraVoice() is called below.
    if (_savedVoiceEngine) {
      engineRef.current = _savedVoiceEngine;
      agoraJoined.current = _savedVoiceEngineJoined;
      _savedVoiceEngine = null;
      _savedVoiceEngineJoined = false;
      logger.log('[VoiceCall] setup: restored engine from minimize singleton, agoraJoined:', agoraJoined.current);
    }

    if (callAccepted) {
      logger.log('[VoiceCall] callAccepted=true — entering connected state immediately');
      setStatus("connected");
      startGlobalTimer();
      if (activeCallDataRef.current) {
        logger.log('[VoiceCall] joining Agora voice channel — channelName:', activeCallDataRef.current?.channelName);
        joinAgoraVoice(activeCallDataRef.current);
      } else {
        logger.error('[VoiceCall] callAccepted=true but activeCallDataRef is null — cannot join Agora');
      }
      // Emit call:accept so the caller receives call:accepted and joins Agora.
      // Required for Path B cold-start (killed device, push notification tap):
      // the receiver navigates here directly with callAccepted:true but nobody
      // has emitted acceptCall yet, so the caller never gets call:accepted and
      // never enters the Agora channel.
      // Use onConnectOnce if the socket isn't connected yet (cold-start timing).
      if (isIncoming && callerId) {
        const doAccept = () => {
          logger.log('[VoiceCall] emitting call:accept for callerId:', callerId,
            '| socketConnected:', socketService.isConnected());
          socketService.acceptCall({ callerId, callData: activeCallDataRef.current });
        };
        if (socketService.isConnected()) {
          doAccept();
        } else {
          logger.log('[VoiceCall] socket not connected yet — queuing call:accept via onConnectOnce');
          socketService.onConnectOnce(doAccept);
        }
      }
    } else if (returnToCall) {
      // Returning from minimize — engine is already live (restored above).
      // Just set the UI state; no Agora re-join needed.
      setStatus("connected");
    } else if (isIncoming) {
      setStatus("ringing");
      ringingTimeout.current = setTimeout(async () => {
        if (callStatusRef.current === "ringing") {
          await stopRingtone();
          socketService.declineCall({ callerId, callType: "voice" });
          setStatus("missed");
          clearCall();
          setTimeout(() => navigation.canGoBack() && navigation.goBack(), 1500);
        }
      }, 60000);
    } else {
      initiateCall();
    }

    const cbAccepted = async () => {
      logger.log("[VoiceCall] call:accepted received — stopping ring, entering connected state");
      // Kill the ring guard synchronously so no in-progress playAsync() or
      // looping audio can restart. Do this BEFORE any await so it takes effect
      // in the current micro-task tick.
      shouldRingRef.current = false;
      if (ringingTimeout.current) {
        clearTimeout(ringingTimeout.current);
        ringingTimeout.current = null;
      }
      // Transition UI immediately — don't wait for audio teardown.
      setStatus("connected");
      startGlobalTimer();
      logger.log("[VoiceCall] call:accepted — joining Agora channel for callData:", !!activeCallDataRef.current);
      if (activeCallDataRef.current) joinAgoraVoice(activeCallDataRef.current);
      // Unload the ringtone sound object in the background after the UI has
      // already updated. The guard (shouldRingRef=false) prevents replay.
      stopRingtone().catch(() => {});
    };
    cbAcceptedRef.current = cbAccepted;
    socketService.on('call:accepted', cbAccepted);

    const cbDeclined = async () => {
      await stopRingtone();
      if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
      setStatus("declined");
      clearCall();
      setTimeout(() => navigation.canGoBack() && navigation.goBack(), 1500);
    };
    cbDeclinedRef.current = cbDeclined;
    socketService.on('call:declined', cbDeclined);

    const cbBusy = async () => {
      await stopRingtone();
      if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
      setStatus("busy");
      clearCall();
      setTimeout(() => navigation.canGoBack() && navigation.goBack(), 2000);
    };
    cbBusyRef.current = cbBusy;
    socketService.on('call:busy', cbBusy);

    // Grace period logic for call:ended events that arrive too soon after
    // the screen mounts.  Two cases need protection:
    //
    // 1. Cold-start (app was killed, relaunched from push notification):
    //    The socket may not be connected yet, so any call:ended that arrives
    //    within 8 s before Agora joins is almost certainly a stale event from
    //    a previous session — ignore it.
    //
    // 2. Receiver foreground accept (isIncoming: true, callAccepted: true):
    //    Signalling completes before the Agora SDK finishes joining.  A stale
    //    call:ended (e.g. duplicate socket event, brief server-side disconnect
    //    during the accept handshake) arriving in this window would pop the
    //    screen immediately, leaving the receiver on the chat screen while
    //    audio is still active.  A 3-second window is enough for Agora to
    //    join; once it has, agoraJoined.current = true and we honour all
    //    subsequent call:ended events without delay.
    const coldStartAccept   = !!callAccepted && !socketService.isConnected();
    const receiverFgAccept  = !!callAccepted && !!isIncoming;
    const acceptArmedAt = Date.now();
    const cbEnded = async () => {
      const elapsed = Date.now() - acceptArmedAt;
      const withinGrace =
        (coldStartAccept  && elapsed < 8000 && !agoraJoined.current) ||
        (receiverFgAccept && elapsed < 8000 && !agoraJoined.current);
      logger.log("[VoiceCall] call:ended received — elapsed:", elapsed, "ms, withinGrace:", withinGrace,
        "agoraJoined:", agoraJoined.current, "status:", callStatusRef.current);
      if (withinGrace) {
        logger.log("[VoiceCall] Ignoring stale call:ended during accept join window");
        return;
      }
      await stopRingtone();
      if (Platform.OS === "web") agoraService.leave();
      else if (!isExpoGo && engineRef.current) {
        try { engineRef.current.leaveChannel(); } catch {}
      }
      const wasConn = callStatusRef.current === "connected";
      // Stamp the end time so IncomingCallHandler's grace window activates.
      callStateRef.lastCallEndedAt = Date.now();
      setStatus("ended");
      stopGlobalTimer();
      clearCall();
      logger.log("[VoiceCall] call:ended handled — wasConnected:", wasConn);
      if (wasConn) {
        wasConnectedRef.current = true;
        setShowRating(true);
      } else {
        setTimeout(() => navigation.canGoBack() && navigation.goBack(), 1200);
      }
    };
    cbEndedRef.current = cbEnded;
    socketService.on('call:ended', cbEnded);

    return () => {
      setIsOnCallScreen(false);
      stopRingtone();
      if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
      // Remove only our specific callbacks — not all listeners for these events.
      // Using socketService.off(event) without a callback would also wipe
      // IncomingCallHandler's 'call:ended' listener, causing false-busy on the next call.
      if (cbAcceptedRef.current) socketService.off('call:accepted', cbAcceptedRef.current);
      if (cbDeclinedRef.current) socketService.off('call:declined', cbDeclinedRef.current);
      if (cbBusyRef.current)     socketService.off('call:busy',     cbBusyRef.current);
      if (cbEndedRef.current)    socketService.off('call:ended',    cbEndedRef.current);
      /* Release native engine on unmount */
      if (!isExpoGo && engineRef.current) {
        try {
          engineRef.current.leaveChannel();
          engineRef.current.release();
        } catch {}
        engineRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Ringtone on status change ── */
  useEffect(() => {
    if (callStatus === "ringing") playRingtone();
    else stopRingtone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus]);

  /* ── Set audio mode for active call ── */
  useEffect(() => {
    if (callStatus !== "connected") return;
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      playThroughEarpieceAndroid: !isSpeakerOn,
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus]);

  /* ── Pulse rings animation ── */
  useEffect(() => {
    if (callStatus === "ringing" || callStatus === "connecting") {
      const loop = (anim: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, { toValue: 1.3, duration: 950, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 1, duration: 950, useNativeDriver: true }),
          ]),
        );
      const l1 = loop(pulseAnim1, 0);
      const l2 = loop(pulseAnim2, 320);
      const l3 = loop(pulseAnim3, 640);
      l1.start(); l2.start(); l3.start();
      return () => { l1.stop(); l2.stop(); l3.stop(); };
    } else {
      pulseAnim1.setValue(1);
      pulseAnim2.setValue(1);
      pulseAnim3.setValue(1);
    }
  }, [callStatus]);

  /* ── Free-tier 5-min limit ── */
  useEffect(() => {
    if (user?.premium?.isActive || callStatus !== "connected") return;
    if (duration === 240) {
      Alert.alert(
        "1 Minute Remaining",
        "Free calls are limited to 5 minutes. Upgrade to Premium for unlimited calls.",
        [{ text: "OK" }],
      );
    }
    if (duration >= 300) handleEndCall();
  }, [duration, callStatus, user, handleEndCall]);

  /* ── Derived state ── */
  const isConnected  = callStatus === "connected";
  const isTerminal   = ["ended", "declined", "missed", "failed", "busy"].includes(callStatus);
  const isWaiting    = !isIncoming && callStatus === "ringing";
  const showIncoming = isIncoming && callStatus === "ringing";
  const showCancel   = callStatus === "connecting" || isWaiting;

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const statusText = (): string => {
    switch (callStatus) {
      case "connecting": return "Connecting…";
      case "ringing":    return isIncoming ? "Incoming voice call" : "Ringing…";
      case "connected":  return formatDuration(duration);
      case "ended":      return "Call ended";
      case "declined":   return "Call declined";
      case "busy":       return "User is busy";
      case "missed":     return "No answer";
      case "failed":     return micDeniedRef.current ? "Microphone denied" : "Call failed";
      default:           return "";
    }
  };

  const terminalMsg = (): string => {
    if (micDeniedRef.current)      return "Microphone access is required for voice calls. Please enable it in Settings.";
    if (callStatus === "busy")     return "User is in another call";
    if (callStatus === "declined") return "Call was declined";
    if (callStatus === "missed")   return "No answer";
    return "Unable to connect";
  };

  /* ── Render ── */
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Background gradient */}
      <LinearGradient
        colors={["#030d08", "#051a0f", "#062517", "#07301e"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle photo tint when connected */}
      {userPhoto && isConnected && (
        <SafeImage
          source={{ uri: userPhoto }}
          style={[StyleSheet.absoluteFillObject as any, { opacity: 0.06 }]}
          blurRadius={Platform.OS === "ios" ? 80 : 20}
        />
      )}

      {/* ── FULL-SCREEN OVERLAY ── */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim }]}>

        {/* ── BACK / MINIMIZE button ── */}
        <Pressable
          style={[s.backBtn, { top: insets.top + 12 }]}
          hitSlop={16}
          onPress={handleBackPress}
        >
          <Ionicons
            name={isConnected ? "chevron-down" : "arrow-back"}
            size={22}
            color="#fff"
          />
        </Pressable>

        {/* ── NAME + STATUS ── */}
        <View style={[s.topNameBlock, { top: insets.top + 12 }]}>
          <Text style={s.callerName} numberOfLines={1}>{userName || "Unknown"}</Text>
          <Text style={[s.statusText, isConnected && s.statusConnected, isTerminal && s.statusError]}>
            {statusText()}
          </Text>
          {(callStatus === "ringing" || callStatus === "connecting") && (
            <View style={s.e2eBadge}>
              <Ionicons name="lock-closed" size={10} color="#34d399" />
              <Text style={s.e2eText}>End-to-end encrypted</Text>
            </View>
          )}
        </View>

        {/* ── AVATAR ── */}
        <View style={s.avatarCenter}>
          <View style={s.avatarRing}>
            {/* Pulse rings (ringing/connecting) */}
            {(callStatus === "ringing" || callStatus === "connecting") && (
              <>
                <PulseRing anim={pulseAnim1} size={AVATAR_SIZE + 28} />
                <PulseRing anim={pulseAnim2} size={AVATAR_SIZE + 58} />
                <PulseRing anim={pulseAnim3} size={AVATAR_SIZE + 88} />
              </>
            )}
            {userPhoto ? (
              <SafeImage
                source={{ uri: userPhoto }}
                style={s.avatar}
                contentFit="cover"
              />
            ) : (
              <LinearGradient colors={["#059669", "#10b981", "#34d399"]} style={s.avatar}>
                <Text style={s.avatarInitial}>{(userName || "?").charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
          </View>

          {isConnected && (
            <View style={s.liveRow}>
              <View style={s.liveDot} />
              <WaveBars active={!isMuted} />
              <SignalBars quality={networkQuality} />
            </View>
          )}

          {isConnected && isMuted && (
            <View style={s.mutedBadge}>
              <Ionicons name="mic-off" size={12} color="#fff" />
              <Text style={s.mutedText}>Muted</Text>
            </View>
          )}

          {isTerminal && callStatus !== "ended" && (
            <View style={s.errorPill}>
              <Ionicons name="close-circle" size={14} color="#f87171" />
              <Text style={s.errorText}>{terminalMsg()}</Text>
            </View>
          )}
        </View>

        {/* ── CONTROLS ── */}
        <View style={[s.controlsPanel, { paddingBottom: insets.bottom + 28 }]}>
          <View style={s.glass}>

            {showIncoming && (
              <View style={s.btnRow}>
                <CtrlBtn icon="call" label="Decline" danger onPress={handleDecline} />
                <View style={s.acceptWrap}>
                  <Pressable style={s.acceptBtn} onPress={handleAccept}>
                    <Ionicons name="call" size={30} color="#fff" />
                  </Pressable>
                  <Text style={ctrl.label}>Accept</Text>
                </View>
              </View>
            )}

            {isConnected && (
              <View style={s.btnRow}>
                <CtrlBtn
                  icon={isMuted ? "mic-off" : "mic"}
                  label={isMuted ? "Unmute" : "Mute"}
                  active={isMuted}
                  onPress={toggleMute}
                />
                <CtrlBtn
                  icon={isSpeakerOn ? "volume-high" : "volume-mute"}
                  label="Speaker"
                  active={isSpeakerOn}
                  onPress={toggleSpeaker}
                />
                <CtrlBtn
                  icon="bluetooth"
                  label="Bluetooth"
                  onPress={() =>
                    Alert.alert(
                      "Bluetooth Audio",
                      "Connect a Bluetooth headset and audio will automatically route to it. Manage devices in your phone's Bluetooth settings.",
                      [{ text: "OK" }],
                    )
                  }
                />
              </View>
            )}

            {showCancel && (
              <View style={s.btnRow}>
                <CtrlBtn
                  icon={isSpeakerOn ? "volume-high" : "volume-mute"}
                  label="Speaker"
                  active={isSpeakerOn}
                  onPress={toggleSpeaker}
                />
              </View>
            )}

            {isTerminal && showRating && (
              <CallQualityRating
                authToken={authToken || ""}
                channelName={activeCallDataRef.current?.channelName}
                callType="voice"
                peerId={isIncoming ? (callerId || "") : (userId || "")}
                duration={duration}
                onClose={() => { clearCall(); if (navigation.canGoBack()) navigation.goBack(); }}
              />
            )}
            {isTerminal && !showRating && (
              <View style={s.btnRow}>
                <CtrlBtn
                  icon="close"
                  label="Close"
                  onPress={() => { clearCall(); navigation.canGoBack() && navigation.goBack(); }}
                />
              </View>
            )}

            {(isConnected || showCancel) && (
              <View style={s.endRow}>
                <Animated.View style={{ transform: [{ scale: endBtnScale }] }}>
                  <Pressable
                    style={s.endBtn}
                    onPress={handleEndCall}
                    onPressIn={() =>
                      Animated.spring(endBtnScale, { toValue: 0.88, useNativeDriver: true, tension: 220, friction: 8 }).start()
                    }
                    onPressOut={() =>
                      Animated.spring(endBtnScale, { toValue: 1, useNativeDriver: true, tension: 220, friction: 8 }).start()
                    }
                  >
                    <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
                  </Pressable>
                </Animated.View>
                <Text style={s.endLabel}>End Call</Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Styles
───────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#030d08" },

  backBtn: {
    position: "absolute",
    left: 16,
    zIndex: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },

  topNameBlock: {
    position: "absolute",
    left: 60,
    right: 60,
    alignItems: "center",
    zIndex: 10,
  },

  avatarCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 140,
    paddingBottom: 220,
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "rgba(52,211,153,0.55)",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 28,
    elevation: 18,
  },
  avatar: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  avatarInitial: {
    fontSize: AVATAR_SIZE * 0.38,
    fontWeight: "800",
    color: "#fff",
  },

  callerName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  statusText: {
    marginTop: 5,
    fontSize: 15,
    color: "rgba(255,255,255,0.50)",
    fontWeight: "500",
    textAlign: "center",
  },
  statusConnected: { color: "#34d399", fontVariant: ["tabular-nums"], letterSpacing: 1.5 },
  statusError:     { color: "#f87171" },

  e2eBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(52,211,153,0.10)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.25)",
  },
  e2eText: { fontSize: 11, color: "rgba(52,211,153,0.80)", fontWeight: "500" },

  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#34d399" },

  mutedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(239,68,68,0.20)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.40)",
  },
  mutedText: { fontSize: 11, color: "#fca5a5", fontWeight: "600" },

  errorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(248,113,113,0.10)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
  },
  errorText: { fontSize: 13, color: "#f87171", fontWeight: "500" },

  controlsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  glass: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    width: "100%",
    marginBottom: 20,
  },

  acceptWrap: { alignItems: "center", gap: 6 },
  acceptBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },

  endRow: { alignItems: "center", gap: 6 },
  endBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 12,
  },
  endLabel: { fontSize: 12, color: "rgba(255,255,255,0.40)", textAlign: "center" },
});
