import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";

type ResultActionButtonProps = {
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  label: string;
  onPress?: () => void;
};

export default function ResultActionButton({
  icon,
  color,
  label,
  onPress,
}: ResultActionButtonProps) {
  const { subtleText } = useTheme();

  return (
    <Pressable onPress={onPress} className="items-center gap-1 active:opacity-60">
      <View
        className="w-11 h-11 rounded-full items-center justify-center"
        style={{ backgroundColor: color }}
      >
        <Feather name={icon} size={20} color="#FFFFFF" />
      </View>
      <Text style={{ color: subtleText }} className="text-xs">
        {label}
      </Text>
    </Pressable>
  );
}
