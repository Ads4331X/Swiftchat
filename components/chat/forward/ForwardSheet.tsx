import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import Toast from "react-native-toast-message";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import NewChatSheetHeader from "@/components/chat/new-chat/NewChatSheetHeader";
import EmptyState from "@/components/ui/EmptyState";
import { BRAND_COLOR } from "@/constants/theme";
import { useTheme } from "@/constants/theme-provider";
import { conversationDisplayName } from "@/lib/utils";
import { normalizeChat, type Chat } from "@/hooks/useChats";
import { type Message } from "@/hooks/useChatMessages";
import { api } from "@/lib/api";
import { getCurrentUserId } from "@/lib/auth";
import {
  deletePendingMessage,
  saveMessage,
  savePendingMessage,
} from "@/lib/db";
import { acquireFlushLock, releaseFlushLock } from "@/lib/sync";
import { encryptMessage, getOrCreateConversationKey } from "@/lib/crypto";
import {
  SelectionCheckbox,
  UserListItem,
} from "@/components/chat/common";

type ForwardSheetProps = {
  bottomSheetRef: React.RefObject<React.ElementRef<typeof BottomSheet> | null>;
  message: Message | null;
  excludeConversationId: string;
  onDone?: () => void;
};

function ForwardChatRow({
  chat,
  selected,
  showDivider,
  onPress,
}: {
  chat: Chat;
  selected: boolean;
  showDivider: boolean;
  onPress: () => void;
}) {
  const { dividerColor } = useTheme();
  const name = conversationDisplayName(chat.name, chat.members);
  const avatarUrl =
    chat.members.length === 1 ? (chat.members[0]?.avatar ?? "") : "";

  return (
    <UserListItem
      username={name}
      avatarUrl={avatarUrl}
      subtitle={
        chat.members.length > 1
          ? `${chat.members.length + 1} members`
          : undefined
      }
      onPress={onPress}
      showDivider={showDivider}
      dividerInset={76}
      trailing={
        <SelectionCheckbox
          selected={selected}
          size={24}
          unselectedBorderColor={dividerColor}
        />
      }
    />
  );
}

export default function ForwardSheet({
  bottomSheetRef,
  message,
  excludeConversationId,
  onDone,
}: ForwardSheetProps) {
  const { colors, subtleText, inputBg } = useTheme();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelectedIds(new Set());
    setErrorMessage(null);

    (async () => {
      try {
        const response = await api.get("/api/conversations");
        const list: Chat[] = Array.isArray(response.data)
          ? response.data
              .map(normalizeChat)
              .filter((chat): chat is Chat => chat !== null)
          : [];
        if (!active) return;
        setChats(
          list.filter((c) => String(c.id) !== String(excludeConversationId)),
        );
      } catch {
        if (active) setChats([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [excludeConversationId]);

  const closeSheet = useCallback(() => {
    setLoading(false);
    setSelectedIds(new Set());
    setErrorMessage(null);
    onDone?.();
    bottomSheetRef.current?.close();
  }, [bottomSheetRef, onDone]);

  const toggleChat = useCallback((chatId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  }, []);

  const handleForward = async () => {
    if (!message || selectedIdsRef.current.size === 0 || sending) return;

    if (message.text.startsWith("[Encrypted")) {
      setErrorMessage(
        "This message can't be re-encrypted on this device yet. Try again later.",
      );
      return;
    }

    setSending(true);
    setErrorMessage(null);

    const userId = await getCurrentUserId();
    if (userId == null) {
      setSending(false);
      setErrorMessage("Please sign in and try again.");
      return;
    }
    const originalMessageId = message.id;
    const originalText = message.text;
    const nowBase = Date.now();
    let index = 0;
    let sentCount = 0;
    let queuedCount = 0;

    for (const chatId of selectedIdsRef.current) {
      const chat = chats.find((c) => c.id === chatId);
      if (!chat) continue;
      index += 1;

      try {
        const conversationKey = await getOrCreateConversationKey(
          String(chat.id),
          [...new Set([userId, ...chat.members.map((m) => m.id)])].filter(
            Boolean,
          ),
        );
        if (!conversationKey) continue;

        const { encryptedMessage, nonce } = await encryptMessage({
          message: originalText,
          decryptedConversationKey: conversationKey,
        });
        const sentAt = new Date().toISOString();
        const messageId = -(nowBase + index);

        const held = await acquireFlushLock();
        try {
          await savePendingMessage({
            message: encryptedMessage,
            nonce,
            messageId,
            SenderId: userId,
            ConversationId: chat.id,
            sentAt,
            forwardedFromMsgId: originalMessageId,
          });

          await api.post("/api/conversations/messages", {
            messageText: encryptedMessage,
            conversationId: chat.id,
            nonce,
            forwardedFromMsgId: originalMessageId,
          });

          await saveMessage({
            messageId,
            message: encryptedMessage,
            sentAt,
            SenderId: userId,
            ConversationId: chat.id,
            nonce,
            forwardedFromMsgId: originalMessageId,
          });
          await deletePendingMessage({ messageId });

          sentCount += 1;
        } catch {
          queuedCount += 1;
        } finally {
          if (held) releaseFlushLock();
        }
      } catch {
        // Key generation/encryption failed for this chat — skip it.
      }
    }

    setSending(false);

    const delivered = sentCount + queuedCount;
    if (delivered === 0) {
      setErrorMessage(
        "Couldn't forward this message. Conversation keys aren't ready on this device yet.",
      );
      return;
    }

    const suffix = ` to ${delivered} chat${delivered > 1 ? "s" : ""}`;
    Toast.show({
      type: "success",
      text1: `Forwarded${suffix}`,
    });

    setSelectedIds(new Set());
    onDone?.();
    closeSheet();
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={["75%"]}
      topInset={insets.top}
      enableDynamicSizing={false}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.background }}
    >
      <BottomSheetView className="flex-1">
        <NewChatSheetHeader onClose={closeSheet} title="Forward message" />

        {message ? (
          <View
            className="mx-4 mb-3 px-3 py-2 rounded-xl"
            style={{ backgroundColor: inputBg }}
          >
            <Text
              numberOfLines={2}
              style={{ color: subtleText }}
              className="text-sm"
            >
              {message.text}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <View className="flex-1 items-center justify-center pb-24">
            <ActivityIndicator size="large" color={BRAND_COLOR} />
          </View>
        ) : chats.length === 0 ? (
          <View className="flex-1 pb-24">
            <EmptyState
              icon="message-circle"
              title="No conversations"
              message="You don't have any other chats to forward to."
            />
          </View>
        ) : (
          <FlatList
            className="flex-1"
            data={chats}
            keyExtractor={(chat) => String(chat.id)}
            renderItem={({ item, index }) => (
              <ForwardChatRow
                chat={item}
                selected={selectedIds.has(item.id)}
                showDivider={index < chats.length - 1}
                onPress={() => toggleChat(item.id)}
              />
            )}
            contentContainerStyle={{ paddingBottom: 8 }}
          />
        )}

        <View
          className="px-4 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          {errorMessage ? (
            <Text style={{ color: "#EF4444" }} className="text-sm mb-2">
              {errorMessage}
            </Text>
          ) : null}

          <Pressable
            disabled={selectedIds.size === 0 || sending}
            onPress={handleForward}
            className="h-12 items-center justify-center rounded-full"
            style={{
              backgroundColor: BRAND_COLOR,
              opacity: selectedIds.size === 0 ? 0.5 : 1,
            }}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">
                {selectedIds.size === 0
                  ? "Select a chat"
                  : `Forward to ${selectedIds.size} chat${selectedIds.size > 1 ? "s" : ""}`}
              </Text>
            )}
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
