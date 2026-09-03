import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";

type NewChatSheetHeaderProps = {
  onClose: () => void;
  title?: string;
};

export default function NewChatSheetHeader({
  onClose,
  title = "New Chat",
}: NewChatSheetHeaderProps) {
  const colors = useTheme().colors;

  return (
    <View className="flex-row items-center px-4 pt-4 pb-2">
      <Pressable
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Feather name="arrow-left" size={24} color={colors.text} />
      </Pressable>
      <Text
        style={{ color: colors.text }}
        className="flex-1 text-center text-lg font-semibold"
      >
        {title}
      </Text>
      <View className="w-6" />
    </View>
  );
}
