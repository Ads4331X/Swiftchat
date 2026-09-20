import { Pressable, StyleSheet, Text, View } from "react-native";
import { memo } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { BRAND_COLOR } from "@/constants/theme";
import Avatar from "@/components/profile/Avatar";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

const CLEAR_ACTION_COLOR = "#E5484D";
const CLEAR_ACTION_WIDTH = 96;

type ChatCardProps = {
  username: string;
  avatarUrl?: string;
  userId?: number;
  lastMessage?: string;
  time?: string;
  unreadCount?: number;
  online?: boolean;
  typing?: boolean;
  onPress?: () => void;
  onClear?: () => void;
  showDivider?: boolean;
};

const MemoizedAvatar = memo(Avatar);

export default memo(function ChatCard({
  username,
  avatarUrl,
  userId,
  lastMessage,
  time,
  unreadCount = 0,
  online,
  typing,
  onPress,
  onClear,
  showDivider = true,
}: ChatCardProps) {
  const { colors, subtleText, dividerColor } = useTheme();

  function RightAction(prog: SharedValue<number>) {
    const opacity = useAnimatedStyle(() => ({ opacity: prog.value }));

    return (
      <Reanimated.View style={[styles.clearActionWrap, opacity]}>
        <Pressable
          onPress={onClear}
          style={({ pressed }) => [
            styles.clearAction,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="trash-2" size={20} color="#fff" />
          <Text style={styles.clearActionText}>Clear</Text>
        </Pressable>
      </Reanimated.View>
    );
  }

  return (
    <ReanimatedSwipeable
      enableTrackpadTwoFingerGesture
      friction={2}
      rightThreshold={40}
      renderRightActions={RightAction}
    >
      <Pressable
        onPress={onPress}
        className="w-full px-4 py-3 active:opacity-60"
      >
        <View className="flex-row items-center gap-3">
          <MemoizedAvatar
            username={username}
            avatarUrl={avatarUrl}
            userId={userId}
            isOnline={online}
            size={48}
            ringColor={colors.background}
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
            ) : lastMessage ? (
              <Text
                numberOfLines={1}
                style={{ color: subtleText }}
                className="text-sm mt-0.5"
              >
                {lastMessage}
              </Text>
            ) : null}
          </View>

          <View className="items-end gap-1">
            {time ? (
              <Text style={{ color: subtleText }} className="text-xs">
                {time}
              </Text>
            ) : null}

            {unreadCount > 0 ? (
              <View
                className="min-w-5 h-5 px-1.5 rounded-full items-center justify-center"
                style={{ backgroundColor: BRAND_COLOR }}
              >
                <Text className="text-white text-xs font-bold">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
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

const styles = StyleSheet.create({
  clearActionWrap: {
    height: "100%",
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
