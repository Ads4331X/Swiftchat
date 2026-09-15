import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useTheme } from "@/constants/theme-provider";

function SkeletonBar({
  width,
  height,
  borderRadius,
  color,
  align = "left",
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius: number;
  color: string;
  align?: "left" | "right";
}) {
  return (
    <View style={{ width: "100%", alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <View
        style={{
          width,
          height,
          borderRadius,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export default function MessageSkeleton() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  const color = colors.skeletonBg;

  return (
    <View className="flex-1 px-4 py-3" style={{ gap: 22 }}>
      <Animated.View style={{ gap: 22, opacity }}>
        {/* Group of incoming messages */}
        <View style={{ gap: 6, width: "75%" }}>
          <SkeletonBar width={110} height={12} borderRadius={6} color={color} />
          <SkeletonBar width={160} height={44} borderRadius={16} color={color} />
          <SkeletonBar width={120} height={44} borderRadius={16} color={color} />
        </View>

        {/* Own message */}
        <SkeletonBar width="55%" height={48} borderRadius={16} color={color} align="right" />

        {/* Incoming with avatar */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: color,
            }}
          />
          <View style={{ gap: 6, flex: 1 }}>
            <SkeletonBar width={90} height={10} borderRadius={5} color={color} />
            <SkeletonBar width={170} height={40} borderRadius={16} color={color} />
          </View>
        </View>

        {/* Own message - wider */}
        <SkeletonBar width="70%" height={56} borderRadius={16} color={color} align="right" />

        {/* Incoming */}
        <View style={{ gap: 6, width: "65%" }}>
          <SkeletonBar width={140} height={44} borderRadius={16} color={color} />
          <SkeletonBar width={70} height={10} borderRadius={5} color={color} />
        </View>
      </Animated.View>
    </View>
  );
}