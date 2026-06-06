import { useState, useRef, useEffect } from "react";
import { View, StyleSheet, TextInput, Pressable, Alert, ActivityIndicator, Animated } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ScreenKeyboardAwareScrollView } from "@/components/ScreenKeyboardAwareScrollView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { Spacing, BorderRadius, Typography, Shadow } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";

type OTPVerificationScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "OTPVerification">;
type OTPVerificationScreenRouteProp = RouteProp<RootStackParamList, "OTPVerification">;

interface OTPVerificationScreenProps {
  navigation: OTPVerificationScreenNavigationProp;
  route: OTPVerificationScreenRouteProp;
}

export default function OTPVerificationScreen({ navigation, route }: OTPVerificationScreenProps) {
  const { theme } = useTheme();
  const { verifyOTP, resendOTP } = useAuth();
  const { userId, email } = route.params;
  
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown]);

  const handleOtpChange = (text: string, index: number) => {
    if (text.length > 1) {
      const digits = text.split("").slice(0, 6);
      const newOtp = [...otp];
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newOtp[index + i] = digit;
        }
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);

    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const shakeInputs = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleVerify = async () => {
    const otpCode = otp.join("");
    
    if (otpCode.length !== 6) {
      Alert.alert("Error", "Please enter the complete 6-digit code");
      shakeInputs();
      return;
    }

    setLoading(true);
    try {
      await verifyOTP(userId, otpCode);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Invalid verification code");
      shakeInputs();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    
    setResending(true);
    try {
      await resendOTP(userId);
      Alert.alert("Success", "New verification code sent to your email");
      setOtp(["", "", "", "", "", ""]);
      setCountdown(60);
      setCanResend(false);
      inputRefs.current[0]?.focus();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to resend code");
    } finally {
      setResending(false);
    }
  };

  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, "$1***$3");

  return (
    <ScreenKeyboardAwareScrollView>
      <View style={styles.header}>
        <Pressable
          style={[styles.backButton, { backgroundColor: theme.surface }]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.iconSection}>
          <View style={[styles.iconContainer, { backgroundColor: theme.surface }]}>
            <Feather name="mail" size={48} color={theme.primary} />
          </View>
        </View>

        <View style={styles.titleSection}>
          <ThemedText style={[styles.title, { color: theme.text }]}>
            OTP code verification
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            We have sent an OTP code to your email{"\n"}
            <ThemedText style={{ color: theme.text, fontWeight: "600" }}>
              {maskedEmail}
            </ThemedText>
            {"\n"}Enter the OTP code below to verify.
          </ThemedText>
        </View>

        <Animated.View 
          style={[styles.otpContainer, { transform: [{ translateX: shakeAnim }] }]}
        >
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputRefs.current[index] = ref; }}
              style={[
                styles.otpInput,
                { 
                  backgroundColor: theme.surface, 
                  color: theme.text, 
                  borderColor: digit ? theme.primary : theme.border 
                }
              ]}
              value={digit}
              onChangeText={(text) => handleOtpChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </Animated.View>

        <View style={styles.timerSection}>
          {!canResend ? (
            <ThemedText style={[styles.timerText, { color: theme.textSecondary }]}>
              Resend code in{" "}
              <ThemedText style={{ color: theme.primary, fontWeight: "600" }}>
                {countdown}s
              </ThemedText>
            </ThemedText>
          ) : (
            <Pressable onPress={handleResend} disabled={resending}>
              <ThemedText style={[styles.resendText, { color: theme.primary }]}>
                {resending ? "Sending..." : "Didn't receive code? Resend"}
              </ThemedText>
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.button, { backgroundColor: theme.primary }, Shadow.button]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.buttonText} />
          ) : (
            <ThemedText style={[styles.buttonText, { color: theme.buttonText }]}>
              Verify & Continue
            </ThemedText>
          )}
        </Pressable>
      </View>
    </ScreenKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    alignItems: "center",
  },
  iconSection: {
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  titleSection: {
    alignItems: "center",
    marginBottom: Spacing.xxl,
  },
  title: {
    ...Typography.h2,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    textAlign: "center",
    lineHeight: 24,
  },
  otpContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  otpInput: {
    width: 52,
    height: 60,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
  },
  timerSection: {
    marginBottom: Spacing.xxl,
    alignItems: "center",
  },
  timerText: {
    ...Typography.body,
  },
  resendText: {
    ...Typography.bodyBold,
  },
  button: {
    width: "100%",
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    ...Typography.bodyBold,
    fontSize: 17,
  },
});
