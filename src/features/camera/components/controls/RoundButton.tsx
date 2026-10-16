import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AppPressable as Pressable } from "@/shared/components/AppPressable";

type RoundButtonProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  label: string;
  disabled?: boolean;
  iconSize?: number;
};

/** Round translucent icon button for the camera top bar. */
export function RoundButton({
  icon,
  onPress,
  label,
  disabled,
  iconSize = 26,
}: RoundButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className="h-12 w-12 items-center justify-center rounded-full bg-black/45"
      style={({ pressed }) => ({
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}
    >
      <Ionicons name={icon} size={iconSize} color="#fff" />
    </Pressable>
  );
}
