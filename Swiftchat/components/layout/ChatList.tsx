import { View, Text } from "react-native";
import useChats from "@/hooks/useChats";
import SkeletonLoader from "./SkeletonLoader";
import { useTheme } from "@/constants/theme-provider";
import type { ChatCategory } from "./PillsNav";

type ChatListProps = {
  filteredMode: ChatCategory;
};

export default function ChatList({ filteredMode }: ChatListProps) {
  const { colors } = useTheme();
  const { chats, loading } = useChats();

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

  return (
    <View>
      {visibleChats.map((chat) => (
        <View key={chat.id}>
          {chat.members.map((c) => (
            <Text key={c.userId} style={{ color: colors.text }}>
              {c.userId}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
