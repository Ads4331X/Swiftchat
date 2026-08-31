import { View, Text } from "react-native";
import { useState, useEffect } from "react";
import SkeletonLoader from "./SkeletonLoader";
import { useTheme } from "@/constants/theme-provider";
import type { ChatCategory } from "./PillsNav";
import type { Chat } from "@/hooks/useChats";
import ChatCard from "./ChatCard";
import { useRouter } from "expo-router";
import {
  joinConversation,
  listenForTyping,
  listenForStopTyping,
} from "@/lib/socket";

type ChatListProps = {
  filteredMode: ChatCategory;
  chats: Chat[];
  loading: boolean;
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
}: ChatListProps) {
  const router = useRouter();
  const { colors } = useTheme();
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
      ? chats.filter((chat) => chat.members.length > 2)
      : chats;

  if (visibleChats.length === 0) {
    return (
      <Text
        style={{ color: colors.text }}
        className="text-2xl text-center font-bold"
      >
        No conversations yet
      </Text>
    );
  }

  const displayName = (chat: Chat) =>
    chat.members.length > 1
      ? chat.members.map((member) => member.username).join(", ")
      : (chat.members[0]?.username ?? "Chat");

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
