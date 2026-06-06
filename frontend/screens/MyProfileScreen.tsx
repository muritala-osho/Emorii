import logger from '@/utils/logger';
import { useState, useRef, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, Modal, Dimensions, ScrollView, TouchableOpacity } from "react-native";
import { useThemedAlert } from "@/components/ThemedAlert";
import { SafeImage } from "@/components/SafeImage";
import ZoomablePhoto from "@/components/ZoomablePhoto";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { CompositeNavigationProp, useFocusEffect } from "@react-navigation/native";
import { useUnread } from "@/contexts/UnreadContext";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainTabParamList } from "@/navigation/MainTabNavigator";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { useTranslation } from "@/hooks/useLanguage";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getPhotoSource } from "@/utils/photos";
import * as Haptics from 'expo-haptics';
import { Platform } from "react-native";
import ProfilePrompts from "@/components/profile/ProfilePrompts";
import SpotifyEmbedPlayer from "@/components/SpotifyEmbedPlayer";
import { PremiumBadge } from "@/components/PremiumBadge";
import { VerificationBadge } from "@/components/VerificationBadge";
import VoiceBio from "@/components/VoiceBio";
import { ProfileCompletionBanner } from "@/components/profile/ProfileCompletion";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MyProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "MyProfile">,
  NativeStackNavigationProp<RootStackParamList>
>;

interface MyProfileScreenProps {
  navigation: MyProfileScreenNavigationProp;
}

const ZODIAC_EMOJI: { [key: string]: string } = {
  aries: '♈',
  taurus: '♉',
  gemini: '♊',
  cancer: '♋',
  leo: '♌',
  virgo: '♍',
  libra: '♎',
  scorpio: '♏',
  sagittarius: '♐',
  capricorn: '♑',
  aquarius: '♒',
  pisces: '♓',
};

const GENDER_LABELS: { [key: string]: string } = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
};

const LOOKING_FOR_LABELS: { [key: string]: string } = {
  relationship: 'Relationship',
  friendship: 'Friendship',
  casual: 'Casual',
  networking: 'Networking',
};

const EDUCATION_LABELS: { [key: string]: string } = {
  high_school: 'High School',
  some_college: 'Some College',
  bachelors: "Bachelor's Degree",
  masters: "Master's Degree",
  doctorate: 'Doctorate',
  trade_school: 'Trade School',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};


const LIFESTYLE_LABELS: { [key: string]: string } = {
  never: 'Never',
  socially: 'Socially',
  regularly: 'Regularly',
  rarely: 'Rarely',
  often: 'Often',
  daily: 'Daily',
  sometimes: 'Sometimes',
  prefer_not_to_say: 'Prefer not to say',

  introverted: 'Introverted',
  ambiverted: 'Ambiverted',
  ambivert: 'Ambivert',
  extroverted: 'Extroverted',

  romantic: 'Romantic',
  playful: 'Playful',
  passionate: 'Passionate',
  intellectual: 'Intellectual',
  caring: 'Caring',
  adventurous: 'Adventurous',
  practical: 'Practical',
  selfless: 'Selfless',
  physical: 'Physical Touch',
  acts_of_service: 'Acts of Service',
  words_of_affirmation: 'Words of Affirmation',
  quality_time: 'Quality Time',
  gift_giving: 'Gift Giving',

  big_talker: 'Big Talker',
  listener: 'Good Listener',
  texter: 'Texter',
  caller: 'Phone Caller',

  christian: 'Christian',
  muslim: 'Muslim',
  traditional: 'Traditional',
  atheist: 'Atheist',
  spiritual: 'Spiritual',
  hindu: 'Hindu',
  buddhist: 'Buddhist',
  jewish: 'Jewish',
  agnostic: 'Agnostic',
  other: 'Other',

  yes: 'Yes',
  no: 'No',
  open_to_it: 'Open to it',
  not_sure: 'Not sure',

  none: 'No pets',
  dog: 'Dog lover',
  cat: 'Cat lover',
  parrot: 'Parrot',
  allergic: 'Allergic to pets',

  african: 'African',
  african_american: 'African American',
  caribbean: 'Caribbean',
  mixed: 'Mixed',

  short_term: 'Short-term Dating',
  long_term: 'Long-term Relationship',
  friendship: 'Friendship',
  networking: 'Networking',
  casual: 'Casual',
  marriage: 'Marriage',
  open_to_everything: 'Open to Everything',
  not_sure_yet: 'Not Sure Yet',

  relationship: 'Relationship',
  hookup: 'Hookup',
  both: 'Both',

  first: '1st Generation',
  second: '2nd Generation',
  third: '3rd+ Generation',
};

const { width, height } = Dimensions.get('window');
const HERO_HEIGHT = height * 0.5;

export default function MyProfileScreen({ navigation }: MyProfileScreenProps) {
  const { theme } = useTheme();
  const { user, logout, token, fetchUser } = useAuth();
  const { del } = useApi();
  const { t } = useTranslation();
  const { showAlert, AlertComponent } = useThemedAlert();
  const { resetProfileBadge } = useUnread();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      resetProfileBadge();
    }, [])
  );
  const [selectedPhoto, setSelectedPhoto] = useState<number>(0);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [currentHeroPhoto, setCurrentHeroPhoto] = useState(0);
  const [localTime, setLocalTime] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  useEffect(() => {
    const update = () =>
      setLocalTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, []);
  const flatListRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (photoModalVisible && selectedPhoto > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollTo({
          x: width * selectedPhoto,
          animated: false,
        });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [photoModalVisible]);

  const handleLogout = () => {
    showAlert(
      t('logout'),
      t('logoutConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
      'log-out'
    );
  };

  const handleDeletePhoto = async (photoIndex: number) => {
    const photo = user?.photos?.[photoIndex];
    if (!photo) return;

    if ((user?.photos?.length ?? 0) <= 4) {
      showAlert(t('error'), "You need at least 4 photos on your profile. Add more before deleting this one.", [{ text: t('ok'), style: 'default' }], 'alert-circle');
      return;
    }

    showAlert(
      t('delete'),
      t('confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await del(`/upload/photo?publicId=${encodeURIComponent(photo.publicId || (photo as any)._id)}`, token ?? undefined);
              await fetchUser();
              if (photoIndex > 0) {
                setSelectedPhoto(photoIndex - 1);
              }
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } catch (error) {
              logger.error('Delete photo error:', error);
              showAlert(t('error'), 'Failed to delete photo', [{ text: t('ok'), style: 'default' }], 'alert-circle');
            }
          },
        },
      ],
      'trash-2'
    );
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setSelectedPhoto(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const photoSource = user?.photos && user.photos[currentHeroPhoto] ? getPhotoSource(user.photos[currentHeroPhoto]) : null;
  const totalPhotos = user?.photos?.length || 0;

  const handleHeroTap = (evt: any) => {
    const tapX = evt.nativeEvent.locationX;
    const tapY = evt.nativeEvent.locationY;
    
    if (tapY < 60) return;

    if (totalPhotos <= 1) return;
    if (tapX > width / 2) {
      setCurrentHeroPhoto((prev) => (prev + 1) % totalPhotos);
    } else {
      setCurrentHeroPhoto((prev) => (prev - 1 + totalPhotos) % totalPhotos);
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleIndicatorPress = (index: number) => {
    setCurrentHeroPhoto(index);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const profileDetails = [
    user?.gender && {
      icon: 'user' as const,
      label: t('gender'),
      value: GENDER_LABELS[user.gender] || user.gender,
    },
    user?.lookingFor && {
      icon: 'heart' as const,
      label: t('lookingFor'),
      value: LOOKING_FOR_LABELS[user.lookingFor] || user.lookingFor,
    },
    (user as any)?.zodiacSign && {
      icon: 'star' as const,
      label: t('zodiac'),
      value: `${(user as any).zodiacSign.charAt(0).toUpperCase() + (user as any).zodiacSign.slice(1)} ${ZODIAC_EMOJI[(user as any).zodiacSign] || ''}`,
    },
    (user as any)?.jobTitle && {
      icon: 'briefcase' as const,
      label: t('work'),
      value: (user as any).jobTitle,
    },
    (user as any)?.school && {
      icon: 'book-open' as const,
      label: 'School',
      value: (user as any).school,
    },
    (user as any)?.education && {
      icon: 'book' as const,
      label: t('education'),
      value: EDUCATION_LABELS[(user as any).education] || (user as any).education,
    },
    (user as any)?.relationshipGoal && {
      icon: 'target' as const,
      label: 'Relationship Goal',
      value: (user as any).relationshipGoal,
    },
    (user as any)?.livingIn && {
      icon: 'map' as const,
      label: t('livingIn'),
      value: (user as any).livingIn,
    },
    (user as any)?.favoriteSong?.title && {
      icon: 'music' as const,
      label: t('favoriteSong'),
      value: `${(user as any).favoriteSong.title}${(user as any).favoriteSong.artist ? ` by ${(user as any).favoriteSong.artist}` : ''}`,
    },
    (user as any)?.lifestyle?.smoking && {
      icon: 'wind' as const,
      label: 'Smoking',
      value: LIFESTYLE_LABELS[(user as any).lifestyle.smoking] || (user as any).lifestyle.smoking,
    },
    (user as any)?.lifestyle?.drinking && {
      icon: 'coffee' as const,
      label: 'Drinking',
      value: LIFESTYLE_LABELS[(user as any).lifestyle.drinking] || (user as any).lifestyle.drinking,
    },
    ((user as any)?.lifestyle?.religion || (user as any)?.religion) && {
      icon: 'sun' as const,
      label: 'Religion',
      value: LIFESTYLE_LABELS[(user as any).lifestyle?.religion || (user as any).religion] || (user as any).lifestyle?.religion || (user as any).religion,
    },
    ((user as any)?.lifestyle?.ethnicity || (user as any)?.ethnicity) && {
      icon: 'globe' as const,
      label: 'Ethnicity',
      value: (user as any).lifestyle?.ethnicity || (user as any).ethnicity,
    },
    (user as any)?.lifestyle?.personalityType && {
      icon: 'zap' as const,
      label: 'Personality',
      value: (user as any).lifestyle.personalityType,
    },
    (user as any)?.lifestyle?.pets ? {
      icon: 'heart' as const,
      label: 'Pets',
      value: LIFESTYLE_LABELS[(user as any).lifestyle.pets] || (user as any).lifestyle.pets,
    } : (user as any)?.lifestyle?.hasPets != null && {
      icon: 'heart' as const,
      label: 'Has Pets',
      value: (user as any).lifestyle.hasPets ? 'Yes' : 'No',
    },
    (user as any)?.lifestyle?.relationshipStatus && {
      icon: 'heart' as const,
      label: 'Relationship',
      value: (user as any).lifestyle.relationshipStatus,
    },
    (user as any)?.lifestyle?.workout && {
      icon: 'activity' as const,
      label: 'Workout',
      value: LIFESTYLE_LABELS[(user as any).lifestyle.workout] || (user as any).lifestyle.workout,
    },
    (user as any)?.lifestyle?.communicationStyle && {
      icon: 'message-circle' as const,
      label: 'Communication',
      value: (user as any).lifestyle.communicationStyle,
    },
    (user as any)?.lifestyle?.loveStyle && {
      icon: 'heart' as const,
      label: 'Love Style',
      value: (user as any).lifestyle.loveStyle,
    },
    ((user as any)?.location?.city || (user as any)?.location?.address) && {
      icon: 'map-pin' as const,
      label: 'Location',
      value: `${(user as any).location?.city || (user as any).location?.address || ''}${(user as any).location?.country ? `, ${(user as any).location.country}` : ''}`,
    },
    (user as any)?.height && {
      icon: 'trending-up' as const,
      label: 'Height',
      value: `${(user as any).height} cm`,
    },
    (user as any)?.countryOfOrigin && {
      icon: 'globe' as const,
      label: 'Country of Origin',
      value: (user as any).countryOfOrigin,
    },
    (user as any)?.tribe && {
      icon: 'users' as const,
      label: 'Tribe / Ethnicity',
      value: (user as any).tribe,
    },
    (user as any)?.languages?.length > 0 && {
      icon: 'message-square' as const,
      label: 'Languages',
      value: Array.isArray((user as any).languages) ? (user as any).languages.join(', ') : (user as any).languages,
    },
    (user as any)?.diasporaGeneration && {
      icon: 'git-branch' as const,
      label: 'Diaspora Generation',
      value: (user as any).diasporaGeneration,
    },
    (user as any)?.lifestyle?.hasKids !== undefined && {
      icon: 'users' as const,
      label: 'Has Kids',
      value: (user as any).lifestyle.hasKids ? 'Yes' : 'No',
    },
    (user as any)?.lifestyle?.wantsKids !== undefined && {
      icon: 'smile' as const,
      label: 'Wants Kids',
      value: (user as any).lifestyle.wantsKids ? 'Yes' : 'No',
    },
  ].filter(Boolean);

  const renderPhotoItem = ({ item, index }: { item: any; index: number }) => {
    const source = getPhotoSource(item);
    return (
      <View style={styles.photoSlideContainer}>
        <ZoomablePhoto source={source} width={width} height={height * 0.75} />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
          <View style={styles.heroContainer}>
          {photoSource ? (
            <SafeImage
              source={photoSource}
              style={styles.heroImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: theme.backgroundSecondary, justifyContent: 'center', alignItems: 'center' }]}>
              <Feather name="user" size={80} color={theme.textSecondary} />
            </View>
          )}
          
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.heroGradient}
          />

          <View style={[styles.tapControls, { top: insets.top + 30 }]} pointerEvents="box-none">
            <Pressable 
              style={styles.tapArea} 
              onPress={() => {
                handleIndicatorPress((currentHeroPhoto - 1 + totalPhotos) % totalPhotos);
              }}
              onLongPress={() => {
                setSelectedPhoto(currentHeroPhoto);
                setPhotoModalVisible(true);
              }}
              delayLongPress={300}
            />
            <Pressable 
              style={styles.tapArea} 
              onPress={() => {
                handleIndicatorPress((currentHeroPhoto + 1) % totalPhotos);
              }}
              onLongPress={() => {
                setSelectedPhoto(currentHeroPhoto);
                setPhotoModalVisible(true);
              }}
              delayLongPress={300}
            />
          </View>

          <View style={[styles.photoIndicators, { top: insets.top + 10 }]}>
            {user?.photos?.map((_, index) => (
              <Pressable
                key={index}
                onPress={() => handleIndicatorPress(index)}
                hitSlop={10}
                style={[
                  styles.photoIndicator,
                  { 
                    backgroundColor: index === currentHeroPhoto ? '#fff' : 'rgba(255,255,255,0.4)',
                    maxWidth: totalPhotos > 6 ? 40 : totalPhotos > 4 ? 50 : 60,
                  }
                ]}
              />
            ))}
          </View>

          <View style={styles.heroContent}>
            <View style={styles.nameRow}>
              <ThemedText style={styles.heroName} numberOfLines={1} ellipsizeMode="tail">
                {user?.name || "User"}
              </ThemedText>
              {user?.premium?.isActive && <PremiumBadge size="medium" style={{ marginLeft: 6 }} />}
              {(user as any)?.verified && <VerificationBadge verified size="small" />}
              {user?.age && !(user as any)?.privacySettings?.hideAge && (
                <ThemedText style={styles.heroAge}>, {user.age}</ThemedText>
              )}
              {(user as any)?.privacySettings?.incognitoMode && (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); navigation.navigate("Settings"); }}
                  style={styles.incognitoBadge}
                  accessibilityLabel="Incognito mode on. Tap to manage in Settings."
                >
                  <Ionicons name="eye-off" size={12} color="#FFF" />
                  <ThemedText style={styles.incognitoBadgeText}>Incognito</ThemedText>
                </Pressable>
              )}
            </View>
            {((user as any)?.livingIn || (user as any)?.location?.city || (user as any)?.location?.address) && (
              <View style={styles.locationRow}>
                <Feather name="map-pin" size={14} color="rgba(255,255,255,0.8)" />
                <ThemedText style={styles.heroLocation} numberOfLines={1} ellipsizeMode="tail">
                  {(user as any).livingIn || `${(user as any).location?.city || (user as any).location?.address || ''}${(user as any).location?.country ? `, ${(user as any).location.country}` : ''}`}
                </ThemedText>
              </View>
            )}
            <View style={styles.locationRow}>
              <Feather name="clock" size={14} color="rgba(255,255,255,0.8)" />
              <ThemedText style={styles.heroLocation} numberOfLines={1}>{localTime} local time</ThemedText>
            </View>
          </View>

          <Pressable 
            style={[styles.settingsButton, { top: insets.top + 10 }]}
            onPress={(e) => {
              e.stopPropagation();
              navigation.navigate("Settings");
            }}
          >
            <Feather name="settings" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.actionButtonsRow}>
          <Pressable 
            style={[styles.actionButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <Feather name="edit-2" size={18} color={theme.primary} />
            <ThemedText style={[styles.actionButtonText, { color: theme.text, fontSize: 12 }]}>{t('editProfile')}</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.surface, borderColor: theme.primary, borderWidth: 1.5 }]}
            onPress={() => {
              const uid = (user as any)?._id || user?.id;
              if (uid) navigation.navigate("ProfileDetail", { userId: uid });
            }}
          >
            <Feather name="user-check" size={18} color={theme.primary} />
            <ThemedText style={[styles.actionButtonText, { color: theme.primary, fontSize: 12 }]}>Preview</ThemedText>
          </Pressable>
          <Pressable 
            style={[styles.actionButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.navigate("Visitors" as any)}
          >
            <Feather name="eye" size={18} color="#FFF" />
            <ThemedText style={[styles.actionButtonText, { color: '#FFF', fontSize: 12 }]}>Visitors</ThemedText>
          </Pressable>
        </View>

        <ProfileCompletionBanner
          onPromptPress={() => navigation.navigate("EditProfile")}
        />

        {user?.bio && (
          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
              {t('aboutMe')}
            </ThemedText>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <ThemedText style={[styles.bio, { color: theme.text }]}>
                {user.bio}
              </ThemedText>
            </View>
          </View>
        )}

        {(user as any)?.voiceBio?.url && (
          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
              Voice Bio
            </ThemedText>
            <VoiceBio
              voiceBioUrl={(user as any).voiceBio.url}
              duration={(user as any).voiceBio.duration || 0}
              isOwn={true}
            />
          </View>
        )}

        <ProfilePrompts isOwnProfile={true} />

        {/* DATING PREFERENCES SECTION */}
        {((user as any)?.lookingFor || (user as any)?.relationshipGoal || (user as any)?.lifestyle?.relationshipStatus) && (
          <View style={styles.section}>
            <View style={[styles.sectionHeaderRow, { borderBottomColor: theme.border + '60' }]}>
              <View style={[styles.sectionIconBubble, { backgroundColor: '#8B5CF620' }]}>
                <Feather name="target" size={15} color="#8B5CF6" />
              </View>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Dating Preferences</ThemedText>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              {(user as any)?.lookingFor && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#8B5CF615' }]}><Feather name="search" size={15} color="#8B5CF6" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Looking For</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {LIFESTYLE_LABELS[(user as any).lookingFor] || (user as any).lookingFor}
                  </ThemedText>
                </View>
              )}
              {(user as any)?.relationshipGoal && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#8B5CF615' }]}><Feather name="heart" size={15} color="#8B5CF6" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Relationship Goal</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {LIFESTYLE_LABELS[(user as any).relationshipGoal] || (user as any).relationshipGoal}
                  </ThemedText>
                </View>
              )}
              {(user as any)?.lifestyle?.relationshipStatus && (
                <View style={styles.detailRow}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#8B5CF615' }]}><Feather name="info" size={15} color="#8B5CF6" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Status</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {LIFESTYLE_LABELS[(user as any).lifestyle.relationshipStatus] || (user as any).lifestyle.relationshipStatus}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {/* PERSONALITY SECTION */}
        {((user as any)?.lifestyle?.personalityType || (user as any)?.lifestyle?.communicationStyle || (user as any)?.lifestyle?.loveStyle || (user as any)?.zodiacSign) && (
          <View style={styles.section}>
            <View style={[styles.sectionHeaderRow, { borderBottomColor: theme.border + '60' }]}>
              <View style={[styles.sectionIconBubble, { backgroundColor: '#F59E0B20' }]}>
                <Feather name="zap" size={15} color="#F59E0B" />
              </View>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Personality</ThemedText>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              {(user as any)?.lifestyle?.personalityType && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#F59E0B15' }]}><Feather name="star" size={15} color="#F59E0B" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Personality</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {LIFESTYLE_LABELS[(user as any).lifestyle.personalityType] || (user as any).lifestyle.personalityType}
                  </ThemedText>
                </View>
              )}
              {(user as any)?.lifestyle?.communicationStyle && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#F59E0B15' }]}><Feather name="message-circle" size={15} color="#F59E0B" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Communication</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {LIFESTYLE_LABELS[(user as any).lifestyle.communicationStyle] || (user as any).lifestyle.communicationStyle}
                  </ThemedText>
                </View>
              )}
              {(user as any)?.lifestyle?.loveStyle && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#F59E0B15' }]}><Feather name="heart" size={15} color="#F59E0B" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Love Language</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {LIFESTYLE_LABELS[(user as any).lifestyle.loveStyle] || (user as any).lifestyle.loveStyle}
                  </ThemedText>
                </View>
              )}
              {(user as any)?.zodiacSign && (
                <View style={styles.detailRow}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#F59E0B15' }]}><Feather name="star" size={15} color="#F59E0B" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Zodiac</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {`${(user as any).zodiacSign.charAt(0).toUpperCase()}${(user as any).zodiacSign.slice(1)} ${ZODIAC_EMOJI[(user as any).zodiacSign] || ''}`}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {/* LIFESTYLE SECTION */}
        {((user as any)?.lifestyle?.smoking || (user as any)?.lifestyle?.drinking || (user as any)?.lifestyle?.workout || (user as any)?.lifestyle?.pets || (user as any)?.lifestyle?.hasPets != null || (user as any)?.lifestyle?.hasKids !== undefined || (user as any)?.lifestyle?.wantsKids !== undefined) && (
          <View style={styles.section}>
            <View style={[styles.sectionHeaderRow, { borderBottomColor: theme.border + '60' }]}>
              <View style={[styles.sectionIconBubble, { backgroundColor: '#10B98120' }]}>
                <Feather name="coffee" size={15} color="#10B981" />
              </View>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Lifestyle</ThemedText>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              {(user as any)?.lifestyle?.smoking && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#10B98115' }]}><Feather name="wind" size={15} color="#10B981" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Smoking</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{LIFESTYLE_LABELS[(user as any).lifestyle.smoking] || (user as any).lifestyle.smoking}</ThemedText>
                </View>
              )}
              {(user as any)?.lifestyle?.drinking && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#10B98115' }]}><Feather name="coffee" size={15} color="#10B981" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Drinking</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{LIFESTYLE_LABELS[(user as any).lifestyle.drinking] || (user as any).lifestyle.drinking}</ThemedText>
                </View>
              )}
              {(user as any)?.lifestyle?.workout && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#10B98115' }]}><Feather name="activity" size={15} color="#10B981" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Workout</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{LIFESTYLE_LABELS[(user as any).lifestyle.workout] || (user as any).lifestyle.workout}</ThemedText>
                </View>
              )}
              {(user as any)?.lifestyle?.pets && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#10B98115' }]}><Feather name="heart" size={15} color="#10B981" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Pets</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {LIFESTYLE_LABELS[(user as any).lifestyle.pets] || (user as any).lifestyle.pets}
                  </ThemedText>
                </View>
              )}
              {!(user as any)?.lifestyle?.pets && (user as any)?.lifestyle?.hasPets != null && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#10B98115' }]}><Feather name="heart" size={15} color="#10B981" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Has Pets</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{(user as any).lifestyle.hasPets ? 'Yes' : 'No'}</ThemedText>
                </View>
              )}
              {(user as any)?.lifestyle?.hasKids !== undefined && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#10B98115' }]}><Feather name="users" size={15} color="#10B981" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Has Kids</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{(user as any).lifestyle.hasKids ? 'Yes' : 'No'}</ThemedText>
                </View>
              )}
              {(user as any)?.lifestyle?.wantsKids !== undefined && (
                <View style={styles.detailRow}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#10B98115' }]}><Feather name="smile" size={15} color="#10B981" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Wants Kids</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{(user as any).lifestyle.wantsKids ? 'Yes' : 'No'}</ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {/* CULTURAL IDENTITY SECTION */}
        <View style={styles.section}>
          <View style={[styles.sectionHeaderRow, { borderBottomColor: theme.border + '60' }]}>
            <View style={[styles.sectionIconBubble, { backgroundColor: '#F9731620' }]}>
              <Feather name="globe" size={15} color="#F97316" />
            </View>
            <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Cultural Identity</ThemedText>
            <Pressable
              onPress={() => navigation.navigate('EditProfile')}
              style={{ marginLeft: 'auto', padding: 4 }}
            >
              <Feather name="edit-2" size={14} color={theme.textSecondary} />
            </Pressable>
          </View>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            {(user as any)?.countryOfOrigin ? (
              <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <View style={styles.detailLeft}>
                  <View style={[styles.detailIconContainer, { backgroundColor: '#F9731615' }]}><Feather name="map-pin" size={15} color="#F97316" /></View>
                  <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Country of Origin</ThemedText>
                </View>
                <ThemedText style={[styles.detailValue, { color: theme.text }]}>{(user as any).countryOfOrigin}</ThemedText>
              </View>
            ) : null}
            {(user as any)?.tribe ? (
              <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <View style={styles.detailLeft}>
                  <View style={[styles.detailIconContainer, { backgroundColor: '#F9731615' }]}><Feather name="users" size={15} color="#F97316" /></View>
                  <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Tribe / Ethnicity</ThemedText>
                </View>
                <ThemedText style={[styles.detailValue, { color: theme.text }]}>{(user as any).tribe}</ThemedText>
              </View>
            ) : null}
            {(user as any)?.languages?.length > 0 ? (
              <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <View style={styles.detailLeft}>
                  <View style={[styles.detailIconContainer, { backgroundColor: '#F9731615' }]}><Feather name="message-square" size={15} color="#F97316" /></View>
                  <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Languages</ThemedText>
                </View>
                <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                  {Array.isArray((user as any).languages) ? (user as any).languages.join(', ') : (user as any).languages}
                </ThemedText>
              </View>
            ) : null}
            {(user as any)?.diasporaGeneration ? (
              <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <View style={styles.detailLeft}>
                  <View style={[styles.detailIconContainer, { backgroundColor: '#F9731615' }]}><Feather name="git-branch" size={15} color="#F97316" /></View>
                  <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Diaspora Generation</ThemedText>
                </View>
                <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                  {LIFESTYLE_LABELS[(user as any).diasporaGeneration] || (user as any).diasporaGeneration}
                </ThemedText>
              </View>
            ) : null}
            {/* Cultural Compatibility Quiz CTA */}
            <Pressable
              onPress={() => navigation.navigate('CompatibilityQuiz')}
              style={({ pressed }) => [
                styles.culturalQuizBtn,
                {
                  backgroundColor: pressed ? '#F97316' : '#F9731614',
                  borderColor: '#F9731640',
                },
              ]}
            >
              <LinearGradient
                colors={['#F9731618', '#FB923C14']}
                style={styles.culturalQuizGradient}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F9731622', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="heart" size={17} color="#F97316" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', color: '#F97316' }}>Cultural Compatibility Quiz</ThemedText>
                    <ThemedText style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>
                      Answer questions to boost your match score
                    </ThemedText>
                  </View>
                  <Feather name="chevron-right" size={18} color="#F97316" />
                </View>
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        {/* BACKGROUND SECTION */}
        {((user as any)?.lifestyle?.ethnicity || (user as any)?.ethnicity || (user as any)?.lifestyle?.religion || (user as any)?.religion || (user as any)?.education || (user as any)?.school || user?.gender || (user as any)?.height) && (
          <View style={styles.section}>
            <View style={[styles.sectionHeaderRow, { borderBottomColor: theme.border + '60' }]}>
              <View style={[styles.sectionIconBubble, { backgroundColor: '#0EA5E920' }]}>
                <Feather name="book" size={15} color="#0EA5E9" />
              </View>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Background</ThemedText>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              {user?.gender && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#0EA5E915' }]}><Feather name="user" size={15} color="#0EA5E9" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Gender</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{GENDER_LABELS[user.gender] || user.gender}</ThemedText>
                </View>
              )}
              {(user as any)?.height && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#0EA5E915' }]}><Feather name="trending-up" size={15} color="#0EA5E9" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Height</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{(user as any).height} cm</ThemedText>
                </View>
              )}
              {((user as any)?.lifestyle?.ethnicity || (user as any)?.ethnicity) && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#0EA5E915' }]}><Feather name="globe" size={15} color="#0EA5E9" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Ethnicity</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {LIFESTYLE_LABELS[(user as any).lifestyle?.ethnicity || (user as any).ethnicity] || (user as any).lifestyle?.ethnicity || (user as any).ethnicity}
                  </ThemedText>
                </View>
              )}
              {((user as any)?.lifestyle?.religion || (user as any)?.religion) && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#0EA5E915' }]}><Feather name="sun" size={15} color="#0EA5E9" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Religion</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{LIFESTYLE_LABELS[(user as any).lifestyle?.religion || (user as any).religion] || (user as any).lifestyle?.religion || (user as any).religion}</ThemedText>
                </View>
              )}
              {(user as any)?.school && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#0EA5E915' }]}><Feather name="book-open" size={15} color="#0EA5E9" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>School</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{(user as any).school}</ThemedText>
                </View>
              )}
              {(user as any)?.education && (
                <View style={styles.detailRow}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#0EA5E915' }]}><Feather name="book" size={15} color="#0EA5E9" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Education Level</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{EDUCATION_LABELS[(user as any).education] || (user as any).education}</ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {/* WORK & LOCATION SECTION */}
        {((user as any)?.jobTitle || (user as any)?.livingIn || (user as any)?.location?.city) && (
          <View style={styles.section}>
            <View style={[styles.sectionHeaderRow, { borderBottomColor: theme.border + '60' }]}>
              <View style={[styles.sectionIconBubble, { backgroundColor: '#EF444420' }]}>
                <Feather name="briefcase" size={15} color="#EF4444" />
              </View>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Work & Location</ThemedText>
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              {(user as any)?.jobTitle && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#EF444415' }]}><Feather name="briefcase" size={15} color="#EF4444" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Job Title</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>{(user as any).jobTitle}</ThemedText>
                </View>
              )}
              {((user as any)?.livingIn || (user as any)?.location?.city) && (
                <View style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={styles.detailLeft}>
                    <View style={[styles.detailIconContainer, { backgroundColor: '#EF444415' }]}><Feather name="map-pin" size={15} color="#EF4444" /></View>
                    <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Living In</ThemedText>
                  </View>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {(user as any).livingIn || `${(user as any).location?.city || ''}${(user as any).location?.country ? `, ${(user as any).location.country}` : ''}`}
                  </ThemedText>
                </View>
              )}
              <Pressable
                style={[styles.detailRow]}
                onPress={() => {
                  if (user?.location?.coordinates || (user as any)?.location?.lat) {
                    navigation.navigate("MapView" as any);
                  } else {
                    showAlert("Location Not Found", "Your location is not set. Please ensure location permissions are enabled.", [{ text: "OK", style: "default" }], "map");
                  }
                }}
              >
                <View style={styles.detailLeft}>
                  <View style={[styles.detailIconContainer, { backgroundColor: '#EF444415' }]}><Feather name="map" size={15} color="#EF4444" /></View>
                  <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>Nearby Users</ThemedText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ThemedText style={[styles.detailValue, { color: '#EF4444' }]}>View Map</ThemedText>
                  <Feather name="chevron-right" size={14} color="#EF4444" />
                </View>
              </Pressable>
            </View>
          </View>
        )}

        {/* SOUNDTRACK SECTION */}
        {(user as any)?.favoriteSong?.title && (
          <View style={styles.section}>
            <View style={[styles.sectionHeaderRow, { borderBottomColor: theme.border + '60' }]}>
              <View style={[styles.sectionIconBubble, { backgroundColor: '#1DB95420' }]}>
                <Feather name="music" size={15} color="#1DB954" />
              </View>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Soundtrack</ThemedText>
              {(user as any)?.spotify?.connected && (
                <View style={{ marginLeft: 8, backgroundColor: '#1DB95420', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                  <ThemedText style={{ color: '#1DB954', fontSize: 11, fontWeight: '600' }}>Spotify</ThemedText>
                </View>
              )}
            </View>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.songRow}>
                {(user as any).favoriteSong?.albumArt ? (
                  <SafeImage
                    source={{ uri: (user as any).favoriteSong.albumArt }}
                    style={{ width: 44, height: 44, borderRadius: 10 }}
                  />
                ) : (
                  <LinearGradient colors={['#1DB954', '#158f3f']} style={[styles.songIconWrap, { borderRadius: 12 }]}>
                    <Feather name="music" size={18} color="#FFF" />
                  </LinearGradient>
                )}
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.songTitle, { color: theme.text }]}>{(user as any).favoriteSong.title}</ThemedText>
                  {(user as any).favoriteSong.artist && (
                    <ThemedText style={[styles.songArtist, { color: theme.textSecondary }]}>{(user as any).favoriteSong.artist}</ThemedText>
                  )}
                </View>
                <SpotifyEmbedPlayer
                  spotifyUri={(user as any).favoriteSong?.spotifyUri}
                  previewUrl={(user as any).favoriteSong?.previewUrl}
                  title={(user as any).favoriteSong?.title}
                  artist={(user as any).favoriteSong?.artist}
                  albumArt={(user as any).favoriteSong?.albumArt}
                  size={18}
                />
              </View>
            </View>
          </View>
        )}

        {/* INTERESTS SECTION */}
        {user?.interests && user.interests.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeaderRow, { borderBottomColor: theme.border + '60' }]}>
              <View style={[styles.sectionIconBubble, { backgroundColor: '#FF6B9D20' }]}>
                <Feather name="heart" size={15} color="#FF6B9D" />
              </View>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>{t('interests')}</ThemedText>
            </View>
            <View style={styles.interestsContainer}>
              {user.interests.map((interest, index) => (
                <View
                  key={index}
                  style={[styles.interestTag, { backgroundColor: '#FF6B9D12', borderColor: '#FF6B9D40', borderWidth: 1 }]}
                >
                  <ThemedText style={[styles.interestText, { color: theme.primary }]}>
                    {interest}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        {user?.photos && user.photos.length > 1 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
                {t('photos')} ({user.photos.length})
              </ThemedText>
              <Pressable onPress={() => navigation.navigate("ChangeProfilePicture")}>
                <ThemedText style={[styles.editLink, { color: theme.primary }]}>
                  {t('manage')}
                </ThemedText>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {user.photos.map((photo, index) => {
                const source = getPhotoSource(photo);
                return (
                  <Pressable 
                    key={index} 
                    style={styles.photoItem}
                    onPress={() => {
                      setSelectedPhoto(index);
                      setPhotoModalVisible(true);
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                  >
                    <SafeImage
                      source={source}
                      style={styles.photoImage}
                      contentFit="cover"
                    />
                    {index === 0 && (
                      <View style={[styles.primaryBadge, { backgroundColor: theme.primary }]}>
                        <ThemedText style={styles.primaryBadgeText}>
                          {t('primary')}
                        </ThemedText>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
            {t('account')}
          </ThemedText>
          <View style={[styles.menuContainer, { backgroundColor: theme.surface }]}>
            <Pressable
              style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
              onPress={() => navigation.navigate("Settings")}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIconContainer, { backgroundColor: theme.primary + '15' }]}>
                  <Feather name="settings" size={18} color={theme.primary} />
                </View>
                <ThemedText style={[styles.menuItemLabel, { color: theme.text }]}>
                  {t('settings')}
                </ThemedText>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
            <Pressable
              style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
              onPress={() => navigation.navigate("Premium" as any)}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIconContainer, { backgroundColor: '#FFD700' + '15' }]}>
                  <Feather name="star" size={18} color="#FFD700" />
                </View>
                <ThemedText style={[styles.menuItemLabel, { color: theme.text }]}>
                  Upgrade to Premium
                </ThemedText>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
            {(user as any)?.isAdmin && (
              <Pressable
                style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
                onPress={() => navigation.navigate("Admin" as any)}
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconContainer, { backgroundColor: '#9C27B0' + '15' }]}>
                    <Feather name="shield" size={18} color="#9C27B0" />
                  </View>
                  <ThemedText style={[styles.menuItemLabel, { color: theme.text }]}>
                    Admin Dashboard
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
            )}
            <Pressable
              style={styles.menuItem}
              onPress={handleLogout}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIconContainer, { backgroundColor: theme.error + '15' }]}>
                  <Feather name="log-out" size={18} color={theme.error} />
                </View>
                <ThemedText style={[styles.menuItemLabel, { color: theme.error }]}>
                  {t('logout')}
                </ThemedText>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal
        visible={photoModalVisible}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.photoModalOverlay}>
          {user?.photos && user.photos.length > 0 && (
            <ScrollView
              ref={flatListRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              style={{ flex: 1 }}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                setSelectedPhoto(idx);
              }}
            >
              {user.photos.map((item: any, index: number) => {
                const source = getPhotoSource(item);
                return (
                  <View key={index} style={styles.photoSlideContainer}>
                    <ZoomablePhoto source={source} width={width} height={height * 0.75} />
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Close */}
          <TouchableOpacity
            style={[styles.photoModalClose, { top: insets.top + 16 }]}
            onPress={() => setPhotoModalVisible(false)}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          {/* Dot indicators */}
          {user?.photos && user.photos.length > 1 && (
            <View style={[styles.modalPhotoIndicators, { top: insets.top + 56 }]}>
              {user.photos.map((_, index) => (
                <Pressable
                  key={index}
                  onPress={() => {
                    setSelectedPhoto(index);
                    flatListRef.current?.scrollTo({ x: width * index, animated: true });
                  }}
                  style={[
                    styles.modalPhotoIndicator,
                    { backgroundColor: index === selectedPhoto ? '#fff' : 'rgba(255,255,255,0.4)' }
                  ]}
                />
              ))}
            </View>
          )}

          {/* Delete + counter at bottom */}
          <View style={[styles.photoModalActions, { bottom: insets.bottom + 24 }]}>
            <ThemedText style={styles.photoCounter}>
              {selectedPhoto + 1} / {user?.photos?.length ?? 0}
            </ThemedText>
            <Pressable
              style={[styles.photoModalButton, { backgroundColor: theme.error }]}
              onPress={() => {
                setPhotoModalVisible(false);
                handleDeletePhoto(selectedPhoto);
              }}
            >
              <Feather name="trash-2" size={16} color="#FFF" />
              <ThemedText style={styles.photoModalButtonText}>{t('delete')}</ThemedText>
            </Pressable>
          </View>

          {/* Hint */}
          <View style={{ position: 'absolute', bottom: insets.bottom + 72, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="search-outline" size={12} color="rgba(255,255,255,0.4)" />
            <ThemedText style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Pinch or double-tap to zoom</ThemedText>
          </View>
        </View>
        </GestureHandlerRootView>
      </Modal>
      <AlertComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  heroContainer: {
    width: width,
    height: HERO_HEIGHT,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT * 0.5,
  },
  photoIndicators: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    zIndex: 15,
  },
  tapControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
  },
  tapArea: {
    flex: 1,
  },
  photoIndicator: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  heroContent: {
    position: 'absolute',
    bottom: 20,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heroName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    includeFontPadding: false,
    paddingBottom: 4,
    flexShrink: 1,
  },
  heroAge: {
    fontSize: 28,
    fontWeight: "400",
    color: "#fff",
    marginLeft: 8,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    includeFontPadding: false,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexShrink: 1,
  },
  heroLocation: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    flexShrink: 1,
  },
  settingsButton: {
    position: 'absolute',
    right: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.bodyBold,
    marginBottom: Spacing.sm,
  },
  editLink: {
    ...Typography.body,
    fontWeight: '500',
  },
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  bio: {
    ...Typography.body,
    lineHeight: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  detailIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    ...Typography.body,
  },
  detailValue: {
    ...Typography.body,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: Spacing.md,
  },
  interestsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  interestTag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  interestText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  photoScroll: {
    marginTop: Spacing.sm,
  },
  photoItem: {
    width: 120,
    height: 160,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginRight: Spacing.sm,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    bottom: Spacing.xs,
    left: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },
  menuContainer: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemLabel: {
    ...Typography.body,
    fontWeight: "500",
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  photoModalClose: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  photoSlideContainer: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  fullPhoto: {
    width: width,
    height: width * 1.2,
  },
  photoModalActions: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    left: 0,
    right: 0,
    justifyContent: 'center',
  },
  photoModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  photoModalButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  modalPhotoIndicators: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 6,
    left: 0,
    right: 0,
    justifyContent: 'center',
  },
  modalPhotoIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  photoCounter: {
    color: '#fff',
    opacity: 0.7,
    fontSize: 14,
    fontWeight: '500',
  },
  premiumBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
    gap: 4,
  },
  premiumBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
  },
  incognitoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  incognitoBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  sectionIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 4,
  },
  songIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  songTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  songArtist: {
    fontSize: 13,
    marginTop: 2,
  },
  culturalQuizBtn: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 6,
  },
  culturalQuizGradient: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
});
