import logger from '@/utils/logger';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

interface BoostPackage {
  id: string;
  name: string;
  durationMinutes: number;
  multiplier: number;
  description: string;
}

interface BoostStatus {
  hasActiveBoost: boolean;
  boost: {
    id: string;
    type: string;
    multiplier: number;
    expiresAt: string;
    remainingMinutes: number;
    viewsGained: number;
    likesGained: number;
    matchesGained: number;
  } | null;
}

export default function BoostCenterScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { token, user } = useAuth();
  const { get, post } = useApi();
  
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [packages, setPackages] = useState<BoostPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [statusRes, packagesRes] = await Promise.all([
        get<BoostStatus>('/boost/status', token),
        get<{ packages: BoostPackage[] }>('/boost/packages', token),
      ]);

      if (statusRes.success && statusRes.data) {
        setStatus(statusRes.data);
      }
      if (packagesRes.success && packagesRes.data) {
        setPackages(packagesRes.data.packages);
      }
    } catch (error) {
      logger.error('Error fetching boost data:', error);
    } finally {
      setLoading(false);
    }
  }, [get, token]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleActivateBoost = async (packageId: string) => {
    if (!token) return;
    
    if (!user?.premium?.isActive) {
      Alert.alert(
        'Premium Feature',
        'Boosts are only available for Premium members. Upgrade now to get 10 free boosts per month!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => navigation.navigate('Premium') }
        ]
      );
      return;
    }

    setActivating(packageId);
    try {
      const response = await post<{ success: boolean; message: string }>('/boost/activate', { type: packageId }, token);
      if (response.success) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        Alert.alert('Boost Activated!', response.data?.message || 'Your profile is now being boosted.');
        fetchData();
      } else {
        Alert.alert('Failed', response.message || 'Could not activate boost.');
      }
    } catch (error) {
      logger.error('Activate boost error:', error);
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setActivating(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Boost Center</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {status?.hasActiveBoost && status.boost ? (
          <View style={[styles.activeBoostCard, { backgroundColor: theme.primary }]}>
            <View style={styles.activeHeader}>
              <View style={styles.activeLabelContainer}>
                <Ionicons name="rocket" size={20} color="#fff" />
                <Text style={styles.activeLabel}>ACTIVE BOOST</Text>
              </View>
              <Text style={styles.timerText}>{status.boost.remainingMinutes}m remaining</Text>
            </View>
            <Text style={styles.multiplierText}>{status.boost.multiplier}x Visibility</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{status.boost.viewsGained}</Text>
                <Text style={styles.statLabel}>Extra Views</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{status.boost.likesGained}</Text>
                <Text style={styles.statLabel}>New Likes</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{status.boost.matchesGained}</Text>
                <Text style={styles.statLabel}>Matches</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.promoCard, { backgroundColor: theme.surface }]}>
            <Ionicons name="rocket-outline" size={48} color={theme.primary} />
            <Text style={[styles.promoTitle, { color: theme.text }]}>Get More Matches</Text>
            <Text style={[styles.promoDesc, { color: theme.textSecondary }]}>
              Boost your profile to be seen by more people in your area.
            </Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Boost Packages</Text>
        {packages.map((pkg) => (
          <TouchableOpacity
            key={pkg.id}
            style={[styles.packageCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => handleActivateBoost(pkg.id)}
            disabled={!!activating || status?.hasActiveBoost}
          >
            <View style={styles.packageInfo}>
              <View style={[styles.packageIcon, { backgroundColor: theme.primary + '15' }]}>
                <Text style={[styles.multiplierBadge, { color: theme.primary }]}>{pkg.multiplier}x</Text>
              </View>
              <View style={styles.packageText}>
                <Text style={[styles.packageName, { color: theme.text }]}>{pkg.name}</Text>
                <Text style={[styles.packageDuration, { color: theme.textSecondary }]}>{pkg.durationMinutes} minutes</Text>
              </View>
            </View>
            {activating === pkg.id ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Ionicons 
                name={status?.hasActiveBoost ? "lock-closed-outline" : "chevron-forward"} 
                size={20} 
                color={theme.textSecondary} 
              />
            )}
          </TouchableOpacity>
        ))}

        <View style={[styles.infoBox, { backgroundColor: theme.surface }]}>
          <Feather name="info" size={18} color={theme.primary} />
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            Premium members get 10 free boosts every month!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollContent: { padding: 16 },
  activeBoostCard: { borderRadius: 20, padding: 24, marginBottom: 24 },
  activeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  activeLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeLabel: { color: '#fff', fontWeight: '800', fontSize: 14 },
  timerText: { color: '#fff', fontWeight: '600' },
  multiplierText: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 24 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '700' },
  statLabel: { color: '#ffffffA0', fontSize: 12 },
  promoCard: { borderRadius: 20, padding: 32, alignItems: 'center', marginBottom: 24 },
  promoTitle: { fontSize: 22, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  promoDesc: { textAlign: 'center', lineHeight: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  packageInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  packageIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  multiplierBadge: { fontWeight: '800', fontSize: 16 },
  packageText: { gap: 2 },
  packageName: { fontWeight: '700', fontSize: 16 },
  packageDuration: { fontSize: 13 },
  infoBox: { flexDirection: 'row', padding: 16, borderRadius: 12, gap: 12, marginTop: 12 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
