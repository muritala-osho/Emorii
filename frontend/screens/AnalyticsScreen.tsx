import logger from '@/utils/logger';
import { useState, useCallback } from "react";
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  Dimensions, 
  ActivityIndicator,
  Pressable
} from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function AnalyticsScreen() {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { get } = useApi();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [profileViews, setProfileViews] = useState(0);
  const [matchRate, setMatchRate] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);

  const fetchAnalytics = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [viewsRes, rateRes] = await Promise.all([
        get<any>('/analytics/profile-views?period=7', token),
        get<any>('/analytics/match-rate', token)
      ]);

      if (viewsRes.success) setProfileViews(viewsRes.views);
      if (rateRes.success) {
        setMatchRate(rateRes.matchRate);
        setTotalMatches(rateRes.totalMatches);
        setTotalLikes(rateRes.totalLikes);
      }
    } catch (error) {
      logger.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAnalytics();
    }, [token])
  );

  const StatCard = ({ title, value, icon, color }: any) => (
    <View style={[styles.statCard, { backgroundColor: theme.settingsItemBg }]}>
      <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={[styles.statTitle, { color: theme.textSecondary }]}>{title}</ThemedText>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingTop: insets.top + Spacing.m, paddingBottom: insets.bottom + Spacing.xl }}
    >
      <View style={styles.header}>
        <ThemedText style={styles.title}>Your Activity</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>Last 7 days performance</ThemedText>
      </View>

      <View style={styles.statsGrid}>
        <StatCard 
          title="Profile Views" 
          value={profileViews} 
          icon="eye" 
          color="#4FACFE" 
        />
        <StatCard 
          title="Match Rate" 
          value={`${matchRate}%`} 
          icon="trending-up" 
          color="#00F2FE" 
        />
        <StatCard 
          title="Matches" 
          value={totalMatches} 
          icon="heart" 
          color="#FF0844" 
        />
        <StatCard 
          title="Likes Sent" 
          value={totalLikes} 
          icon="thumbs-up" 
          color="#F9D423" 
        />
      </View>

      <View style={[styles.chartContainer, { backgroundColor: theme.settingsItemBg }]}>
        <ThemedText style={styles.chartTitle}>Overview</ThemedText>
        <LineChart
          data={{
            labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            datasets: [{ data: [Math.random() * 10, Math.random() * 10, profileViews, Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10] }]
          }}
          width={SCREEN_WIDTH - Spacing.xl * 2}
          height={220}
          chartConfig={{
            backgroundColor: theme.settingsItemBg,
            backgroundGradientFrom: theme.settingsItemBg,
            backgroundGradientTo: theme.settingsItemBg,
            decimalPlaces: 0,
            color: (opacity = 1) => theme.primary,
            labelColor: (opacity = 1) => theme.textSecondary,
            style: { borderRadius: 16 },
            propsForDots: { r: "6", strokeWidth: "2", stroke: theme.primary }
          }}
          bezier
          style={{ marginVertical: 8, borderRadius: 16 }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.xl },
  title: { fontSize: 28, fontWeight: 'bold' },
  subtitle: { fontSize: 16 },
  statsGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    paddingHorizontal: Spacing.m,
    justifyContent: 'space-between'
  },
  statCard: {
    width: (SCREEN_WIDTH - Spacing.m * 3) / 2,
    padding: Spacing.l,
    borderRadius: BorderRadius.l,
    marginBottom: Spacing.m,
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.s,
  },
  statValue: { fontSize: 24, fontWeight: 'bold' },
  statTitle: { fontSize: 14 },
  chartContainer: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.m,
    padding: Spacing.l,
    borderRadius: BorderRadius.l,
  },
  chartTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: Spacing.m },
});
