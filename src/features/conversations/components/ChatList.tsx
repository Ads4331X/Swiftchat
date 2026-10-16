import { useCallback, useEffect, useMemo, useState } from "react";
import SkeletonLoader from "@/features/conversations/components/SkeletonLoader";
import EmptyState from "@/shared/components/EmptyState";
import type { ChatCategory } from "@/features/conversations/components/PillsNav";
import type { Chat } from "@/features/conversations/hooks/useChats";
import ChatCard from "@/features/conversations/components/ChatCard";
import { useRouter } from "expo-router";
import { conversationDisplayName } from "@/shared/utils";
import {
  joinConversation,
  listenForTyping,
  listenForStopTyping,
} from "@/core/socket";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

// One placeholder per filter, so the empty branch stays a single lookup
// instead of three near-identical blocks.
const EMPTY_STATES: Record<
  ChatCategory,
  { icon: "users" | "check-circle" | "message-circle"; title: string; message: string }
> = {
  Groups: {
    icon: "users",
    title: "No groups yet",
    message:
      "Start a group chat by tapping +.\nSearch and select multiple people, then create your group.",
  },
  Unread: {
    icon: "check-circle",
    title: "You're all caught up",
    message:
      "No unread conversations.\nCheck back when someone messages you.",
  },
  All: {
    icon: "message-circle",
    title: "Welcome to Swiftchat",
    message:
      "You don't have any conversations yet.\nTap + to find someone and start a conversation.",
  },
};

type ChatListProps = {
  filteredMode: ChatCategory;
  chats: Chat[];
  loading: boolean;
  clearChat: (conversationId: number) => Promise<void>;
  onMarkChatAsRead: (chatId: number) => void;
  refreshing: boolean;
  onRefresh: () => void;
};

export default function ChatList({
  filteredMode,
  chats,
  loading,
  clearChat,
  onMarkChatAsRead,
  refreshing,
  onRefresh,
}: ChatListProps) {
  const router = useRouter();
  const [typingMap, setTypingMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const subTyping = listenForTyping(({ conversationId }) => {
      setTypingMap((prev) => ({ ...prev, [conversationId]: true }));
    });

    const subStopTyping = listenForStopTyping(({ conversationId }) => {
      setTypingMap((prev) => ({ ...prev, [conversationId]: false }));
    });

    return () => {
      subTyping?.();
      subStopTyping?.();
    };
  }, []);

  const visibleChats = useMemo(
    () =>
      filteredMode === "Groups"
        ? chats.filter((chat) => chat.members.length > 1)
        : filteredMode === "Unread"
          ? chats.filter((chat) => (chat.unread ?? 0) > 0)
          : chats,
    [filteredMode, chats],
  );

  const openChat = useCallback(
    (chat: Chat) => {
      onMarkChatAsRead(chat.id);
      joinConversation({ id: String(chat.id) });
      router.push({
        pathname: "/chat/[id]" as any as any,
        params: {
          id: String(chat.id),
          username: conversationDisplayName(chat.name, chat.members),
          avatarUrl: chat.members.length === 1 ? (chat.members[0]?.avatar ?? "") : "",
          memberIds: String(
            chat.members.flatMap((member) => String(member.id)).join(","),
          ),
        },
      });
    },
    [onMarkChatAsRead, router],
  );

  const renderChat = useCallback(
    ({ item, index }: { item: Chat; index: number }) => (
      <ChatCard
        chat={item}
        typing={Boolean(typingMap[item.id])}
        onPress={openChat}
        onClear={clearChat}
        showDivider={index < visibleChats.length - 1}
      />
    ),
    [typingMap, openChat, clearChat, visibleChats.length],
  );

  if (loading) {
    return <SkeletonLoader />;
  }

  if (visibleChats.length === 0) {
    const empty = EMPTY_STATES[filteredMode];

    return (
      <View className="flex-1" style={{ marginTop: 100 }}>
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          message={empty.message}
          iconSize={72}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={visibleChats}
      keyExtractor={(chat) => String(chat.id)}
      renderItem={renderChat}
      // Owns the scroll position and pull-to-refresh; the parent must not
      // wrap this in a ScrollView or virtualization is defeated.
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      // Each row mounts a swipeable + avatar, so keep the mounted window
      // small instead of letting the whole list render up front.
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 120,
  },
});
