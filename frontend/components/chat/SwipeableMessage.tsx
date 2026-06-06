import React, { useRef } from "react";
import { View, Animated, PanResponder } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Message } from "@/types/chat";

interface SwipeableMessageProps {
  item: Message;
  isMe: boolean;
  children: React.ReactNode;
  onReply: (item: Message) => void;
  themeTextSecondary: string;
}

const SwipeableMessage = React.memo(
  ({ item, isMe, children, onReply, themeTextSecondary }: SwipeableMessageProps) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const itemRef = useRef(item);
    const onReplyRef = useRef(onReply);
    itemRef.current = item;
    onReplyRef.current = onReply;

    const panResponder = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dx) > 10 &&
            Math.abs(gestureState.dy) < 10 &&
            gestureState.dx < 0
          );
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0) {
            translateX.setValue(Math.max(gestureState.dx, -80));
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -50) {
            onReplyRef.current(itemRef.current);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    ).current;

    return (
      <View style={{ overflow: "hidden" }}>
        <View
          style={{
            position: "absolute",
            right: isMe ? undefined : 8,
            left: isMe ? 8 : undefined,
            top: 0,
            bottom: 0,
            justifyContent: "center",
          }}
        >
          <Feather name="corner-up-left" size={20} color={themeTextSecondary} />
        </View>
        <Animated.View
          style={{ transform: [{ translateX }] }}
          {...panResponder.panHandlers}
        >
          {children}
        </Animated.View>
      </View>
    );
  },
);

export default SwipeableMessage;
