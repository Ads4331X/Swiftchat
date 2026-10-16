import { Pressable, StyleSheet, Text, View } from "react-native";
import { memo, useCallback, useEffect, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/shared/providers/theme-provider";
import { BRAND_COLOR } from "@/shared/theme/theme";
import Avatar from "@/features/profile/components/Avatar";
import { getUser } from "@/core/db";
import { conversationDisplayName } from "@/shared/utils";
import type { Chat } from "@/features/conversations/hooks/useChats";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, { SharedValue, useAnimatedStyle } from "react-native-reanimated";

const CLEAR_ACTION_COLOR = "#E5484D";
const CLEAR_ACTION_WIDTH = 96;

type ChatCardProps = {
  chat: Chat;
  onPress: (chat: Chat) => void;
  onClear: (conversationId: number) => Promise<void>;
  typing?: boolean;
  showDivider?: boolean;
};

const MemoizedAvatar = memo(Avatar);

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default memo(function ChatCard({
  chat,
  onPress,
  onClear,
  typing = false,
  showDivider = true,
}: ChatCardProps) {
  const { colors, subtleText, dividerColor } = useTheme();
  const [localAvatarUrlPath, setLocalAvatarUrlPath] = useState<string | null>(
    null,
  );

  // A direct chat has exactly one other member; groups show no avatar here.
  const counterpart = chat.members.length === 1 ? chat.members[0] : undefined;
  const userId = counterpart?.id;

  useEffect(() => {
    let mounted = true;
    if (userId == null) {
      setLocalAvatarUrlPath(null);
      return;
    }
    getUser(userId).then((user) => {
      if (mounted) setLocalAvatarUrlPath(user?.localAvatarUrlPath ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const handlePress = useCallback(() => onPress(chat), [onPress, chat]);
  const handleClear = useCallback(
    () => onClear(chat.id),
    [onClear, chat.id],
  );

  // Memoized so the swipeable sees a stable renderRightActions and doesn't
  // rebuild its action row on every parent render.
  const renderRightAction = useCallback(
    (progress: SharedValue<number>) => (
      <ClearAction progress={progress} onPress={handleClear} />
    ),
    [handleClear],
  );

  const username = conversationDisplayName(chat.name, chat.members);

  return (
    <ReanimatedSwipeable
      enableTrackpadTwoFingerGesture
      friction={2}
      rightThreshold={40}
      renderRightActions={renderRightAction}
    >
      <Pressable
        onPress={handlePress}
        className="w-full px-4 py-3 active:opacity-60"
      >
        <View className="flex-row items-center gap-3">
          <MemoizedAvatar
            username={username}
            avatarUrl={counterpart?.avatar}
            userId={userId}
            size={48}
            ringColor={colors.background}
            localAvatarUrlPath={localAvatarUrlPath}
          />

          <View className="flex-1">
            <Text
              numberOfLines={1}
              style={{ color: colors.text }}
              className="font-semibold text-base"
            >
              {username}
            </Text>

            {typing ? (
              <Text
                numberOfLines={1}
                style={{ color: BRAND_COLOR }}
                className="text-sm mt-0.5"
              >
                typing...
              </Text>
            ) : chat.lastMessage ? (
              <Text
                numberOfLines={1}
                style={{ color: subtleText }}
                className="text-sm mt-0.5"
              >
                {chat.lastMessage.text}
              </Text>
            ) : null}
          </View>

          <View className="items-end justify-around flex-1 gap-1">
            {(chat.unread ?? 0) > 0 ? (
              <View
                className="min-w-5 h-5 px-1.5 rounded-full items-center justify-center"
                style={{ backgroundColor: BRAND_COLOR }}
              >
                <Text className="text-white text-xs font-bold">
                  {(chat.unread ?? 0) > 5 ? "4+" : chat.unread}
                </Text>
              </View>
            ) : null}

            {chat.lastMessage ? (
              <Text style={{ color: subtleText }} className="text-xs">
                {formatTime(chat.lastMessage.sentAt)}
              </Text>
            ) : null}
          </View>
        </View>

        {showDivider ? (
          <View
            className="mt-3"
            style={{
              height: StyleSheet.hairlineWidth,
              backgroundColor: dividerColor,
            }}
          />
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
});

function ClearAction({
  progress,
  onPress,
}: {
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const opacity = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Reanimated.View style={[styles.clearActionWrap, opacity]}>
      <Pressable
        onPress={onPress}
        className="active:opacity-70"
        style={styles.clearAction}
      >
        <Feather name="trash-2" size={20} color="#fff" />
        <Text style={styles.clearActionText}>Clear</Text>
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  clearActionWrap: {
    alignSelf: "stretch",
    width: CLEAR_ACTION_WIDTH,
  },
  clearAction: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: CLEAR_ACTION_COLOR,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  clearActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
