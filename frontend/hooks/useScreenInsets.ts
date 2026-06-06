import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { Spacing } from "@/constants/theme";

function useSafeBottomTabBarHeight() {
  try {
    return useBottomTabBarHeight();
  } catch {
    return 0;
  }
}

export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useSafeBottomTabBarHeight();

  return {
    paddingTop: headerHeight + Spacing.sm,
    paddingBottom: tabBarHeight + Spacing.md,
    scrollInsetBottom: insets.bottom + 8,
  };
}
