import { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  KeyboardAvoidingView,
  ScrollView,
  Dimensions,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useThemedAlert } from "@/components/ThemedAlert";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Login">;

interface LoginScreenProps {
  navigation: LoginScreenNavigationProp;
}

function AnimatedInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoComplete,
  autoCapitalize,
  keyboardAppearance,
  rightElement,
  theme,
}: any) {
  const focusAnim = useRef(new Animated.Value(0)).current;

  const onFocus = () => {
    Animated.spring(focusAnim, { toValue: 1, useNativeDriver: false, friction: 6 }).start();
  };
  const onBlur = () => {
    Animated.spring(focusAnim, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
  };

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.border, theme.primary],
  });

  const shadowOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.18],
  });

  return (
    <Animated.View
      style={[
        styles.inputWrapper,
        {
          backgroundColor: theme.surface,
          borderColor,
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity,
          shadowRadius: 10,
          elevation: 2,
        },
      ]}
    >
      <Feather name={icon} size={18} color={theme.textSecondary} style={styles.inputIcon} />
      <TextInput
        style={[styles.input, { color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        keyboardAppearance={keyboardAppearance}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {rightElement}
    </Animated.View>
  );
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { theme, themeMode } = useTheme();
  const { login } = useAuth();
  const { showAlert, AlertComponent } = useThemedAlert();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const onButtonPressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true, friction: 6 }).start();
  };
  const onButtonPressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert("Missing Fields", "Please fill in all fields", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (error: any) {
      const errorMsg = error.message || "Invalid email or password";
      if (error.requiresVerification) {
        setLoading(false);
        navigation.navigate("OTPVerification", {
          userId: error.userId,
          email: email.trim().toLowerCase(),
        });
        return;
      }
      if (
        error.isBanned ||
        error.status === 403 ||
        errorMsg.toLowerCase().includes("banned") ||
        errorMsg.toLowerCase().includes("suspended")
      ) {
        setLoading(false);
        const banReason = error.banReason || "Violation of community guidelines";
        Alert.alert(
          "Account Suspended",
          `Your account has been suspended.\n\nReason: ${banReason}\n\nYou can submit an appeal to request reinstatement.`,
          [
            {
              text: "Appeal",
              onPress: () => {
                navigation.navigate("AppealBanned", {
                  appealToken: error.appealToken,
                  email: error.email || email,
                  banReason: error.banReason,
                  bannedAt: error.bannedAt,
                  appeal: error.appeal,
                });
              },
            },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      } else {
        const isNetworkError =
          errorMsg.toLowerCase().includes("network") ||
          errorMsg.toLowerCase().includes("fetch") ||
          errorMsg.toLowerCase().includes("connection") ||
          error.name === "TypeError";
        const displayMsg = isNetworkError
          ? "Couldn't connect to the server. Please check your internet connection and try again."
          : errorMsg;
        showAlert("Sign In Failed", displayMsg, [{ text: "Try Again", style: "default" }], "alert-circle");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient Header */}
        <LinearGradient
          colors={["#10B981", "#059669", "#0D9488"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientHeader}
        >
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={12}
          >
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>

          <Animated.View
            style={[styles.headerContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            <View style={styles.logoContainer}>
              <View style={styles.logoCard}>
                <Image
                  source={require("@/assets/logo-new.png")}
                  style={styles.logo}
                  contentFit="contain"
                />
              </View>
            </View>
            <ThemedText style={styles.greetingEmoji}>👋</ThemedText>
            <ThemedText style={styles.headerTitle}>Welcome back</ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              Sign in to continue your journey
            </ThemedText>
          </Animated.View>
        </LinearGradient>

        {/* Form Card */}
        <Animated.View
          style={[
            styles.formCard,
            { backgroundColor: theme.background, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Email */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              Email Address
            </ThemedText>
            <AnimatedInput
              icon="mail"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              autoCapitalize="none"
              keyboardAppearance={themeMode === "dark" ? "dark" : "light"}
              theme={theme}
            />
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              Password
            </ThemedText>
            <AnimatedInput
              icon="lock"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              autoCapitalize="none"
              keyboardAppearance={themeMode === "dark" ? "dark" : "light"}
              theme={theme}
              rightElement={
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} hitSlop={8}>
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
              }
            />
          </View>

          {/* Links row */}
          <View style={styles.linksRow}>
            <Pressable onPress={() => Linking.openURL("https://emorii.com/terms")}>
              <ThemedText style={[styles.linkText, { color: theme.textSecondary }]}>
                Terms of Service
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => navigation.navigate("ForgotPassword")}>
              <ThemedText style={[styles.linkText, { color: theme.primary, fontWeight: "600" }]}>
                Forgot password?
              </ThemedText>
            </Pressable>
          </View>

          {/* CTA Button */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <Pressable
              onPressIn={onButtonPressIn}
              onPressOut={onButtonPressOut}
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [styles.ctaButton, pressed && { opacity: 0.95 }]}
            >
              <LinearGradient
                colors={["#10B981", "#059669"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <ThemedText style={styles.ctaText}>Sign In</ThemedText>
                    <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <ThemedText style={[styles.dividerText, { color: theme.textSecondary }]}>or</ThemedText>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
          </View>

          {/* Switch to signup */}
          <Pressable
            style={[styles.signupOutlineBtn, { borderColor: theme.border }]}
            onPress={() => navigation.navigate("SignUp")}
          >
            <ThemedText style={[styles.signupOutlineText, { color: theme.text }]}>
              Don't have an account?{" "}
              <ThemedText style={{ color: theme.primary, fontWeight: "700" }}>Sign Up</ThemedText>
            </ThemedText>
          </Pressable>
        </Animated.View>
      </ScrollView>
      <AlertComponent />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gradientHeader: {
    paddingTop: Platform.OS === "ios" ? 60 : 44,
    paddingBottom: 44,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 44,
    left: Spacing.xl,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: {
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  logoContainer: {
    marginBottom: Spacing.md,
  },
  logoCard: {
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  logo: {
    width: 88,
    height: 88,
  },
  greetingEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
  },
  formCard: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  fieldGroup: {
    gap: Spacing.xs + 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginLeft: 2,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.lg,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    height: "100%",
  },
  eyeBtn: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  linksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: -Spacing.xs,
  },
  linkText: {
    fontSize: 13,
    fontWeight: "500",
  },
  ctaButton: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    marginTop: Spacing.sm,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaGradient: {
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginVertical: Spacing.xs,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: "500",
  },
  signupOutlineBtn: {
    height: 54,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  signupOutlineText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
