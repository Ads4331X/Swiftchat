import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/constants/theme";
import { useTheme } from "@/constants/theme-provider";
import Avatar from "@/components/profile/Avatar";

type ChatHeaderProps = {
  userId?: number;
  username?: string;
  avatarUrl?: string;
  isGroup?: boolean;
  memberCount?: number;
  textColor: string;
  dividerColor: string;
  backgroundColor: string;
};

export default function ChatHeader({
  userId,
  username,
  avatarUrl,
  isGroup = false,
  memberCount,
  textColor,
  dividerColor,
  backgroundColor,
}: ChatHeaderProps) {
  const router = useRouter();
  const { subtleText } = useTheme();

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View
      className="w-full px-4 py-3 flex-row items-center"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: dividerColor,
        backgroundColor,
      }}
    >
      <Pressable
        onPress={handleBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        className="p-2 -ml-1 mr-2"
      >
        <Feather name="arrow-left" size={24} color={textColor} />
      </Pressable>
      <Avatar username={username ?? "?"} avatarUrl={avatarUrl} size={34} />
      <Pressable
        disabled={!(isGroup === false && userId != null)}
        onPress={() => {
          if (userId != null) {
            router.push({
              pathname: "/otherProfile/[id]" as never,
              params: { id: userId },
            });
          }
        }}
        className="flex-1"
      >
        <Text
          numberOfLines={1}
          style={{ color: textColor }}
          className="ml-3 font-bold text-lg"
        >
          {username || "Chat"}
        </Text>
        {isGroup && memberCount ? (
          <Text
            numberOfLines={1}
            style={{ color: subtleText }}
            className="ml-3 text-xs"
          >
            {memberCount} members
          </Text>
        ) : null}
      </Pressable>
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
