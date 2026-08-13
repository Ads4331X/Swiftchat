import { View, Pressable, Text } from "react-native";
import { useTheme } from "@/constants/theme-provider";

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
  const theme = useTheme();
  const colors = theme.colors;

  return (
    <View className="flex-row flex-wrap items-center m-2 mb-2 ">
      {CHAT_CATEGORIES.map((category) => {
        const isActive = category === activeChatCategory;
        return (
          <Pressable
            key={category}
            onPress={() => onSelectCategory(category)}
            className="px-4 py-2 m-1 rounded-full"
            style={{
              backgroundColor: isActive
                ? colors.pillActiveBg
                : colors.pillInactiveBg,
            }}
          >
            <Text
              style={{
                color: isActive
                  ? colors.pillActiveText
                  : colors.pillInactiveText,
              }}
            >
              {category}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
