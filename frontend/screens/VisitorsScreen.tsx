import logger from '@/utils/logger';
import { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Dimensions, ActivityIndicator, Pressable, Platform, Modal, Text } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, Typography, Shadow } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";
import { getPhotoSource } from "@/utils/photos";
import { VerificationBadge } from "@/components/VerificationBadge";
import { useTranslation } from "@/hooks/useLanguage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Visitor {
  _id: string;
  name: string;
  age: number;
  photos: any[];
  verified: boolean;
  viewedAt: string;
  isBlurred?: boolean;
  canInteract?: boolean;
}

export default function VisitorsScreen({ navigation }: { navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const { get } = useApi();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [weeklyInsights, setWeeklyInsights] = useState<{ viewsThisWeek: number; almostLikedYou: number } | null>(null);
  const isPremium = user?.premium?.isActive;

  const fetchVisitors = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await get<any>('/users/who-viewed-me', token);
      if (response.success && response.data?.views) {
        setVisitors(response.data.views);
      }
      if (response.data?.weeklyInsights) {
        setWeeklyInsights(response.data.weeklyInsights);
      }
    } catch (error) {
      logger.error('Failed to fetch visitors:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchVisitors();
    }, [token])
  );

  const hashName = (name: string) => {
    if (!name) return "";
    return name[0] + "****" + name[name.length - 1];
  };

  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const handleVisitorPress = (visitorUser: any) => {
    if (isPremium) {
      navigation.navigate("ProfileDetail", { userId: visitorUser._id });
    } else {
      setShowPremiumModal(true);
    }
  };

  const renderVisitor = ({ item }: { item: Visitor }) => {
    if (!item._id) return null;

    const photoSource = item.photos?.[0] ? getPhotoSource(item.photos[0]) : null;
    const showBlurred = item.isBlurred || !isPremium;

    return (
      <Pressable 
        style={[styles.visitorCard, { backgroundColor: theme.surface }]}
        onPress={() => handleVisitorPress(item)}
      >
        <View style={styles.photoContainer}>
          {photoSource ? (
            <Image 
              source={photoSource} 
              style={styles.photo} 
              contentFit="cover"
              blurRadius={showBlurred ? 20 : 0}
            estimatedItemSize={80}
      />
          ) : (
            <View style={[styles.photo, { backgroundColor: theme.backgroundSecondary, justifyContent: 'center', alignItems: 'center' }]}>
              <Feather name="user" size={30} color={theme.textSecondary} />
            </View>
          )}
          {showBlurred && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
              <Feather name="eye-off" size={24} color="#FFF" />
            </View>
          )}
        </View>
        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <ThemedText style={styles.name}>{isPremium ? item.name : hashName(item.name)}, {item.age}</ThemedText>
            {item.verified && (
              <VerificationBadge size={14} />
            )}
          </View>
          <ThemedText style={[styles.time, { color: theme.textSecondary }]}>
            Visited {new Date(item.viewedAt).toLocaleDateString()}
          </ThemedText>
        </View>
        {!isPremium && <Feather name="lock" size={16} color={theme.primary} />}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Profile Visitors</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      {weeklyInsights && (weeklyInsights.viewsThisWeek > 0 || weeklyInsights.almostLikedYou > 0) && (
        <LinearGradient
          colors={['#FF6B6B', '#FF8E53']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.insightsBanner}
        >
          <ThemedText style={styles.insightsTitle}>Your Week in Review</ThemedText>
          <View style={styles.insightsRow}>
            <View style={styles.insightStat}>
              <ThemedText style={styles.insightNumber}>{weeklyInsights.viewsThisWeek}</ThemedText>
              <ThemedText style={styles.insightLabel}>Profile views{'\n'}this week</ThemedText>
            </View>
            <View style={styles.insightDivider} />
            <View style={styles.insightStat}>
              <ThemedText style={styles.insightNumber}>{weeklyInsights.almostLikedYou}</ThemedText>
              <ThemedText style={styles.insightLabel}>People almost{'\n'}liked you</ThemedText>
            </View>
          </View>
          {!isPremium && (
            <Pressable
              style={styles.insightsUpgradeBtn}
              onPress={() => navigation.navigate("Premium")}
            >
              <Feather name="star" size={14} color="#FF6B6B" />
              <ThemedText style={styles.insightsUpgradeText}>Upgrade to see who</ThemedText>
            </Pressable>
          )}
        </LinearGradient>
      )}

      <FlashList
        data={visitors}
        renderItem={renderVisitor}
        keyExtractor={(item, index) => item._id || index.toString()}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: !isPremium && visitors.length > 0 ? 96 + insets.bottom : insets.bottom + Spacing.md },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="users" size={50} color={theme.textSecondary} />
            <ThemedText style={styles.emptyText}>No visitors yet</ThemedText>
            <ThemedText style={[styles.emptySubtext, { color: theme.textSecondary }]}>
              When someone views your profile, they’ll appear here.
            </ThemedText>
          </View>
        }
        estimatedItemSize={80}
      />

      {!isPremium && visitors.length > 0 && (
        <View style={[styles.premiumBannerWrap, { paddingBottom: insets.bottom + 12, backgroundColor: theme.background }]}>
          <Pressable
            style={({ pressed }) => [
              styles.premiumBanner,
              { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={() => navigation.navigate("Premium")}
          >
            <Feather name="star" size={18} color="#FFF" />
            <ThemedText style={styles.premiumText}>Upgrade to view full profiles</ThemedText>
            <Feather name="chevron-right" size={18} color="#FFF" />
          </Pressable>
        </View>
      )}

      <Modal
        visible={showPremiumModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPremiumModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalIcon, { backgroundColor: theme.primary + '20' }]}>
              <Ionicons name="lock-closed" size={32} color={theme.primary} />
            </View>
            <ThemedText style={styles.modalTitle}>Premium Feature</ThemedText>
            <ThemedText style={[styles.modalText, { color: theme.textSecondary }]}>
              Upgrade to Premium to view full profiles and connect with people who visited you.
            </ThemedText>
            <Pressable 
              style={[styles.unlockButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                setShowPremiumModal(false);
                navigation.navigate("Premium");
              }}
            >
              <Ionicons name="star" size={18} color="#FFF" />
              <ThemedText style={styles.unlockButtonText}>Unlock Premium</ThemedText>
            </Pressable>
            <Pressable 
              style={styles.cancelButton}
              onPress={() => setShowPremiumModal(false)}
            >
              <ThemedText style={{ color: theme.textSecondary }}>Maybe Later</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    height: 56,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    padding: 8,
  },
  listContent: {
    padding: Spacing.md,
  },
  visitorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    ...Shadow.small,
  },
  photoContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    marginRight: Spacing.md,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  blurredPhoto: {
    ...Platform.select({
      web: {
        filter: 'blur(10px)',
      },
      default: {
      }
    })
  },
  infoContainer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  time: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: 16,
  },
  insightsBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 16,
    padding: 16,
  },
  insightsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insightsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  insightStat: {
    flex: 1,
    alignItems: 'center',
  },
  insightNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFF',
  },
  insightLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 16,
  },
  insightDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 16,
  },
  insightsUpgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
    marginTop: 14,
  },
  insightsUpgradeText: {
    color: '#FF6B6B',
    fontWeight: '700',
    fontSize: 13,
  },
  premiumBannerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 28,
    gap: 10,
    ...Shadow.small,
  },
  premiumText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
    flexShrink: 1,
  },
  emptySubtext: {
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 25,
    width: '100%',
  },
  unlockButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
});