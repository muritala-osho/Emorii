import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import {
  useTheme,
  ThemeMode,
  FontSizeOption,
  ChatBubbleStyle,
} from "@/hooks/useTheme";
import { Feather } from "@expo/vector-icons";
import { Spacing, BorderRadius } from "@/constants/theme";
import * as Haptics from "expo-haptics";

const ACCENT_COLOR = "10B981";

const FONT_SIZES: { label: string; value: FontSizeOption; scale: number }[] = [
  { label: "Small", value: "small", scale: 0.85 },
  { label: "Default", value: "default", scale: 1 },
  { label: "Large", value: "large", scale: 1.15 },
];

const CHAT_BUBBLE_STYLES: { label: string; value: ChatBubbleStyle }[] = [
  { label: "Rounded", value: "rounded" },
  { label: "Sharp", value: "sharp" },
  { label: "Minimal", value: "minimal" },
];

export default function CustomizeInterfaceScreen({ navigation }: any) {
  const {
    theme,
    themeMode,
    fontSize,
    chatBubbleStyle,
    compactMode,
    animationsEnabled,
    hapticFeedback,
    setThemeMode,
    setFontSize,
    setChatBubbleStyle,
    setCompactMode,
    setAnimationsEnabled,
    setHapticFeedback,
  } = useTheme();

  const doHaptic = () => {
    if (hapticFeedback && Platform.OS !== "web") {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {}
    }
  };

  const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "Auto", icon: "monitor" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Feather name="arrow-left" size={24} color={theme.text} />
          </TouchableOpacity>
          <ThemedText type="h3">Customize</ThemedText>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* THEME SECTION */}
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <ThemedText
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              APPEARANCE
            </ThemedText>
            <ThemedText style={styles.label}>Theme</ThemedText>
            <View style={styles.themeRow}>
              {themeOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor: theme.cardBackground,
                      borderColor: theme.border,
                    },
                    themeMode === opt.value && {
                      borderColor: ACCENT_COLOR,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => {
                    setThemeMode(opt.value);
                    doHaptic();
                  }}
                >
                  <Feather
                    name={opt.icon as any}
                    size={20}
                    color={
                      themeMode === opt.value
                        ? ACCENT_COLOR
                        : theme.textSecondary
                    }
                  />
                  <ThemedText
                    style={[
                      styles.themeLabel,
                      {
                        color:
                          themeMode === opt.value
                            ? ACCENT_COLOR
                            : theme.textSecondary,
                      },
                    ]}
                  >
                    {opt.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* TEXT SECTION */}
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <ThemedText
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              TEXT
            </ThemedText>
            <ThemedText style={styles.label}>Font Size</ThemedText>
            <View style={styles.fontRow}>
              {FONT_SIZES.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.fontOption,
                    {
                      backgroundColor: theme.cardBackground,
                      borderColor: theme.border,
                    },
                    fontSize === opt.value && {
                      borderColor: ACCENT_COLOR,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => {
                    setFontSize(opt.value);
                    doHaptic();
                  }}
                >
                  <ThemedText
                    style={[styles.fontSample, { fontSize: 14 * opt.scale }]}
                    skipFontScale
                  >
                    Aa
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.fontLabel,
                      {
                        color:
                          fontSize === opt.value
                            ? ACCENT_COLOR
                            : theme.textSecondary,
                      },
                    ]}
                    skipFontScale
                  >
                    {opt.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* PREFERENCES SECTION */}
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <ThemedText
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
            >
              PREFERENCES
            </ThemedText>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Feather name="layout" size={20} color={theme.text} />
                <View style={styles.toggleTextWrap}>
                  <ThemedText style={styles.toggleLabel}>
                    Compact Mode
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary }}
                  >
                    Less spacing
                  </ThemedText>
                </View>
              </View>
              <Switch
                value={compactMode}
                onValueChange={(v) => {
                  setCompactMode(v);
                  doHaptic();
                }}
                trackColor={{ false: theme.border, true: ACCENT_COLOR + "80" }}
                thumbColor={compactMode ? ACCENT_COLOR : "#f4f3f4"}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Feather name="smartphone" size={20} color={theme.text} />
                <View style={styles.toggleTextWrap}>
                  <ThemedText style={styles.toggleLabel}>
                    Haptic Feedback
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary }}
                  >
                    Vibrate on tap
                  </ThemedText>
                </View>
              </View>
              <Switch
                value={hapticFeedback}
                onValueChange={(v) => {
                  setHapticFeedback(v);
                }}
                trackColor={{ false: theme.border, true: ACCENT_COLOR + "80" }}
                thumbColor={hapticFeedback ? ACCENT_COLOR : "#f4f3f4"}
              />
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { paddingHorizontal: Spacing.lg },
  section: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  label: { fontSize: 15, fontWeight: "600", marginBottom: Spacing.sm },
  themeRow: { flexDirection: "row", gap: 10 },
  themeOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 6,
  },
  themeLabel: { fontSize: 12, fontWeight: "600" },
  fontRow: { flexDirection: "row", gap: 10 },
  fontOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 6,
  },
  fontSample: { fontWeight: "700" },
  fontLabel: { fontSize: 11, fontWeight: "600" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  toggleInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  toggleTextWrap: { marginLeft: 12, flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: "600" },
  divider: { height: 1, marginVertical: 4 },
});
