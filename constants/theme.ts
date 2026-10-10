/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { type ColorSchemeName } from "react-native";

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const BRAND_COLOR = "#29A195";

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

export type AttachmentColors = {
  cardColor: string;
  labelColor: string;
  dividerColor: string;
  placeholderBg: string;
  iconMuted: string;
  textColor: string;
  subtle: string;
  trackColor: string;
  accent: string;
};

export function getAttachmentColors(
  colorScheme?: ColorSchemeName,
  isMine = false,
): AttachmentColors {
  const isDark = colorScheme === "dark";
  const subtleText = getFormColors(colorScheme).subtleText;
  const divider = getFormColors(colorScheme).dividerColor;

  return {
    cardColor: isMine
      ? "rgba(255,255,255,0.16)"
      : isDark
        ? "#1F2529"
        : "#FFFFFF",
    labelColor: isMine ? "rgba(255,255,255,0.85)" : subtleText,
    dividerColor: isMine ? "rgba(255,255,255,0.16)" : divider,
    placeholderBg: isMine
      ? "rgba(0,0,0,0.22)"
      : isDark
        ? "#232B2F"
        : "#E4E9EC",
    iconMuted: isMine ? "rgba(255,255,255,0.9)" : isDark ? "#8A939A" : "#6B7280",
    textColor: isMine ? "#FFFFFF" : isDark ? "#ECEDEE" : "#11181C",
    subtle: isMine ? "rgba(255,255,255,0.7)" : subtleText,
    trackColor: isMine ? "rgba(255,255,255,0.35)" : isDark ? "#3A4247" : "#D6DCE0",
    accent: BRAND_COLOR,
  };
}
