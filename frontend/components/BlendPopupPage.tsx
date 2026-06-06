import { useEffect } from 'react';
import { View, Pressable, Dimensions, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/ThemedText';
import { getPhotoSource } from '@/utils/photos';
import { DiscoverUser } from '@/constants/discoveryConstants';

const { width, height } = Dimensions.get('window');
const PHOTO_SIZE = Math.min(width * 0.32, 130);

interface BlendPopupPageProps {
  blendMatch: {
    user: DiscoverUser;
    shared: string[];
    songMatch?: { type: 'song' | 'artist'; title?: string; artist?: string; albumArt?: string };
  } | null;
  currentUser: any;
  theme: any;
  onClose: () => void;
  onLike: () => void;
}

export default function BlendPopupPage({
  blendMatch,
  currentUser,
  theme,
  onClose,
  onLike,
}: BlendPopupPageProps) {
  const insets = useSafeAreaInsets();

  const leftScale = useSharedValue(0);
  const rightScale = useSharedValue(0);
  const leftX = useSharedValue(-60);
  const rightX = useSharedValue(60);
  const badgeScale = useSharedValue(0);
  const badgePulse = useSharedValue(1);
  const contentOpacity = useSharedValue(0);
  const contentY = useSharedValue(20);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (!blendMatch) return;
    leftScale.value = 0;
    rightScale.value = 0;
    leftX.value = -60;
    rightX.value = 60;
    badgeScale.value = 0;
    contentOpacity.value = 0;
    contentY.value = 20;

    leftScale.value = withDelay(80, withSpring(1, { damping: 12, stiffness: 110 }));
    rightScale.value = withDelay(160, withSpring(1, { damping: 12, stiffness: 110 }));
    leftX.value = withDelay(80, withSpring(0, { damping: 14, stiffness: 90 }));
    rightX.value = withDelay(160, withSpring(0, { damping: 14, stiffness: 90 }));
    badgeScale.value = withDelay(320, withSpring(1, { damping: 8, stiffness: 130 }));
    contentOpacity.value = withDelay(420, withTiming(1, { duration: 400 }));
    contentY.value = withDelay(420, withSpring(0, { damping: 14 }));

    badgePulse.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 1400 }),
        withTiming(0.25, { duration: 1400 }),
      ),
      -1,
      true,
    );
  }, [blendMatch?.user.id]);

  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftX.value }, { scale: leftScale.value }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightX.value }, { scale: rightScale.value }],
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value * badgePulse.value }],
    opacity: badgeScale.value,
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  if (!blendMatch) return null;

  const { user: them, shared, songMatch } = blendMatch;
  const myPhoto = currentUser?.photos?.[0] ? getPhotoSource(currentUser.photos[0]) : null;
  const theirPhoto = them.photos?.[0] ? getPhotoSource(them.photos[0]) : null;

  const accent = theme.primary;
  const accent2 = '#FF8E53';

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <LinearGradient
        colors={[accent + '30', theme.background, theme.background]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.55 }}
      />

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: height * 0.12,
            alignSelf: 'center',
            width: 320,
            height: 320,
            borderRadius: 160,
            overflow: 'hidden',
          },
          glowStyle,
        ]}
      >
        <LinearGradient
          colors={[accent, accent2, 'transparent']}
          style={{ width: '100%', height: '100%' }}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      <Pressable
        onPress={onClose}
        hitSlop={12}
        style={{
          position: 'absolute',
          top: insets.top + 12,
          right: 16,
          zIndex: 20,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: 'rgba(0,0,0,0.35)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="x" size={20} color="#FFF" />
      </Pressable>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 60,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: accent + '25', marginBottom: 24 }}>
          <Feather name="zap" size={13} color={accent} />
          <ThemedText style={{ fontSize: 12, fontWeight: '800', color: accent, letterSpacing: 1 }}>
            BLEND DETECTED
          </ThemedText>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Animated.View style={[leftStyle]}>
            <View style={{ width: PHOTO_SIZE + 8, height: PHOTO_SIZE + 8, borderRadius: (PHOTO_SIZE + 8) / 2, borderWidth: 3, borderColor: accent, padding: 3, backgroundColor: theme.surface }}>
              {myPhoto ? (
                <Image source={myPhoto} style={{ width: '100%', height: '100%', borderRadius: PHOTO_SIZE / 2 }} contentFit="cover" />
              ) : (
                <View style={{ width: '100%', height: '100%', borderRadius: PHOTO_SIZE / 2, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="user" size={36} color={theme.textSecondary} />
                </View>
              )}
            </View>
            <View style={{ marginTop: 8, alignItems: 'center' }}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                You
              </ThemedText>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              {
                marginHorizontal: -18,
                zIndex: 5,
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.surface,
                marginBottom: 28,
              },
              badgeStyle,
            ]}
          >
            <LinearGradient
              colors={[accent, accent2]}
              style={{ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="zap" size={24} color="#FFF" />
            </LinearGradient>
          </Animated.View>

          <Animated.View style={[rightStyle]}>
            <View style={{ width: PHOTO_SIZE + 8, height: PHOTO_SIZE + 8, borderRadius: (PHOTO_SIZE + 8) / 2, borderWidth: 3, borderColor: accent2, padding: 3, backgroundColor: theme.surface }}>
              {theirPhoto ? (
                <Image source={theirPhoto} style={{ width: '100%', height: '100%', borderRadius: PHOTO_SIZE / 2 }} contentFit="cover" />
              ) : (
                <View style={{ width: '100%', height: '100%', borderRadius: PHOTO_SIZE / 2, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="user" size={36} color={theme.textSecondary} />
                </View>
              )}
            </View>
            <View style={{ marginTop: 8, alignItems: 'center' }}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                {them.name}
              </ThemedText>
            </View>
          </Animated.View>
        </View>

        <Animated.View style={[contentStyle, { alignItems: 'center' }]}>
          <ThemedText style={{ fontSize: 26, fontWeight: '800', color: theme.text, textAlign: 'center', letterSpacing: -0.3 }}>
            You might be a Blend
          </ThemedText>
          <ThemedText style={{ fontSize: 16, color: theme.textSecondary, textAlign: 'center', marginTop: 6 }}>
            with <ThemedText style={{ color: accent, fontWeight: '700' }}>{them.name}</ThemedText>
          </ThemedText>

          {them.similarityScore != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}>
              <Feather name="trending-up" size={13} color={accent} />
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>
                {Math.round(them.similarityScore)}% in common
              </ThemedText>
            </View>
          )}

          {songMatch && (
            <View style={{ width: '100%', marginTop: 24, padding: 16, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1, borderColor: accent + '40' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Ionicons name="musical-notes" size={14} color={accent} />
                <ThemedText style={{ fontSize: 11, fontWeight: '800', color: accent, letterSpacing: 0.8 }}>
                  {songMatch.type === 'song' ? 'SAME FAVORITE SONG' : 'SAME FAVORITE ARTIST'}
                </ThemedText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
                  {songMatch.albumArt ? (
                    <Image source={{ uri: songMatch.albumArt }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Ionicons name="musical-note" size={26} color={theme.textSecondary} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  {songMatch.type === 'song' ? (
                    <>
                      <ThemedText style={{ fontSize: 15, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                        {songMatch.title}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }} numberOfLines={1}>
                        {songMatch.artist}
                      </ThemedText>
                    </>
                  ) : (
                    <ThemedText style={{ fontSize: 15, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                      {songMatch.artist}
                    </ThemedText>
                  )}
                </View>
              </View>
            </View>
          )}

          {shared && shared.length > 0 && (
            <View style={{ width: '100%', marginTop: 22 }}>
              <ThemedText style={{ fontSize: 11, fontWeight: '800', color: theme.textSecondary, letterSpacing: 1, marginBottom: 12, textAlign: 'center' }}>
                YOU BOTH LOVE
              </ThemedText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {shared.slice(0, 8).map((tag) => (
                  <View key={tag} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: accent + '15', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Feather name="check" size={12} color={accent} />
                    <ThemedText style={{ fontSize: 13, color: accent, fontWeight: '700' }}>{tag}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Animated.View>

        <Animated.View style={[contentStyle, { flexDirection: 'row', gap: 12, marginTop: 32, width: '100%' }]}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 16,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: theme.border,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <ThemedText style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>Skip</ThemedText>
          </Pressable>
          <Pressable
            onPress={onLike}
            style={({ pressed }) => ({
              flex: 1.5,
              paddingVertical: 16,
              borderRadius: 999,
              alignItems: 'center',
              opacity: pressed ? 0.9 : 1,
              overflow: 'hidden',
              shadowColor: accent,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4,
              shadowRadius: 14,
              elevation: 8,
            })}
          >
            <LinearGradient
              colors={[accent, accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Feather name="heart" size={17} color="#FFF" />
              <ThemedText style={{ color: '#FFF', fontWeight: '800', fontSize: 15 }}>Send Like</ThemedText>
            </View>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
