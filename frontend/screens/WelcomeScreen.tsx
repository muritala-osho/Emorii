import { useRef, useEffect, useState } from "react";
import { View, StyleSheet, Image, Pressable, Animated, Dimensions, Linking, ScrollView, TextInput, Alert, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { getApiBaseUrl } from "@/constants/config";

type WelcomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Welcome">;

interface WelcomeScreenProps {
  navigation: WelcomeScreenNavigationProp;
}

const { width, height } = Dimensions.get("window");

const SLIDESHOW_IMAGES = [
  require("@/assets/slideshow/couple1.png"),
  require("@/assets/slideshow/couple2.png"),
  require("@/assets/slideshow/couple3.png"),
  require("@/assets/slideshow/couple4.png"),
];

export default function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);
  const crossfade = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);

  const [showAbout, setShowAbout] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [challengeQuestion, setChallengeQuestion] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    const interval = setInterval(() => {
      if (isAnimating.current) return;
      isAnimating.current = true;

      setNextIndex((prev) => (prev + 1) % SLIDESHOW_IMAGES.length);

      crossfade.setValue(0);
      Animated.timing(crossfade, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex((prev) => (prev + 1) % SLIDESHOW_IMAGES.length);
        crossfade.setValue(0);
        isAnimating.current = false;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showAbout) {
      fetchSupportChallenge();
    }
  }, [showAbout]);

  const fetchSupportChallenge = async () => {
    setChallengeLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/support/challenge`);
      const data = await response.json();
      if (data.success) {
        setChallengeQuestion(data.question);
        setChallengeToken(data.challengeToken);
        setChallengeAnswer("");
      }
    } catch {
      setChallengeQuestion("");
      setChallengeToken("");
    } finally {
      setChallengeLoading(false);
    }
  };

  const handleContactSubmit = async () => {
    if (!name || !email || !message) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (!challengeToken || !challengeAnswer.trim()) {
      Alert.alert("Security Check", "Please answer the security challenge before sending your message.");
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/support/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name,
          email,
          message,
          challengeToken,
          challengeAnswer: challengeAnswer.trim(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert("Success", "Message sent!");
        setName(""); setEmail(""); setMessage(""); setChallengeAnswer("");
        fetchSupportChallenge();
      } else {
        Alert.alert("Error", data.message || "Failed to send message");
        if (data.requiresChallenge) fetchSupportChallenge();
      }
    } catch {
      Alert.alert("Error", "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const openSocial = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open link"));
  };

  return (
    <View style={styles.container}>
      {/* Crossfade background slideshow */}
      <View style={StyleSheet.absoluteFill}>
        {/* Bottom layer — current image */}
        <Image
          source={SLIDESHOW_IMAGES[currentIndex]}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
        {/* Top layer — next image fades in */}
        <Animated.Image
          source={SLIDESHOW_IMAGES[nextIndex]}
          style={[styles.backgroundImage, StyleSheet.absoluteFill, { opacity: crossfade }]}
          resizeMode="cover"
        />
        <View style={styles.overlay} />
      </View>

      <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>
        <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Image source={require("@/assets/emorii-logo.png")} style={styles.logo} resizeMode="contain" />
          <ThemedText style={styles.taglineText}>Find meaningful connections in the African diaspora</ThemedText>
        </Animated.View>

        <View style={styles.bottomSection}>
          <Animated.View style={[styles.buttonContainer, { opacity: fadeAnim }]}>
            <Pressable style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={() => navigation.navigate("SignUp")}>
              <ThemedText style={styles.primaryButtonText}>Get Started</ThemedText>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate("Login")}>
              <ThemedText style={styles.secondaryButtonText}>I already have an account</ThemedText>
            </Pressable>

            <Pressable style={styles.aboutButton} onPress={() => setShowAbout(true)}>
              <ThemedText style={styles.aboutButtonText}>About Us</ThemedText>
              <Ionicons name="chevron-down" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </Pressable>
          </Animated.View>

          <View style={styles.termsContainer}>
            <ThemedText style={styles.termsText}>By continuing, you agree to our </ThemedText>
            <View style={{ flexDirection: "row" }}>
              <Pressable onPress={() => Linking.openURL("https://emorii.com/terms")}>
                <ThemedText style={[styles.termsLink, { color: theme.primary }]}>Terms of Service</ThemedText>
              </Pressable>
              <ThemedText style={styles.termsText}> and </ThemedText>
              <Pressable onPress={() => Linking.openURL("https://emorii.com/privacy")}>
                <ThemedText style={[styles.termsLink, { color: theme.primary }]}>Privacy Policy</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* About modal */}
      {showAbout && (
        <Modal visible={showAbout} animationType="slide" transparent={false}>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <View style={{ padding: 20, paddingTop: insets.top + 20 }}>
                <Pressable onPress={() => setShowAbout(false)} style={{ alignSelf: "flex-end", padding: 10 }}>
                  <Ionicons name="close" size={30} color={theme.text} />
                </Pressable>

                <ThemedText style={styles.sectionTitle}>How Emorii Works</ThemedText>
                <ThemedText style={[styles.aboutText, { color: theme.textSecondary, marginBottom: 20 }]}>
                  1. Create your profile with authentic photos and interests.{"\n"}
                  2. Use our AI-powered discovery to find meaningful matches.{"\n"}
                  3. Start conversations and build genuine connections.
                </ThemedText>

                <ThemedText style={styles.sectionTitle}>Frequently Asked Questions</ThemedText>
                <View style={styles.faqItem}>
                  <ThemedText style={[styles.faqQuestion, { color: theme.text }]}>Is my data safe?</ThemedText>
                  <ThemedText style={[styles.faqAnswer, { color: theme.textSecondary }]}>Yes, we use industry-standard encryption and prioritize your privacy.</ThemedText>
                </View>
                <View style={styles.faqItem}>
                  <ThemedText style={[styles.faqQuestion, { color: theme.text }]}>How do I report a user?</ThemedText>
                  <ThemedText style={[styles.faqAnswer, { color: theme.textSecondary }]}>You can report any profile directly from their profile page using the report button.</ThemedText>
                </View>

                <Pressable
                  style={[styles.successStoryLink, { backgroundColor: theme.primary + "15" }]}
                  onPress={() => { setShowAbout(false); navigation.push("SuccessStories" as any); }}
                >
                  <Ionicons name="heart" size={20} color={theme.primary} />
                  <ThemedText style={[styles.successStoryLinkText, { color: theme.primary }]}>View Success Stories</ThemedText>
                  <Ionicons name="chevron-forward" size={18} color={theme.primary} />
                </Pressable>

                <ThemedText style={styles.sectionTitle}>Connect with Us</ThemedText>
                <View style={styles.socialRow}>
                  <Pressable onPress={() => openSocial("https://instagram.com/emorii")}><Ionicons name="logo-instagram" size={32} color={theme.primary} /></Pressable>
                  <Pressable onPress={() => openSocial("https://twitter.com/emorii")}><Ionicons name="logo-twitter" size={32} color={theme.primary} /></Pressable>
                  <Pressable onPress={() => openSocial("https://tiktok.com/@emorii")}><Ionicons name="logo-tiktok" size={32} color={theme.primary} /></Pressable>
                </View>

                <ThemedText style={styles.sectionTitle}>Contact Us</ThemedText>
                <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text }]} placeholder="Your Name" placeholderTextColor={theme.textSecondary} value={name} onChangeText={setName} />
                <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text }]} placeholder="Your Email" placeholderTextColor={theme.textSecondary} value={email} onChangeText={setEmail} />
                <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text, height: 100 }]} placeholder="Your Message" placeholderTextColor={theme.textSecondary} multiline value={message} onChangeText={setMessage} />
                <View style={[styles.challengeBox, { borderColor: theme.border, backgroundColor: theme.primary + "10" }]}>
                  <ThemedText style={[styles.challengeLabel, { color: theme.text }]}>
                    {challengeLoading ? "Loading security challenge..." : challengeQuestion || "Security challenge unavailable"}
                  </ThemedText>
                  <View style={styles.challengeRow}>
                    <TextInput
                      style={[styles.challengeInput, { borderColor: theme.border, color: theme.text }]}
                      placeholder="Answer"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="number-pad"
                      value={challengeAnswer}
                      onChangeText={setChallengeAnswer}
                    />
                    <Pressable style={[styles.refreshChallenge, { borderColor: theme.border }]} onPress={fetchSupportChallenge}>
                      <Ionicons name="refresh" size={18} color={theme.primary} />
                    </Pressable>
                  </View>
                </View>
                <Pressable
                  style={[styles.primaryButton, { backgroundColor: submitting ? theme.border : theme.primary, opacity: submitting ? 0.8 : 1 }]}
                  onPress={handleContactSubmit}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <ThemedText style={styles.primaryButtonText}>Send Message</ThemedText>
                  }
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  backgroundImage: { width: "100%", height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.48)" },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: 30, zIndex: 5 },
  logoContainer: { alignItems: "center" },
  logo: { width: 120, height: 140, borderRadius: 20, marginBottom: 15 },
  taglineText: { color: "#FFF", fontSize: 24, fontWeight: "800", textAlign: "center", lineHeight: 32 },
  bottomSection: { width: "100%", alignItems: "center" },
  buttonContainer: { width: "100%", gap: 12, marginBottom: 25 },
  primaryButton: { height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", width: "100%" },
  primaryButtonText: { fontSize: 18, fontWeight: "700", color: "#FFF" },
  secondaryButton: { height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", width: "100%", borderWidth: 2, borderColor: "#FFF" },
  secondaryButtonText: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  aboutButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 10 },
  aboutButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  termsContainer: { alignItems: "center", marginTop: 10 },
  termsText: { color: "rgba(255,255,255,0.8)", fontSize: 13 },
  termsLink: { fontSize: 13, fontWeight: "700" },
  sectionTitle: { fontSize: 22, fontWeight: "800", marginBottom: 15, marginTop: 20 },
  socialRow: { flexDirection: "row", gap: 20, marginBottom: 20 },
  aboutText: { fontSize: 14, lineHeight: 20 },
  faqItem: { marginBottom: 15 },
  faqQuestion: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  faqAnswer: { fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 15 },
  challengeBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 15 },
  challengeLabel: { fontSize: 14, fontWeight: "700", marginBottom: 10 },
  challengeRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  challengeInput: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12 },
  refreshChallenge: { width: 46, height: 46, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  successStoryLink: { flexDirection: "row", alignItems: "center", padding: 15, borderRadius: 12, marginTop: 10, marginBottom: 10, gap: 10 },
  successStoryLinkText: { flex: 1, fontSize: 16, fontWeight: "700" },
});
