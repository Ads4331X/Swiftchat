import { View, Text } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/shared/providers/theme-provider";
import { BRAND_COLOR } from "@/shared/theme/theme";

type EmptyStateProps = {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  message?: string;
  iconSize?: number;
};

export default function EmptyState({
  icon = "message-circle",
  title,
  message,
  iconSize = 64,
}: EmptyStateProps) {
  const { colors, subtleText } = useTheme();

  return (
    <View className="flex-1 items-center justify-center px-8">
      <Feather name={icon} size={iconSize} color={BRAND_COLOR} style={{ opacity: 0.5 }} />
      <Text
        style={{ color: colors.text }}
        className="text-xl font-semibold text-center mt-4"
      >
        {title}
      </Text>
      {message && (
        <Text
          style={{ color: subtleText }}
          className="text-sm text-center mt-2 leading-5"
        >
          {message}
        </Text>
      )}
    </View>
  );
}
