import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { memo } from "react";
import { useTheme } from "@/constants/theme-provider";
import { BRAND_COLOR } from "@/constants/theme";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

const ONLINE_COLOR = "#25D366";

type ChatCardProps = {
  username: string;
  avatarUrl?: string;
  lastMessage?: string;
  time?: string;
  unreadCount?: number;
  online?: boolean;
  typing?: boolean;
  onPress?: () => void;
  onClear?: () => void;
  showDivider?: boolean;
};

function Avatar({
  username,
  avatarUrl,
  online,
  ringColor,
}: {
  username: string;
  avatarUrl?: string;
  online?: boolean;
  ringColor: string;
}) {
  const initial = username.charAt(0).toUpperCase();

  return (
    <View className="relative">
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} className="w-12 h-12 rounded-full" />
      ) : (
        <View
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ backgroundColor: BRAND_COLOR }}
        >
          <Text className="text-white text-lg font-bold">{initial}</Text>
        </View>
      )}

      {online && (
        <View
          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
          style={{ backgroundColor: ONLINE_COLOR, borderColor: ringColor }}
        />
      )}
    </View>
  );
}

const MemoizedAvatar = memo(Avatar);

export default memo(function ChatCard({
  username,
  avatarUrl,
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

  function RightAction(prog: SharedValue<number>, drag: SharedValue<number>) {
    const styleAnimation = useAnimatedStyle(() => {
      console.log("showRightProgress:", prog.value);
      console.log("appliedTranslation:", drag.value);

      return {
        transform: [{ translateX: drag.value + 60 }],
        backgroundColor: "red",
      };
    });

    return (
      <Reanimated.View style={styleAnimation} className="p-2 m-2">
        <Pressable
          className="flex-1 justify-center items-center  "
          onPress={onClear}
        >
          <Text style={{ color: colors.text }}>Clear Chat</Text>
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
            online={online}
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
