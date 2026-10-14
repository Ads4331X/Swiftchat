import type { ComponentProps } from "react";
import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { AppPressable as Pressable } from "@/components/ui/AppPressable";
import { useTheme } from "@/constants/theme-provider";

type RoundIconButtonProps = {
  icon: ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
};

function RoundIconButton({
  icon,
  label,
  onPress,
  size = 22,
  color,
}: RoundIconButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.pillInactiveBg,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Feather name={icon} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}

type ReviewTopBarProps = {
  isVideo: boolean;
  onBack: () => void;
  onTrim: () => void;
};

export function ReviewTopBar({ isVideo, onBack, onTrim }: ReviewTopBarProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        height: 60,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <RoundIconButton icon="x" label="Close preview" onPress={onBack} />

      {/* Trim is videos only */}
      {isVideo ? (
        <RoundIconButton
          icon="scissors"
          label="Trim video"
          onPress={onTrim}
          size={18}
          color={colors.icon}
        />
      ) : (
        <View style={{ width: 40, height: 40 }} />
      )}
    </View>
  );
}
