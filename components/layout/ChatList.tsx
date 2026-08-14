import { View, Text } from "react-native";
import SkeletonLoader from "./SkeletonLoader";
import { useTheme } from "@/constants/theme-provider";
import type { ChatCategory } from "./PillsNav";
import type { Chat } from "@/hooks/useChats";
import ChatCard from "./ChatCard";
import { useRouter } from "expo-router";

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

  if (loading) {
    return <SkeletonLoader />;
  }
  const visibleChats =
    filteredMode === "Groups"
      ? chats.filter((chat) => chat.members.length >= 2)
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

  return (
    <View>
      {visibleChats.map((chat, index) => (
        <ChatCard
          key={chat.id}
          onPress={() =>
            router.push({
              pathname: "/chat/[id]",
              params: { id: String(chat.id), username: displayName(chat) },
            })
          }
          username={displayName(chat)}
          lastMessage={chat.lastMessage?.text}
          time={chat.lastMessage ? formatTime(chat.lastMessage.sentAt) : undefined}
          showDivider={index < visibleChats.length - 1}
        />
      ))}
    </View>
  );
}
