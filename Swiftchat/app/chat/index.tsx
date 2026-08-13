import ChatHome from "@/components/layout/ChatHome";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/constants/theme-provider";
import PillsNav, { ChatCategory } from "@/components/layout/PillsNav";
import { useRef, useState } from "react";
import { View } from "react-native";
import ChatList from "@/components/layout/ChatList";
import NewChatFab from "@/components/chat/new-chat/NewChatFab";
import NewChatSheet from "@/components/chat/new-chat/NewChatSheet";
import BottomSheet from "@gorhom/bottom-sheet";
export default function Chat() {
  const [activeChatCategory, setActiveChatCategory] =
    useState<ChatCategory>("All");
  const { colors } = useTheme();
  const bottomSheetRef = useRef<BottomSheet>(null);

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
      <View className="absolute right-2 bottom-16">
        <NewChatFab onPress={() => bottomSheetRef.current?.expand()} />
      </View>
      <NewChatSheet bottomSheetRef={bottomSheetRef} />
    </SafeAreaView>
  );
}
