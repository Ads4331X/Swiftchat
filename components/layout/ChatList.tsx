import { useState, useEffect } from "react";
import SkeletonLoader from "./SkeletonLoader";
import EmptyState from "@/components/ui/EmptyState";
import type { ChatCategory } from "./PillsNav";
import type { Chat } from "@/hooks/useChats";
import ChatCard from "./ChatCard";
import { useRouter } from "expo-router";
import { conversationDisplayName } from "@/lib/conversation";
import {
  joinConversation,
  listenForTyping,
  listenForStopTyping,
} from "@/lib/socket";
import { View } from "react-native";
type ChatListProps = {
  filteredMode: ChatCategory;
  chats: Chat[];
  loading: boolean;
  clearChat: (conversationId: number) => Promise<void>;
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatList({
  filteredMode,
  chats,
  loading,
  clearChat,
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

  if (loading) {
    return <SkeletonLoader />;
  }
  const visibleChats =
    filteredMode === "Groups"
      ? chats.filter((chat) => chat.members.length > 1)
      : chats;

  if (visibleChats.length === 0) {
    if (filteredMode === "Groups") {
      return (
        <View className="flex-1" style={{ marginTop: 100 }}>
          <EmptyState
            icon="users"
            title="No groups yet"
            message={`Start a group chat by tapping +.\nSearch and select multiple people, then create your group.`}
            iconSize={72}
          />
        </View>
      );
    }

    if (filteredMode === "Unread") {
      return (
        <View className="flex-1" style={{ marginTop: 100 }}>
          <EmptyState
            icon="check-circle"
            title="You're all caught up"
            message={`No unread conversations.\nCheck back when someone messages you.`}
            iconSize={72}
          />
        </View>
      );
    }

    return (
      <View className="flex-1" style={{ marginTop: 100 }}>
        <EmptyState
          icon="message-circle"
          title="Welcome to Swiftchat"
          message={`You don't have any conversations yet.\nTap + to find someone and start a conversation.`}
          iconSize={72}
        />
      </View>
    );
  }

  const displayName = (chat: Chat) =>
    conversationDisplayName(chat.name, chat.members);

  const otherAvatar = (chat: Chat) =>
    chat.members.length === 1 ? (chat.members[0]?.avatar ?? "") : "";

  return (
    <View>
      {visibleChats.map((chat, index) => (
        <ChatCard
          key={chat.id}
          onPress={() => {
            joinConversation({ id: String(chat.id) });
            router.push({
              pathname: "/chat/[id]",
              params: {
                id: String(chat.id),
                username: displayName(chat),
                avatarUrl: otherAvatar(chat),
                memberIds: String(
                  chat.members.flatMap((member) => String(member.id)).join(","),
                ),
              },
            });
          }}
          username={displayName(chat)}
          avatarUrl={otherAvatar(chat)}
          lastMessage={chat.lastMessage?.text}
          onClear={() => clearChat(Number(chat.id))}
          typing={typingMap[chat.id]}
          time={
            chat.lastMessage ? formatTime(chat.lastMessage.sentAt) : undefined
          }
          showDivider={index < visibleChats.length - 1}
        />
      ))}
    </View>
  );
}
