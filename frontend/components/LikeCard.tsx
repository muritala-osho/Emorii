import React from "react";
import { View, StyleSheet, Pressable, Dimensions, TouchableOpacity } from "react-native";
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  runOnJS,
  withTiming,
  interpolate
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { Feather } from "@expo/vector-icons";
import { getPhotoSource } from "@/utils/photos";
import { Spacing, BorderRadius } from "@/constants/theme";
import { VerificationBadge } from "@/components/VerificationBadge";

const { width } = Dimensions.get("window");
const CARD_GAP = 10;
const COLUMN_WIDTH = (width - Spacing.lg * 2 - CARD_GAP) / 2;
const TALL_CARD_HEIGHT = COLUMN_WIDTH * 1.55;
const SHORT_CARD_HEIGHT = COLUMN_WIDTH * 1.1;

interface LikeCardProps {
  likeUser: any;
  isTall: boolean;
  isLast: boolean;
  isPremium: boolean;
  onLikeBack: (userId: string) => void;
  onPass: (userId: string) => void;
  onPress: (userId: string) => void;
  onPremiumRequired: () => void;
  onRemove: (userId: string) => void;
}

function LikeCardComponent({ 
  likeUser, 
  isTall, 
  isLast, 
  isPremium,
  onLikeBack, 
  onPass, 
  onPress,
  onPremiumRequired,
  onRemove
}: LikeCardProps) {
  const photoSource = likeUser.photos?.[0] ? getPhotoSource(likeUser.photos[0]) : null;
  const cardHeight = isTall ? TALL_CARD_HEIGHT : SHORT_CARD_HEIGHT;
  
  const translateX = useSharedValue(0);
  const context = useSharedValue({ x: 0 });

  const triggerLikeBack = () => {
    if (likeUser.isBlurred && !isPremium) {
      onPremiumRequired();
      return;
    }
    onLikeBack(likeUser._id);
  };

  const triggerPass = () => {
    onPass(likeUser._id);
    onRemove(likeUser._id);
  };

  const gesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-20, 20])
    .minDistance(8)
    .onStart(() => {
      context.value = { x: translateX.value };
    })
    .onUpdate((event) => {
      translateX.value = event.translationX * 1.2 + context.value.x;
    })
    .onEnd((event) => {
      const velocity = event.velocityX;
      const threshold = width * 0.15;
      
      if (translateX.value > threshold || velocity > 400) {
        if (likeUser.isBlurred && !isPremium) {
          translateX.value = withSpring(0, { damping: 15, stiffness: 400 });
          runOnJS(onPremiumRequired)();
          return;
        }
        translateX.value = withTiming(width, { duration: 200 }, () => {
          runOnJS(onLikeBack)(likeUser._id);
        });
      } else if (translateX.value < -threshold || velocity < -400) {
        translateX.value = withTiming(-width, { duration: 200 }, () => {
          runOnJS(onPass)(likeUser._id);
          runOnJS(onRemove)(likeUser._id);
        });
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 400 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const likeIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, width * 0.15], [0, 1]),
  }));

  const nopeIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -width * 0.15], [0, 1]),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.matchCard, animatedStyle, { height: cardHeight, marginBottom: isLast ? 0 : CARD_GAP }]}
      >
        <Pressable
          style={styles.likeCardContent}
          onPress={() => onPress(likeUser._id)}
        >
          {photoSource ? (
            <Image
              source={photoSource}
              style={[styles.matchPhoto, likeUser.isBlurred && { opacity: 0.3 }]}
              contentFit="cover"
              blurRadius={likeUser.isBlurred ? 15 : 0}
            />
          ) : (
            <View style={[styles.matchPhoto, styles.noPhotoContainer]}>
              <Feather name="user" size={50} color="#666" />
            </View>
          )}
          
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.cardGradient}
          />

          {likeUser.isBlurred && (
            <View style={styles.blurOverlay}>
              <Feather name="lock" size={28} color="#FFF" />
              <ThemedText style={styles.blurOverlayText}>Upgrade to see details</ThemedText>
            </View>
          )}

          <Animated.View style={[styles.swipeIndicator, styles.likeIndicator, likeIndicatorStyle]}>
            <Feather name="heart" size={26} color="#FFF" />
          </Animated.View>
          <Animated.View style={[styles.swipeIndicator, styles.nopeIndicator, nopeIndicatorStyle]}>
            <Feather name="x" size={26} color="#FFF" />
          </Animated.View>
          
          <View style={[styles.matchBadge, { backgroundColor: '#FF6B6B' }]}>
            <ThemedText style={styles.matchBadgeText}>Likes you</ThemedText>
          </View>
          
          {likeUser.onlineStatus === 'online' && (
            <View style={styles.onlineDot} />
          )}
          
          <View style={styles.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <ThemedText style={styles.cardName} numberOfLines={1}>
                {likeUser.isBlurred ? `${(likeUser.name || '?')[0]}***` : likeUser.name}{likeUser.age && !likeUser.isBlurred ? `, ${likeUser.age}` : ''}
              </ThemedText>
              {likeUser.verified && !likeUser.isBlurred && (
                <VerificationBadge size={14} />
              )}
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.passBtn]} 
                onPress={triggerPass}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color="#FF3B30" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.likeBtn]} 
                onPress={triggerLikeBack}
                activeOpacity={0.7}
              >
                <Feather name="heart" size={18} color="#4CD964" />
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  matchCard: {
    width: COLUMN_WIDTH,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: '#2A2A2A',
  },
  likeCardContent: {
    flex: 1,
    position: 'relative',
  },
  matchPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  noPhotoContainer: {
    backgroundColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  swipeIndicator: {
    position: 'absolute',
    top: '40%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeIndicator: {
    right: 8,
    backgroundColor: 'rgba(76, 217, 100, 0.9)',
  },
  nopeIndicator: {
    left: 8,
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
  },
  matchBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  matchBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CD964',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  cardInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
  },
  cardName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  passBtn: {
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderColor: '#FF3B30',
  },
  likeBtn: {
    backgroundColor: 'rgba(76,217,100,0.15)',
    borderColor: '#4CD964',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 5,
    paddingHorizontal: 10,
  },
  blurOverlayText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
});

const LikeCard = React.memo(LikeCardComponent);
export default LikeCard;
