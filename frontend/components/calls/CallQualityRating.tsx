import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getApiBaseUrl } from "@/constants/config";

interface CallQualityRatingProps {
  authToken: string;
  channelName?: string;
  callType: "voice" | "video";
  peerId: string;
  duration: number;
  onClose: () => void;
}

const AUTO_CLOSE_MS = 8000;

export default function CallQualityRating({
  authToken,
  channelName,
  callType,
  peerId,
  duration,
  onClose,
}: CallQualityRatingProps) {
  const [hovered, setHovered]     = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const slideAnim   = useRef(new Animated.Value(40)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef   = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim,   { toValue: 0, useNativeDriver: true, tension: 70, friction: 11 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    timerRef.current = setTimeout(() => close(null), AUTO_CLOSE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (rating: number) => {
    if (!authToken) return;
    const apiUrl = getApiBaseUrl();
    fetch(`${apiUrl}/api/call/quality`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body:    JSON.stringify({ rating, callType, channelName: channelName || "", peerId, duration }),
    }).catch(() => {});
  };

  const close = (rating: number | null) => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rating !== null) { setSubmitted(true); submit(rating); }
    Animated.parallel([
      Animated.timing(slideAnim,   { toValue: 40, duration: 220, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0,  duration: 220, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  return (
    <Animated.View style={[s.wrap, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}>
      {submitted ? (
        <Text style={s.thanks}>Thanks for the feedback!</Text>
      ) : (
        <>
          <Text style={s.title}>How was the call quality?</Text>
          <View style={s.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPressIn={() => setHovered(n)}
                onPressOut={() => setHovered(0)}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  close(n);
                }}
                style={s.starHit}
              >
                <Ionicons
                  name={n <= hovered ? "star" : "star-outline"}
                  size={34}
                  color={n <= hovered ? "#f59e0b" : "rgba(255,255,255,0.38)"}
                />
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => close(null)} hitSlop={10}>
            <Text style={s.skip}>Skip</Text>
          </Pressable>
        </>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  title:   { fontSize: 14, color: "rgba(255,255,255,0.78)", marginBottom: 14, fontWeight: "500" },
  stars:   { flexDirection: "row", gap: 6, marginBottom: 12 },
  starHit: { padding: 4 },
  skip:    { fontSize: 12, color: "rgba(255,255,255,0.35)", textDecorationLine: "underline" },
  thanks:  { fontSize: 15, color: "#34d399", fontWeight: "600", paddingVertical: 6 },
});
