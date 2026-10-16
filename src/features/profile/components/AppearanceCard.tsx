import { Text, View } from "react-native";
import { AppPressable as Pressable } from "@/shared/components/AppPressable";
import { useTheme } from "@/shared/providers/theme-provider";
import FontAwesome from "@expo/vector-icons/FontAwesome";

type Appearance = "light" | "dark" | "system";

export function AppearanceCard({
  appearanceName,
  active,
  onPress,
}: {
  appearanceName: Appearance;
  active: Appearance;
  onPress: () => void;
}) {
  const { colors, inputBg, subtleText } = useTheme();
  const selected = appearanceName === active;

  const labels = {
    light: "Light",
    dark: "Dark",
    system: "System",
  };

  const icons = {
    light: "sun-o",
    dark: "moon-o",
    system: "mobile",
  } as const;

  const descriptions = {
    light: "Always use light mode",
    dark: "Always use dark mode",
    system: "Match your device setting",
  } as const;

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-2 flex-row items-center gap-3 rounded-2xl px-4 py-4"
      style={({ pressed }) => ({
        backgroundColor: selected ? colors.tint + "18" : inputBg,
        borderWidth: 1,
        borderColor: selected ? colors.tint : "transparent",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: selected ? colors.tint + "18" : "rgba(41,161,149,0.15)",
        }}
      >
        <FontAwesome
          name={icons[appearanceName]}
          size={20}
          color={selected ? colors.tint : colors.icon}
        />
      </View>

      <View className="flex-1">
        <Text
          className="text-base font-semibold"
          style={{ color: colors.text }}
        >
          {labels[appearanceName]}
        </Text>
        <Text className="text-sm mt-0.5" style={{ color: subtleText }}>
          {descriptions[appearanceName]}
        </Text>
      </View>

      <FontAwesome
        name={selected ? "dot-circle-o" : "circle-o"}
        size={22}
        color={selected ? colors.tint : colors.icon}
      />
    </Pressable>
  );
}
