import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { BRAND_COLOR } from "@/constants/theme";

type SearchResultItemProps = {
  username: string;
  onPress: () => void;
  loading?: boolean;
  actionIcon?: React.ComponentProps<typeof Feather>["name"];
};

export default function SearchResultItem({
  username,
  onPress,
  loading = false,
  actionIcon = "message-circle",
}: SearchResultItemProps) {
  const { colors, dividerColor } = useTheme();
  const initial = username.charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className="flex-row items-center gap-3 py-3 active:opacity-60"
    >
      <View
        className="w-11 h-11 rounded-full items-center justify-center"
        style={{ backgroundColor: BRAND_COLOR }}
      >
        <Text className="text-white text-base font-bold">{initial}</Text>
      </View>

      <View className="flex-1">
        <Text style={{ color: colors.text }} className="font-medium text-base">
          {username}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={BRAND_COLOR} />
      ) : (
        <Feather name={actionIcon} size={20} color={BRAND_COLOR} />
      )}

      <View
        className="absolute bottom-0 right-0"
        style={{
          left: 56,
          height: StyleSheet.hairlineWidth,
          backgroundColor: dividerColor,
        }}
      />
    </Pressable>
  );
}
