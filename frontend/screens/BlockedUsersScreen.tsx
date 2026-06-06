import logger from '@/utils/logger';
import { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useThemedAlert } from "@/components/ThemedAlert";
import { getPhotoSource } from "@/utils/photos";
import { useNavigation } from "@react-navigation/native";

export default function BlockedUsersScreen() {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { get, del } = useApi();
  const { showAlert, AlertComponent } = useThemedAlert();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlockedUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await get<any>('/block/list', token);
      if (response.success && response.data?.blockedUsers) {
        setBlockedUsers(response.data.blockedUsers);
      }
    } catch (error) {
      logger.error('Failed to fetch blocked users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockedUsers();
  }, [token]);

  const handleUnblock = async (userId: string, name: string) => {
    showAlert(
      'Unblock User',
      `Are you sure you want to unblock ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              const response = await del(`/block/${userId}`, token || '');
              if (response.success) {
                setBlockedUsers(prev => prev.filter(u => u._id !== userId));
                showAlert('Success', `${name} has been unblocked`, [{ text: 'OK' }], 'check-circle');
              }
            } catch (error) {
              showAlert('Error', 'Failed to unblock user', [{ text: 'OK' }], 'alert-circle');
            }
          }
        }
      ],
      'alert-circle'
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const photoSource = getPhotoSource(item.photos?.[0]) || require('../assets/icon.png');
    return (
      <View style={[styles.userCard, { backgroundColor: theme.settingsItemBg, borderColor: theme.border }]}>
        <Image 
          source={photoSource} 
          style={styles.avatar}
          contentFit="cover"
        />
        <View style={styles.userInfo}>
          <ThemedText style={[styles.userName, { color: theme.text }]}>{item.name}</ThemedText>
          <ThemedText style={[styles.userStatus, { color: theme.textSecondary }]}>Blocked</ThemedText>
        </View>
        <Pressable 
          style={[styles.unblockButton, { borderColor: theme.primary, backgroundColor: theme.primary + '10' }]} 
          onPress={() => handleUnblock(item._id, item.name)}
        >
          <Ionicons name="lock-open-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
          <ThemedText style={{ color: theme.primary, fontWeight: '600', fontSize: 14 }}>Unblock</ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: theme.text }]}>Blocked Users</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlashList
          data={blockedUsers}
          renderItem={renderItem}
          keyExtractor={item => item._id}
          estimatedItemSize={72}
          contentContainerStyle={[styles.listContent, blockedUsers.length === 0 && { flex: 1 }] as any}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.primary + '15' }]}>
                <Feather name="slash" size={40} color={theme.primary} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>No blocked users</ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                Users you block will appear here
              </ThemedText>
            </View>
          }
        />
      )}
      <AlertComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: Spacing.md },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  userInfo: { flex: 1, marginLeft: Spacing.md },
  userName: { fontSize: 16, fontWeight: '700' },
  userStatus: { fontSize: 13, marginTop: 2 },
  unblockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { fontSize: 14 },
});
