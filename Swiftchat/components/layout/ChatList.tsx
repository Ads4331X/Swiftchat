import { View, Text } from "react-native";
import SkeletonLoader from "./SkeletonLoader";
import { useTheme } from "@/constants/theme-provider";
import type { ChatCategory } from "./PillsNav";
import type { Chat } from "@/hooks/useChats";
import ChatCard from "./ChatCard";

type ChatListProps = {
  filteredMode: ChatCategory;
  chats: Chat[];
  loading: boolean;
};

export default function ChatList({
  filteredMode,
  chats,
  loading,
}: ChatListProps) {
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
      : chat.members[0]?.username ?? "Chat";

  return (
    <View>
      {visibleChats.map((chat, index) => (
        <ChatCard
          key={chat.id}
          username={displayName(chat)}
          showDivider={index < visibleChats.length - 1}
        />
      ))}
    </View>
  );
}
