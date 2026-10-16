import { useEffect, useRef } from "react";
import { View, Text, Image, Animated } from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";

export default function SplashScreen() {
  const { colors, isDark } = useTheme();

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: colors.background }}
    >
      <Animated.View
        style={{
          transform: [{ scale: pulseAnim }],
          alignItems: "center",
        }}
      >
        <Image
          className="w-72 h-72"
          source={require("@/assets/images/logo.png")}
          resizeMode="contain"
        />

        <Text
          className="text-sm font-medium tracking-widest mt-[-20px]"
          style={{
            color: isDark ? "#9BA1A6" : "#687076",
          }}
        >
          Fast · Secure · Private
        </Text>
      </Animated.View>
    </View>
  );
}
