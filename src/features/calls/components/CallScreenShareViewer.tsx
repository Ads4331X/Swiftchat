import { useMemo, useState } from "react";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import type { MediaStream } from "react-native-webrtc";

import CallVideo from "./CallVideo";

export default function CallScreenShareViewer({
  stream,
  sharerName,
  isLocal,
}: {
  stream: MediaStream;
  sharerName: string;
  isLocal: boolean;
}) {
  const { width } = useWindowDimensions();
  const [isLarger, setIsLarger] = useState(false);
  const scale = useSharedValue(1);
  const initialScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const initialX = useSharedValue(0);
  const initialY = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          initialScale.value = scale.value;
        })
        .onUpdate((event) => {
          scale.value = Math.max(1, Math.min(5, initialScale.value * event.scale));
          if (scale.value === 1) {
            translateX.value = 0;
            translateY.value = 0;
          }
        }),
    [initialScale, scale, translateX, translateY],
  );
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          initialX.value = translateX.value;
          initialY.value = translateY.value;
        })
        .onUpdate((event) => {
          if (scale.value <= 1) return;
          const maxX = (viewportWidth.value * (scale.value - 1)) / 2;
          const maxY = (viewportHeight.value * (scale.value - 1)) / 2;
          translateX.value = Math.max(
            -maxX,
            Math.min(maxX, initialX.value + event.translationX),
          );
          translateY.value = Math.max(
            -maxY,
            Math.min(maxY, initialY.value + event.translationY),
          );
        }),
    [
      initialX,
      initialY,
      scale,
      translateX,
      translateY,
      viewportHeight,
      viewportWidth,
    ],
  );
  const gesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [panGesture, pinchGesture],
  );
  const videoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const resetZoom = () => {
    scale.value = 1;
    initialScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    initialX.value = 0;
    initialY.value = 0;
  };

  return (
    <View
      style={[
        styles.container,
        width >= 900 && !isLarger ? styles.bounded : styles.expanded,
      ]}
    >
      <GestureDetector gesture={gesture}>
        <View
          style={styles.viewport}
          onLayout={(event) => {
            viewportWidth.value = event.nativeEvent.layout.width;
            viewportHeight.value = event.nativeEvent.layout.height;
          }}
        >
          <Animated.View style={[StyleSheet.absoluteFill, videoStyle]}>
            <CallVideo
              stream={stream}
              muted={isLocal}
              objectFit="contain"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </GestureDetector>
      <View pointerEvents="box-none" style={styles.toolbar}>
        <View style={styles.sharerBadge}>
          <View style={styles.sharingDot} />
          <Text numberOfLines={1} style={styles.sharerName}>
            {isLocal ? "You are sharing" : `${sharerName} is sharing`}
          </Text>
        </View>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fit shared screen to screen"
            onPress={resetZoom}
            style={styles.toolbarButton}
          >
            <Text style={styles.toolbarButtonText}>Fit</Text>
          </Pressable>
          {width >= 900 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isLarger ? "Use a centered shared screen" : "Enlarge shared screen"
              }
              onPress={() => setIsLarger((larger) => !larger)}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>
                {isLarger ? "Centered" : "Enlarge"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    flex: 1,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  bounded: {
    maxWidth: 1280,
  },
  expanded: {
    maxWidth: "100%",
  },
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 8,
    position: "absolute",
    right: 8,
    top: 8,
  },
  sharerBadge: {
    alignItems: "center",
    backgroundColor: "rgba(10, 15, 18, 0.82)",
    borderRadius: 18,
    flexDirection: "row",
    gap: 7,
    maxWidth: "65%",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sharingDot: {
    backgroundColor: "#22C55E",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  sharerName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  buttons: {
    flexDirection: "row",
    gap: 6,
  },
  toolbarButton: {
    backgroundColor: "rgba(10, 15, 18, 0.82)",
    borderRadius: 18,
    minWidth: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolbarButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
