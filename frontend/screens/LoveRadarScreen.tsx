import logger from "@/utils/logger";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  StatusBar,
  Text,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  SlideInDown,
  SlideOutDown,
  interpolate,
} from "react-native-reanimated";
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Circle,
  Line,
  G,
  Path,
  LinearGradient as SvgLinearGradient,
} from "react-native-svg";
import { Image } from "expo-image";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { getApiBaseUrl } from "@/constants/config";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const RADAR_SIZE = Math.min(SCREEN_W - 32, SCREEN_H * 0.55);
const RADAR_RADIUS = RADAR_SIZE / 2;
const AVATAR_SIZE = 48;
const CENTER_PAD = AVATAR_SIZE / 2 + 18;

const COLORS = {
  bg: "#06060c",
  bgGradient: ["#0d0d1a", "#06060c"] as const,
  accent: "#FF4D8B",
  accentSoft: "rgba(255, 77, 139, 0.18)",
  ring: "rgba(255, 77, 139, 0.22)",
  ringFaint: "rgba(255, 255, 255, 0.06)",
  text: "#ffffff",
  textDim: "rgba(255,255,255,0.7)",
  textMuted: "rgba(255,255,255,0.45)",
  surface: "rgba(20, 20, 35, 0.85)",
  cardBorder: "rgba(255,255,255,0.08)",
};

const Pulse = Animated.createAnimatedComponent(Circle);

interface NearbyUser {
  id: string;
  name: string;
  username?: string;
  age: number | null;
  gender?: string;
  bio?: string;
  profilePhoto: string | null;
  distance: number; // km
  distanceDisplay?: string;
  distanceUnit?: "m" | "km";
  angle: number; // degrees, 0-360
  online?: boolean;
  verified?: boolean;
  interests?: string[];
}

type Nav = NativeStackNavigationProp<RootStackParamList, "LoveRadar">;
interface Props { navigation: Nav }

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDistance(km: number): string {
  if (km == null || isNaN(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)}m away`;
  if (km < 10) return `${km.toFixed(1)}km away`;
  return `${Math.round(km)}km away`;
}

function avatarPosition(angleDeg: number, distance: number, maxRadius: number) {
  const usableR = RADAR_RADIUS - CENTER_PAD - AVATAR_SIZE / 2 - 4;
  const norm = Math.max(0.05, Math.min(1, distance / Math.max(1, maxRadius)));
  const r = CENTER_PAD + norm * usableR;
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: RADAR_RADIUS + r * Math.sin(rad) - AVATAR_SIZE / 2,
    y: RADAR_RADIUS - r * Math.cos(rad) - AVATAR_SIZE / 2,
  };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function PulseRing({ delay = 0, accentColor }: { delay?: number; accentColor: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.1, 1], [0, 0.55, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.15, 1]) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <View
        style={{
          width: RADAR_SIZE,
          height: RADAR_SIZE,
          borderRadius: RADAR_RADIUS,
          borderWidth: 1.5,
          borderColor: accentColor,
          shadowColor: accentColor,
          shadowOpacity: 0.6,
          shadowRadius: 12,
        }}
      />
    </Animated.View>
  );
}

function SweepLine({ accentColor }: { accentColor: string }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 4500, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          top: 0,
          width: RADAR_SIZE,
          height: RADAR_SIZE,
        },
        style,
      ]}
    >
      <Svg width={RADAR_SIZE} height={RADAR_SIZE}>
        <Defs>
          <SvgLinearGradient id="sweep" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={accentColor} stopOpacity={0} />
            <Stop offset="60%" stopColor={accentColor} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={accentColor} stopOpacity={0.85} />
          </SvgLinearGradient>
        </Defs>
        {/* Cone-like sweep using a path */}
        <Path
          d={`M ${RADAR_RADIUS} ${RADAR_RADIUS}
              L ${RADAR_RADIUS} 0
              A ${RADAR_RADIUS} ${RADAR_RADIUS} 0 0 1
                ${RADAR_RADIUS + Math.sin((Math.PI / 4)) * RADAR_RADIUS}
                ${RADAR_RADIUS - Math.cos((Math.PI / 4)) * RADAR_RADIUS}
              Z`}
          fill="url(#sweep)"
        />
        {/* Leading edge sharp line */}
        <Line
          x1={RADAR_RADIUS}
          y1={RADAR_RADIUS}
          x2={RADAR_RADIUS + Math.sin(Math.PI / 4) * RADAR_RADIUS}
          y2={RADAR_RADIUS - Math.cos(Math.PI / 4) * RADAR_RADIUS}
          stroke={accentColor}
          strokeWidth={1.5}
          strokeOpacity={0.9}
        />
      </Svg>
    </Animated.View>
  );
}

function RadarRings({ accentColor }: { accentColor: string }) {
  const ringColor = `${accentColor}38`;
  return (
    <Svg
      width={RADAR_SIZE}
      height={RADAR_SIZE}
      style={{ position: "absolute", left: 0, top: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="bg" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={accentColor} stopOpacity={0.07} />
          <Stop offset="60%" stopColor={accentColor} stopOpacity={0.02} />
          <Stop offset="100%" stopColor={accentColor} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={RADAR_RADIUS} cy={RADAR_RADIUS} r={RADAR_RADIUS} fill="url(#bg)" />
      {[0.3, 0.55, 0.8, 1].map((p, idx) => (
        <Circle
          key={idx}
          cx={RADAR_RADIUS}
          cy={RADAR_RADIUS}
          r={RADAR_RADIUS * p - 1}
          stroke={idx === 3 ? ringColor : COLORS.ringFaint}
          strokeWidth={idx === 3 ? 1.2 : 1}
          fill="none"
        />
      ))}
      {/* crosshair */}
      <Line
        x1={RADAR_RADIUS}
        y1={4}
        x2={RADAR_RADIUS}
        y2={RADAR_SIZE - 4}
        stroke={COLORS.ringFaint}
        strokeWidth={0.8}
      />
      <Line
        x1={4}
        y1={RADAR_RADIUS}
        x2={RADAR_SIZE - 4}
        y2={RADAR_RADIUS}
        stroke={COLORS.ringFaint}
        strokeWidth={0.8}
      />
    </Svg>
  );
}

function CenterDot({ accentColor }: { accentColor: string }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.18, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: RADAR_RADIUS - 8,
          top: RADAR_RADIUS - 8,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: "#fff",
          shadowColor: accentColor,
          shadowOpacity: 0.9,
          shadowRadius: 12,
          elevation: 6,
        },
        style,
      ]}
    />
  );
}

function RadarUserAvatar({
  user,
  index,
  maxRadius,
  onPress,
  isSelected,
}: {
  user: NearbyUser;
  index: number;
  maxRadius: number;
  onPress: () => void;
  isSelected: boolean;
}) {
  const pos = useMemo(() => avatarPosition(user.angle, user.distance, maxRadius), [user, maxRadius]);
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withDelay(
      index * 80,
      withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.ease) }), -1, false),
    );
  }, []);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.2, 1], [0, 0.55, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.9, 1.7]) }],
  }));
  const genderColor = user.gender === "female" ? "#FF6B9D" : user.gender === "male" ? "#4A90E2" : COLORS.accent;
  return (
    <Animated.View
      entering={ZoomIn.delay(index * 60).springify().damping(14)}
      style={{ position: "absolute", left: pos.x, top: pos.y, width: AVATAR_SIZE, height: AVATAR_SIZE }}
    >
      {/* pulse glow */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            backgroundColor: genderColor,
          },
          ringStyle,
        ]}
      />
      <Pressable onPress={onPress} hitSlop={6}>
        <View
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            borderWidth: isSelected ? 2.5 : 2,
            borderColor: isSelected ? "#fff" : genderColor,
            overflow: "hidden",
            backgroundColor: "#1a1a2a",
            shadowColor: genderColor,
            shadowOpacity: 0.8,
            shadowRadius: 10,
            elevation: 4,
          }}
        >
          {user.profilePhoto ? (
            <Image source={{ uri: user.profilePhoto }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="user" size={20} color="#fff" />
            </View>
          )}
        </View>
        {user.online ? (
          <View
            style={{
              position: "absolute",
              right: -1,
              bottom: -1,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: "#22c55e",
              borderWidth: 2,
              borderColor: COLORS.bg,
            }}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function PreviewCard({
  user,
  onClose,
  onView,
  accentColor,
}: {
  user: NearbyUser;
  onClose: () => void;
  onView: () => void;
  accentColor: string;
}) {
  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18)}
      exiting={SlideOutDown.duration(180)}
      style={styles.previewCard}
    >
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, overflow: "hidden", backgroundColor: "#1a1a2a", borderWidth: 2, borderColor: accentColor }}>
          {user.profilePhoto ? (
            <Image source={{ uri: user.profilePhoto }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="user" size={26} color="#fff" />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 14, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.previewName} numberOfLines={1}>
              {user.name}
              {user.age != null ? <Text style={{ color: COLORS.textDim, fontWeight: "500" }}>{`, ${user.age}`}</Text> : null}
            </Text>
            {user.verified ? <Feather name="check-circle" size={14} color="#3b82f6" /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 6 }}>
            <Feather name="map-pin" size={12} color={accentColor} />
            <Text style={styles.previewMeta}>{formatDistance(user.distance)}</Text>
            {user.online ? (
              <>
                <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.textMuted, marginHorizontal: 2 }} />
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" }} />
                <Text style={[styles.previewMeta, { color: "#22c55e" }]}>Online</Text>
              </>
            ) : null}
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <Feather name="x" size={18} color="#fff" />
        </Pressable>
      </View>

      <Pressable onPress={onView} style={({ pressed }) => [styles.viewBtn, pressed && { opacity: 0.85 }]}>
        <LinearGradient
          colors={[accentColor, accentColor + "CC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.viewBtnText}>View Profile</Text>
        <Feather name="arrow-right" size={16} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

function FiltersSheet({
  visible,
  onClose,
  filters,
  onChange,
  onApply,
  accentColor,
  isPremium,
  onUpgrade,
}: {
  visible: boolean;
  onClose: () => void;
  filters: { radius: number; ageMin: number; ageMax: number; gender: "any" | "male" | "female" };
  onChange: (next: any) => void;
  onApply: () => void;
  accentColor: string;
  isPremium: boolean;
  onUpgrade: () => void;
}) {
  const FREE_MAX_RADIUS = 50;
  const maxRadius = isPremium ? 100 : FREE_MAX_RADIUS;

  const handleRadiusChange = (v: number) => {
    const rounded = Math.round(v);
    if (!isPremium && rounded > FREE_MAX_RADIUS) {
      onUpgrade();
      return;
    }
    onChange({ ...filters, radius: rounded });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Radar Filters</Text>

          <View style={{ marginTop: 16 }}>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Search radius</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.sliderValue}>{filters.radius} km</Text>
                {!isPremium && (
                  <Text style={{ color: accentColor, fontSize: 10, fontWeight: "700" }}>FREE MAX 50km</Text>
                )}
              </View>
            </View>
            <Slider
              style={{ width: "100%", height: 36 }}
              minimumValue={1}
              maximumValue={maxRadius}
              step={1}
              value={Math.min(filters.radius, maxRadius)}
              minimumTrackTintColor={accentColor}
              maximumTrackTintColor="rgba(255,255,255,0.18)"
              thumbTintColor={accentColor}
              onValueChange={handleRadiusChange}
            />
            {!isPremium && (
              <Pressable onPress={onUpgrade} style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="star" size={13} color={accentColor} />
                <Text style={{ color: accentColor, fontSize: 12, fontWeight: "600" }}>Upgrade to Premium for up to 100km</Text>
              </Pressable>
            )}
          </View>

          <View style={{ marginTop: 18 }}>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Age range</Text>
              <Text style={styles.sliderValue}>{filters.ageMin} – {filters.ageMax}</Text>
            </View>
            <Slider
              style={{ width: "100%", height: 36 }}
              minimumValue={18}
              maximumValue={80}
              step={1}
              value={filters.ageMin}
              minimumTrackTintColor={accentColor}
              maximumTrackTintColor="rgba(255,255,255,0.18)"
              thumbTintColor={accentColor}
              onValueChange={(v) => onChange({ ...filters, ageMin: Math.min(Math.round(v), filters.ageMax - 1) })}
            />
            <Slider
              style={{ width: "100%", height: 36 }}
              minimumValue={18}
              maximumValue={80}
              step={1}
              value={filters.ageMax}
              minimumTrackTintColor={accentColor}
              maximumTrackTintColor="rgba(255,255,255,0.18)"
              thumbTintColor={accentColor}
              onValueChange={(v) => onChange({ ...filters, ageMax: Math.max(Math.round(v), filters.ageMin + 1) })}
            />
          </View>

          <View style={{ marginTop: 18 }}>
            <Text style={styles.sliderLabel}>Show me</Text>
            <View style={{ flexDirection: "row", marginTop: 10, gap: 8 }}>
              {(["any", "female", "male"] as const).map((g) => (
                <Pressable
                  key={g}
                  onPress={() => onChange({ ...filters, gender: g })}
                  style={[styles.chip, filters.gender === g && { backgroundColor: accentColor, borderColor: accentColor }]}
                >
                  <Text style={[styles.chipText, filters.gender === g && { color: "#fff" }]}>
                    {g === "any" ? "Everyone" : g === "female" ? "Women" : "Men"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => {
              onApply();
              onClose();
            }}
            style={[styles.viewBtn, { marginTop: 24 }]}
          >
            <LinearGradient
              colors={[accentColor, accentColor + "CC"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.viewBtnText}>Apply</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────
export default function LoveRadarScreen({ navigation }: Props) {
  const { token, user } = useAuth();
  const { theme } = useTheme();
  const accentColor = theme.primary || COLORS.accent;
  const isPremium = !!(user as any)?.premium?.isActive;
  const FREE_MAX_RADIUS = 50;

  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [selected, setSelected] = useState<NearbyUser | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    radius: isPremium ? 25 : Math.min(25, FREE_MAX_RADIUS),
    ageMin: 18,
    ageMax: 60,
    gender: "any" as "any" | "female" | "male",
  });
  const fetchSeq = useRef(0);

  // Acquire location once on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setPermissionDenied(true);
          setLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch (err) {
        logger.error("Radar location error:", err);
        setPermissionDenied(true);
        setLoading(false);
      }
    })();
  }, []);

  const fetchNearby = useCallback(async () => {
    if (!coords || !token) return;
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat: String(coords.lat),
        lng: String(coords.lng),
        radius: String(filters.radius),
        ageMin: String(filters.ageMin),
        ageMax: String(filters.ageMax),
        gender: filters.gender,
      });
      const res = await fetch(`${getApiBaseUrl()}/api/radar/nearby-users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (seq !== fetchSeq.current) return;
      if (data.success) {
        setUsers((data.users || []) as NearbyUser[]);
      }
    } catch (err) {
      logger.error("Radar fetch error:", err);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [coords, token, filters]);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

  const handleAvatarPress = (user: NearbyUser) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(user);
  };

  const goToProfile = (user: NearbyUser) => {
    setSelected(null);
    navigation.navigate("ProfileDetail" as any, { userId: user.id });
  };

  const handleUpgrade = () => {
    setFiltersOpen(false);
    navigation.navigate("Premium" as any);
  };

  const ringLabels = useMemo(() => {
    const r = filters.radius;
    return [
      { label: r < 4 ? `${(r * 0.25).toFixed(1)}km` : `${Math.round(r * 0.25)}km`, ratio: 0.3 },
      { label: r < 4 ? `${(r * 0.55).toFixed(1)}km` : `${Math.round(r * 0.55)}km`, ratio: 0.55 },
      { label: `${r}km`, ratio: 1 },
    ];
  }, [filters.radius]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <LinearGradient colors={COLORS.bgGradient} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
          <View style={{ alignItems: "center" }}>
            <Text style={styles.title}>Love Radar</Text>
            <Text style={styles.subtitle}>
              {loading ? "Scanning…" : users.length === 0 ? "No one nearby yet" : `${users.length} nearby`}
            </Text>
          </View>
          <Pressable onPress={() => setFiltersOpen(true)} hitSlop={10} style={styles.iconBtn}>
            <Feather name="sliders" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Radar */}
        <View style={styles.radarWrap}>
          <View style={styles.radar}>
            <RadarRings accentColor={accentColor} />
            <PulseRing delay={0} accentColor={accentColor} />
            <PulseRing delay={900} accentColor={accentColor} />
            <PulseRing delay={1800} accentColor={accentColor} />
            <SweepLine accentColor={accentColor} />
            <CenterDot accentColor={accentColor} />

            {/* avatars */}
            {users.map((u, i) => (
              <RadarUserAvatar
                key={u.id}
                user={u}
                index={i}
                maxRadius={filters.radius}
                isSelected={selected?.id === u.id}
                onPress={() => handleAvatarPress(u)}
              />
            ))}

            {/* ring distance labels (top side) */}
            {ringLabels.map((rl, idx) => (
              <View
                key={idx}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: RADAR_RADIUS + 6,
                  top: RADAR_RADIUS - RADAR_RADIUS * rl.ratio - 8,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 6,
                  backgroundColor: "rgba(0,0,0,0.45)",
                }}
              >
                <Text style={styles.ringLabel}>{rl.label}</Text>
              </View>
            ))}
          </View>

          {/* You label */}
          <View style={{ marginTop: 20, alignItems: "center" }}>
            <Text style={styles.youLabel}>You</Text>
          </View>
        </View>

        {/* Bottom action / refresh */}
        <View style={styles.bottomBar}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              fetchNearby();
            }}
            disabled={loading || !coords}
            style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.8 }, (loading || !coords) && { opacity: 0.5 }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="refresh-cw" size={16} color="#fff" />
            )}
            <Text style={styles.refreshText}>{loading ? "Scanning" : "Rescan"}</Text>
          </Pressable>
          <Text style={styles.bottomHint}>Tap any avatar to see who they are</Text>
        </View>

        {/* Permission denied overlay */}
        {permissionDenied ? (
          <View style={styles.permission}>
            <Animated.View entering={FadeIn.duration(220)} style={styles.permissionCard}>
              <Feather name="map-pin" size={28} color={accentColor} />
              <Text style={styles.permTitle}>Location needed</Text>
              <Text style={styles.permBody}>
                Love Radar needs your location to show people nearby. Enable location access in your settings to use the radar.
              </Text>
              <Pressable onPress={() => navigation.goBack()} style={[styles.permBtn, { backgroundColor: accentColor }]}>
                <Text style={styles.permBtnText}>Go Back</Text>
              </Pressable>
            </Animated.View>
          </View>
        ) : null}

        {/* Preview card */}
        {selected ? (
          <PreviewCard
            user={selected}
            onClose={() => setSelected(null)}
            onView={() => goToProfile(selected)}
            accentColor={accentColor}
          />
        ) : null}
      </SafeAreaView>

      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onApply={fetchNearby}
        accentColor={accentColor}
        isPremium={isPremium}
        onUpgrade={handleUpgrade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { color: COLORS.text, fontSize: 17, fontWeight: "700", letterSpacing: 0.4 },
  subtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },

  radarWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  radar: {
    width: RADAR_SIZE,
    height: RADAR_SIZE,
    borderRadius: RADAR_RADIUS,
    overflow: "visible",
  },
  ringLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: "500" },
  youLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },

  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    alignItems: "center",
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  refreshText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  bottomHint: { color: COLORS.textMuted, fontSize: 11, marginTop: 10 },

  // preview card
  previewCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 26,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  previewName: { color: "#fff", fontSize: 17, fontWeight: "700", flexShrink: 1 },
  previewMeta: { color: COLORS.textDim, fontSize: 12, fontWeight: "500" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 14,
    gap: 8,
  },
  viewBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // permission
  permission: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,6,12,0.94)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  permissionCard: {
    backgroundColor: "#13131f",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    maxWidth: 340,
  },
  permTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 12 },
  permBody: { color: COLORS.textDim, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 19 },
  permBtn: {
    marginTop: 20,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
  },
  permBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#13131f",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 30,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 14,
  },
  sheetTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  sliderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sliderLabel: { color: COLORS.textDim, fontSize: 13, fontWeight: "600" },
  sliderValue: { color: "#fff", fontSize: 13, fontWeight: "700" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { color: COLORS.textDim, fontSize: 13, fontWeight: "600" },
});
