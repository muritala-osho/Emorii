import { Text, type TextProps } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Typography } from "@/constants/theme";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: "h1" | "h2" | "h3" | "h4" | "body" | "small" | "link";
  skipFontScale?: boolean;
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "body",
  skipFontScale = false,
  ...rest
}: ThemedTextProps) {
  const { theme, isDark, fontScale } = useTheme();

  const getColor = () => {
    if (isDark && darkColor) {
      return darkColor;
    }

    if (!isDark && lightColor) {
      return lightColor;
    }

    if (type === "link") {
      return theme.link;
    }

    return theme.text;
  };

  const getTypeStyle = () => {
    const baseStyle = (() => {
      switch (type) {
        case "h1":
          return Typography.h1;
        case "h2":
          return Typography.h2;
        case "h3":
          return Typography.h3;
        case "h4":
          return Typography.h4;
        case "body":
          return Typography.body;
        case "small":
          return Typography.small;
        case "link":
          return Typography.link;
        default:
          return Typography.body;
      }
    })();

    if (skipFontScale || fontScale === 1) return baseStyle;

    return {
      ...baseStyle,
      fontSize: baseStyle.fontSize ? Math.round(baseStyle.fontSize * fontScale) : undefined,
      lineHeight: baseStyle.lineHeight ? Math.round(baseStyle.lineHeight * fontScale) : undefined,
    };
  };

  return (
    <Text style={[{ color: getColor() }, getTypeStyle(), style]} {...rest} />
  );
}
