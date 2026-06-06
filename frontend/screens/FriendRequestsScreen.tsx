import logger from '@/utils/logger';
import { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { useFocusEffect } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useThemedAlert } from "@/components/ThemedAlert";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getPhotoSource } from "@/utils/photos";
import * as Haptics from 'expo-haptics';

type FriendRequestsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "FriendRequests">;

interface FriendRequestsScreenProps {
  navigation: FriendRequestsScreenNavigationProp;
}

interface RequestUser {
  _id: string;
  name: string;
  age?: number;
  bio?: string;
  photos?: any[];
}

interface FriendRequestData {
  _id: string;
  sender: RequestUser;
  status: string;
  createdAt: string;
}

export default function FriendRequestsScreen({ navigation }: FriendRequestsScreenProps) {
  const { theme } = useTheme();
  const { token } = useAuth();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const { showAlert, AlertComponent } = useThemedAlert();
  const [requests, setRequests] = useState<FriendRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    if (!token) return;
    
    try {
      const response = await api.get<{ success: boolean; requests: FriendRequestData[] }>(
        '/friends/requests',
        token
      );
      
      if (response.success && response.data?.requests) {
        setRequests(response.data.requests);
      }
    } catch (error) {
      logger.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [token])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const handleAccept = async (requestId: string, senderName: string) => {
    if (!token) return;
    setProcessingId(requestId);
    
    try {
      const response = await api.put<{ success: boolean; isMatch: boolean }>(
        `/friends/request/${requestId}`,
        { action: 'accept' },
        token
      );
      
      if (response.success) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setRequests(prev => prev.filter(r => r._id !== requestId));
        showAlert(
          "It's a Match!",
          `You and ${senderName} are now matched! Start chatting now.`,
          [{ text: 'OK', style: 'default' }],
          'heart'
        );
      }
    } catch (error) {
      logger.error("Error accepting request:", error);
      showAlert('Error', 'Failed to accept request. Please try again.', [{ text: 'OK', style: 'default' }], 'alert-circle');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!token) return;
    setProcessingId(requestId);
    
    try {
      const response = await api.put<{ success: boolean }>(
        `/friends/request/${requestId}`,
        { action: 'reject' },
        token
      );
      
      if (response.success) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        setRequests(prev => prev.filter(r => r._id !== requestId));
      }
    } catch (error) {
      logger.error("Error rejecting request:", error);
      showAlert('Error', 'Failed to reject request. Please try again.', [{ text: 'OK', style: 'default' }], 'alert-circle');
    } finally {
      setProcessingId(null);
    }
  };

  const renderRequest = ({ item }: { item: FriendRequestData }) => {
    const isProcessing = processingId === item._id;
    const photoSource = item.sender?.photos?.[0] ? getPhotoSource(item.sender.photos[0]) : null;
    
    return (
      <View style={[styles.requestCard, { backgroundColor: theme.surface }]}>
        <View style={styles.userInfo}>
          {photoSource ? (
            <Image source={photoSource} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="user" size={28} color={theme.textSecondary} />
            </View>
          )}
          <View style={styles.textInfo}>
            <ThemedText style={[styles.name, { color: theme.text }]}>
              {item.sender?.name}{item.sender?.age ? `, ${item.sender.age}` : ''}
            </ThemedText>
            {item.sender?.bio && (
              <ThemedText style={[styles.bio, { color: theme.textSecondary }]} numberOfLines={2}>
                {item.sender.bio}
              </ThemedText>
            )}
            <ThemedText style={[styles.timeAgo, { color: theme.textSecondary }]}>
              Wants to match with you
            </ThemedText>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.actionButton, styles.rejectButton, { borderColor: '#FF6B6B' }]}
            onPress={() => handleReject(item._id)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <>
                <Feather name="x" size={18} color="#FF6B6B" />
                <ThemedText style={[styles.actionButtonText, { color: '#FF6B6B' }]}>
                  Decline
                </ThemedText>
              </>
            )}
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.acceptButton, { backgroundColor: '#4CAF50' }]}
            onPress={() => handleAccept(item._id, item.sender?.name || 'User')}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Feather name="check" size={18} color="#FFF" />
                <ThemedText style={[styles.actionButtonText, { color: '#FFF' }]}>
                  Accept
                </ThemedText>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.primary + '20' }]}>
        <Feather name="heart" size={48} color={theme.primary} />
      </View>
      <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>
        No match requests yet
      </ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        When someone wants to match with you, you'll see their request here
      </ThemedText>
    </View>
  );

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading requests...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Match Requests</ThemedText>
        <View style={styles.headerSpacer} />
      </View>
      
      <FlashList
        data={requests}
        renderItem={renderRequest}
        keyExtractor={(item) => item._id}
        estimatedItemSize={88}
        contentContainerStyle={styles.listContent as any}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      />
      <AlertComponent />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFF",
  },
  headerSpacer: {
    width: 44,
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: "#888",
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  requestCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  userInfo: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  textInfo: {
    flex: 1,
    gap: 4,
  },
  name: {
    ...Typography.h3,
    fontSize: 18,
    fontWeight: "700",
  },
  bio: {
    ...Typography.caption,
    lineHeight: 18,
  },
  timeAgo: {
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  rejectButton: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  acceptButton: {},
  actionButtonText: {
    ...Typography.body,
    fontWeight: "600",
    fontSize: 15,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl * 2,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h2,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    ...Typography.body,
    textAlign: "center",
    lineHeight: 22,
  },
});
