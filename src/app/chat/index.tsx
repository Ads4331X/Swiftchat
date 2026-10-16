import ChatHome from "@/features/conversations/components/ChatHome";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/shared/providers/theme-provider";
import PillsNav, { ChatCategory } from "@/features/conversations/components/PillsNav";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import ChatList from "@/features/conversations/components/ChatList";
import NewChatFab from "@/features/conversations/components/new-chat/NewChatFab";
import NewChatSheet from "@/features/conversations/components/new-chat/NewChatSheet";
import { useFocusEffect } from "expo-router";
import BottomSheet from "@gorhom/bottom-sheet";
import useChats from "@/features/conversations/hooks/useChats";
import { useKeySetup } from "@/features/security/hooks/useKeySetup";
import PinModal from "@/features/security/components/PinModal";

export default function Chat() {
  const [activeChatCategory, setActiveChatCategory] =
    useState<ChatCategory>("All");
  const { colors } = useTheme();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const { chats, loading, refetch, clearChat, markChatAsReadLocally } =
    useChats();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  const {
    needsPin,
    pinMode,
    busy: pinBusy,
    setUpKeys,
    submitPin,
    skip: skipPin,
  } = useKeySetup();
  const [pinError, setPinError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch().catch(() => {});
      setUpKeys().catch(() => {});
    }, [refetch, setUpKeys]),
  );

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

      {/* ChatList is a FlatList and owns its own scrolling + refresh. */}
      <ChatList
        filteredMode={activeChatCategory}
        chats={chats}
        loading={loading}
        clearChat={clearChat}
        onMarkChatAsRead={markChatAsReadLocally}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      <View className="absolute right-2 bottom-16">
        <NewChatFab onPress={() => bottomSheetRef.current?.expand()} />
      </View>

      <NewChatSheet bottomSheetRef={bottomSheetRef} onChatCreated={refetch} />

      <PinModal
        visible={needsPin}
        mode={pinMode}
        error={pinError}
        loading={pinBusy}
        onSubmit={async (pin) => {
          const ok = await submitPin(pin);
          if (!ok.ok) {
            setPinError(ok.error || "Incorrect PIN. Please try again.");
            return;
          }
          setPinError(null);
          refetch().catch(() => {});
        }}
        onCancel={skipPin}
      />
    </SafeAreaView>
  );
}
