
import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius } from "@/constants/theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

export function Skeleton({ width = "100%", height = 20, borderRadius = BorderRadius.sm, style }: SkeletonProps) {
  const { theme } = useTheme();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 1000 }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.backgroundSecondary,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function ProfileCardSkeleton() {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.skeletonCard, { backgroundColor: theme.surface }]}>
      <Skeleton height={200} borderRadius={0} />
      <View style={styles.skeletonContent}>
        <Skeleton width="60%" height={24} />
        <Skeleton width="40%" height={16} style={{ marginTop: 8 }} />
        <Skeleton width="80%" height={16} style={{ marginTop: 12 }} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Skeleton width={60} height={24} borderRadius={12} />
          <Skeleton width={70} height={24} borderRadius={12} />
          <Skeleton width={55} height={24} borderRadius={12} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    marginBottom: 12,
  },
  skeletonContent: {
    padding: 12,
  },
});
