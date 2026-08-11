import { useState, useMemo } from "react";
import { SafeAreaView, FlatList, Text } from "react-native";
import HomeHeader from "@/components/layout/HomeHeader";
import PillsNav, {
  CHAT_CATEGORIES,
  ChatCategory,
} from "@/components/layout/PillsNav";

const allChats = [
  { id: "1", name: "Alice", category: "Unread" as ChatCategory },
  { id: "2", name: "Team", category: "Groups" as ChatCategory },
  { id: "3", name: "Bob", category: "All" as ChatCategory },
];

export default function HomeScreen() {
  const [activeChatCategory, setActiveChatCategory] = useState<ChatCategory>(
    CHAT_CATEGORIES[0],
  );

  const filteredChats = useMemo(() => {
    if (activeChatCategory === "All") return allChats;
    return allChats.filter((chat) => chat.category === activeChatCategory);
  }, [activeChatCategory]);

  return (
    <SafeAreaView>
      <HomeHeader />
      <PillsNav
        activeChatCategory={activeChatCategory}
        onSelectCategory={setActiveChatCategory}
      />
      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text>{item.name}</Text>}
      />
    </SafeAreaView>
  );
}
