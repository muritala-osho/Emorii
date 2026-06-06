import logger from '@/utils/logger';
import { useState, useEffect } from "react";
import { View, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ScreenKeyboardAwareScrollView } from "@/components/ScreenKeyboardAwareScrollView";
import { ThemedText } from "@/components/ThemedText";
import { useThemedAlert } from "@/components/ThemedAlert";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Typography, Shadow } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getApiBaseUrl, API_ENDPOINTS } from "@/constants/config";

type ForgotPasswordScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "ForgotPassword">;

interface ForgotPasswordScreenProps {
  navigation: ForgotPasswordScreenNavigationProp;
}

export default function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const { theme } = useTheme();
  const { showAlert, AlertComponent } = useThemedAlert();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Email, 2: OTP & New Password
  const [showPassword, setShowPassword] = useState(false);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleRequestOtp = async () => {
    if (!email) {
      showAlert("Error", "Please enter your email address", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }

    if (!validateEmail(email)) {
      showAlert("Error", "Please enter a valid email address", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}${API_ENDPOINTS.FORGOT_PASSWORD}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json();

      if (data.success) {
        setStep(2);
        showAlert("Success", "Verification code sent to your email", [{ text: "OK", style: "default" }], "check-circle");
      } else {
        showAlert("Error", data.message || "Failed to send reset code", [{ text: "OK", style: "default" }], "alert-circle");
      }
    } catch (error: any) {
      showAlert("Error", "Network error. Please try again.", [{ text: "OK", style: "default" }], "alert-circle");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!otp || !newPassword || !confirmPassword) {
      showAlert("Error", "Please fill in all fields", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }

    if (newPassword !== confirmPassword) {
      showAlert("Error", "Passwords do not match", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }

    if (newPassword.length < 6) {
      showAlert("Error", "Password must be at least 6 characters", [{ text: "OK", style: "default" }], "alert-circle");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}${API_ENDPOINTS.RESET_PASSWORD}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
          newPassword: newPassword
        }),
      });

      const data = await response.json();

      if (data.success) {
        showAlert("Success", "Password reset successful", [
          { text: "Login", onPress: () => navigation.navigate("Login") }
        ], "check-circle");
      } else {
        const errorMsg = data.message || "Failed to reset password";
        showAlert("Error", errorMsg, [{ text: "OK", style: "default" }], "alert-circle");
        logger.log("Reset failed:", data);
      }
    } catch (error: any) {
      showAlert("Error", "Network error. Please try again.", [{ text: "OK", style: "default" }], "alert-circle");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenKeyboardAwareScrollView>
      <View style={styles.header}>
        <Pressable
          style={[styles.backButton, { backgroundColor: theme.surface }]}
          onPress={() => step === 2 ? setStep(1) : navigation.goBack()}
        >
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.titleSection}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primaryLight }]}>
            <Feather name={step === 1 ? "lock" : "mail"} size={32} color={theme.primary} />
          </View>
          <ThemedText style={[styles.title, { color: theme.text }]}>
            {step === 1 ? "Forgot password?" : "Verify Reset"}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            {step === 1 
              ? "No worries, we'll send you a verification code." 
              : `Enter the code sent to ${email} and your new password.`}
          </ThemedText>
        </View>

        <View style={styles.form}>
          {step === 1 ? (
            <View style={styles.inputContainer}>
              <ThemedText style={[styles.label, { color: theme.text }]}>Email</ThemedText>
              <View style={[styles.inputWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Feather name="mail" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Enter your email"
                  placeholderTextColor={theme.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!loading}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.inputContainer}>
                <ThemedText style={[styles.label, { color: theme.text }]}>Verification Code</ThemedText>
                <View style={[styles.inputWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Feather name="hash" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor={theme.textSecondary}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <ThemedText style={[styles.label, { color: theme.text }]}>New Password</ThemedText>
                <View style={[styles.inputWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Feather name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="At least 6 characters"
                    placeholderTextColor={theme.textSecondary}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={20} color={theme.textSecondary} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <ThemedText style={[styles.label, { color: theme.text }]}>Confirm Password</ThemedText>
                <View style={[styles.inputWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Feather name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Re-enter password"
                    placeholderTextColor={theme.textSecondary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                </View>
              </View>
            </>
          )}

          <Pressable
            style={[
              styles.primaryButton, 
              { backgroundColor: theme.primary },
              loading && styles.buttonDisabled
            ]}
            onPress={step === 1 ? handleRequestOtp : handleResetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.primaryButtonText}>
                {step === 1 ? "Send Code" : "Reset Password"}
              </ThemedText>
            )}
          </Pressable>

          <Pressable
            style={styles.backToLoginButton}
            onPress={() => navigation.navigate("Login")}
          >
            <Feather name="arrow-left" size={16} color={theme.textSecondary} />
            <ThemedText style={[styles.backToLoginText, { color: theme.textSecondary }]}>
              Back to login
            </ThemedText>
          </Pressable>
        </View>
      </View>
      <AlertComponent />
    </ScreenKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  titleSection: {
    alignItems: "center",
    marginBottom: Spacing.xxl * 2,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: Typography.body.fontSize,
    textAlign: "center",
    lineHeight: 22,
  },
  form: {
    gap: Spacing.lg,
  },
  inputContainer: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    marginLeft: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 56,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    height: "100%",
  },
  primaryButton: {
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.md,
    ...Shadow.small,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
  },
  backToLoginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  backToLoginText: {
    fontSize: Typography.body.fontSize,
  },
  successContainer: {
    alignItems: "center",
    marginBottom: Spacing.xxl * 2,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  successTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: Typography.body.fontSize,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  successNote: {
    fontSize: Typography.small.fontSize,
    textAlign: "center",
    lineHeight: 20,
  },
  resendButton: {
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  resendButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
  },
});
