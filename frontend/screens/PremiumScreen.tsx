import logger from '@/utils/logger';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { iapService } from '@/services/iapService';

const { width } = Dimensions.get('window');

interface PriceTier {
  id: string;
  interval: 'day' | 'week' | 'month' | 'year';
  amount: number;
  currency: string;
  label: string;
  savings?: string;
  popular?: boolean;
}

const PRICING_TIERS: PriceTier[] = [
  { id: iapService.PRODUCT_IDS.DAILY, interval: 'day', amount: 99, currency: 'USD', label: 'Daily', savings: undefined },
  { id: iapService.PRODUCT_IDS.WEEKLY, interval: 'week', amount: 499, currency: 'USD', label: 'Weekly', savings: 'Save 28%' },
  { id: iapService.PRODUCT_IDS.MONTHLY, interval: 'month', amount: 999, currency: 'USD', label: 'Monthly', savings: 'Save 67%', popular: true },
  { id: iapService.PRODUCT_IDS.YEARLY, interval: 'year', amount: 4999, currency: 'USD', label: 'Yearly', savings: 'Save 86%' },
];

const PREMIUM_FEATURES = [
  { icon: 'heart-multiple', text: 'Unlimited Likes', color: '#FF6B6B', desc: 'Swipe without limits' },
  { icon: 'eye', text: 'See Who Likes You', color: '#4CAF50', desc: 'View all your admirers' },
  { icon: 'lightning-bolt', text: '10 Super Likes Daily', color: '#FFD93D', desc: 'Stand out from the crowd' },
  { icon: 'undo-variant', text: 'Unlimited Rewinds', color: '#9C27B0', desc: 'Undo accidental swipes' },
  { icon: 'incognito', text: 'Incognito Mode', color: '#607D8B', desc: 'Browse without being seen' },
  { icon: 'rocket-launch', text: '1 Free Boost Monthly', color: '#FF9800', desc: 'Get more visibility' },
  { icon: 'earth', text: 'Global Discovery', color: '#2196F3', desc: 'Match worldwide by country' },
  { icon: 'phone', text: 'Unlimited Calls', color: '#00BCD4', desc: 'Voice & video without limits' },
  { icon: 'eye-check', text: 'Story Viewer Details', color: '#E91E63', desc: 'See who viewed your stories' },
  { icon: 'clock-check-outline', text: 'Seen-At Timestamps', color: '#4FC3F7', desc: 'See exactly when your messages were read' },
  { icon: 'filter-variant', text: 'Advanced Filters', color: '#795548', desc: 'Refine your matches' },
  { icon: 'shield-star', text: 'Premium Badge', color: '#FFD700', desc: 'Exclusive animated profile badge' },
  { icon: 'map-marker-radius', text: 'No Distance Limits', color: '#3F51B5', desc: 'See matches everywhere' },
];

export default function PremiumScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { token, user } = useAuth();
  const { get, post } = useApi();
  const insets = useSafeAreaInsets();
  
  const [selectedTier, setSelectedTier] = useState<PriceTier>(PRICING_TIERS[2]);
  const [processing, setProcessing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [iapReady, setIapReady] = useState(false);
  const [storePrices, setStorePrices] = useState<Record<string, { localizedPrice: string; currency: string; priceAmountMicros?: string }>>({});
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesError, setPricesError] = useState(false);
  const [pricesFromStore, setPricesFromStore] = useState(false);

  const cardScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  useEffect(() => {
    glowOpacity.value = withSequence(
      withTiming(1, { duration: 1500 }),
      withTiming(0.5, { duration: 1500 })
    );
    const interval = setInterval(() => {
      glowOpacity.value = withSequence(
        withTiming(1, { duration: 1500 }),
        withTiming(0.5, { duration: 1500 })
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    checkSubscriptionStatus();
    initIAP();
    const removeEntitlementListener = iapService.addEntitlementListener(() => {
      setIsActive(true);
      setProcessing(false);
      Alert.alert('Welcome to Premium!', 'Your subscription is now active. Enjoy all the premium features!');
    });
    return () => {
      removeEntitlementListener();
    };
  }, [token]);

  // Load cached prices from AsyncStorage immediately so the UI shows
  // local-currency prices before the live IAP fetch completes.
  useEffect(() => {
    iapService.loadCachedPrices().then((cached) => {
      if (Object.keys(cached).length > 0) {
        setStorePrices(cached);
        setPricesFromStore(true);
        setPricesLoading(false);
      }
    });
  }, []);

  const applyStorePrices = (subs: any[]) => {
    if (!subs || subs.length === 0) return false;
    const priceMap: Record<string, { localizedPrice: string; currency: string; priceAmountMicros?: string }> = {};
    subs.forEach((sub) => {
      priceMap[sub.productId] = {
        localizedPrice: sub.localizedPrice,
        currency: sub.currency,
        priceAmountMicros: sub.priceAmountMicros,
      };
    });
    if (Object.keys(priceMap).length > 0) {
      setStorePrices(priceMap);
      setPricesFromStore(true);
      setPricesError(false);
      return true;
    }
    return false;
  };

  const retryPrices = async () => {
    if (!iapReady) return;
    setPricesError(false);
    setPricesLoading(true);
    try {
      const subs = await iapService.getSubscriptions();
      if (!applyStorePrices(subs)) setPricesError(true);
    } catch {
      setPricesError(true);
    } finally {
      setPricesLoading(false);
    }
  };

  const initIAP = async () => {
    if (Platform.OS === 'web') {
      setPricesLoading(false);
      return;
    }
    const available = await iapService.loadIAP();
    setIapReady(available);

    if (available) {
      try {
        setPricesLoading(true);
        const subs = await iapService.getSubscriptions();
        if (!applyStorePrices(subs)) setPricesError(true);
      } catch (e) {
        logger.log('Failed to load store prices:', e);
        setPricesError(true);
      } finally {
        setPricesLoading(false);
      }

    }
  };

  const checkSubscriptionStatus = async () => {
    if (!token) return;
    try {
      const response = await get<{ subscription: { isActive: boolean } }>('/subscription/status', token);
      if (response.success && response.data?.subscription?.isActive) {
        setIsActive(true);
      }
    } catch (e) {}
  };

  const formatPrice = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount / 100);
    } catch {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount / 100);
    }
  };

  const getDisplayPrice = (tier: PriceTier): string => {
    const stored = storePrices[tier.id];
    if (stored?.localizedPrice) return stored.localizedPrice;
    return formatPrice(tier.amount, tier.currency);
  };

  // Compute savings % from actual store priceAmountMicros so the label
  // is accurate in every currency, not just the hardcoded USD baseline.
  const getDynamicSavings = (tier: PriceTier): string | undefined => {
    const dailyMicros = Number(storePrices[iapService.PRODUCT_IDS.DAILY]?.priceAmountMicros || 0);
    const targetMicros = Number(storePrices[tier.id]?.priceAmountMicros || 0);
    // If we have live micros data use it, otherwise fall back to hardcoded label
    if (dailyMicros > 0 && targetMicros > 0 && tier.interval !== 'day') {
      const daysMap: Record<string, number> = { week: 7, month: 30, year: 365 };
      const days = daysMap[tier.interval] ?? 1;
      const fullPrice = dailyMicros * days;
      const pct = Math.round(((fullPrice - targetMicros) / fullPrice) * 100);
      return pct > 0 ? `Save ${pct}%` : undefined;
    }
    return tier.savings;
  };

  const handleRestore = async () => {
    if (!token) {
      Alert.alert('Login Required', 'Please log in to restore your purchases.');
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('Mobile Only', 'Purchases can only be restored on the iOS or Android app.');
      return;
    }
    if (!iapReady) {
      Alert.alert('Unavailable', 'In-app purchases are not available on this device.');
      return;
    }

    setRestoring(true);
    try {
      const { receipt, productId } = await iapService.restorePurchases();
      if (!receipt) {
        Alert.alert('No Purchases Found', 'We could not find any previous purchases to restore. If you believe this is an error, please contact support.');
        return;
      }
      const response = await post<{ subscription?: any }>(
        '/subscription/restore-purchases',
        { platform: Platform.OS === 'ios' ? 'ios' : 'android', receipt, productId },
        token
      );
      if (response.success) {
        setIsActive(true);
        Alert.alert('Purchases Restored!', 'Your Premium subscription has been restored successfully.');
      } else {
        Alert.alert('Restore Failed', response.message || 'Could not restore your purchase. Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Restore Failed', 'Something went wrong. Please try again or contact support.');
    } finally {
      setRestoring(false);
    }
  };

  const handleSubscribe = async () => {
    if (!token) {
      Alert.alert('Login Required', 'Please log in to subscribe.');
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert(
        'Mobile Only',
        'In-app purchases are only available on the mobile app. Please use the iOS or Android app to subscribe.'
      );
      return;
    }

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}

    if (!iapReady) {
      const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play Store';
      Alert.alert(
        'Coming Soon',
        `In-app purchases through the ${storeName} will be available soon. You'll be able to subscribe to the ${selectedTier.label} plan at ${getDisplayPrice(selectedTier)}/${selectedTier.interval}.`
      );
      return;
    }

    setProcessing(true);
    try {
      await iapService.requestSubscription(selectedTier.id);
    } catch (error: any) {
      if (error?.message === 'CANCELLED') {
        setProcessing(false);
        return;
      }
      const code = error?.code ? ` (${error.code})` : '';
      const detail = error?.debugMessage || error?.message;
      logger.log('Purchase request failed:', {
        code: error?.code,
        message: error?.message,
        debugMessage: error?.debugMessage,
        productId: error?.productId,
      });
      Alert.alert(
        'Purchase Error',
        detail
          ? `Unable to process your purchase${code}: ${detail}`
          : 'Unable to process your purchase. Please try again.',
      );
      setProcessing(false);
    }
  };

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={StyleSheet.absoluteFill}
      />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Premium</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.heroSection}>
            <Animated.View style={[styles.heroGlow, glowStyle]}>
              <LinearGradient
                colors={['transparent', 'rgba(255, 107, 107, 0.35)', 'rgba(255, 215, 0, 0.18)', 'transparent']}
                style={styles.glowGradient}
              />
            </Animated.View>

            <View style={styles.crownContainer}>
              <Animated.View style={[styles.crownGlow, glowStyle]} />
              <LinearGradient
                colors={['#FFE066', '#FFD700', '#FFA500', '#FF6B6B']}
                style={styles.crownBg}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name="crown" size={44} color="#FFF" />
              </LinearGradient>
            </View>

            <Text style={styles.heroEyebrow}>EMORII PREMIUM</Text>
            <Text style={styles.heroTitle}>Stand Out.{'\n'}Get Noticed. Match Faster.</Text>
            <Text style={styles.heroSubtitle}>
              Join the inner circle of the African diaspora's most‑loved dating app — and find your person, faster.
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>10×</Text>
                <Text style={styles.statLabel}>more matches</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statChip}>
                <Text style={styles.statValue}>3×</Text>
                <Text style={styles.statLabel}>profile views</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statChip}>
                <Text style={styles.statValue}>∞</Text>
                <Text style={styles.statLabel}>daily likes</Text>
              </View>
            </View>
          </View>

          {isActive && (
            <LinearGradient colors={['#4CAF50', '#2E7D32']} style={styles.activeBanner}>
              <MaterialCommunityIcons name="check-circle" size={24} color="#FFF" style={{ marginRight: 10 }} />
              <Text style={styles.activeBannerText}>You're a Premium Member!</Text>
            </LinearGradient>
          )}

          <Text style={styles.sectionLabel}>Pick the plan that fits you</Text>
          <Text style={styles.sectionSub}>Cancel anytime. No surprises.</Text>

          <View style={styles.tiersContainer}>
            {PRICING_TIERS.map((tier) => {
              const isSelected = selectedTier.id === tier.id;
              const handlePress = () => {
                setSelectedTier(tier);
                if (Platform.OS !== 'web') {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
                }
              };

              const innerCard = (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.tierCard,
                    isSelected && styles.tierCardSelected,
                    tier.popular && styles.tierCardPopularInner,
                  ]}
                  onPress={handlePress}
                >
                  {tier.popular && (
                    <LinearGradient
                      colors={['#FF6B6B', '#FF8E53', '#FFD700']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.popularBadge}
                    >
                      <MaterialCommunityIcons name="star" size={10} color="#FFF" style={{ marginRight: 4 }} />
                      <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
                    </LinearGradient>
                  )}

                  <View style={styles.tierContent}>
                    <View style={styles.tierLeft}>
                      <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                      <View style={styles.tierLabelBlock}>
                        <View style={styles.tierTitleRow}>
                          <Text style={[styles.tierLabel, isSelected && styles.tierLabelSelected]} numberOfLines={1}>
                            {tier.label}
                          </Text>
                          {getDynamicSavings(tier) && (
                            <View style={styles.savingsBadge}>
                              <Text style={styles.savingsBadgeText}>{getDynamicSavings(tier)}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.tierInterval}>
                          {tier.popular
                            ? 'Best value · ' + (tier.interval === 'year' ? 'billed annually' : tier.interval === 'day' ? 'billed daily' : 'billed ' + tier.interval + 'ly')
                            : 'Billed ' + (tier.interval === 'day' ? 'daily' : tier.interval === 'year' ? 'annually' : tier.interval + 'ly')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.tierRight}>
                      <Text style={[styles.tierPrice, isSelected && styles.tierPriceSelected]} numberOfLines={1} adjustsFontSizeToFit>
                        {pricesLoading ? '...' : getDisplayPrice(tier)}
                      </Text>
                      <Text style={styles.tierPer}>/{tier.interval}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );

              if (tier.popular) {
                return (
                  <View key={tier.id} style={styles.popularWrapper}>
                    <Animated.View style={[styles.popularGlow, glowStyle]} />
                    <LinearGradient
                      colors={isSelected ? ['#FF6B6B', '#FFA500', '#FFD700'] : ['rgba(255,107,107,0.6)', 'rgba(255,165,0,0.6)', 'rgba(255,215,0,0.6)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.popularBorderGradient}
                    >
                      {innerCard}
                    </LinearGradient>
                  </View>
                );
              }
              return <View key={tier.id}>{innerCard}</View>;
            })}
          </View>

          {/* Price source indicator */}
          {pricesFromStore && !pricesError && !pricesLoading && (
            <View style={styles.priceSourceRow}>
              <MaterialCommunityIcons name="store-check-outline" size={13} color="rgba(255,255,255,0.4)" />
              <Text style={styles.priceSourceText}>Prices shown in your local currency via {Platform.OS === 'ios' ? 'App Store' : 'Google Play'}</Text>
            </View>
          )}

          {/* Retry row when live prices failed to load */}
          {pricesError && !pricesLoading && iapReady && (
            <TouchableOpacity style={styles.retryRow} onPress={retryPrices} activeOpacity={0.7}>
              <MaterialCommunityIcons name="refresh" size={13} color="#FFD700" />
              <Text style={styles.retryText}>Couldn't load prices · Tap to retry</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionLabel}>Everything you unlock</Text>
          <Text style={styles.sectionSub}>{PREMIUM_FEATURES.length} premium perks designed to get you matched.</Text>

          <View style={styles.featuresGrid}>
            {PREMIUM_FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: feature.color + '20' }]}>
                  <MaterialCommunityIcons name={feature.icon as any} size={22} color={feature.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureText}>{feature.text}</Text>
                  <Text style={styles.featureDesc}>{feature.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.trustRow}>
            <View style={styles.trustItem}>
              <MaterialCommunityIcons name="shield-check" size={16} color="#4CAF50" />
              <Text style={styles.trustText}>Secure payment</Text>
            </View>
            <View style={styles.trustItem}>
              <MaterialCommunityIcons name="cancel" size={16} color="#FFD700" />
              <Text style={styles.trustText}>Cancel anytime</Text>
            </View>
            <View style={styles.trustItem}>
              <MaterialCommunityIcons name="lock-outline" size={16} color="#4FC3F7" />
              <Text style={styles.trustText}>Private & safe</Text>
            </View>
          </View>

          <View style={{ height: 140 }} />
        </ScrollView>

        <View style={[styles.bottomCta, { paddingBottom: Math.max(insets.bottom - 4, 0) }]}>
          <LinearGradient
            colors={['transparent', 'rgba(26, 26, 46, 0.95)', '#1a1a2e']}
            style={styles.bottomGradient}
          >
            {!isActive && selectedTier.savings && (
              <View style={styles.ctaSavingsRow}>
                <MaterialCommunityIcons name="tag-outline" size={13} color="#FFD700" />
                <Text style={styles.ctaSavingsText}>
                  {selectedTier.label} plan · {selectedTier.savings}
                </Text>
              </View>
            )}

            <View style={styles.subscribeWrap}>
              <Animated.View style={[styles.subscribeGlow, glowStyle]} />
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.subscribeButton}
                onPress={handleSubscribe}
                disabled={processing || isActive}
              >
                <LinearGradient
                  colors={isActive ? ['#4CAF50', '#2E7D32'] : ['#FF6B6B', '#FF8E53', '#FFA500']}
                  style={styles.subscribeGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {processing ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <>
                      <View style={styles.subscribeCopy}>
                        <Text style={styles.subscribeText}>
                          {isActive ? 'You’re Premium' : `Start Premium`}
                        </Text>
                        {!isActive && (
                          <Text style={styles.subscribePrice} numberOfLines={1} adjustsFontSizeToFit>
                            {pricesLoading ? '...' : `· ${getDisplayPrice(selectedTier)}/${selectedTier.interval}`}
                          </Text>
                        )}
                      </View>
                      {!isActive && <Feather name="arrow-right" size={20} color="#FFF" />}
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <Text style={styles.termsText}>
              Renews automatically. Cancel anytime in your store account.
            </Text>

            {Platform.OS !== 'web' && !isActive && (
              <TouchableOpacity
                onPress={handleRestore}
                disabled={restoring || processing}
                style={styles.restoreButton}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                ) : (
                  <Text style={styles.restoreText}>Restore Purchases</Text>
                )}
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 4,
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    top: -60,
    width: 340,
    height: 240,
  },
  glowGradient: {
    flex: 1,
    borderRadius: 170,
  },
  crownContainer: {
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 215, 0, 0.35)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 30,
  },
  crownBg: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 22,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 2.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    paddingHorizontal: 18,
    lineHeight: 22,
    marginBottom: 22,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignSelf: 'stretch',
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFD700',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  activeBannerText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
    marginTop: 14,
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 18,
  },
  tiersContainer: {
    marginBottom: 28,
    gap: 12,
  },
  tierCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  tierCardSelected: {
    borderColor: '#FF6B6B',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
  },
  tierCardPopularInner: {
    backgroundColor: 'rgba(26, 18, 38, 0.85)',
    borderWidth: 0,
    paddingTop: 24,
  },
  popularWrapper: {
    position: 'relative',
  },
  popularGlow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 107, 107, 0.25)',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 18,
  },
  popularBorderGradient: {
    borderRadius: 18,
    padding: 2,
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomLeftRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  popularBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  savingsBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.45)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  savingsBadgeText: {
    color: '#66E07A',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tierContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tierLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  tierLabelBlock: {
    flex: 1,
    minWidth: 0,
  },
  tierTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioOuterSelected: {
    borderColor: '#FF6B6B',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF6B6B',
  },
  tierLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  tierLabelSelected: {
    color: '#FF6B6B',
  },
  tierInterval: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  tierRight: {
    alignItems: 'flex-end',
    minWidth: 82,
    maxWidth: 130,
  },
  tierPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'right',
  },
  tierPriceSelected: {
    color: '#FF6B6B',
  },
  tierPer: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  featureItem: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  featureDesc: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
    lineHeight: 13,
  },
  featureText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFF',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 6,
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '600',
  },
  bottomCta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomGradient: {
    paddingTop: 34,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  ctaSavingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.35)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignSelf: 'center',
  },
  ctaSavingsText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subscribeWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  subscribeGlow: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 107, 107, 0.35)',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 22,
  },
  subscribeButton: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  subscribeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 19,
    paddingHorizontal: 22,
  },
  subscribeCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginRight: 10,
  },
  subscribeText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subscribePrice: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    opacity: 0.95,
  },
  termsText: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 16,
  },
  restoreButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restoreText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textDecorationLine: 'underline',
  },
  priceSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
    marginBottom: 4,
  },
  priceSourceText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    alignSelf: 'center',
  },
  retryText: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '600',
  },
});
