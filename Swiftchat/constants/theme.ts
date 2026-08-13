/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform, type ColorSchemeName } from "react-native";

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
    pillActiveBg: "#3B82F6",
    pillActiveText: "#FFFFFF",
    pillInactiveBg: "#FEF2F2",
    pillInactiveText: "#11181C",
    skeletonBg: "#e0e0e0",
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
    pillActiveBg: "#3B82F6",
    pillActiveText: "#FFFFFF",
    pillInactiveBg: "#2A2D2F",
    pillInactiveText: "#ECEDEE",
    skeletonBg: "#3a3a3a",
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export function getFormColors(colorScheme?: ColorSchemeName) {
  const isDark = colorScheme === "dark";
  return {
    subtleText: isDark ? "#9BA1A6" : "#687076",
    inputBorderColor: isDark ? "#2A2D2F" : "#E5E7EB",
    inputBg: isDark ? "#1C1F21" : "#F9FAFB",
    placeholderColor: isDark ? "#6B7280" : "#9CA3AF",
    dividerColor: isDark ? "#2A2D2F" : "#E5E7EB",
  };
}
