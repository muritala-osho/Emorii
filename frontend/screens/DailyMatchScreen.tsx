import logger from '@/utils/logger';
import { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";
import { getPhotoSource } from "@/utils/photos";
import { BorderRadius, Spacing } from "@/constants/theme";
import { VerificationBadge } from "@/components/VerificationBadge";
import VoiceBio from "@/components/VoiceBio";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const PHOTO_HEIGHT = SCREEN_HEIGHT * 0.58;

const DIASPORA_LABELS: Record<string, string> = {
  "1st_gen": "1st Generation",
  "2nd_gen": "2nd Generation",
  "3rd_gen_plus": "3rd Gen+",
  "born_in_africa": "Born in Africa",
  "not_applicable": "N/A",
};

const RELIGION_ICONS: Record<string, string> = {
  christian: "cross-outline",
  muslim: "moon-outline",
  traditional: "leaf-outline",
  spiritual: "sparkles-outline",
  atheist: "remove-circle-outline",
  agnostic: "help-circle-outline",
};

interface BreakdownItem {
  label: string;
  score: number;
  max: number;
  mine?: any;
  theirs?: any;
  shared?: string[];
}

interface DailyMatch {
  _id: string;
  name: string;
  age?: number;
  bio?: string;
  photos: any[];
  interests?: string[];
  lifestyle?: any;
  countryOfOrigin?: string;
  tribe?: string;
  languages?: string[];
  diasporaGeneration?: string;
  location?: { city?: string; country?: string };
  verified?: boolean;
  premium?: { isActive?: boolean };
  onlineStatus?: string;
  culturalScore?: number;
  culturalBreakdown?: BreakdownItem[];
  sharedInterests?: number;
  voiceBio?: { url?: string; duration?: number };
}

const ScoreRing = ({ score, max, color }: { score: number; max: number; color: string }) => {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <View style={[styles.ringWrap, { borderColor: color }]}>
      <ThemedText style={[styles.ringScore, { color }]}>{score}</ThemedText>
      <ThemedText style={styles.ringLabel}>/ {max}</ThemedText>
      <ThemedText style={[styles.ringPct, { color }]}>{pct}%</ThemedText>
    </View>
  );
};

const AnimBar = ({ score, max, color }: { score: number; max: number; color: string }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const pct = max > 0 ? score / max : 0;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 800, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={styles.barTrack}>
      <Animated.View
        style={[styles.barFill, {
          backgroundColor: color,
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }]}
      />
    </View>
  );
};

export default function DailyMatchScreen() {
  const { theme } = useTheme();
  const { token, user: currentUser } = useAuth();
  const { get, post } = useApi();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [match, setMatch] = useState<DailyMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [liked, setLiked] = useState(false);
  const [passed, setPassed] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchDailyMatch();
  }, []);

  const fetchDailyMatch = async () => {
    if (!token) return;
    setLoading(true);
    setHasError(false);
    try {
      const res = await get<any>("/match/daily-match", token);
      if (!res) {
        setHasError(true);
        return;
      }
      if (res.success === false) {
        setMatch(null);
        setMessage(res.message || "Check back tomorrow for a new match!");
      } else {
        const matchData = res.data?.match ?? res.data ?? res.match ?? (res._id ? res : null);
        const msg = res.data?.message ?? res.message ?? null;
        if (matchData?._id) {
          setMatch(matchData);
          setMessage(msg);
          Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        } else {
          setMatch(null);
          setMessage(msg);
        }
      }
    } catch (e) {
      logger.error("Daily match error:", e);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!match || !token || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await post<{ isMatch?: boolean; matchedUser?: any }>(
        "/friends/request",
        { receiverId: match._id },
        token
      );
      if (res.success) {
        setLiked(true);
        if (res.data?.isMatch && res.data?.matchedUser) {
          navigation.navigate("MatchPopup", {
            currentUser,
            matchedUser: {
              id: res.data.matchedUser._id || match._id,
              name: res.data.matchedUser.name || match.name,
              photos: res.data.matchedUser.photos || match.photos,
            },
          });
        }
      }
    } catch (e) {
      logger.error("Like error:", e);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePass = async () => {
    if (!match || !token || actionLoading) return;
    setActionLoading(true);
    try {
      await post("/match/swipe", { targetUserId: match._id, action: "pass" }, token);
      setPassed(true);
    } catch (e) {
      logger.error("Pass error:", e);
    } finally {
      setActionLoading(false);
    }
  };

  const accentColor =
    (match?.culturalScore || 0) >= 70
      ? "#00C853"
      : (match?.culturalScore || 0) >= 40
      ? "#FF9800"
      : theme.primary;

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
          Finding your best match today...
        </ThemedText>
      </ThemedView>
    );
  }

  if (hasError) {
    return (
      <ThemedView style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={56} color={theme.textSecondary} />
        <ThemedText style={[styles.noMatchTitle, { color: theme.text }]}>
          Could Not Load
        </ThemedText>
        <ThemedText style={[styles.noMatchSub, { color: theme.textSecondary }]}>
          Something went wrong fetching your match. Please try again.
        </ThemedText>
        <Pressable
          style={[styles.retryBtn, { backgroundColor: theme.primary }]}
          onPress={fetchDailyMatch}
        >
          <ThemedText style={styles.retryText}>Try Again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (!match) {
    return (
      <ThemedView style={styles.centered}>
        <Ionicons name="heart-dislike-outline" size={56} color={theme.textSecondary} />
        <ThemedText style={[styles.noMatchTitle, { color: theme.text }]}>
          No Match Today
        </ThemedText>
        <ThemedText style={[styles.noMatchSub, { color: theme.textSecondary }]}>
          {message || "Check back tomorrow — we're curating the perfect match for you."}
        </ThemedText>
      </ThemedView>
    );
  }

  const photo = match.photos?.[photoIndex];
  const photoSource = photo ? getPhotoSource(photo) : null;

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeTop} edges={["top"]}>
        <View style={[styles.navbar, { paddingTop: insets.top > 0 ? 0 : 12 }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <View style={styles.navCenter}>
            <Ionicons name="star" size={14} color="#FFD700" />
            <ThemedText style={[styles.navTitle, { color: theme.text }]}>The One Today</ThemedText>
          </View>
          <View style={{ width: 26 }} />
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <Animated.View style={{ opacity: fadeAnim }}>
          <View style={styles.photoSection}>
            {photoSource ? (
              <Image source={photoSource} style={styles.photo} contentFit="cover" />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: theme.surface }]}>
                <Ionicons name="person-outline" size={80} color={theme.textSecondary} />
              </View>
            )}
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.75)"]}
              style={styles.photoGradient}
            />

            {match.photos.length > 1 && (
              <View style={styles.photoDots}>
                {match.photos.map((_, i) => (
                  <Pressable key={i} onPress={() => setPhotoIndex(i)}>
                    <View style={[styles.dot, { backgroundColor: i === photoIndex ? "#fff" : "rgba(255,255,255,0.4)" }]} />
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.photoOverlay}>
              <View style={styles.nameRow}>
                <ThemedText style={styles.matchName}>
                  {match.name}{match.age ? `, ${match.age}` : ""}
                </ThemedText>
                {match.verified && <VerificationBadge size={18} />}
              </View>
              {(match.location?.city || match.countryOfOrigin) && (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.8)" />
                  <ThemedText style={styles.locationText}>
                    {[match.location?.city, match.countryOfOrigin].filter(Boolean).join(" · ")}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.contentCard, { backgroundColor: theme.background }]}>
            <View style={[styles.premiumBanner, { backgroundColor: "#FFD70018", borderColor: "#FFD70040" }]}>
              <Ionicons name="sparkles" size={16} color="#FFD700" />
              <ThemedText style={styles.premiumBannerText}>
                Curated for you based on cultural fit + shared interests
              </ThemedText>
            </View>

            <View style={[styles.scoreSection, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.scoreTop}>
                <ScoreRing score={match.culturalScore || 0} max={100} color={accentColor} />
                <View style={styles.scoreInfo}>
                  <ThemedText style={[styles.scoreTitle, { color: theme.text }]}>Cultural Compatibility</ThemedText>
                  <ThemedText style={[styles.scoreDesc, { color: theme.textSecondary }]}>
                    {match.sharedInterests || 0} shared interest{(match.sharedInterests || 0) !== 1 ? "s" : ""} · detailed breakdown below
                  </ThemedText>
                </View>
              </View>
              {match.culturalBreakdown?.map((item, i) => (
                <View key={i} style={styles.breakItem}>
                  <View style={styles.breakHeader}>
                    <ThemedText style={[styles.breakLabel, { color: theme.text }]}>{item.label}</ThemedText>
                    <ThemedText style={[styles.breakPoints, { color: item.score > 0 ? accentColor : theme.textSecondary }]}>
                      {item.score}/{item.max}
                    </ThemedText>
                  </View>
                  <AnimBar score={item.score} max={item.max} color={item.score > 0 ? accentColor : theme.border} />
                </View>
              ))}
            </View>

            {match.voiceBio?.url && (
              <VoiceBio voiceBioUrl={match.voiceBio.url} duration={match.voiceBio.duration} isOwn={false} />
            )}

            {match.bio ? (
              <View style={[styles.bioCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Ionicons name="person-outline" size={16} color={theme.primary} />
                <ThemedText style={[styles.bioText, { color: theme.text }]}>{match.bio}</ThemedText>
              </View>
            ) : null}

            {match.interests && match.interests.length > 0 && (
              <View style={styles.interestsSection}>
                <ThemedText style={[styles.sectionLabel, { color: theme.textSecondary }]}>Interests</ThemedText>
                <View style={styles.interestChips}>
                  {match.interests.map((interest, i) => (
                    <View key={i} style={[styles.chip, { backgroundColor: theme.primary + "14", borderColor: theme.primary + "30" }]}>
                      <ThemedText style={[styles.chipText, { color: theme.primary }]}>{interest}</ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.culturalDetails}>
              {match.countryOfOrigin && (
                <View style={[styles.detailPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="flag-outline" size={14} color={theme.primary} />
                  <ThemedText style={[styles.detailPillText, { color: theme.text }]}>{match.countryOfOrigin}</ThemedText>
                </View>
              )}
              {match.tribe && (
                <View style={[styles.detailPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="people-outline" size={14} color={theme.primary} />
                  <ThemedText style={[styles.detailPillText, { color: theme.text }]}>{match.tribe}</ThemedText>
                </View>
              )}
              {match.languages && match.languages.length > 0 && (
                <View style={[styles.detailPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="chatbubble-outline" size={14} color={theme.primary} />
                  <ThemedText style={[styles.detailPillText, { color: theme.text }]}>
                    {match.languages.join(", ")}
                  </ThemedText>
                </View>
              )}
              {match.diasporaGeneration && match.diasporaGeneration !== "not_applicable" && (
                <View style={[styles.detailPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="earth-outline" size={14} color={theme.primary} />
                  <ThemedText style={[styles.detailPillText, { color: theme.text }]}>
                    {DIASPORA_LABELS[match.diasporaGeneration] || match.diasporaGeneration}
                  </ThemedText>
                </View>
              )}
              {match.lifestyle?.religion && match.lifestyle.religion !== "prefer_not_to_say" && (
                <View style={[styles.detailPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons
                    name={(RELIGION_ICONS[match.lifestyle.religion] || "prism-outline") as any}
                    size={14}
                    color={theme.primary}
                  />
                  <ThemedText style={[styles.detailPillText, { color: theme.text }]}>
                    {match.lifestyle.religion.charAt(0).toUpperCase() + match.lifestyle.religion.slice(1)}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      {!liked && !passed && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + 8, backgroundColor: theme.background, borderColor: theme.border }]}>
          <Pressable
            style={[styles.passBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={handlePass}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <Feather name="x" size={28} color="#666" />
            )}
          </Pressable>

          <Pressable
            style={[styles.viewProfileBtn, { borderColor: theme.primary + "40", backgroundColor: theme.primary + "12" }]}
            onPress={() => navigation.navigate("ProfileDetail", { userId: match._id })}
          >
            <ThemedText style={[styles.viewProfileText, { color: theme.primary }]}>View Profile</ThemedText>
          </Pressable>

          <Pressable
            style={[styles.likeBtn, { backgroundColor: theme.primary }]}
            onPress={handleLike}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="heart" size={28} color="#fff" />
            )}
          </Pressable>
        </View>
      )}

      {liked && (
        <View style={[styles.resultBanner, { backgroundColor: "#00C853", paddingBottom: insets.bottom + 8 }]}>
          <Ionicons name="heart" size={20} color="#fff" />
          <ThemedText style={styles.resultText}>You liked {match.name}! Waiting for them to match.</ThemedText>
        </View>
      )}

      {passed && (
        <View style={[styles.resultBanner, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 8, borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <ThemedText style={[styles.resultText, { color: theme.textSecondary }]}>
            Passed. Come back tomorrow for a new match!
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeTop: { backgroundColor: "transparent" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 15, textAlign: "center", marginTop: 8 },
  noMatchTitle: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  noMatchSub: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  retryBtn: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  retryText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: 8,
  },
  navCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  navTitle: { fontSize: 17, fontWeight: "700" },
  photoSection: { width: SCREEN_WIDTH, height: PHOTO_HEIGHT, position: "relative" },
  photo: { width: "100%", height: "100%" },
  photoPlaceholder: { alignItems: "center", justifyContent: "center" },
  photoGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 180 },
  photoDots: { position: "absolute", bottom: 76, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  photoOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: Spacing.md, paddingBottom: Spacing.lg },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  matchName: { fontSize: 26, fontWeight: "800", color: "#fff" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  contentCard: { padding: Spacing.md, gap: Spacing.md },
  premiumBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: BorderRadius.md,
    padding: 10,
  },
  premiumBannerText: { fontSize: 13, fontWeight: "600", color: "#B8860B", flex: 1 },
  scoreSection: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  scoreTop: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: 4 },
  ringWrap: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  ringScore: { fontSize: 20, fontWeight: "800", lineHeight: 22 },
  ringLabel: { fontSize: 10, opacity: 0.6, lineHeight: 12 },
  ringPct: { fontSize: 11, fontWeight: "700", lineHeight: 13 },
  scoreInfo: { flex: 1 },
  scoreTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  scoreDesc: { fontSize: 12, lineHeight: 16 },
  breakItem: { gap: 4 },
  breakHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  breakLabel: { fontSize: 12, fontWeight: "500" },
  breakPoints: { fontSize: 12, fontWeight: "700" },
  barTrack: { height: 6, backgroundColor: "#0000001a", borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  bioCard: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.md, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bioText: { fontSize: 14, lineHeight: 21, flex: 1 },
  sectionLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  interestsSection: {},
  interestChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: "500" },
  culturalDetails: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detailPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  detailPillText: { fontSize: 13, fontWeight: "500" },
  actions: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 16, padding: Spacing.md,
    borderTopWidth: 1,
  },
  passBtn: { width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  likeBtn: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  viewProfileBtn: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 12 },
  viewProfileText: { fontSize: 14, fontWeight: "700" },
  resultBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: Spacing.md },
  resultText: { fontSize: 14, fontWeight: "600", color: "#fff", textAlign: "center", flex: 1 },
});
