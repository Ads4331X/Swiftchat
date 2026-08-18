import { View } from "react-native";
import { useTheme } from "@/constants/theme-provider";
export function TypingIndicator() {
  const colors = useTheme().colors;
  return (
    <View
      className="flex-row items-center space-x-1.5 px-4 py-3 rounded-2xl self-start"
      style={{ backgroundColor: colors.background }}
    >
      <View className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
      <View className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
      <View className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]" />
    </View>
  );
}
