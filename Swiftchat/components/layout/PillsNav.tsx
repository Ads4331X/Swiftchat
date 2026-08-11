import { View, Pressable, Text } from "react-native";

export type ChatCategory = "All" | "Unread" | "Groups";
export const CHAT_CATEGORIES: ChatCategory[] = ["All", "Unread", "Groups"];

type PillsNavProps = {
  activeChatCategory: ChatCategory;
  onSelectCategory: (category: ChatCategory) => void;
};

export default function PillsNav({
  activeChatCategory,
  onSelectCategory,
}: PillsNavProps) {
  return (
    <View className="flex-row flex-wrap items-center m-2 pt-2">
      {CHAT_CATEGORIES.map((category) => {
        const isActive = category === activeChatCategory;
        return (
          <Pressable
            key={category}
            onPress={() => onSelectCategory(category)}
            className="px-4 py-2 m-1 rounded-full"
            style={{ backgroundColor: isActive ? "#3B82F6" : "#FEF2F2" }}
          >
            <Text className={isActive ? "text-white" : "text-black"}>
              {category}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
