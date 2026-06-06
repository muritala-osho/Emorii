import { useNavigation } from "@react-navigation/native";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { ErrorFallbackProps } from "@/components/ErrorFallback";

export function ScreenErrorFallback({ resetError }: ErrorFallbackProps) {
  const { theme } = useTheme();
  const navigation = useNavigation();

  const handleGoBack = () => {
    resetError();
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.iconWrapper}>
        <Feather name="alert-triangle" size={40} color={theme.error ?? "#FF6B6B"} />
      </View>

      <ThemedText type="h2" style={styles.title}>
        Something went wrong
      </ThemedText>

      <ThemedText type="body" style={[styles.message, { color: theme.textSecondary }]}>
        This screen ran into an unexpected error. Your data is safe.
      </ThemedText>

      <Pressable
        onPress={handleGoBack}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.link, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Feather name="arrow-left" size={16} color={theme.buttonText ?? "#fff"} style={styles.buttonIcon} />
        <ThemedText type="body" style={[styles.buttonText, { color: theme.buttonText ?? "#fff" }]}>
          Go back
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["2xl"],
    gap: Spacing.lg,
  },
  iconWrapper: {
    marginBottom: Spacing.sm,
  },
  title: {
    textAlign: "center",
  },
  message: {
    textAlign: "center",
    lineHeight: 22,
    opacity: 0.8,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  buttonIcon: {
    marginRight: 2,
  },
  buttonText: {
    fontWeight: "600",
    fontSize: 16,
  },
});
