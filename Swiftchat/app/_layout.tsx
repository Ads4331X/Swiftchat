import "../global.css";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import Toast from "react-native-toast-message";
import { toastConfig } from "@/lib/toastConfig";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { AppThemeProvider, useTheme } from "@/constants/theme-provider";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useMemo } from "react";

export const unstable_settings = {
  anchor: "(tabs)",
};

function ToastSafeAreaWrapper() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView
      style={{
        position: "absolute",
        top: insets.top,
        left: 0,
        right: 0,
        zIndex: 999,
      }}
      pointerEvents="box-none"
    >
      <Toast config={toastConfig} />
    </SafeAreaView>
  );
}

function AppNavigator() {
  const { isDark, colors } = useTheme();

  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.background,
      },
    };
  }, [isDark, colors.background]);

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
      </Stack>
      <ToastSafeAreaWrapper />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <AppNavigator />
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
