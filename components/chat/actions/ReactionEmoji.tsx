import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { REACTION_SIZE } from "./constants";

export function ReactionEmoji({
  emoji,
  scaleValue,
  onPress,
}: {
  emoji: string;
  scaleValue: SharedValue<number>;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: REACTION_SIZE,
        height: REACTION_SIZE,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: REACTION_SIZE / 2,
        zIndex: 30,
      }}
    >
      <Animated.Text style={[{ fontSize: 26 }, animatedStyle]}>
        {emoji}
      </Animated.Text>
    </Pressable>
  );
}
