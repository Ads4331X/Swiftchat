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
  localAvatarUrlPath: string | null;
  memberIds: string | undefined;
  chatId: string;
  presence: string;
  isOnline: boolean;
};

export default function ChatHeader({
  userId,
  username,
  avatarUrl,
  isGroup = false,
  memberCount,
  memberIds,
  chatId,
  presence,
  localAvatarUrlPath,
  isOnline,
}: ChatHeaderProps) {
  const router = useRouter();
  const { colors, subtleText, dividerColor } = useTheme();

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
        backgroundColor: colors.background,
      }}
    >
      <Pressable
        onPress={handleBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        className="p-2 -ml-1 mr-2"
      >
        <Feather name="arrow-left" size={24} color={colors.text} />
      </Pressable>

      <Avatar
        username={username ?? "?"}
        avatarUrl={avatarUrl}
        size={34}
        userId={isGroup ? undefined : userId}
        isOnline={isOnline}
        localAvatarUrlPath={localAvatarUrlPath}
      />

      <Pressable
        onPress={() => {
          if (isGroup) {
            router.push({
              pathname: "/otherProfile/[id]",
              params: {
                id: chatId,
                chatId,
                username,
                avatarUrl,
                memberIds,
              },
            });
          } else if (userId != null) {
            router.push({
              pathname: "/otherProfile/[id]",
              params: {
                id: userId,
                chatId,
                username,
                avatarUrl,
                memberIds: String(userId),
              },
            });
          }
        }}
        className="flex-1 min-w-0"
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.text }}
          className="ml-3 font-bold text-lg"
        >
          {username || "Chat"}
        </Text>

        {!isGroup ? (
          <Text
            numberOfLines={1}
            style={{ color: subtleText }}
            className="ml-3 text-xs"
          >
            {presence}
          </Text>
        ) : memberCount ? (
          <Text
            numberOfLines={1}
            style={{ color: subtleText }}
            className="ml-3 text-xs"
          >
            {memberCount} members
          </Text>
        ) : null}
      </Pressable>

      <View className="flex-row items-center gap-4 ml-2">
        <Pressable
          onPress={() => {
            router.push({
              pathname: "/otherProfile/Search",
              params: {
                conversationId: chatId,
              },
            });
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="search" size={22} color={BRAND_COLOR} />
        </Pressable>

        <Pressable hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="phone" size={22} color={BRAND_COLOR} />
        </Pressable>

        <Pressable hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="video" size={24} color={BRAND_COLOR} />
        </Pressable>
      </View>
    </View>
  );
}
