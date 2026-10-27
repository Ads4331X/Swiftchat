import { useEffect, useMemo, useRef, useState } from "react";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import {
  Pressable,
  Platform,
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
import { createVideoTrackStream } from "../webrtc";

export default function CallScreenShareViewer({
  stream,
  sharerName,
  isLocal,
  onSingleTap,
}: {
  stream: MediaStream;
  sharerName: string;
  isLocal: boolean;
  onSingleTap?: () => void;
}) {
  const { width } = useWindowDimensions();
  const [isLarger, setIsLarger] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [orientationReady, setOrientationReady] = useState(
    Platform.OS === "web",
  );
  const previousOrientationLock = useRef<
    ScreenOrientation.OrientationLock | undefined
  >(undefined);
  const scale = useSharedValue(1);
  const initialScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const initialX = useSharedValue(0);
  const initialY = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);

  useEffect(() => {
    if (Platform.OS === "web") return;
    setIsLandscape(false);
    setOrientationReady(false);
    previousOrientationLock.current = undefined;

    let cancelled = false;
    const orientationSubscription =
      ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
        setIsLandscape(
          orientationInfo.orientation ===
            ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
            orientationInfo.orientation ===
              ScreenOrientation.Orientation.LANDSCAPE_RIGHT,
        );
      });

    void (async () => {
      try {
        const previousLock = await ScreenOrientation.getOrientationLockAsync();
        if (cancelled) return;
        previousOrientationLock.current = previousLock;
        setOrientationReady(true);
      } catch (error) {
        previousOrientationLock.current =
          ScreenOrientation.OrientationLock.PORTRAIT_UP;
        setOrientationReady(true);
        console.warn("Could not read screen orientation:", error);
      }
    })();

    return () => {
      cancelled = true;
      orientationSubscription.remove();
      const previousLock = previousOrientationLock.current;
      previousOrientationLock.current = undefined;
      if (previousLock !== undefined) {
        void ScreenOrientation.lockAsync(previousLock).catch((error: unknown) => {
          console.warn("Could not restore screen orientation:", error);
        });
      }
    };
  }, []);

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
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(10)
        .onEnd((_event, success) => {
          if (success) onSingleTap?.();
        }),
    [onSingleTap],
  );
  const gesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture, tapGesture),
    [panGesture, pinchGesture, tapGesture],
  );
  const videoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));
  const videoTracks = stream.getVideoTracks();
  const screenTrack = isLocal
    ? videoTracks[0]
    : videoTracks[videoTracks.length - 1];
  const screenStream = useMemo(
    () => (screenTrack ? createVideoTrackStream(screenTrack) : stream),
    [screenTrack, stream],
  );

  const resetZoom = () => {
    scale.value = 1;
    initialScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    initialX.value = 0;
    initialY.value = 0;
  };

  const toggleOrientation = async () => {
    if (Platform.OS === "web") return;
    const nextOrientation = isLandscape
      ? (previousOrientationLock.current ??
        ScreenOrientation.OrientationLock.PORTRAIT_UP)
      : ScreenOrientation.OrientationLock.LANDSCAPE;

    try {
      await ScreenOrientation.lockAsync(nextOrientation);
      setIsLandscape(!isLandscape);
      resetZoom();
    } catch (error) {
      console.warn("Could not rotate shared screen:", error);
    }
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
              stream={screenStream}
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
          {Platform.OS !== "web" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isLandscape ? "Return to previous orientation" : "Rotate to landscape"
              }
              onPress={() => void toggleOrientation()}
              disabled={!orientationReady}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>
                {isLandscape ? "Portrait" : "Rotate"}
              </Text>
            </Pressable>
          ) : null}
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
