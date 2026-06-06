import logger from '@/utils/logger';
import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  StatusBar,
  Vibration,
  Platform,
  Alert,
  Dimensions,
  BackHandler,
  ActivityIndicator,
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
import { ensureCallPermissions } from "@/utils/callPermissions";
import { useCallContext, CallStatus } from "@/contexts/CallContext";
import CallQualityRating from "@/components/calls/CallQualityRating";
import { getApiBaseUrl } from "@/constants/config";
import { callStateRef } from "@/utils/callStateRef";

/* react-native-agora is a native module — not available on web or in Expo Go.
   The platform-specific resolver in `@/utils/agoraNative` keeps the native
   import out of the web bundle entirely (via a `.native.ts` extension). */
import {
  createAgoraRtcEngine,
  RtcSurfaceView,
  VideoSourceType,
  ChannelProfileType,
  ClientRoleType,
  VideoMirrorModeType,
  RenderModeType,
  OrientationMode,
  DegradationPreference,
} from "@/utils/agoraNative";

/* react-native-agora isn't bundled in Expo Go (it's a native module), so we
   detect Expo Go at runtime and fall back to socket-only signalling instead
   of crashing with "createAgoraRtcEngine is not a function". */
const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

const { width: SW, height: SH } = Dimensions.get("window");
const AVATAR_SIZE = Math.min(SW * 0.44, 175);

/* ─────────────────────────────────────────────────────────────────
   Signal bars — reflects Agora onNetworkQuality (1=excellent…6=down)
───────────────────────────────────────────────────────────────── */
function qualityToBars(q: number): { bars: number; color: string; label: string } {
  // Agora: 0=unknown, 1=excellent, 2=good, 3=poor, 4=bad, 5=very bad, 6=down
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
   Pulse ring
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
        opacity: anim.interpolate({ inputRange: [1, 1.3], outputRange: [0.55, 0] }),
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────
   Video control button
───────────────────────────────────────────────────────────────── */
function VidBtn({
  icon,
  label,
  active = false,
  danger = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress?: () => void;
}) {
  const bg = danger ? "#dc2626" : active ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.16)";
  const iconColor = active && !danger ? "#111" : "#fff";

  return (
    <Pressable style={vb.wrap} onPress={onPress}>
      <View
        style={[
          vb.btn,
          {
            backgroundColor: bg,
            shadowColor: danger ? "#dc2626" : "transparent",
            shadowOpacity: danger ? 0.5 : 0,
            shadowRadius: 10,
            elevation: danger ? 8 : 0,
          },
        ]}
      >
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={vb.label}>{label}</Text>
    </Pressable>
  );
}
const vb = StyleSheet.create({
  wrap: { alignItems: "center", gap: 5 },
  btn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 11, color: "rgba(255,255,255,0.60)", fontWeight: "500" },
});

/* ─────────────────────────────────────────────────────────────────
   Module-level Agora engine singleton — survives minimize/unmount
   ─────────────────────────────────────────────────────────────────
   Same pattern as VoiceCallScreen. When the user minimizes a video
   call, handleMinimize moves the live engine into these variables
   before goBack() unmounts the screen. The cleanup effect skips
   leaveChannel / release when engineRef.current is null.
   On remount (FloatingCallBar tap), the setup effect restores the
   engine so the video session continues without re-joining.
───────────────────────────────────────────────────────────────── */
let _savedVideoEngine: any = null;
let _savedVideoEngineJoined = false;

/* ─────────────────────────────────────────────────────────────────
   Main VideoCallScreen
───────────────────────────────────────────────────────────────── */
export default function VideoCallScreen() {
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
  const [callStatus, setCallStatusState] = useState<CallStatus>(
    callAccepted ? "connected" : "connecting",
  );
  const [activeCallData, setActiveCallData] = useState<any>(incomingCallData || null);
  const [isMuted, setIsMuted]             = useState(false);
  const [isCameraOff, setIsCameraOff]     = useState(false);
  const [isSpeakerOn, setIsSpeakerOn]     = useState(true);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  // remoteVideoMuted tracks whether the remote user has muted their camera.
  // It is kept separate from hasRemoteVideo so the RtcSurfaceView stays mounted
  // (preventing flicker) while we simply show a "camera off" overlay.
  const [remoteVideoMuted, setRemoteVideoMuted] = useState(false);
  const [remoteUid, setRemoteUid]         = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [networkQuality, setNetworkQuality] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [engineReady,   setEngineReady]    = useState(false);
  const [isSwapped,     setIsSwapped]      = useState(false);
  const [showRating,    setShowRating]     = useState(false);

  /* ── Animated values ── */
  const fadeAnim      = useRef(new Animated.Value(0)).current;
  const controlsAnim  = useRef(new Animated.Value(1)).current;
  const pulseAnim1    = useRef(new Animated.Value(1)).current;
  const pulseAnim2    = useRef(new Animated.Value(1)).current;
  const pulseAnim3    = useRef(new Animated.Value(1)).current;
  const endBtnScale   = useRef(new Animated.Value(1)).current;

  /* ── Draggable self-view PiP ── */
  const PIP_W           = 110;
  const PIP_H           = 150;
  const PIP_MARGIN      = 16;
  const SWAP_THRESHOLD  = 8; // px — movement below this = tap → swap

  // Initial position: bottom-right corner (mirrors the old static style)
  const pipPos = useRef(new Animated.ValueXY({
    x: SW - PIP_W - PIP_MARGIN,
    y: SH - PIP_H - 200,
  })).current;

  // Scale flash played when the user taps the PiP to swap
  const pipScaleAnim = useRef(new Animated.Value(1)).current;

  // Whether the current touch moved enough to count as a drag (not a tap)
  const pipMoved        = useRef(false);
  const wasConnectedRef = useRef(false);

  // Stable ref so the PanResponder closure can always call the latest toggleSwap
  const toggleSwapRef = useRef<() => void>(() => {});

  const toggleSwap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(pipScaleAnim, { toValue: 0.90, duration: 70,  useNativeDriver: false }),
      Animated.timing(pipScaleAnim, { toValue: 1,    duration: 120, useNativeDriver: false }),
    ]).start();
    setIsSwapped(prev => !prev);
  }, [pipScaleAnim]);

  // Keep the ref current whenever the callback identity changes
  useEffect(() => { toggleSwapRef.current = toggleSwap; }, [toggleSwap]);

  const pipPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        pipMoved.current = false;
        // Capture current position as offset so dx/dy start at 0
        pipPos.setOffset({
          x: (pipPos.x as any)._value,
          y: (pipPos.y as any)._value,
        });
        pipPos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gs) => {
        if (
          Math.abs(gs.dx) > SWAP_THRESHOLD ||
          Math.abs(gs.dy) > SWAP_THRESHOLD
        ) {
          pipMoved.current = true;
        }
        // Directly set animated value — equivalent to Animated.event dx/dy mapping
        pipPos.setValue({ x: gs.dx, y: gs.dy });
      },
      onPanResponderRelease: () => {
        pipPos.flattenOffset();
        if (!pipMoved.current) {
          // Short tap — swap the streams
          toggleSwapRef.current();
          return;
        }
        // Drag released — snap to nearest corner
        const x = (pipPos.x as any)._value;
        const y = (pipPos.y as any)._value;
        const snapX = x + PIP_W / 2 < SW / 2
          ? PIP_MARGIN
          : SW - PIP_W - PIP_MARGIN;
        const snapY = y + PIP_H / 2 < SH / 2
          ? 70 + PIP_MARGIN
          : SH - PIP_H - 210;
        Animated.spring(pipPos, {
          toValue: { x: snapX, y: snapY },
          useNativeDriver: false,
          tension: 120,
          friction: 14,
        }).start();
      },
    }),
  ).current;

  /* ── Refs ── */
  const ringtoneRef       = useRef<Audio.Sound | null>(null);
  const shouldRingRef     = useRef(false);
  const ringingTimeout    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineRef         = useRef<any>(null);
  const agoraJoined       = useRef(false);
  const activeCallDataRef = useRef<any>(incomingCallData || null);
  const callStatusRef     = useRef<CallStatus>(callAccepted ? "connected" : "connecting");
  const controlsTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const duration = activeCall?.duration || 0;

  /* ── setStatus helper ── */
  const setStatus = useCallback(
    (s: CallStatus) => {
      callStatusRef.current = s;
      setCallStatusState(s);
      updateCallStatus(s);
    },
    [updateCallStatus],
  );

  /* ── Auto-hide controls after 4s when connected ── */
  const showControls = useCallback(() => {
    if (callStatusRef.current !== "connected") return;
    setControlsVisible(true);
    Animated.timing(controlsAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      Animated.timing(controlsAnim, { toValue: 0, duration: 380, useNativeDriver: true }).start(
        () => setControlsVisible(false),
      );
    }, 4000);
  }, [controlsAnim]);

  /* ── Stop ringtone ── */
  const stopRingtone = useCallback(async () => {
    shouldRingRef.current = false;
    Vibration.cancel();
    try {
      if (ringtoneRef.current) {
        const snd = ringtoneRef.current;
        ringtoneRef.current = null;
        snd.stopAsync().catch(() => {}).finally(() => snd.unloadAsync().catch(() => {}));
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
        await sound.stopAsync().catch(() => {});
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
      logger.error("Video ringtone error:", err);
      if (isIncoming && shouldRingRef.current) Vibration.vibrate([500, 1000, 500], true);
    }
  }, [isIncoming, stopRingtone]);

  /* ── Init native Agora engine ── */
  const initEngine = useCallback((callDataObj: any) => {
    if (engineRef.current || Platform.OS === "web" || isExpoGo || !createAgoraRtcEngine) return;
    try {
      if (!callDataObj?.appId) {
        logger.error('[VideoCall] initEngine: appId is missing — Agora engine will not initialize correctly.',
          'callDataObj:', JSON.stringify(callDataObj ?? null));
        // Do not proceed without an appId; an empty-string appId causes a
        // native Agora crash on some OEM builds (Samsung in particular).
        return;
      }
      logger.log('[VideoCall] initEngine — appId present, initializing engine');

      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId: callDataObj.appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      engine.enableVideo();
      engine.enableAudio();
      // Make sure local video capture is actually turned on. enableVideo() is
      // not always enough on the receiving side — without this the local
      // RtcSurfaceView (uid:0) renders an empty surface and the user sees the
      // remote person full-screen but no self-view PiP.
      try { engine.enableLocalVideo(true); } catch {}
      try { engine.enableLocalAudio(true); } catch {}
      try { engine.muteLocalVideoStream(false); } catch {}
      try { engine.muteLocalAudioStream(false); } catch {}
      engine.setDefaultAudioRouteToSpeakerphone(true);

      engine.setVideoEncoderConfiguration({
        dimensions:           { width: 1280, height: 720 },
        frameRate:            30,
        bitrate:              2000,
        orientationMode:      OrientationMode.OrientationModeAdaptive,
        degradationPreference: DegradationPreference.MaintainQuality,
        mirrorMode:           VideoMirrorModeType.VideoMirrorModeEnabled,
      });

      // onJoinChannelSuccess fires once the local user is fully in the channel.
      // This is the definitive signal that Agora is connected — set agoraJoined
      // here (not speculatively in joinAgoraVideo) so the call:ended grace-period
      // guard uses the actual join timestamp rather than the token-fetch start.
      engine.addListener("onJoinChannelSuccess", (_conn: any, elapsed: any) => {
        agoraJoined.current = true;
        logger.log("[VideoCall] Agora joined channel, elapsed:", elapsed, "ms");
      });

      engine.addListener("onUserJoined", (_conn: any, uid: any) => {
        logger.log("[VideoCall] Remote user joined — uid:", uid);
        setRemoteUid(uid);
        setHasRemoteVideo(true);
        setRemoteVideoMuted(false);
      });

      engine.addListener("onUserOffline", (_conn: any, uid: any, reason: any) => {
        logger.log("[VideoCall] Remote user offline — uid:", uid, "reason:", reason);
        setRemoteUid(null);
        setHasRemoteVideo(false);
        if (callStatusRef.current === "connected") {
          handleEngineEndCall();
        }
      });

      engine.addListener("onNetworkQuality", (_conn: any, uid: any, txQ: any, rxQ: any) => {
        if (uid === 0) setNetworkQuality(Math.max(txQ, rxQ));
      });

      engine.addListener("onConnectionStateChanged", (_conn: any, state: any, reason: any) => {
        // Agora states: 1=disconnected, 2=connecting, 3=connected, 4=reconnecting, 5=failed
        logger.log("[VideoCall] Connection state changed:", state, "reason:", reason);
        setIsReconnecting(state === 4);
      });

      // onRemoteVideoStateChanged fires very frequently during normal video
      // streaming (on every packet burst, keyframe, or brief pause). Using it
      // to toggle hasRemoteVideo caused the RtcSurfaceView to conditionally
      // mount/unmount dozens of times per minute, which is the root cause of
      // the video flickering/twitching observed on both sides.
      //
      // FIX: onRemoteVideoStateChanged now only updates remoteVideoMuted —
      // a separate flag that shows a "camera off" overlay WITHOUT unmounting
      // the SurfaceView. hasRemoteVideo is only toggled in onUserJoined /
      // onUserOffline (coarse events that fire once per call leg). This keeps
      // the SurfaceView mounted and stable throughout the call.
      //
      // Agora video states: 0=stopped, 1=starting, 2=decoding, 3=frozen, 4=failed
      engine.addListener("onRemoteVideoStateChanged", (_conn: any, uid: any, state: any, reason: any) => {
        logger.log("[VideoCall] Remote video state changed — uid:", uid, "state:", state, "reason:", reason);
        // state 0 = stopped (remote muted camera); anything else = stream live/recovering
        setRemoteVideoMuted(state === 0);
      });

      engine.addListener("onError", (_conn: any, err: any, msg: any) => {
        logger.warn("[VideoCall] Agora engine error:", err, msg);
      });

      engine.startPreview();
      setEngineReady(true);
      logger.log("[VideoCall] Engine initialized, preview started");
    } catch (e) {
      logger.error("[VideoCall] Engine init error:", e);
    }
  }, []);

  /* ── Internal end-call triggered from engine events ── */
  const handleEngineEndCall = useCallback(() => {
    try { engineRef.current?.leaveChannel(); } catch {}
    const wasConn = callStatusRef.current === "connected";
    logger.log("[VideoCall] handleEngineEndCall — wasConnected:", wasConn);
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

  /* ── Join Agora channel ── */
  const joinAgoraVideo = useCallback(
    async (callDataObj: any) => {
      if (agoraJoined.current) return;

      // Null guard: callDataObj must exist and have a channelName. If missing
      // (e.g. answered from a notification before the full callData was stored),
      // fail gracefully instead of crashing the native Agora engine.
      if (!callDataObj || !callDataObj.channelName) {
        logger.error('[VideoCall] joinAgoraVideo: callDataObj is missing or has no channelName — aborting join',
          JSON.stringify(callDataObj ?? null));
        setStatus('failed');
        setTimeout(() => navigation.canGoBack() && navigation.goBack(), 2000);
        return;
      }

      // Normalize token field names: backend sends callData.token; background
      // accept handler may store it as agoraToken. Ensure both are populated.
      if (callDataObj.token && !callDataObj.agoraToken) callDataObj = { ...callDataObj, agoraToken: callDataObj.token };
      if (callDataObj.agoraToken && !callDataObj.token) callDataObj = { ...callDataObj, token: callDataObj.agoraToken };

      logger.log('[VideoCall] joinAgoraVideo — channelName:', callDataObj.channelName,
        'hasToken:', !!(callDataObj.token), 'hasAppId:', !!callDataObj.appId,
        'isIncoming:', isIncoming);

      // Camera + mic permission MUST be granted before initEngine kicks the
      // capture pipeline, otherwise startPreview() opens an empty surface and
      // the local self-view PiP renders blank.
      if (Platform.OS !== "web") {
        const ok = await ensureCallPermissions(true);
        if (!ok) return;
      }

      agoraJoined.current = true;

      if (Platform.OS === "web" || isExpoGo || !createAgoraRtcEngine) {
        if (Platform.OS === "web") agoraService.joinVideoCall(callDataObj.appId, callDataObj.channelName, callDataObj.token, callDataObj.uid || 0);
        return;
      }

      if (!engineRef.current) initEngine(callDataObj);

      // Defensive: even if the engine already existed, make sure local capture
      // is on before joining (covers re-join after a previous engine release).
      // Note: startPreview() is NOT called here — it was already called inside
      // initEngine(). Calling it again causes a brief camera restart that
      // produces a visible black-frame flash on the local self-view PiP.
      try {
        engineRef.current?.enableLocalVideo(true);
        engineRef.current?.enableLocalAudio(true);
        engineRef.current?.muteLocalVideoStream(false);
        engineRef.current?.muteLocalAudioStream(false);
      } catch {}

      let joinToken = callDataObj.token;
      let joinUid   = callDataObj.uid || 0;

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
          logger.log("Video token fallback");
        }
      }

      try {
        engineRef.current?.joinChannel(joinToken || null, callDataObj.channelName, joinUid, {
          clientRoleType:       ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack:     true,
          autoSubscribeAudio:     true,
          autoSubscribeVideo:     true,
        });
        logger.log("[VideoCall] joinChannel called — channel:", callDataObj.channelName,
          "uid:", joinUid, "isIncoming:", isIncoming);
      } catch (e) {
        logger.error("[VideoCall] joinChannel error:", e);
        agoraJoined.current = false;
      }
    },
    [isIncoming, authToken, get, initEngine],
  );

  /* ── End call ── */
  const handleEndCall = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const dur = activeCall?.duration || 0;
    const wasConnected = callStatusRef.current === "connected";
    logger.log("[VideoCall] handleEndCall — wasConnected:", wasConnected, "duration:", dur);
    callStateRef.lastCallEndedAt = Date.now();
    setStatus("ended");
    await stopRingtone();
    stopGlobalTimer();
    if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);

    if (Platform.OS === "web") {
      agoraService.leave();
    } else if (!isExpoGo) {
      try { engineRef.current?.leaveChannel(); } catch {}
    }

    socketService.endCall({
      targetUserId: isIncoming ? callerId : userId,
      callType: "video",
      duration: dur,
      wasAnswered: wasConnected || dur > 0,
    });
    logger.log("[VideoCall] call:end emitted to targetUserId:", isIncoming ? callerId : userId);
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
      _savedVideoEngine = engineRef.current;
      _savedVideoEngineJoined = agoraJoined.current;
      engineRef.current = null; // signal cleanup to skip teardown
      logger.log('[VideoCall] handleMinimize: engine saved to singleton, agoraJoined:', _savedVideoEngineJoined);
    }
    minimizeCall();
    if (navigation.canGoBack()) navigation.goBack();
  }, [minimizeCall, navigation]);

  /* ── Decline incoming ── */
  const handleDecline = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    callStateRef.lastCallEndedAt = Date.now();
    await stopRingtone();
    if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
    socketService.declineCall({ callerId, callType: "video" });
    if (authToken && isIncoming) {
      post("/call/decline", { callerId, type: "video" }, authToken).catch(() => {});
    }
    setStatus("declined");
    clearCall();
    setTimeout(() => navigation.canGoBack() && navigation.goBack(), 900);
  }, [callerId, isIncoming, authToken, post, stopRingtone, clearCall, navigation, setStatus]);

  /* ── Unified back press handler ── */
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

  /* ── Accept incoming ── */
  const handleAccept = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    logger.log("[VideoCall] handleAccept — verifying permissions, callerId:", callerId);
    // Verify camera + mic BEFORE accepting — otherwise we'd connect with a
    // black local video and the caller would think we hung up. The helper
    // shows a one-tap "Open Settings" dialog if either is hard-denied.
    const ok = await ensureCallPermissions(true);
    if (!ok) {
      socketService.declineCall({ callerId, callType: "video" });
      setStatus("declined");
      callStateRef.lastCallEndedAt = Date.now();
      clearCall();
      setTimeout(() => navigation.canGoBack() && navigation.goBack(), 900);
      return;
    }
    // Emit call:accept FIRST so the caller stops ringing ASAP.
    socketService.acceptCall({ callerId, callData: activeCallData });
    logger.log("[VideoCall] accept event sent to caller:", callerId);
    // Kill ring guard synchronously, then unload in background.
    shouldRingRef.current = false;
    if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
    stopRingtone().catch(() => {});
    setStatus("connected");
    startGlobalTimer();
    showControls();
    logger.log("[VideoCall] handleAccept — joining Agora video channel");
    if (activeCallData) joinAgoraVideo(activeCallData);
  }, [callerId, activeCallData, stopRingtone, joinAgoraVideo, startGlobalTimer, setStatus, showControls, clearCall, navigation]);

  /* ── Toggle mute ── */
  const toggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsMuted((prev) => {
      const next = !prev;
      if (Platform.OS === "web") agoraService.toggleMute(next);
      else if (!isExpoGo) engineRef.current?.muteLocalAudioStream(next);
      return next;
    });
    showControls();
  }, [showControls]);

  /* ── Toggle camera ── */
  const toggleCamera = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsCameraOff((prev) => {
      const next = !prev;
      if (Platform.OS === "web") agoraService.toggleCamera(next);
      else if (!isExpoGo) engineRef.current?.muteLocalVideoStream(next);
      return next;
    });
    showControls();
  }, [showControls]);

  /* ── Flip camera ── */
  const flipCamera = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      agoraService.switchCamera();
    } else if (!isExpoGo) {
      if (engineRef.current && engineReady) {
        engineRef.current.switchCamera();
      } else {
        logger.warn("[VideoCall] flipCamera called before engine was ready");
      }
    }
    showControls();
  }, [engineReady, showControls]);

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
    } catch {}
    if (Platform.OS !== "web" && !isExpoGo) engineRef.current?.setEnableSpeakerphone(next);
    showControls();
  }, [isSpeakerOn, showControls]);

  /* ── Initiate outgoing call ── */
  const initiateCall = useCallback(async () => {
    if (!authToken || !userId) return setStatus("failed");
    // Verify camera + mic BEFORE we even ring the other side. Avoids the
    // confusing case where we'd dial out and then connect with a black
    // local video. On hard-deny the helper shows a one-tap Settings link.
    const ok = await ensureCallPermissions(true);
    if (!ok) { setStatus("failed"); return; }
    try {
      const response = await post<any>(
        "/agora/call/initiate",
        { targetUserId: userId, callType: "video" },
        authToken,
      );
      if (response.success && response.data?.callData) {
        const cd = response.data.callData;
        setActiveCallData(cd);
        activeCallDataRef.current = cd;

        if (Platform.OS !== "web") initEngine(cd);

        setStatus("ringing");

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
            socketService.missedCall?.({ targetUserId: userId, callType: "video" });
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
  }, [authToken, userId, post, user, navigation, setStatus, clearCall, initEngine]);

  /* ── Release engine on unmount ── */
  const releaseEngine = useCallback(() => {
    if (!engineRef.current || Platform.OS === "web" || isExpoGo) return;
    try {
      engineRef.current.removeAllListeners();
      engineRef.current.leaveChannel();
      engineRef.current.release();
      engineRef.current = null;
      agoraJoined.current = false;
      setEngineReady(false);
    } catch {}
  }, []);

  /* ── Setup effect ── */
  useEffect(() => {
    logger.log(
      '[VideoCall] Screen mounted',
      '| callAccepted:', callAccepted,
      '| isIncoming:', isIncoming,
      '| callerId:', callerId,
      '| userId:', userId,
      '| hasChannelName:', !!(incomingCallData?.channelName),
      '| hasAppId:', !!(incomingCallData?.appId),
      '| socketConnected:', socketService.isConnected(),
      '| returnToCall:', returnToCall,
    );

    Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }).start();

    setIsOnCallScreen(true);
    maximizeCall();

    setActiveCall({
      userId: userId || callerId || "",
      userName: userName || "Unknown",
      userPhoto,
      isIncoming: !!isIncoming,
      callStatus: callAccepted ? "connected" : "connecting",
      callType: "video",
      duration: 0,
    });

    // Restore the Agora engine saved by handleMinimize, if any.
    if (_savedVideoEngine) {
      engineRef.current = _savedVideoEngine;
      agoraJoined.current = _savedVideoEngineJoined;
      _savedVideoEngine = null;
      _savedVideoEngineJoined = false;
      logger.log('[VideoCall] setup: restored engine from minimize singleton, agoraJoined:', agoraJoined.current);
    }

    if (callAccepted) {
      logger.log('[VideoCall] callAccepted=true — entering connected state immediately');
      setStatus("connected");
      startGlobalTimer();
      showControls();
      if (activeCallDataRef.current) {
        logger.log('[VideoCall] joining Agora video channel — channelName:', activeCallDataRef.current?.channelName);
        joinAgoraVideo(activeCallDataRef.current);
      } else {
        logger.error('[VideoCall] callAccepted=true but activeCallDataRef is null — cannot join Agora');
      }
      // Emit call:accept so the caller receives call:accepted and joins Agora.
      // Required for Path B cold-start (killed device, push notification tap):
      // the receiver navigates here directly with callAccepted:true but nobody
      // has emitted acceptCall yet, so the caller never gets call:accepted and
      // never enters the Agora channel.
      if (isIncoming && callerId) {
        const doAccept = () => {
          logger.log('[VideoCall] emitting call:accept for callerId:', callerId,
            '| socketConnected:', socketService.isConnected());
          socketService.acceptCall({ callerId, callData: activeCallDataRef.current });
        };
        if (socketService.isConnected()) {
          doAccept();
        } else {
          logger.log('[VideoCall] socket not connected yet — queuing call:accept via onConnectOnce');
          socketService.onConnectOnce(doAccept);
        }
      }
    } else if (returnToCall) {
      // Returning from minimize — engine is already live (restored above).
      // Just set the UI state; no Agora re-join needed.
      setStatus("connected");
      showControls();
    } else if (isIncoming) {
      setStatus("ringing");
      ringingTimeout.current = setTimeout(async () => {
        if (callStatusRef.current === "ringing") {
          await stopRingtone();
          socketService.declineCall({ callerId, callType: "video" });
          setStatus("missed");
          clearCall();
          setTimeout(() => navigation.canGoBack() && navigation.goBack(), 1500);
        }
      }, 60000);
    } else {
      initiateCall();
    }

    // cbAccepted: caller receives this when the receiver taps Answer.
    // Stop ringing ASAP (already set shouldRingRef=false on the receiver side),
    // then join Agora so both sides enter the channel together.
    const cbAccepted = async () => {
      logger.log("[VideoCall] call:accepted — receiver answered, stopping ring");
      shouldRingRef.current = false;
      stopRingtone().catch(() => {});
      if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
      setStatus("connected");
      startGlobalTimer();
      showControls();
      if (activeCallDataRef.current) joinAgoraVideo(activeCallDataRef.current);
    };
    socketService.onCallAccepted(cbAccepted);

    const cbDeclined = async () => {
      logger.log("[VideoCall] call:declined received");
      callStateRef.lastCallEndedAt = Date.now();
      await stopRingtone();
      if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
      setStatus("declined");
      clearCall();
      setTimeout(() => navigation.canGoBack() && navigation.goBack(), 1500);
    };
    socketService.onCallDeclined(cbDeclined);

    const cbBusy = async () => {
      logger.log("[VideoCall] call:busy received");
      callStateRef.lastCallEndedAt = Date.now();
      await stopRingtone();
      if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
      setStatus("busy");
      clearCall();
      setTimeout(() => navigation.canGoBack() && navigation.goBack(), 2000);
    };
    socketService.onCallBusy(cbBusy);

    /* Cold-start armor: when the user answers a video call from a push
     * notification while the app was killed, the original caller may have
     * already given up (their `pendingCall` expires after 35s on the
     * backend) by the time we cold-launch. The backend then bounces a
     * `call:ended` to us — which used to dismiss the call screen the
     * moment it finished mounting. Give the join pipeline a brief window
     * to actually connect both sides before honouring `call:ended`. */
    // Grace period logic — mirrors VoiceCallScreen.  Two cases:
    // 1. Cold-start: socket not yet connected → 8 s window before Agora joins.
    // 2. Receiver foreground accept: 3 s window so a stale call:ended can't
    //    pop the screen before the Agora engine has a chance to connect.
    const coldStartAccept   = !!callAccepted && !socketService.isConnected();
    const receiverFgAccept  = !!callAccepted && !!isIncoming;
    const acceptArmedAt = Date.now();
    const cbEnded = async () => {
      const elapsed = Date.now() - acceptArmedAt;
      const withinGrace =
        (coldStartAccept  && elapsed < 8000 && !agoraJoined.current) ||
        (receiverFgAccept && elapsed < 8000 && !agoraJoined.current);
      logger.log("[VideoCall] call:ended received — elapsed:", elapsed, "ms, withinGrace:", withinGrace);
      if (withinGrace) {
        logger.log("[VideoCall] Ignoring stale call:ended during accept join window");
        return;
      }
      callStateRef.lastCallEndedAt = Date.now();
      await stopRingtone();
      if (Platform.OS === "web") agoraService.leave();
      else if (!isExpoGo) { try { engineRef.current?.leaveChannel(); } catch {} }
      const wasConn = callStatusRef.current === "connected";
      logger.log("[VideoCall] call:ended handled — wasConnected:", wasConn);
      setStatus("ended");
      stopGlobalTimer();
      clearCall();
      if (wasConn) {
        wasConnectedRef.current = true;
        setShowRating(true);
      } else {
        setTimeout(() => navigation.canGoBack() && navigation.goBack(), 1200);
      }
    };
    socketService.onCallEnded(cbEnded);

    return () => {
      setIsOnCallScreen(false);
      stopRingtone();
      if (ringingTimeout.current) clearTimeout(ringingTimeout.current);
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      // Use specific-callback removal so we don't accidentally nuke listeners
      // registered by IncomingCallHandler or other components for the same event.
      socketService.off("call:accepted", cbAccepted);
      socketService.off("call:declined", cbDeclined);
      socketService.off("call:busy", cbBusy);
      socketService.off("call:ended", cbEnded);
      releaseEngine();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Ringtone on status change ── */
  useEffect(() => {
    if (callStatus === "ringing") playRingtone();
    else stopRingtone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus]);

  /* ── Audio mode for active call ── */
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

  /* ── Pulse ring animation ── */
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
        [
          { text: "Continue", style: "cancel" },
          { text: "Upgrade", style: "default", onPress: () => {} },
        ],
      );
    }
    if (duration >= 300) handleEndCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, callStatus]);

  /* ── Derived state ── */
  const isConnected  = callStatus === "connected";
  const isTerminal   = ["ended", "declined", "missed", "failed", "busy"].includes(callStatus);
  const isWaiting    = !isIncoming && callStatus === "ringing";
  const showIncoming = isIncoming && callStatus === "ringing";
  const showCancel   = callStatus === "connecting" || isWaiting;
  const nativeVideo  = Platform.OS !== "web" && !isExpoGo && !!createAgoraRtcEngine;
  const showVideo    = (isConnected || (!isIncoming && (callStatus === "connecting" || callStatus === "ringing"))) && nativeVideo;

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const statusText = (): string => {
    switch (callStatus) {
      case "connecting": return "Connecting…";
      case "ringing":    return isIncoming ? "Incoming video call" : "Ringing…";
      case "connected":  return "Connected";
      case "ended":      return "Call ended";
      case "declined":   return "Call declined";
      case "busy":       return "User is busy";
      case "missed":     return "No answer";
      case "failed":     return "Call failed";
      default:           return "";
    }
  };

  const terminalMsg = (): string => {
    if (callStatus === "busy")     return "User is in another call";
    if (callStatus === "declined") return "Call was declined";
    if (callStatus === "missed")   return "No answer";
    return "Unable to connect";
  };

  /* ── Render ── */
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Background blurred avatar — visible until video starts */}
      {!showVideo && (
        <>
          <SafeImage
            source={{ uri: userPhoto || "https://via.placeholder.com/400" }}
            style={StyleSheet.absoluteFillObject as any}
            blurRadius={Platform.OS === "ios" ? 65 : 20}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(5,10,25,0.45)", "rgba(0,0,0,0.60)"]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}

      {/* ── NATIVE VIDEO VIEWS (iOS / Android, not Expo Go) ── */}
      {nativeVideo && engineReady && RtcSurfaceView && (

        <>
          {/* Remote video — full-screen when NOT swapped.
              Mounted as soon as remoteUid is known (set by onUserJoined) and
              kept alive until the remote user leaves (onUserOffline sets
              remoteUid=null).  Critically, it no longer unmounts on every
              onRemoteVideoStateChanged event — that was the root cause of the
              video flickering/twitching bug.
              When the remote user has muted their camera (remoteVideoMuted)
              we show a darkened overlay instead of unmounting the SurfaceView. */}
          {isConnected && remoteUid !== null && !isSwapped && (
            <>
              <RtcSurfaceView
                canvas={{
                  uid: remoteUid,
                  renderMode: RenderModeType.RenderModeHidden,
                }}
                style={StyleSheet.absoluteFillObject}
              />
              {remoteVideoMuted && (
                <View style={[StyleSheet.absoluteFillObject, s.remoteVideoMutedOverlay]}>
                  <View style={s.remoteVideoMutedBadge}>
                    <Ionicons name="videocam-off" size={22} color="rgba(255,255,255,0.7)" />
                  </View>
                </View>
              )}
            </>
          )}

          {/* Local self-view — render TWO stable mounts (fullscreen and PiP)
              and toggle visibility instead of swapping keys.

              Why not a single view with style swap?
                Android SurfaceView's z-order (`zOrderMediaOverlay`) is set
                ONCE when the view is attached to the window — changing the
                prop later has no effect. And remounting via `key` change
                detaches the Agora capture from the surface; on the callee
                side that left the PiP blank after accept ("I can't see
                myself"). Two separate, never-remounted SurfaceViews fix
                both: the PiP is created with z-order overlay from the start
                so it always sits above the remote view.

              Swap logic:
                isSwapped=false (default) → remote full-screen, local PiP
                isSwapped=true  (tapped)  → local full-screen, remote PiP  */}

          {/* Local full-screen:
              • while waiting for remote to join (original behaviour), OR
              • when the user swapped so local fills the background           */}
          {showVideo && !isCameraOff &&
            (!(isConnected && hasRemoteVideo) || isSwapped) && (
            <RtcSurfaceView
              canvas={{
                uid: 0,
                sourceType: VideoSourceType.VideoSourceCamera,
                renderMode: RenderModeType.RenderModeHidden,
                mirrorMode: VideoMirrorModeType.VideoMirrorModeEnabled,
              }}
              style={StyleSheet.absoluteFillObject}
            />
          )}

          {/* Draggable PiP — shown once remote is live.
              • Not swapped → shows local camera (uid 0)
              • Swapped     → shows remote stream (uid remoteUid)
              Tap the PiP to toggle swap; drag to reposition.
              A key on the inner RtcSurfaceView forces it to remount with
              the correct uid when the swap changes, while the outer
              Animated.View (with zOrderMediaOverlay) stays stable so the
              z-order overlay is preserved across the swap.               */}
          {isConnected && hasRemoteVideo && (
            <Animated.View
              style={[
                s.localPip,
                { left: pipPos.x, top: pipPos.y, transform: [{ scale: pipScaleAnim }] },
              ]}
              {...pipPan.panHandlers}
            >
              {/* Camera video inside the PiP */}
              {isSwapped ? (
                /* Swapped: remote stream fills the PiP */
                remoteUid !== null ? (
                  <RtcSurfaceView
                    key="pip-remote"
                    canvas={{
                      uid: remoteUid,
                      renderMode: RenderModeType.RenderModeHidden,
                    }}
                    style={StyleSheet.absoluteFillObject}
                    zOrderMediaOverlay
                  />
                ) : null
              ) : (
                /* Default: local camera in the PiP */
                showVideo && !isCameraOff ? (
                  <RtcSurfaceView
                    key="pip-local"
                    canvas={{
                      uid: 0,
                      sourceType: VideoSourceType.VideoSourceCamera,
                      renderMode: RenderModeType.RenderModeHidden,
                      mirrorMode: VideoMirrorModeType.VideoMirrorModeEnabled,
                    }}
                    style={StyleSheet.absoluteFillObject}
                    zOrderMediaOverlay
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFillObject, s.camOffPip]}>
                    <Ionicons name="videocam-off" size={18} color="rgba(255,255,255,0.5)" />
                  </View>
                )
              )}

              {/* Swap-hint icon — subtle indicator that the PiP is tappable */}
              <View style={s.pipSwapHint} pointerEvents="none">
                <Ionicons name="swap-horizontal" size={13} color="rgba(255,255,255,0.70)" />
              </View>
            </Animated.View>
          )}
        </>
      )}

      {/* ── UI OVERLAY ── */}
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]} pointerEvents="box-none">

        {/* Tap to show controls */}
        {isConnected && !controlsVisible && (
          <Pressable style={StyleSheet.absoluteFillObject} onPress={showControls} />
        )}

        {/* ── TOP GRADIENT + header ── */}
        <Animated.View
          style={[s.topOverlay, { opacity: isConnected ? controlsAnim : 1 }]}
          pointerEvents={isConnected && !controlsVisible ? "none" : "box-none"}
        >
          <LinearGradient
            colors={["rgba(0,0,0,0.50)", "transparent"]}
            style={s.topGrad}
          >
            <View style={[s.topRow, { paddingTop: insets.top + 16 }]}>
              <Pressable style={s.topBtn} hitSlop={12} onPress={handleBackPress}>
                <Ionicons
                  name={isConnected ? "chevron-down" : "arrow-back"}
                  size={22}
                  color="#fff"
                />
              </Pressable>

              <View style={s.topInfo}>
                <Text style={s.topName} numberOfLines={1}>{userName || "Unknown"}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  <Text style={[s.topStatus, isTerminal && { color: "#f87171" }]}>
                    {isReconnecting
                      ? "Reconnecting…"
                      : isConnected && duration > 0
                        ? formatDuration(duration)
                        : statusText()}
                  </Text>
                  {isConnected && !isReconnecting && networkQuality > 0 && (
                    <View style={s.qualityBadge}>
                      <SignalBars quality={networkQuality} />
                      {networkQuality >= 3 && (
                        <Text style={[s.qualityText, { color: qualityToBars(networkQuality).color }]}>
                          {qualityToBars(networkQuality).label}
                        </Text>
                      )}
                    </View>
                  )}
                  {isReconnecting && (
                    <View style={[s.qualityBadge, { backgroundColor: "rgba(248,113,113,0.18)", borderColor: "rgba(248,113,113,0.4)" }]}>
                      <ActivityIndicator size="small" color="#f87171" />
                    </View>
                  )}
                </View>
              </View>

              {isConnected && isCameraOff ? (
                <View style={s.camOffBadge}>
                  <Ionicons name="videocam-off" size={14} color="#fff" />
                </View>
              ) : (
                <View style={{ width: 38 }} />
              )}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── AVATAR (when no remote video or not connected) ── */}
        {(!isConnected || !hasRemoteVideo) && (
          <View style={s.avatarCenter}>
            <View style={[
              s.avatarFrame,
              isConnected && s.avatarFrameConnected,
              isTerminal && s.avatarFrameTerminal,
            ]}>
              {(callStatus === "ringing" || callStatus === "connecting") && (
                <>
                  <PulseRing anim={pulseAnim1} size={AVATAR_SIZE + 20} />
                  <PulseRing anim={pulseAnim2} size={AVATAR_SIZE + 40} />
                  <PulseRing anim={pulseAnim3} size={AVATAR_SIZE + 60} />
                </>
              )}
              <SafeImage
                source={{ uri: userPhoto || "https://via.placeholder.com/200" }}
                style={s.avatarImg}
                contentFit="cover"
              />
            </View>

            {isTerminal && callStatus !== "ended" && (
              <View style={s.errorPill}>
                <Ionicons name="close-circle" size={14} color="#f87171" />
                <Text style={s.errorText}>{terminalMsg()}</Text>
              </View>
            )}

            {(callStatus === "ringing" || callStatus === "connecting") && (
              <View style={s.e2eBadge}>
                <Ionicons name="lock-closed" size={10} color="#34d399" />
                <Text style={s.e2eText}>End-to-end encrypted</Text>
              </View>
            )}
          </View>
        )}

        {/* ── BOTTOM GRADIENT + controls ── */}
        <Animated.View
          style={[s.bottomOverlay, { opacity: isConnected ? controlsAnim : 1 }]}
          pointerEvents={isConnected && !controlsVisible ? "none" : "box-none"}
        >
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.60)"]}
            style={s.bottomGrad}
          >
            {/* INCOMING: Decline + Accept */}
            {showIncoming && (
              <View style={[s.ctrlRow, { paddingBottom: insets.bottom + 28 }]}>
                <View style={s.ctrlItem}>
                  <Pressable style={[s.bigBtn, s.redBtn]} onPress={handleDecline}>
                    <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
                  </Pressable>
                  <Text style={s.bigBtnLabel}>Decline</Text>
                </View>
                <View style={s.ctrlItem}>
                  <Pressable style={[s.bigBtn, s.greenBtn]} onPress={handleAccept}>
                    <Ionicons name="videocam" size={30} color="#fff" />
                  </Pressable>
                  <Text style={s.bigBtnLabel}>Accept</Text>
                </View>
              </View>
            )}

            {/* CONNECTED: full controls */}
            {isConnected && (
              <View style={[s.ctrlRow, { paddingBottom: insets.bottom + 28 }]}>
                <VidBtn icon={isMuted ? "mic-off" : "mic"} label={isMuted ? "Unmute" : "Mute"} active={isMuted} onPress={toggleMute} />
                <VidBtn icon={isCameraOff ? "videocam-off" : "videocam"} label={isCameraOff ? "Cam On" : "Cam Off"} active={isCameraOff} onPress={toggleCamera} />
                <VidBtn icon="camera-reverse" label="Flip" onPress={flipCamera} />
                <VidBtn icon={isSpeakerOn ? "volume-high" : "ear"} label={isSpeakerOn ? "Speaker" : "Earpiece"} active={!isSpeakerOn} onPress={toggleSpeaker} />
                <View style={vb.wrap}>
                  <Animated.View style={{ transform: [{ scale: endBtnScale }] }}>
                    <Pressable
                      style={[s.bigBtn, s.redBtn]}
                      onPress={handleEndCall}
                      onPressIn={() => Animated.spring(endBtnScale, { toValue: 0.88, useNativeDriver: true, tension: 220, friction: 8 }).start()}
                      onPressOut={() => Animated.spring(endBtnScale, { toValue: 1, useNativeDriver: true, tension: 220, friction: 8 }).start()}
                    >
                      <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
                    </Pressable>
                  </Animated.View>
                  <Text style={vb.label}>End</Text>
                </View>
              </View>
            )}

            {/* OUTGOING / CONNECTING: Cancel */}
            {showCancel && (
              <View style={[s.ctrlRow, { paddingBottom: insets.bottom + 28 }]}>
                <View style={s.ctrlItem}>
                  <Pressable style={[s.bigBtn, s.redBtn]} onPress={handleEndCall}>
                    <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
                  </Pressable>
                  <Text style={s.bigBtnLabel}>Cancel</Text>
                </View>
              </View>
            )}

            {/* TERMINAL: Quality rating (if call was connected) or plain Close */}
            {isTerminal && showRating && (
              <CallQualityRating
                authToken={authToken || ""}
                channelName={activeCallData?.channelName}
                callType="video"
                peerId={isIncoming ? (callerId || "") : (userId || "")}
                duration={activeCall?.duration || 0}
                onClose={() => { clearCall(); if (navigation.canGoBack()) navigation.goBack(); }}
              />
            )}
            {isTerminal && !showRating && (
              <View style={[s.ctrlRow, { paddingBottom: insets.bottom + 28 }]}>
                <View style={s.ctrlItem}>
                  <Pressable style={s.bigBtn} onPress={() => { clearCall(); navigation.canGoBack() && navigation.goBack(); }}>
                    <Ionicons name="close" size={28} color="#fff" />
                  </Pressable>
                  <Text style={s.bigBtnLabel}>Close</Text>
                </View>
              </View>
            )}
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Styles
───────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject },

  topOverlay: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  topGrad:    { paddingBottom: 40 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  topInfo: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  topName: {
    fontSize: 16, fontWeight: "700", color: "#fff",
    textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  topStatus: { fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 2, fontVariant: ["tabular-nums"] },
  camOffBadge: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(220,38,38,0.70)",
    alignItems: "center", justifyContent: "center",
  },
  qualityBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
    backgroundColor: "rgba(251,191,36,0.18)", borderWidth: 1, borderColor: "rgba(251,191,36,0.35)",
  },
  qualityText: { fontSize: 10, color: "#fbbf24", fontWeight: "600" },

  avatarCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    paddingTop: 100, paddingBottom: 160,
  },
  avatarFrame: {
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden", borderWidth: 3, borderColor: "rgba(52,211,153,0.50)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#10b981", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 24, elevation: 16,
  },
  avatarFrameConnected: { borderColor: "rgba(255,255,255,0.30)" },
  avatarFrameTerminal:  { borderColor: "rgba(248,113,113,0.40)" },
  avatarImg: { width: "100%", height: "100%" },

  errorPill: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
    backgroundColor: "rgba(248,113,113,0.12)", borderWidth: 1, borderColor: "rgba(248,113,113,0.28)",
  },
  errorText: { fontSize: 13, color: "#f87171", fontWeight: "500" },

  e2eBadge: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    backgroundColor: "rgba(52,211,153,0.10)", borderWidth: 1, borderColor: "rgba(52,211,153,0.25)",
  },
  e2eText: { fontSize: 11, color: "rgba(52,211,153,0.80)", fontWeight: "500" },

  bottomOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10 },
  bottomGrad:    { paddingTop: 60 },

  ctrlRow: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-end", paddingHorizontal: 16 },
  ctrlItem: { alignItems: "center", gap: 6 },

  bigBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  redBtn: {
    backgroundColor: "#dc2626",
    shadowColor: "#dc2626", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 12, elevation: 10,
  },
  greenBtn: {
    backgroundColor: "#10b981",
    shadowColor: "#10b981", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 12, elevation: 10,
  },
  bigBtnLabel: { fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: "500" },

  /* Native video PiP (self-view when remote is present) — position driven by pipPos */
  localPip: {
    position: "absolute",
    width: 110,
    height: 150,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    zIndex: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 8,
  },
  camOffPip: {
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  // Overlay shown when the remote user has muted their camera.  Sits on top of
  // the RtcSurfaceView (which stays mounted to avoid GL surface teardown/flicker)
  // and shows a darkened background with a camera-off icon.
  remoteVideoMutedOverlay: {
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  remoteVideoMutedBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  pipSwapHint: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderRadius: 8,
    padding: 2,
  },
});
