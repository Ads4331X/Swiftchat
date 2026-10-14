import { Animated, Dimensions, StyleSheet, View } from "react-native";
import { useTheme } from "@/constants/theme-provider";
import { useEffect, useRef } from "react";

function SkeletonRow({
  opacity,
  boxColor,
}: {
  opacity: Animated.Value;
  boxColor: string;
}) {
  return (
    <Animated.View style={[styles.row, { opacity }]}>
      <View
        style={{ backgroundColor: boxColor }}
        className="w-12 h-12 rounded-full"
      />
      <View className="flex-1 gap-2">
        <View
          style={{ backgroundColor: boxColor }}
          className="h-4 w-1/2 rounded"
        />
        <View
          style={{ backgroundColor: boxColor }}
          className="h-3 w-3/4 rounded"
        />
      </View>
    </Animated.View>
  );
}

export default function SkeletonLoader() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  const boxColor = colors.skeletonBg;

  // roughly estimate how many rows fill the screen (each row ~76px tall including margin)
  const screenHeight = Dimensions.get("window").height;
  const rowCount = Math.ceil(screenHeight / 76);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <View className="w-full">
      {Array.from({ length: rowCount }).map((_, index) => (
        <SkeletonRow key={index} opacity={opacity} boxColor={boxColor} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    width: "100%",
    marginBottom: 8,
  },
});
