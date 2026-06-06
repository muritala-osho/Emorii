import React, { useState, useEffect, useRef } from "react";
import { View, Animated, Pressable, LayoutChangeEvent, GestureResponderEvent } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { WAVEFORM_HEIGHTS } from "@/constants/chatConstants";

interface WavyWaveformProps {
  isPlaying: boolean;
  progress: number;
  isMe: boolean;
  theme: any;
  duration?: number;
  onSeek?: (fraction: number) => void;
}

const formatDuration = (secs?: number) => {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const WavyWaveform = ({ isPlaying, progress, isMe, theme, duration, onSeek }: WavyWaveformProps) => {
  const BAR_COUNT = 30;
  const widthRef = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => { widthRef.current = e.nativeEvent.layout.width; };
  const handleSeekTouch = (e: GestureResponderEvent) => {
    if (!onSeek || !widthRef.current) return;
    const x = e.nativeEvent.locationX;
    const f = Math.max(0, Math.min(1, x / widthRef.current));
    onSeek(f);
  };
  const [animations] = useState(() =>
    WAVEFORM_HEIGHTS.slice(0, BAR_COUNT).map((h) => new Animated.Value(h)),
  );
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (isPlaying) {
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = animations.map((anim, i) => {
        const baseH = WAVEFORM_HEIGHTS[i % WAVEFORM_HEIGHTS.length];
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: baseH * (0.3 + Math.random() * 0.7) + 0.4,
              duration: 200 + (i % 5) * 60,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: baseH * 0.6,
              duration: 180 + (i % 4) * 50,
              useNativeDriver: false,
            }),
          ]),
        );
        loop.start();
        return loop;
      });
    } else {
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = [];
      animations.forEach((anim, i) => {
        Animated.spring(anim, {
          toValue: WAVEFORM_HEIGHTS[i % WAVEFORM_HEIGHTS.length],
          useNativeDriver: false,
          tension: 60,
          friction: 8,
        }).start();
      });
    }
    return () => {
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = [];
    };
  }, [isPlaying]);

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onLayout={onLayout}
        onPress={onSeek ? handleSeekTouch : undefined}
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: 28,
          gap: 2,
          flex: 1,
          overflow: "hidden",
        }}
      >
        {animations.map((anim, i) => {
          const barProgress = i / BAR_COUNT;
          const isActive = barProgress <= progress;
          const isPast = progress > 0 && barProgress < progress;
          return (
            <Animated.View
              key={i}
              style={{
                width: 3,
                borderRadius: 2,
                height: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [3, 22],
                }),
                backgroundColor: isPast || isActive
                  ? isMe ? "rgba(255,255,255,0.95)" : theme.primary
                  : isMe ? "rgba(255,255,255,0.35)" : theme.border + "AA",
              }}
            />
          );
        })}
      </Pressable>
      {duration !== undefined && duration > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
          <ThemedText style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.6)" : theme.textSecondary }}>
            {progress > 0 ? formatDuration(progress * duration) : "0:00"}
          </ThemedText>
          <ThemedText style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.6)" : theme.textSecondary }}>
            {formatDuration(duration)}
          </ThemedText>
        </View>
      )}
    </View>
  );
};

export default WavyWaveform;
