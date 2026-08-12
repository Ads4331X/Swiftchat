import ChatHome from "@/components/layout/ChatHome";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import PillsNav, { ChatCategory } from "@/components/layout/PillsNav";
import { useState } from "react";
export default function Chat() {
  const [activeChatCategory, setActiveChatCategory] =
    useState<ChatCategory>("All");
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const isDark = colorScheme === "dark";
  const subtleText = isDark ? "#9BA1A6" : "#687076";
  const inputBorderColor = isDark ? "#2A2D2F" : "#E5E7EB";
  const inputBg = isDark ? "#1C1F21" : "#F9FAFB";
  const placeholderColor = isDark ? "#6B7280" : "#9CA3AF";
  const dividerColor = isDark ? "#2A2D2F" : "#E5E7EB";
  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
    >
      <ChatHome />
   
    </SafeAreaView>
  );
}
