import { View } from "react-native";
import { useTheme } from "@/constants/theme-provider";

export function TypingIndicator({
  size = 6,
  color,
}: {
  size?: number;
  color?: string;
}) {
  const { subtleText } = useTheme();
  const dotColor = color ?? subtleText;

  return (
    <View className="flex-row items-center" style={{ gap: size * 0.5 }}>
      <View
        className="rounded-full animate-bounce"
        style={{ width: size, height: size, backgroundColor: dotColor }}
      />
      <View
        className="rounded-full animate-bounce"
        style={{
          width: size,
          height: size,
          backgroundColor: dotColor,
          opacity: 0.6,
          animationDelay: "0.15s",
        }}
      />
      <View
        className="rounded-full animate-bounce"
        style={{
          width: size,
          height: size,
          backgroundColor: dotColor,
          opacity: 0.35,
          animationDelay: "0.3s",
        }}
      />
    </View>
  );
}
