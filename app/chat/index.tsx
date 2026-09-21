import ChatHome from "@/components/layout/ChatHome";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/constants/theme-provider";
import PillsNav, { ChatCategory } from "@/components/layout/PillsNav";
import { useCallback, useRef, useState } from "react";
import { ScrollView, RefreshControl, View } from "react-native";
import ChatList from "@/components/layout/ChatList";
import NewChatFab from "@/components/chat/new-chat/NewChatFab";
import NewChatSheet from "@/components/chat/new-chat/NewChatSheet";
import { useFocusEffect } from "expo-router";
import BottomSheet from "@gorhom/bottom-sheet";
import useChats from "@/hooks/useChats";
import { useKeySetup } from "@/hooks/useKeySetup";
import PinModal from "@/components/security/PinModal";

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
      refetch();
      setUpKeys();
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 120,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ChatList
          filteredMode={activeChatCategory}
          chats={chats}
          loading={loading}
          clearChat={clearChat}
          onMarkChatAsRead={markChatAsReadLocally}
        />
      </ScrollView>

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
          refetch();
        }}
        onCancel={skipPin}
      />
    </SafeAreaView>
  );
}
