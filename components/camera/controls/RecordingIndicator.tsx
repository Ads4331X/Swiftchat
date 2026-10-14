import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatRecordingTime } from "./utils";

/** Blinking red dot shown while recording. */
function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.dot, { opacity }]} />
  );
}

export function RecordingIndicator({
  recordingTime,
}: {
  recordingTime: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="none"
      className="absolute left-0 right-0 z-10 items-center"
      style={{ top: insets.top + 12 }}
    >
      <View className="flex-row items-center rounded-full bg-black/60 px-4 py-2">
        <RecordingDot />
        <Text
          className="text-sm font-semibold text-white"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          REC {formatRecordingTime(recordingTime)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    marginRight: 8,
    height: 10,
    width: 10,
    borderRadius: 9999,
    backgroundColor: "#ef4444",
  },
});
