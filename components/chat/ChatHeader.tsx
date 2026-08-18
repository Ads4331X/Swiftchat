import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/constants/theme";

type ChatHeaderProps = {
  username?: string;
  isTyping?: boolean;
  textColor: string;
  dividerColor: string;
  backgroundColor: string;
};

export default function ChatHeader({
  username,
  isTyping,
  textColor,
  dividerColor,
  backgroundColor,
}: ChatHeaderProps) {
  const router = useRouter();

  return (
    <View
      className="w-full px-4 py-3 flex-row items-center"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: dividerColor,
        backgroundColor,
      }}
    >
      <Pressable onPress={() => router.back()} className="p-1">
        <Feather name="arrow-left" size={24} color={textColor} />
      </Pressable>

      <View className="flex-1 items-center">
        <Text
          numberOfLines={1}
          style={{ color: textColor }}
          className="font-bold text-lg"
        >
          {username || "Chat"}
        </Text>
        {isTyping && (
          <Text
            numberOfLines={1}
            style={{ color: BRAND_COLOR }}
            className="text-xs"
          >
            typing...
          </Text>
        )}
      </View>

      <View className="flex-row items-center gap-4">
        <Pressable>
          <Feather name="phone" size={22} color={BRAND_COLOR} />
        </Pressable>
        <Pressable>
          <Feather name="video" size={24} color={BRAND_COLOR} />
        </Pressable>
      </View>
    </View>
  );
}
