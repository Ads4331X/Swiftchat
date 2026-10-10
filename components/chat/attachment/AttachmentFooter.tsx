import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import type { AttachmentColors } from "@/constants/theme";

export function AttachmentFooter({
  colors,
  left,
  timeText,
  showFavorite,
  isFavorite,
  onToggleFavorite,
}: {
  colors: AttachmentColors;
  left?: string;
  timeText?: string;
  showFavorite?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <View
      className="flex-row items-center justify-between gap-2 px-2.5 py-1.5"
      style={{ borderTopWidth: 1, borderTopColor: colors.dividerColor }}
    >
      {showFavorite ? (
        <Pressable
          onPress={onToggleFavorite}
          accessibilityRole="button"
          accessibilityLabel={
            isFavorite ? "Remove from favorites" : "Add to favorites"
          }
          hitSlop={6}
          className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
          style={({ pressed }) => ({
            backgroundColor: isFavorite
              ? "rgba(226,169,26,0.18)"
              : "rgba(127,127,127,0.14)",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather
            name="star"
            size={12}
            color={isFavorite ? "#E2A91A" : colors.labelColor}
          />
          <Text
            className="text-[11.5px] font-semibold"
            style={{ color: colors.labelColor }}
          >
            {isFavorite ? "Added" : "Add to Favorites"}
          </Text>
        </Pressable>
      ) : left ? (
        <Text className="text-[11.5px] font-medium" style={{ color: colors.labelColor }} numberOfLines={1}>
          {left}
        </Text>
      ) : (
        <View />
      )}
      {timeText ? (
        <Text className="text-[11px]" style={{ color: colors.labelColor }} numberOfLines={1}>
          {timeText}
        </Text>
      ) : (
        <View />
      )}
    </View>
  );
}