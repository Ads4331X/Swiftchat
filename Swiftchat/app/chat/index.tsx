import ChatHome from "@/components/layout/ChatHome";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/constants/theme-provider";
import PillsNav, { ChatCategory } from "@/components/layout/PillsNav";
import { useState } from "react";
import ChatList from "@/components/layout/ChatList";
export default function Chat() {
  const [activeChatCategory, setActiveChatCategory] =
    useState<ChatCategory>("All");
  const { colors } = useTheme();
  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
    >
      <ChatHome />
      <PillsNav
        activeChatCategory={activeChatCategory}
        onSelectCategory={setActiveChatCategory}
      />
      <ChatList filteredMode={activeChatCategory} />
    </SafeAreaView>
  );
}
