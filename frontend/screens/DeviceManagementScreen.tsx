import { useState, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BorderRadius, Spacing } from "@/constants/theme";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "DeviceManagement">;
};

interface Session {
  sessionId: string;
  deviceName: string;
  platform: "ios" | "android" | "web" | "unknown";
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function platformIcon(platform: string) {
  if (platform === "ios") return "smartphone";
  if (platform === "android") return "smartphone";
  if (platform === "web") return "monitor";
  return "cpu";
}

function platformLabel(platform: string) {
  if (platform === "ios") return "iOS";
  if (platform === "android") return "Android";
  if (platform === "web") return "Web";
  return "Unknown";
}

export default function DeviceManagementScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { get, del } = useApi();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadSessions = useCallback(
    async (isRefresh = false) => {
      if (!token) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await get<{ sessions: Session[] }>("/sessions", token);
        if (res.success && res.data?.sessions) {
          setSessions(res.data.sessions);
        }
      } catch (_) {}
      setLoading(false);
      setRefreshing(false);
    },
    [token, get]
  );

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  const handleRevoke = (sessionId: string, deviceName: string) => {
    Alert.alert(
      "Log out device",
      `Remove "${deviceName}" from your account?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out",
          style: "destructive",
          onPress: async () => {
            setRevoking(sessionId);
            try {
              const res = await del(`/sessions/${sessionId}`, token || "");
              if (res.success) {
                setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
              } else {
                Alert.alert("Error", res.message || "Failed to log out device");
              }
            } catch (_) {
              Alert.alert("Error", "Something went wrong. Please try again.");
            }
            setRevoking(null);
          },
        },
      ]
    );
  };

  const handleRevokeAll = () => {
    const otherCount = sessions.filter((s) => !s.isCurrent).length;
    if (otherCount === 0) {
      Alert.alert("No other devices", "You only have this one active session.");
      return;
    }
    Alert.alert(
      "Log out all other devices",
      `This will remove ${otherCount} other device${otherCount > 1 ? "s" : ""} from your account.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out all",
          style: "destructive",
          onPress: async () => {
            setRevokingAll(true);
            try {
              const res = await del("/sessions/others", token || "");
              if (res.success) {
                setSessions((prev) => prev.filter((s) => s.isCurrent));
              } else {
                Alert.alert("Error", res.message || "Failed to log out other devices");
              }
            } catch (_) {
              Alert.alert("Error", "Something went wrong. Please try again.");
            }
            setRevokingAll(false);
          },
        },
      ]
    );
  };

  const otherSessions = sessions.filter((s) => !s.isCurrent);
  const currentSession = sessions.find((s) => s.isCurrent);

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Active Sessions</ThemedText>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadSessions(true)}
              tintColor={theme.primary}
            />
          }
        >
          <ThemedText style={[styles.sectionDesc, { color: theme.textSecondary }]}>
            Devices currently logged into your Emorii account. Remove any session you don't recognise.
          </ThemedText>

          {currentSession && (
            <>
              <ThemedText style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                THIS DEVICE
              </ThemedText>
              <SessionCard
                session={currentSession}
                theme={theme}
                revoking={false}
                onRevoke={() => {}}
                isCurrentDisabled
              />
            </>
          )}

          {otherSessions.length > 0 && (
            <>
              <ThemedText style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                OTHER DEVICES
              </ThemedText>
              {otherSessions.map((session) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  theme={theme}
                  revoking={revoking === session.sessionId}
                  onRevoke={() => handleRevoke(session.sessionId, session.deviceName)}
                />
              ))}

              <Pressable
                style={[styles.revokeAllBtn, { borderColor: "#FF3B30" }]}
                onPress={handleRevokeAll}
                disabled={revokingAll}
              >
                {revokingAll ? (
                  <ActivityIndicator color="#FF3B30" size="small" />
                ) : (
                  <>
                    <Feather name="log-out" size={16} color="#FF3B30" />
                    <ThemedText style={styles.revokeAllText}>
                      Log out all other devices
                    </ThemedText>
                  </>
                )}
              </Pressable>
            </>
          )}

          {sessions.length === 0 && (
            <View style={styles.centered}>
              <Feather name="shield" size={40} color={theme.textSecondary} />
              <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
                No active sessions found
              </ThemedText>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function SessionCard({
  session,
  theme,
  revoking,
  onRevoke,
  isCurrentDisabled,
}: {
  session: Session;
  theme: any;
  revoking: boolean;
  onRevoke: () => void;
  isCurrentDisabled?: boolean;
}) {
  const location =
    session.city && session.country
      ? `${session.city}, ${session.country}`
      : session.country || session.ipAddress || "Unknown location";

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.iconCircle, { backgroundColor: theme.primary + "18" }]}>
        <Feather name={platformIcon(session.platform) as any} size={22} color={theme.primary} />
      </View>
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <ThemedText style={styles.cardTitle} numberOfLines={1}>
            {session.deviceName}
          </ThemedText>
          {session.isCurrent && (
            <View style={[styles.currentBadge, { backgroundColor: theme.primary + "20" }]}>
              <ThemedText style={[styles.currentBadgeText, { color: theme.primary }]}>
                Active
              </ThemedText>
            </View>
          )}
        </View>
        <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>
          {platformLabel(session.platform)} · {location}
        </ThemedText>
        <ThemedText style={[styles.cardSub, { color: theme.textSecondary }]}>
          Last active {timeAgo(session.lastActive)}
        </ThemedText>
      </View>
      {!isCurrentDisabled && (
        <Pressable
          onPress={onRevoke}
          disabled={revoking}
          style={styles.revokeBtn}
          hitSlop={8}
        >
          {revoking ? (
            <ActivityIndicator size="small" color="#FF3B30" />
          ) : (
            <Feather name="x-circle" size={20} color="#FF3B30" />
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, alignItems: "flex-start" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: { fontSize: 15, marginTop: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1, gap: 3 },
  cardNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  cardSub: { fontSize: 13 },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  currentBadgeText: { fontSize: 11, fontWeight: "700" },
  revokeBtn: { padding: 4 },
  revokeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
  revokeAllText: {
    color: "#FF3B30",
    fontSize: 15,
    fontWeight: "600",
  },
});
