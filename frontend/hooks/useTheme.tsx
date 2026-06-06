import logger from '@/utils/logger';
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "@/constants/theme";

export type ThemeMode = "light" | "dark" | "system";
export type FontSizeOption = "small" | "default" | "large";
export type ChatBubbleStyle = "rounded" | "sharp" | "minimal";

const THEME_STORAGE_KEY = "app_theme_preference";
const ACCENT_COLOR_KEY = "customize_accent_color";
const FONT_SIZE_KEY = "customize_font_size";
const CHAT_BUBBLE_KEY = "customize_chat_bubble";
const COMPACT_MODE_KEY = "customize_compact_mode";
const ANIMATIONS_KEY = "customize_animations";
const HAPTIC_KEY = "customize_haptic";

export { Colors };

const FONT_SCALE_MAP: Record<FontSizeOption, number> = {
  small: 0.85,
  default: 1,
  large: 1.15,
};

interface ThemeContextType {
  theme: typeof Colors.light;
  themeMode: ThemeMode;
  isDark: boolean;
  accentColor: string | null;
  fontSize: FontSizeOption;
  fontScale: number;
  chatBubbleStyle: ChatBubbleStyle;
  compactMode: boolean;
  animationsEnabled: boolean;
  hapticFeedback: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  setFontSize: (size: FontSizeOption) => void;
  setChatBubbleStyle: (style: ChatBubbleStyle) => void;
  setCompactMode: (enabled: boolean) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
  setHapticFeedback: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyAccentColor(baseTheme: typeof Colors.light, accent: string | null): typeof Colors.light {
  if (!accent) return baseTheme;
  return {
    ...baseTheme,
    primary: accent,
    primaryLight: accent + 'CC',
    link: accent,
    tabIconSelected: accent,
    like: accent,
    accentGradientStart: accent,
    accentGradientEnd: accent + 'CC',
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [accentColor, setAccentColorState] = useState<string | null>(null);
  const [fontSize, setFontSizeState] = useState<FontSizeOption>("default");
  const [chatBubbleStyle, setChatBubbleStyleState] = useState<ChatBubbleStyle>("rounded");
  const [compactMode, setCompactModeState] = useState(false);
  const [animationsEnabled, setAnimationsEnabledState] = useState(true);
  const [hapticFeedback, setHapticFeedbackState] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const keys = [THEME_STORAGE_KEY, ACCENT_COLOR_KEY, FONT_SIZE_KEY, CHAT_BUBBLE_KEY, COMPACT_MODE_KEY, ANIMATIONS_KEY, HAPTIC_KEY];
      const stored = await AsyncStorage.multiGet(keys);
      const map: Record<string, string | null> = {};
      stored.forEach(([k, v]) => { map[k] = v; });

      const themeVal = map[THEME_STORAGE_KEY];
      if (themeVal && ["light", "dark", "system"].includes(themeVal)) {
        setThemeModeState(themeVal as ThemeMode);
      }
      if (map[ACCENT_COLOR_KEY]) {
        setAccentColorState(map[ACCENT_COLOR_KEY]);
      }
      const fs = map[FONT_SIZE_KEY];
      if (fs && ["small", "default", "large"].includes(fs)) {
        setFontSizeState(fs as FontSizeOption);
      }
      const cb = map[CHAT_BUBBLE_KEY];
      if (cb && ["rounded", "sharp", "minimal"].includes(cb)) {
        setChatBubbleStyleState(cb as ChatBubbleStyle);
      }
      if (map[COMPACT_MODE_KEY] !== null) {
        setCompactModeState(map[COMPACT_MODE_KEY] === "true");
      }
      if (map[ANIMATIONS_KEY] !== null) {
        setAnimationsEnabledState(map[ANIMATIONS_KEY] !== "false");
      }
      if (map[HAPTIC_KEY] !== null) {
        setHapticFeedbackState(map[HAPTIC_KEY] !== "false");
      }
    } catch (error) {
      logger.error("Error loading theme preference:", error);
    } finally {
      setIsLoaded(true);
    }
  };

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      setThemeModeState(mode);
    } catch (error) {
      logger.error("Error saving theme preference:", error);
    }
  }, []);

  const setAccentColor = useCallback(async (color: string) => {
    try {
      await AsyncStorage.setItem(ACCENT_COLOR_KEY, color);
      setAccentColorState(color);
    } catch (error) {
      logger.error("Error saving accent color:", error);
    }
  }, []);

  const setFontSize = useCallback(async (size: FontSizeOption) => {
    try {
      await AsyncStorage.setItem(FONT_SIZE_KEY, size);
      setFontSizeState(size);
    } catch (error) {
      logger.error("Error saving font size:", error);
    }
  }, []);

  const setChatBubbleStyle = useCallback(async (style: ChatBubbleStyle) => {
    try {
      await AsyncStorage.setItem(CHAT_BUBBLE_KEY, style);
      setChatBubbleStyleState(style);
    } catch (error) {
      logger.error("Error saving chat bubble style:", error);
    }
  }, []);

  const setCompactMode = useCallback(async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(COMPACT_MODE_KEY, String(enabled));
      setCompactModeState(enabled);
    } catch (error) {
      logger.error("Error saving compact mode:", error);
    }
  }, []);

  const setAnimationsEnabled = useCallback(async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(ANIMATIONS_KEY, String(enabled));
      setAnimationsEnabledState(enabled);
    } catch (error) {
      logger.error("Error saving animations:", error);
    }
  }, []);

  const setHapticFeedback = useCallback(async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(HAPTIC_KEY, String(enabled));
      setHapticFeedbackState(enabled);
    } catch (error) {
      logger.error("Error saving haptic:", error);
    }
  }, []);

  const effectiveTheme = themeMode === "system" ? systemColorScheme : themeMode;
  const isDark = effectiveTheme === "dark";
  const themeKey = isDark ? "dark" : "light";
  const baseTheme = Colors[themeKey];
  const theme = applyAccentColor(baseTheme, accentColor);
  const fontScale = FONT_SCALE_MAP[fontSize];

  return (
    <ThemeContext.Provider value={{
      theme, themeMode, isDark, accentColor,
      fontSize, fontScale, chatBubbleStyle, compactMode, animationsEnabled, hapticFeedback,
      setThemeMode, setAccentColor, setFontSize, setChatBubbleStyle,
      setCompactMode, setAnimationsEnabled, setHapticFeedback,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    return {
      theme: Colors.light,
      themeMode: "system" as ThemeMode,
      isDark: false,
      accentColor: null as string | null,
      fontSize: "default" as FontSizeOption,
      fontScale: 1,
      chatBubbleStyle: "rounded" as ChatBubbleStyle,
      compactMode: false,
      animationsEnabled: true,
      hapticFeedback: true,
      setThemeMode: (_mode: ThemeMode) => {},
      setAccentColor: (_color: string) => {},
      setFontSize: (_size: FontSizeOption) => {},
      setChatBubbleStyle: (_style: ChatBubbleStyle) => {},
      setCompactMode: (_enabled: boolean) => {},
      setAnimationsEnabled: (_enabled: boolean) => {},
      setHapticFeedback: (_enabled: boolean) => {},
    };
  }
  return context;
}
