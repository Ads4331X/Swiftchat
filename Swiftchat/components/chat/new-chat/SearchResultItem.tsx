import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";

const BRAND_COLOR = "#29A195";

type SearchResultItemProps = {
  username: string;
  onPress: () => void;
  loading?: boolean;
};

export default function SearchResultItem({
  username,
  onPress,
  loading = false,
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
        <Feather name="message-circle" size={20} color={BRAND_COLOR} />
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
