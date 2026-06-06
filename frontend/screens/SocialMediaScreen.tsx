import {
  View,
  StyleSheet,
  Pressable,
  Linking,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Feather, Ionicons } from "@expo/vector-icons";

const SOCIAL_LINKS = [
  {
    name: "Instagram",
    handle: "@emorii",
    url: "https://instagram.com/emorii",
    icon: "logo-instagram",
    color: "#E4405F",
    bg: "#E4405F15",
  },
  {
    name: "Twitter / X",
    handle: "@emorii",
    url: "https://x.com/emorii",
    icon: "logo-twitter",
    color: "#1DA1F2",
    bg: "#1DA1F215",
  },
  {
    name: "TikTok",
    handle: "@emorii",
    url: "https://tiktok.com/@emorii",
    icon: "logo-tiktok",
    color: "#000000",
    bg: "#00000010",
  },
];

export default function SocialMediaScreen({ navigation }: any) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16), borderBottomColor: theme.border }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="chevron-left" size={28} color={theme.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: theme.text }]}>Follow Us</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        <View style={styles.heroSection}>
          <View style={[styles.heroIcon, { backgroundColor: theme.primary + '15' }]}>
            <Feather name="share-2" size={32} color={theme.primary} />
          </View>
          <ThemedText style={[styles.heroTitle, { color: theme.text }]}>Stay Connected</ThemedText>
          <ThemedText style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
            Follow us on social media for updates, tips, success stories, and community events.
          </ThemedText>
        </View>

        <View style={[styles.linksCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {SOCIAL_LINKS.map((social, index) => (
            <Pressable
              key={social.name}
              style={[
                styles.socialItem,
                index < SOCIAL_LINKS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
              ]}
              onPress={() => Linking.openURL(social.url).catch(() => {})}
            >
              <View style={[styles.socialIconWrap, { backgroundColor: isDark ? social.color + '20' : social.bg }]}>
                <Ionicons name={social.icon as any} size={22} color={social.color} />
              </View>
              <View style={styles.socialInfo}>
                <ThemedText style={[styles.socialName, { color: theme.text }]}>{social.name}</ThemedText>
                <ThemedText style={[styles.socialHandle, { color: theme.textSecondary }]}>{social.handle}</ThemedText>
              </View>
              <Feather name="external-link" size={18} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>

        <View style={styles.footerSection}>
          <ThemedText style={[styles.footerText, { color: theme.textSecondary }]}>
            Tag us with #Emorii to get featured!
          </ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: 20,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 28,
    paddingTop: 12,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  linksCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  socialItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  socialIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  socialInfo: {
    flex: 1,
  },
  socialName: {
    fontSize: 15,
    fontWeight: "700",
  },
  socialHandle: {
    fontSize: 13,
    marginTop: 1,
  },
  footerSection: {
    alignItems: "center",
    marginTop: 28,
  },
  footerText: {
    fontSize: 13,
    fontStyle: "italic",
  },
});
