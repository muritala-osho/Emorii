import { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
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
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useThemedAlert } from "@/components/ThemedAlert";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

type SignUpScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "SignUp"
>;

interface SignUpScreenProps {
  navigation: SignUpScreenNavigationProp;
}

const SIGNUP_STORAGE_KEY = "emorii_signup_draft";

function AnimatedInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoComplete,
  autoCapitalize,
  rightElement,
  theme,
}: any) {
  const focusAnim = useRef(new Animated.Value(0)).current;

  const onFocus = () => {
    Animated.spring(focusAnim, {
      toValue: 1,
      useNativeDriver: false,
      friction: 6,
    }).start();
  };

  const onBlur = () => {
    Animated.spring(focusAnim, {
      toValue: 0,
      useNativeDriver: false,
      friction: 6,
    }).start();
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
      <Feather
        name={icon}
        size={18}
        color={theme.textSecondary}
        style={styles.inputIcon}
      />
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
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {rightElement}
    </Animated.View>
  );
}

export default function SignUpScreen({ navigation }: SignUpScreenProps) {
  const { theme } = useTheme();
  const { signup } = useAuth();
  const { showAlert, AlertComponent } = useThemedAlert();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draft = await AsyncStorage.getItem(SIGNUP_STORAGE_KEY);
        if (draft) {
          const { email: savedEmail, agreeToTerms: savedAgree } = JSON.parse(draft);
          setEmail(savedEmail || "");
          setAgreeToTerms(savedAgree || false);
        }
      } catch {}
    };
    loadDraft();
  }, []);

  useEffect(() => {
    const saveDraft = async () => {
      try {
        await AsyncStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify({ email, agreeToTerms }));
      } catch {}
    };
    saveDraft();
  }, [email, agreeToTerms]);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const onButtonPressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true, friction: 6 }).start();
  };

  const onButtonPressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
  };

  const handleSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      showAlert("Missing Fields", "Please fill in all fields", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }
    if (!validateEmail(email)) {
      showAlert("Invalid Email", "Please enter a valid email address", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }
    if (password !== confirmPassword) {
      showAlert("Password Mismatch", "Passwords do not match", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }
    if (password.length < 8) {
      showAlert("Weak Password", "Password must be at least 8 characters", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }
    if (!agreeToTerms) {
      showAlert("Terms Required", "Please agree to the Terms and Privacy Policy", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const result = await signup(email.trim().toLowerCase(), password);
      await AsyncStorage.removeItem(SIGNUP_STORAGE_KEY);
      navigation.navigate("OTPVerification", { userId: result.userId, email: result.email });
    } catch (error: any) {
      showAlert("Sign Up Failed", error.message || "Failed to create account", [{ text: "OK", style: "default" }], "alert-circle");
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
            <ThemedText style={styles.headerTitle}>Create Account</ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              Join Emorii and start connecting
            </ThemedText>
          </Animated.View>

          {/* Progress step dots */}
          <View style={styles.stepDots}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
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
              placeholder="At least 8 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              autoCapitalize="none"
              theme={theme}
              rightElement={
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  hitSlop={8}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
              }
            />
          </View>

          {/* Confirm Password */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              Confirm Password
            </ThemedText>
            <AnimatedInput
              icon="lock"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoComplete="new-password"
              autoCapitalize="none"
              theme={theme}
              rightElement={
                <Pressable
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeBtn}
                  hitSlop={8}
                >
                  <Feather
                    name={showConfirmPassword ? "eye-off" : "eye"}
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
              }
            />
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <ThemedText style={styles.errorHint}>Passwords don't match</ThemedText>
            )}
            {confirmPassword.length > 0 && password === confirmPassword && password.length > 0 && (
              <ThemedText style={styles.successHint}>
                <Feather name="check" size={12} /> Passwords match
              </ThemedText>
            )}
          </View>

          {/* Terms */}
          <Pressable
            style={styles.termsRow}
            onPress={() => {
              Haptics.selectionAsync();
              setAgreeToTerms(!agreeToTerms);
            }}
          >
            <View
              style={[
                styles.checkbox,
                agreeToTerms
                  ? { backgroundColor: theme.primary, borderColor: theme.primary }
                  : { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              {agreeToTerms && <Feather name="check" size={13} color="#fff" />}
            </View>
            <ThemedText style={[styles.termsText, { color: theme.textSecondary }]}>
              I agree to the{" "}
              <ThemedText
                style={{ color: theme.primary, fontWeight: "600" }}
                onPress={() => Linking.openURL("https://emorii.com/terms")}
              >
                Terms of Service
              </ThemedText>{" "}
              and{" "}
              <ThemedText
                style={{ color: theme.primary, fontWeight: "600" }}
                onPress={() => Linking.openURL("https://emorii.com/privacy")}
              >
                Privacy Policy
              </ThemedText>
            </ThemedText>
          </Pressable>

          {/* CTA Button */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <Pressable
              onPressIn={onButtonPressIn}
              onPressOut={onButtonPressOut}
              onPress={handleSignUp}
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
                    <ThemedText style={styles.ctaText}>Create Account</ThemedText>
                    <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Switch to login */}
          <Pressable
            style={styles.switchRow}
            onPress={() => navigation.navigate("Login")}
          >
            <ThemedText style={[styles.switchText, { color: theme.textSecondary }]}>
              Already have an account?{" "}
              <ThemedText style={{ color: theme.primary, fontWeight: "700" }}>Sign In</ThemedText>
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
    paddingBottom: 40,
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
    marginBottom: Spacing.lg,
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
  stepDots: {
    flexDirection: "row",
    gap: 6,
    marginTop: Spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: {
    width: 20,
    backgroundColor: "#fff",
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
  errorHint: {
    fontSize: 12,
    color: "#FF6B6B",
    marginLeft: 4,
    fontWeight: "500",
  },
  successHint: {
    fontSize: 12,
    color: "#10B981",
    marginLeft: 4,
    fontWeight: "500",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  termsText: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
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
  switchRow: {
    alignItems: "center",
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  switchText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
