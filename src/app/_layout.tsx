import "../../global.css";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";

import { View, Easing } from "react-native";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import "react-native-reanimated";

import Toast from "react-native-toast-message";
import { toastConfig } from "@/shared/utils/toastConfig";

import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppThemeProvider, useTheme } from "@/shared/providers/theme-provider";
import { PresenceProvider } from "@/shared/providers/presence-provider";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useEffect, useMemo } from "react";
import { startPendingSync } from "@/features/chat/services/sync";

function ToastProvider() {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
      }}
      pointerEvents="box-none"
    >
      <Toast
        config={toastConfig}
        position="bottom"
        bottomOffset={16}
        keyboardOffset={16}
        visibilityTime={4000}
        animationConfig={{
          enter: {
            type: "timing",
            duration: 200,
            easing: Easing.out(Easing.ease),
          },
          exit: {
            type: "timing",
            duration: 150,
            easing: Easing.in(Easing.ease),
          },
        }}
      />
    </View>
  );
}

function AppNavigator() {
  const { isDark, colors } = useTheme();

  useEffect(() => {
    try {
      startPendingSync();
    } catch (err) {
      console.warn("Pending sync failed to start; continuing offline:", err);
    }
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

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
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="chat/index" />
        <Stack.Screen name="chat/[id]" />
      </Stack>

      <ToastProvider />

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <PresenceProvider>
            <KeyboardProvider>
              <AppNavigator />
            </KeyboardProvider>
          </PresenceProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
