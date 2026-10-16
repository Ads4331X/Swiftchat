import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";
import Avatar from "@/features/profile/components/Avatar";

type UserListItemProps = {
  username: string;
  avatarUrl?: string;
  localAvatarUrlPath?: string | null;
  userId?: number;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  showDivider?: boolean;
  avatarSize?: number;
  dividerInset?: number;
};

export default function UserListItem({
  username,
  avatarUrl,
  localAvatarUrlPath = null,
  userId,
  subtitle,
  trailing,
  onPress,
  disabled = false,
  showDivider = true,
  avatarSize = 44,
  dividerInset = 56,
}: UserListItemProps) {
  const { colors, subtleText, dividerColor } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="flex-row items-center gap-3 py-3 active:opacity-60"
    >
      <Avatar
        username={username}
        avatarUrl={avatarUrl}
        size={avatarSize}
        userId={userId}
        localAvatarUrlPath={localAvatarUrlPath}
      />

      <View className="flex-1">
        <Text
          numberOfLines={1}
          style={{ color: colors.text }}
          className="font-medium text-base"
        >
          {username}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: subtleText }}
            className="text-sm mt-0.5"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing}

      {showDivider ? (
        <View
          className="absolute bottom-0 right-0"
          style={{
            left: dividerInset,
            height: StyleSheet.hairlineWidth,
            backgroundColor: dividerColor,
          }}
        />
      ) : null}
    </Pressable>
  );
}
