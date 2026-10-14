import { Feather } from "@expo/vector-icons";
import { AppPressable as Pressable } from "@/components/ui/AppPressable";

export function CircularControl({
  onPress,
  accessibilityLabel,
  children,
  size = 52,
  tone,
}: {
  onPress?: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  size?: number;
  tone?: "light" | "dark";
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      className="items-center justify-center"
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor:
          tone === "dark" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.92)",
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {children}
    </Pressable>
  );
}

export function PlayIcon({
  name,
  color,
  size = 22,
}: {
  name: "play" | "download";
  color: string;
  size?: number;
}) {
  return (
    <Feather
      name={name}
      size={size}
      color={color}
      style={name === "play" ? { marginLeft: 3 } : undefined}
    />
  );
}