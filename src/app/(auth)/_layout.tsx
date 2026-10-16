// app/auth/_layout.tsx
import { Stack } from "expo-router";
import { useTheme } from "@/shared/providers/theme-provider";

export default function AuthLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
