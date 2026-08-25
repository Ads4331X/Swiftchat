import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/constants/theme";
import Avatar from "@/components/profile/Avatar";

type ChatHeaderProps = {
  username?: string;
  avatarUrl?: string;
  textColor: string;
  dividerColor: string;
  backgroundColor: string;
};

export default function ChatHeader({
  username,
  avatarUrl,
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

      <Avatar username={username ?? "?"} avatarUrl={avatarUrl} size={34} />

      <Text
        numberOfLines={1}
        style={{ color: textColor }}
        className="flex-1 ml-3 font-bold text-lg"
      >
        {username || "Chat"}
      </Text>

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
