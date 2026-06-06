import logger from '@/utils/logger';
import { useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, Dimensions, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather, Ionicons } from "@expo/vector-icons";
import { getPhotoSource } from "@/utils/photos";
import * as Haptics from 'expo-haptics';
import { Audio } from '../utils/expoAvCompat';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withSequence,
  withDelay,
  withTiming,
  withRepeat,
  interpolate,
  Extrapolate,
  Easing
} from 'react-native-reanimated';

const { width, height } = Dimensions.get("window");
const PHOTO_SIZE = width * 0.32;

type MatchPopupScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "MatchPopup">;
type MatchPopupScreenRouteProp = RouteProp<RootStackParamList, "MatchPopup">;

interface MatchPopupScreenProps {
  navigation: MatchPopupScreenNavigationProp;
  route: MatchPopupScreenRouteProp;
}

export default function MatchPopupScreen({ navigation, route }: MatchPopupScreenProps) {
  const { currentUser, matchedUser, isSuperLike } = route.params || {};
  const insets = useSafeAreaInsets();
  const matchSoundRef = useRef<Audio.Sound | null>(null);
  
  const leftPhotoScale = useSharedValue(0);
  const rightPhotoScale = useSharedValue(0);
  const leftPhotoX = useSharedValue(-100);
  const rightPhotoX = useSharedValue(100);
  const heartScale = useSharedValue(0);
  const heartPulse = useSharedValue(1);
  const textOpacity = useSharedValue(0);
  const textY = useSharedValue(30);
  const buttonsOpacity = useSharedValue(0);
  const buttonsY = useSharedValue(50);
  const sparkleRotate = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const playMatchSound = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/sounds/match-success.mp3'),
          { shouldPlay: true, volume: 0.8 }
        );
        matchSoundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync();
            matchSoundRef.current = null;
          }
        });
      } catch (err) {
        logger.log('Match sound error:', err);
      }
    };
    playMatchSound();

    return () => {
      if (matchSoundRef.current) {
        matchSoundRef.current.stopAsync().catch(() => {});
        matchSoundRef.current.unloadAsync().catch(() => {});
        matchSoundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    leftPhotoScale.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 100 }));
    rightPhotoScale.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 100 }));
    leftPhotoX.value = withDelay(100, withSpring(0, { damping: 15, stiffness: 80 }));
    rightPhotoX.value = withDelay(200, withSpring(0, { damping: 15, stiffness: 80 }));
    
    heartScale.value = withDelay(400, withSpring(1, { damping: 8, stiffness: 120 }));
    heartPulse.value = withDelay(600, withRepeat(
      withSequence(
        withTiming(1.15, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    ));
    
    textOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    textY.value = withDelay(500, withSpring(0, { damping: 15 }));
    
    buttonsOpacity.value = withDelay(700, withTiming(1, { duration: 300 }));
    buttonsY.value = withDelay(700, withSpring(0, { damping: 15 }));
    
    sparkleRotate.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
    
    glowOpacity.value = withDelay(400, withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1000 }),
        withTiming(0.3, { duration: 1000 })
      ),
      -1,
      true
    ));
  }, []);

  const currentUserPhoto = currentUser?.photos?.[0] ? getPhotoSource(currentUser.photos[0]) : null;
  const matchedUserPhoto = matchedUser?.photos?.[0] ? getPhotoSource(matchedUser.photos[0]) : null;

  const leftPhotoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: leftPhotoX.value },
      { scale: leftPhotoScale.value },
    ],
  }));

  const rightPhotoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: rightPhotoX.value },
      { scale: rightPhotoScale.value },
    ],
  }));

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value * heartPulse.value }],
    opacity: heartScale.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }],
  }));

  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsY.value }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sparkleRotate.value}deg` }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const handleSendMessage = () => {
    navigation.replace("ChatDetail", { 
      userId: matchedUser.id, 
      userName: matchedUser.name,
      userPhoto: typeof matchedUserPhoto === 'object' && matchedUserPhoto?.uri ? matchedUserPhoto.uri : undefined
    });
  };

  const handleKeepSwiping = () => {
    navigation.goBack();
  };

  const primaryColor = isSuperLike ? '#7c4dff' : '#FF6B6B';
  const secondaryColor = isSuperLike ? '#b388ff' : '#FF8E53';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={isSuperLike 
          ? ['#0f0c29', '#302b63', '#24243e'] 
          : ['#1a1a2e', '#16213e', '#1a1a2e']}
        style={styles.gradient}
      />

      {/* Animated glow behind photos */}
      <Animated.View style={[styles.glowContainer, glowStyle]}>
        <LinearGradient
          colors={[primaryColor, secondaryColor, 'transparent']}
          style={styles.glowGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      {/* Sparkles */}
      <Animated.View style={[styles.sparkleContainer, sparkleStyle]}>
        {[...Array(12)].map((_, i) => (
          <View
            key={i}
            style={[
              styles.sparkle,
              {
                transform: [
                  { rotate: `${i * 30}deg` },
                  { translateY: -height * 0.25 },
                ],
              },
            ]}
          >
            <Ionicons name="sparkles" size={20} color={primaryColor} style={{ opacity: 0.6 }} />
          </View>
        ))}
      </Animated.View>

      {/* Hearts floating up */}
      <View style={styles.floatingHeartsContainer}>
        {[...Array(8)].map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.floatingHeart,
              {
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${i * 0.3}s`,
              },
            ]}
          >
            <Ionicons name="heart" size={16 + Math.random() * 12} color={primaryColor} style={{ opacity: 0.4 }} />
          </Animated.View>
        ))}
      </View>

      <View style={[styles.content, { paddingTop: insets.top + 60 }]}>
        {/* Round Photos Side by Side */}
        <View style={styles.photosContainer}>
          <Animated.View style={[styles.photoWrapper, leftPhotoStyle]}>
            <View style={[styles.photoBorder, { borderColor: primaryColor }]}>
              {currentUserPhoto ? (
                <Image
                  source={currentUserPhoto}
                  style={styles.roundPhoto}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.roundPhoto, styles.noPhoto]}>
                  <Feather name="user" size={40} color="#666" />
                </View>
              )}
            </View>
            <View style={[styles.nameTag, { backgroundColor: primaryColor }]}>
              <ThemedText style={styles.nameTagText}>You</ThemedText>
            </View>
          </Animated.View>

          {/* Heart Badge in Center */}
          <Animated.View style={[styles.heartBadge, heartStyle]}>
            <LinearGradient
              colors={[primaryColor, secondaryColor]}
              style={styles.heartGradient}
            >
              <Ionicons name="heart" size={32} color="#FFF" />
            </LinearGradient>
          </Animated.View>

          <Animated.View style={[styles.photoWrapper, rightPhotoStyle]}>
            <View style={[styles.photoBorder, { borderColor: secondaryColor }]}>
              {matchedUserPhoto ? (
                <Image
                  source={matchedUserPhoto}
                  style={styles.roundPhoto}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.roundPhoto, styles.noPhoto]}>
                  <Feather name="user" size={40} color="#666" />
                </View>
              )}
            </View>
            <View style={[styles.nameTag, { backgroundColor: secondaryColor }]}>
              <ThemedText style={styles.nameTagText} numberOfLines={1}>{matchedUser.name}</ThemedText>
            </View>
          </Animated.View>
        </View>

        {/* Match Text */}
        <Animated.View style={[styles.textContainer, textStyle]}>
          <ThemedText style={styles.matchTitle}>
            {isSuperLike ? "✨ Super Match! ✨" : "It's a Match! 💕"}
          </ThemedText>
          <ThemedText style={styles.matchSubtitle}>
            {currentUser.name} & {matchedUser.name}
          </ThemedText>
          <ThemedText style={styles.matchDescription}>
            You both liked each other! Why not start a conversation?
          </ThemedText>
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View style={[styles.buttonsContainer, buttonsStyle, { paddingBottom: insets.bottom + 30 }]}>
          <Pressable
            style={styles.messageButton}
            onPress={handleSendMessage}
          >
            <LinearGradient
              colors={[primaryColor, secondaryColor]}
              style={styles.messageButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="chatbubble-ellipses" size={24} color="#FFF" />
              <ThemedText style={styles.messageButtonText}>Send Message</ThemedText>
            </LinearGradient>
          </Pressable>

          <Pressable
            style={styles.keepSwipingButton}
            onPress={handleKeepSwiping}
          >
            <ThemedText style={styles.keepSwipingText}>Keep Swiping</ThemedText>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  glowContainer: {
    position: 'absolute',
    top: height * 0.15,
    left: '50%',
    marginLeft: -150,
    width: 300,
    height: 300,
    borderRadius: 150,
    overflow: 'hidden',
  },
  glowGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 150,
  },
  sparkleContainer: {
    position: 'absolute',
    top: height * 0.35,
    left: '50%',
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: {
    position: 'absolute',
  },
  floatingHeartsContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  floatingHeart: {
    position: 'absolute',
    bottom: -30,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
  },
  photosContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  photoWrapper: {
    alignItems: 'center',
  },
  photoBorder: {
    width: PHOTO_SIZE + 8,
    height: PHOTO_SIZE + 8,
    borderRadius: (PHOTO_SIZE + 8) / 2,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },
  roundPhoto: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
  },
  noPhoto: {
    backgroundColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameTag: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  nameTagText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  heartBadge: {
    marginHorizontal: -15,
    zIndex: 10,
  },
  heartGradient: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFF',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  matchTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
    textShadowColor: 'rgba(255,107,107,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  matchSubtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFD93D',
    marginTop: 10,
    textAlign: 'center',
  },
  matchDescription: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
  },
  messageButton: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  messageButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 12,
  },
  messageButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  keepSwipingButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  keepSwipingText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
});
