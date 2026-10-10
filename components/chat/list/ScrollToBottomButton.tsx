import { Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";

export function ScrollToBottomButton({ onPress }: { onPress: () => void }) {
  const { colors, inputBg } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        position: "absolute",
        bottom: 16,
        alignSelf: "center",
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: inputBg,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      <Feather name="chevron-down" size={20} color={colors.text} />
    </Pressable>
  );
}
