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
  const { isDark } = useTheme();

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
            title: "Modal",
            headerShown: true,
          }}
        />
      </Stack>
      <ToastSafeAreaWrapper />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <AppNavigator />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
