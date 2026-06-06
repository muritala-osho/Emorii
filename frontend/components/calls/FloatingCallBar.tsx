import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { SafeImage } from "@/components/SafeImage";
import { useCallContext } from "@/contexts/CallContext";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export default function FloatingCallBar() {
  const { activeCall, isCallMinimized, isOnCallScreen, maximizeCall } = useCallContext();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  /* Only show the bar when minimized AND not currently on a call screen */
  const show = !!(
    activeCall &&
    isCallMinimized &&
    activeCall.callStatus === "connected" &&
    !isOnCallScreen
  );

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: show ? 0 : -80,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [show]);

  useEffect(() => {
    if (!show) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [show]);

  /* Never render on top of the call screens */
  if (!activeCall || isOnCallScreen) return null;

  const handleTap = () => {
    maximizeCall();
    const screen = activeCall.callType === "video" ? "VideoCall" : "VoiceCall";
    navigation.navigate(screen, {
      userId: activeCall.userId,
      userName: activeCall.userName,
      userPhoto: activeCall.userPhoto,
      isIncoming: activeCall.isIncoming,
      returnToCall: true,
    });
  };

  const isVideo = activeCall.callType === "video";

  return (
    <Animated.View
      style={[
        styles.bar,
        { top: insets.top + 8, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Pressable style={styles.inner} onPress={handleTap}>
        <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />

        <SafeImage
          source={{ uri: activeCall.userPhoto || "https://via.placeholder.com/36" }}
          style={styles.avatar}
        />

        <View style={styles.info}>
          <ThemedText style={styles.name} numberOfLines={1}>
            {activeCall.userName}
          </ThemedText>
          <ThemedText style={styles.timer}>
            {formatDuration(activeCall.duration)}
          </ThemedText>
        </View>

        <View style={styles.returnBtn}>
          <Ionicons name={isVideo ? "videocam" : "call"} size={18} color="#fff" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 20,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    backgroundColor: "#1a1a2e",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#22c55e",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  timer: {
    fontSize: 12,
    color: "#22c55e",
    fontWeight: "600",
    marginTop: 1,
  },
  returnBtn: {
    backgroundColor: "#22c55e",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
});
