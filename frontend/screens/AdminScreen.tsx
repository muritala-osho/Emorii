import logger from '@/utils/logger';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { getApiBaseUrl } from '@/constants/config';

const { width } = Dimensions.get('window');

interface Stats {
  totalUsers: number;
  verifiedUsers: number;
  activeToday: number;
  totalMatches: number;
  totalMessages: number;
  pendingReports: number;
  bannedUsers: number;
}

interface Report {
  _id: string;
  reporter: { name: string; email: string };
  reportedUser: { _id: string; name: string; email: string };
  reason: string;
  description: string;
  createdAt: string;
  status: string;
}

interface User {
  _id: string;
  name: string;
  email: string;
  verified: boolean;
  banned: boolean;
  createdAt: string;
  premium?: { isActive: boolean; plan: string };
}

interface Verification {
  _id: string;
  name: string;
  email: string;
  verificationPhoto: string;
  verificationRequestDate?: string;
}

interface Appeal {
  _id: string;
  name: string;
  email: string;
  banned: boolean;
  suspended: boolean;
  appeal: {
    message: string;
    submittedAt: string;
  };
}

export default function AdminScreen({ navigation }: any) {
  const { theme, isDark } = useTheme();
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'stats' | 'users' | 'reports' | 'verifications' | 'appeals' | 'analytics' | 'subscriptions' | 'activity' | 'stories' | 'boosts'>('stats');
  const [isAdminDark, setIsAdminDark] = useState(isDark);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any>(null);
  const [activity, setActivity] = useState<any>(null);
  const [stories, setStories] = useState<any>(null);
  const [boosts, setBoosts] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const authFetch = useCallback(async (url: string, options: any = {}) => {
    const response = await fetch(`${getApiBaseUrl()}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    return response.json();
  }, [token]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await authFetch('/api/admin/stats');
      if (data.success) setStats(data.stats);
    } catch (error) {
      logger.error('Error fetching stats:', error);
    }
  }, [authFetch]);

  const fetchUsers = useCallback(async () => {
    try {
      const query = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
      const data = await authFetch(`/api/admin/users${query}`);
      if (data.success) setUsers(data.users);
    } catch (error) {
      logger.error('Error fetching users:', error);
    }
  }, [authFetch, searchQuery]);

  const fetchReports = useCallback(async () => {
    try {
      const data = await authFetch('/api/admin/reports?status=pending');
      if (data.success) setReports(data.reports);
    } catch (error) {
      logger.error('Error fetching reports:', error);
    }
  }, [authFetch]);

  const fetchVerifications = useCallback(async () => {
    try {
      const data = await authFetch('/api/admin/verifications');
      if (data.success) setVerifications(data.verifications || []);
    } catch (error) {
      logger.error('Error fetching verifications:', error);
    }
  }, [authFetch]);

  const fetchAppeals = useCallback(async () => {
    try {
      const data = await authFetch('/api/admin/appeals');
      if (data.success) setAppeals(data.appeals || []);
    } catch (error) {
      logger.error('Error fetching appeals:', error);
    }
  }, [authFetch]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await authFetch('/api/admin/analytics');
      if (data.success) setAnalytics(data.analytics);
    } catch (error) {
      logger.error('Error fetching analytics:', error);
    }
  }, [authFetch]);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const data = await authFetch('/api/admin/subscriptions-revenue');
      if (data.success) setSubscriptions(data.subscriptions);
    } catch (error) {
      logger.error('Error fetching subscriptions:', error);
    }
  }, [authFetch]);

  const fetchActivity = useCallback(async () => {
    try {
      const data = await authFetch('/api/admin/activity-monitoring');
      if (data.success) setActivity(data.activity);
    } catch (error) {
      logger.error('Error fetching activity:', error);
    }
  }, [authFetch]);

  const fetchStories = useCallback(async () => {
    try {
      const data = await authFetch('/api/admin/stories-moderation');
      if (data.success) setStories(data.flaggedStories || []);
    } catch (error) {
      logger.error('Error fetching stories:', error);
    }
  }, [authFetch]);

  const fetchBoosts = useCallback(async () => {
    try {
      const data = await authFetch('/api/admin/boosts-revenue');
      if (data.success) setBoosts(data.boosts);
    } catch (error) {
      logger.error('Error fetching boosts:', error);
    }
  }, [authFetch]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchUsers(), fetchReports(), fetchVerifications(), fetchAppeals(), fetchAnalytics(), fetchSubscriptions(), fetchActivity(), fetchStories(), fetchBoosts()]);
    setLoading(false);
  }, [fetchStats, fetchUsers, fetchReports, fetchVerifications, fetchAppeals, fetchAnalytics, fetchSubscriptions, fetchActivity, fetchStories, fetchBoosts]);

  useEffect(() => {
    if (!user?.isAdmin) {
      Alert.alert('Access Denied', 'You do not have admin privileges.');
      navigation.goBack();
      return;
    }
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleBanUser = async (userId: string, banned: boolean) => {
    Alert.alert(
      banned ? 'Ban User' : 'Unban User',
      `Are you sure you want to ${banned ? 'ban' : 'unban'} this user?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            try {
              const data = await authFetch(`/api/admin/users/${userId}/ban`, {
                method: 'PUT',
                body: JSON.stringify({ banned, reason: 'Admin action' }),
              });
              if (data.success) {
                Alert.alert('Success', data.message);
                fetchUsers();
                fetchStats();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to update user');
            }
          },
        },
      ]
    );
  };

  const handleReviewAppeal = async (userId: string, action: 'approve' | 'reject') => {
    Alert.alert(
      action === 'approve' ? 'Approve Appeal' : 'Reject Appeal',
      action === 'approve' ? 'Unban/unsuspend this user?' : 'Reject their appeal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Reject',
          style: action === 'approve' ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const response = await authFetch(`/api/admin/appeals/${userId}`, {
                method: 'PUT',
                body: JSON.stringify({ action, adminResponse: '' })
              });
              if (response.success) {
                Alert.alert('Success', response.message);
                fetchAppeals();
                fetchStats();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to review appeal');
            }
          }
        }
      ]
    );
  };

  const handleResolveReport = async (reportId: string, action: string) => {
    try {
      const data = await authFetch(`/api/admin/reports/${reportId}/resolve`, {
        method: 'PUT',
        body: JSON.stringify({ action, notes: `Resolved with action: ${action}` }),
      });
      if (data.success) {
        Alert.alert('Success', 'Report resolved');
        fetchReports();
        fetchStats();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to resolve report');
    }
  };

  const handleVerification = async (userId: string, action: 'approve' | 'reject') => {
    Alert.alert(
      action === 'approve' ? 'Approve Verification' : 'Reject Verification',
      `Are you sure you want to ${action} this verification request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: action === 'approve' ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const data = await authFetch(`/api/admin/verifications/${userId}`, {
                method: 'PUT',
                body: JSON.stringify({ action }),
              });
              if (data.success) {
                Alert.alert('Success', `Verification ${action}d`);
                fetchVerifications();
                fetchStats();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to process verification');
            }
          },
        },
      ]
    );
  };

  const renderVerification = ({ item }: { item: Verification }) => (
    <View style={[styles.listItem, { backgroundColor: theme.card }]}>
      <TouchableOpacity
        style={styles.userInfo}
        onPress={() => navigation.navigate('ProfileDetail', { userId: item._id })}
      >
        <Text style={[styles.userName, { color: theme.text }]}>{item.name}</Text>
        <Text style={[styles.userEmail, { color: theme.textSecondary }]}>{item.email}</Text>
        <Text style={[styles.reportMeta, { color: theme.textSecondary }]}>
          Requested: {item.verificationRequestDate ? new Date(item.verificationRequestDate).toLocaleDateString() : 'N/A'}
        </Text>
      </TouchableOpacity>
      <View style={styles.reportActions}>
        <TouchableOpacity
          style={[styles.miniButton, { backgroundColor: '#22c55e' }]}
          onPress={() => handleVerification(item._id, 'approve')}
        >
          <Ionicons name="checkmark" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.miniButton, { backgroundColor: '#ef4444' }]}
          onPress={() => handleVerification(item._id, 'reject')}
        >
          <Ionicons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const StatCard = ({ title, value, icon, color }: any) => (
    <View style={[styles.statCard, { backgroundColor: isAdminDark ? '#1a1a1a' : theme.card, width: (width - 44) / 2 }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={[styles.statValue, { color: isAdminDark ? '#fff' : theme.text }]}>{value}</Text>
      <Text style={[styles.statTitle, { color: isAdminDark ? '#ccc' : theme.textSecondary }]}>{title}</Text>
    </View>
  );

  const renderUser = ({ item }: { item: User }) => (
    <View style={[styles.listItem, { backgroundColor: isAdminDark ? '#1a1a1a' : theme.card }]}>
      <TouchableOpacity
        style={styles.userInfo}
        onPress={() => navigation.navigate('ProfileDetail', { userId: item._id })}
      >
        <Text style={[styles.userName, { color: isAdminDark ? '#fff' : theme.text }]}>{item.name}</Text>
        <Text style={[styles.userEmail, { color: isAdminDark ? '#ccc' : theme.textSecondary }]}>{item.email}</Text>
        <View style={styles.badges}>
          {item.verified && (
            <View style={[styles.badge, { backgroundColor: '#22c55e20' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
              <Text style={[styles.badgeText, { color: '#22c55e' }]}>Verified</Text>
            </View>
          )}
          {item.premium?.isActive && (
            <View style={[styles.badge, { backgroundColor: '#f59e0b20' }]}>
              <Ionicons name="star" size={12} color="#f59e0b" />
              <Text style={[styles.badgeText, { color: '#f59e0b' }]}>{item.premium.plan}</Text>
            </View>
          )}
          {item.banned && (
            <View style={[styles.badge, { backgroundColor: '#ef444420' }]}>
              <Ionicons name="ban" size={12} color="#ef4444" />
              <Text style={[styles.badgeText, { color: '#ef4444' }]}>Banned</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: item.banned ? '#22c55e' : '#ef4444' }]}
        onPress={() => handleBanUser(item._id, !item.banned)}
      >
        <Text style={styles.actionButtonText}>{item.banned ? 'Unban' : 'Ban'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReport = ({ item }: { item: Report }) => (
    <View style={[styles.listItem, { backgroundColor: theme.card }]}>
      <TouchableOpacity
        style={styles.reportInfo}
        onPress={() => navigation.navigate('ProfileDetail', { userId: item.reportedUser?._id })}
      >
        <Text style={[styles.reportReason, { color: theme.text }]}>{item.reason}</Text>
        <Text style={[styles.reportDesc, { color: theme.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
        <Text style={[styles.reportMeta, { color: theme.textSecondary }]}>
          {item.reporter?.name} reported {item.reportedUser?.name}
        </Text>
      </TouchableOpacity>
      <View style={styles.reportActions}>
        <TouchableOpacity
          style={[styles.miniButton, { backgroundColor: '#22c55e' }]}
          onPress={() => handleResolveReport(item._id, 'dismiss')}
        >
          <Ionicons name="checkmark" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.miniButton, { backgroundColor: '#f59e0b' }]}
          onPress={() => handleResolveReport(item._id, 'warn')}
        >
          <Ionicons name="warning" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.miniButton, { backgroundColor: '#ef4444' }]}
          onPress={() => handleResolveReport(item._id, 'ban')}
        >
          <Ionicons name="ban" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isAdminDark ? '#000' : theme.background }]}>
      <View style={[styles.header, { backgroundColor: isAdminDark ? '#1a1a1a' : theme.card }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={isAdminDark ? '#fff' : theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isAdminDark ? '#fff' : theme.text }]}>Admin Dashboard</Text>
        <TouchableOpacity 
          style={styles.themeToggle}
          onPress={() => setIsAdminDark(!isAdminDark)}
        >
          <Ionicons name={isAdminDark ? "sunny" : "moon"} size={24} color={isAdminDark ? '#fff' : theme.text} />
          <Text style={[styles.themeToggleText, { color: isAdminDark ? '#fff' : theme.text }]}>
            {isAdminDark ? "Day" : "Night"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {['stats', 'users', 'reports', 'verifications', 'appeals', 'analytics', 'subscriptions', 'activity', 'stories', 'boosts'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab as any)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? theme.primary : theme.textSecondary }]}>
              {tab === 'verifications' ? '✓' : tab === 'analytics' ? '📊' : tab === 'subscriptions' ? '💰' : tab === 'activity' ? '📱' : tab === 'stories' ? '📸' : tab === 'boosts' ? '⭐' : tab.charAt(0).toUpperCase()}
              {tab === 'reports' && reports.length > 0 && ` (${reports.length})`}
              {tab === 'verifications' && verifications.length > 0 && ` (${verifications.length})`}
              {tab === 'appeals' && appeals.length > 0 && ` (${appeals.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'stats' && stats && (
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.statsGrid}>
            <StatCard title="Total Users" value={stats.totalUsers} icon="people" color="#3b82f6" />
            <StatCard title="Active Today" value={stats.activeToday} icon="pulse" color="#22c55e" />
            <StatCard title="Verified" value={stats.verifiedUsers} icon="checkmark-circle" color="#8b5cf6" />
            <StatCard title="Matches" value={stats.totalMatches} icon="heart" color="#ec4899" />
            <StatCard title="Messages" value={stats.totalMessages} icon="chatbubbles" color="#06b6d4" />
            <StatCard title="Pending Reports" value={stats.pendingReports} icon="flag" color="#f59e0b" />
            <StatCard title="Banned Users" value={stats.bannedUsers} icon="ban" color="#ef4444" />
          </View>
        </ScrollView>
      )}

      {activeTab === 'users' && (
        <View style={styles.content}>
          <View style={[styles.searchBar, { backgroundColor: theme.card }]}>
            <Ionicons name="search" size={20} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search users..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={fetchUsers}
            />
          </View>
          <FlatList
            data={users}
            renderItem={renderUser}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.list}
          />
        </View>
      )}

      {activeTab === 'reports' && (
        <FlatList
          data={reports}
          renderItem={renderReport}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No pending reports</Text>
            </View>
          }
        />
      )}

      {activeTab === 'verifications' && (
        <FlatList
          data={verifications}
          renderItem={renderVerification}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No pending verifications</Text>
            </View>
          }
        />
      )}

      {activeTab === 'appeals' && (
        <FlatList
          data={appeals}
          renderItem={({ item }) => (
            <View style={[styles.listItem, { backgroundColor: theme.card }]}>
              <TouchableOpacity
                style={styles.userInfo}
                onPress={() => navigation.navigate('ProfileDetail', { userId: item._id })}
              >
                <Text style={[styles.userName, { color: theme.text }]}>{item.name}</Text>
                <Text style={[styles.userEmail, { color: theme.textSecondary }]}>{item.email}</Text>
                <Text style={[styles.reportMeta, { color: theme.textSecondary }]}>
                  {item.banned ? '🚫 Banned' : '⏸ Suspended'}
                </Text>
                <Text style={[styles.reportDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                  "{item.appeal.message}"
                </Text>
              </TouchableOpacity>
              <View style={styles.reportActions}>
                <TouchableOpacity
                  style={[styles.miniButton, { backgroundColor: '#22c55e' }]}
                  onPress={() => handleReviewAppeal(item._id, 'approve')}
                >
                  <Ionicons name="checkmark" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.miniButton, { backgroundColor: '#ef4444' }]}
                  onPress={() => handleReviewAppeal(item._id, 'reject')}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No pending appeals</Text>
            </View>
          }
        />
      )}

      {activeTab === 'analytics' && analytics && (
        <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View style={styles.statsGrid}>
            <StatCard title="Profile Views" value={analytics.profileViewsMonth} icon="eye" color="#3b82f6" />
            <StatCard title="Total Matches" value={analytics.totalMatches} icon="heart" color="#ec4899" />
            <StatCard title="Total Users" value={analytics.totalUsers} icon="people" color="#8b5cf6" />
            <StatCard title="Avg Match Rate" value={`${analytics.avgMatchRate}%`} icon="trending-up" color="#22c55e" />
          </View>
        </ScrollView>
      )}

      {activeTab === 'subscriptions' && subscriptions && (
        <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View style={styles.statsGrid}>
            <StatCard title="Active Subs" value={subscriptions.totalActive} icon="star" color="#f59e0b" />
            <StatCard title="Est. Revenue" value={`$${subscriptions.estimatedMonthlyRevenue}`} icon="cash" color="#22c55e" />
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statTitle, { color: theme.text, marginTop: 8 }]}>Plans Breakdown:</Text>
              {Object.entries(subscriptions.plansBreakdown || {}).map(([plan, count]: any) => (
                <Text key={plan} style={[styles.statTitle, { color: theme.textSecondary }]}>
                  {plan}: {count}
                </Text>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {activeTab === 'activity' && activity && (
        <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View style={styles.statsGrid}>
            <StatCard title="Active 24h" value={activity.active24h} icon="pulse" color="#22c55e" />
            <StatCard title="Active 7d" value={activity.active7d} icon="calendar" color="#3b82f6" />
            <StatCard title="Messages 24h" value={activity.messages24h} icon="chatbubbles" color="#06b6d4" />
            <StatCard title="Online Now" value={activity.onlineNow} icon="globe" color="#ef4444" />
          </View>
        </ScrollView>
      )}

      {activeTab === 'stories' && stories && (
        <FlatList
          data={stories}
          renderItem={({ item }) => (
            <View style={[styles.listItem, { backgroundColor: theme.card }]}>
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: theme.text }]}>Flagged Story</Text>
                <Text style={[styles.userEmail, { color: theme.textSecondary }]}>By: {item.userId?.name || 'Unknown'}</Text>
                <Text style={[styles.reportMeta, { color: theme.textSecondary }]}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          )}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No flagged stories</Text>
            </View>
          }
        />
      )}

      {activeTab === 'boosts' && boosts && (
        <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View style={styles.statsGrid}>
            <StatCard title="Total Boosts" value={boosts.totalBoostsIssued} icon="flash" color="#f59e0b" />
            <StatCard title="Users w/ Boosts" value={boosts.usersWithBoosts} icon="people" color="#8b5cf6" />
            <StatCard title="Est. Revenue" value={`$${boosts.estimatedBoostRevenue}`} icon="cash" color="#22c55e" />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  themeToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '500' },
  content: { flex: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  statCard: { width: '45%', margin: '2.5%', padding: 16, borderRadius: 12, alignItems: 'center' },
  statIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: '700' },
  statTitle: { fontSize: 12, marginTop: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 16, paddingHorizontal: 12, borderRadius: 8, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  list: { padding: 16 },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600' },
  userEmail: { fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', marginTop: 6, gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, gap: 4 },
  badgeText: { fontSize: 10, fontWeight: '500' },
  actionButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  actionButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  reportInfo: { flex: 1 },
  reportReason: { fontSize: 14, fontWeight: '600' },
  reportDesc: { fontSize: 12, marginTop: 4 },
  reportMeta: { fontSize: 10, marginTop: 4 },
  reportActions: { flexDirection: 'row', gap: 8 },
  miniButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, marginTop: 8 },
});
