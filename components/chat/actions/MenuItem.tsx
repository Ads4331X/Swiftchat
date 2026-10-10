import Feather from "@expo/vector-icons/Feather";
import { Pressable, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { MENU_ROW_HEIGHT } from "./constants";

export function MenuItem({
  icon,
  label,
  color = "#fff",
  disabled,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.96, { damping: 20, stiffness: 400 });
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  };

  const itemColor = disabled ? "rgba(255,255,255,0.35)" : color;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 16,
            height: MENU_ROW_HEIGHT,
          },
          animatedStyle,
        ]}
      >
        <Feather name={icon} size={17} color={itemColor} />
        <Text style={{ color: itemColor, fontSize: 15 }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
