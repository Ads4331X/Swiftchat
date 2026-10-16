import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/shared/providers/theme-provider";

export function EditBanner({ onCancel }: { onCancel: () => void }) {
  const { inputBg, subtleText, dividerColor } = useTheme();

  return (
    <View
      className="flex-row items-center justify-between px-4 py-2"
      style={{
        backgroundColor: inputBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: dividerColor,
      }}
    >
      <Text style={{ color: subtleText }} className="text-sm flex-1">
        Editing message
      </Text>
      <Pressable onPress={onCancel}>
        <Feather name="x" size={18} color={subtleText} />
      </Pressable>
    </View>
  );
}
