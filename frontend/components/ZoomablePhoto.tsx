import React from "react";
import { Image, ImageSourcePropType, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

interface Props {
  source: ImageSourcePropType;
  width: number;
  height: number;
  onSingleTap?: () => void;
  onZoomChange?: (zoomed: boolean) => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export default function ZoomablePhoto({ source, width, height, onSingleTap, onZoomChange }: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const wasZoomedRef = React.useRef(false);
  const notifyZoom = (zoomed: boolean) => {
    if (wasZoomedRef.current === zoomed) return;
    wasZoomedRef.current = zoomed;
    onZoomChange?.(zoomed);
  };

  const reset = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    notifyZoom(false);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      // Tell the parent (e.g. swipeable gallery) to lock its horizontal scroll
      // the moment a pinch begins, so it doesn't steal the gesture mid-zoom.
      runOnJS(notifyZoom)(true);
    })
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE * 0.8), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE);
        savedScale.value = MIN_SCALE;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(notifyZoom)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(notifyZoom)(scale.value > 1.05);
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(notifyZoom)(false);
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
        runOnJS(notifyZoom)(true);
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onSingleTap) runOnJS(onSingleTap)();
    })
    .requireExternalGestureToFail(doubleTap);

  const composed = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  React.useEffect(() => {
    return () => {
      reset();
    };
  }, []);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.container, { width, height }]}>
        <Animated.View style={[styles.imageWrap, animatedStyle]}>
          <Image
            source={source}
            style={{ width, height }}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  imageWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
