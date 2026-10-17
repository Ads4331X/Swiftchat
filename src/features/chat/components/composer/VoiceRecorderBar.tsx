import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Feather from "@expo/vector-icons/Feather";

import { BRAND_COLOR } from "@/shared/theme/theme";
import { useTheme } from "@/shared/providers/theme-provider";

type VoiceRecorderBarProps = {
  onCancel: () => void;
  onStop: () => void;
};

const CANCEL_THRESHOLD = 100;
const MAX_DRAG = CANCEL_THRESHOLD + 40;
const MAX_SECONDS = 5 * 60;

function formatTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorderBar({ onCancel, onStop }: VoiceRecorderBarProps) {
  const { colors, subtleText, dividerColor, inputBg } = useTheme();
  const [seconds, setSeconds] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (seconds >= MAX_SECONDS) onStopRef.current();
  }, [seconds]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.2,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const springBack = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dx < -6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        translateX.setValue(Math.max(Math.min(g.dx, 0), -MAX_DRAG));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -CANCEL_THRESHOLD) onCancelRef.current();
        else springBack();
      },
      onPanResponderTerminate: springBack,
    }),
  ).current;

  const hintOpacity = translateX.interpolate({
    inputRange: [-60, 0],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const hintShift = translateX.interpolate({
    inputRange: [-MAX_DRAG, 0],
    outputRange: [-40, 0],
    extrapolate: "clamp",
  });

  return (
    <View
      className="w-full flex-row items-center gap-2 px-3 py-2"
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: dividerColor,
        backgroundColor: colors.background,
        paddingBottom: 8,
      }}
      {...pan.panHandlers}
    >
      <Pressable
        hitSlop={8}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel recording"
      >
        <Feather name="trash-2" size={22} color={subtleText} />
      </Pressable>

      {/* Pill */}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 40,
          paddingHorizontal: 12,
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: inputBg,
        }}
      >
        {/* Left: dot + timer */}
        <View
          style={{ flexDirection: "row", alignItems: "center", flexShrink: 0 }}
        >
          <Animated.View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              marginRight: 8,
              backgroundColor: "#EF4444",
              opacity: pulse,
            }}
          />
          <Text
            style={{
              color: colors.text,
              fontSize: 15,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatTime(seconds)}
          </Text>
        </View>

        {/* Right: hint */}
        <Animated.View
          style={{
            flexShrink: 1,
            marginLeft: 12,
            opacity: hintOpacity,
            transform: [{ translateX: hintShift }],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Feather name="chevron-left" size={16} color={subtleText} />
            <Text
              numberOfLines={1}
              style={{
                color: subtleText,
                fontSize: 13,
                marginLeft: 2,
                flexShrink: 1,
              }}
            >
              Slide to cancel
            </Text>
          </View>
        </Animated.View>
      </View>

      <Pressable
        onPress={onStop}
        accessibilityRole="button"
        accessibilityLabel="Send voice message"
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: BRAND_COLOR }}
      >
        <Feather name="mic" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}
