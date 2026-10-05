import { useCallback, useMemo, type RefObject } from "react";
import { View } from "react-native";
import { Camera } from "react-native-vision-camera";
import type {
  CameraDevice,
  CameraOutput,
  CameraRef,
} from "react-native-vision-camera";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const DOUBLE_TAP_MAX_DELAY_MS = 250;

type CameraPreviewProps = {
  cameraRef: RefObject<CameraRef | null>;
  device: CameraDevice;
  outputs: CameraOutput[];
  isActive: boolean;
  isSessionActive: boolean;
  hasTorch: boolean;
  torchOn: boolean;
  zoom: SharedValue<number>;
  minZoom: number;
  maxZoom: number;
  onToggleFacing: () => void;
  onSessionActiveChange: (isActive: boolean) => void;
};

export function CameraPreview({
  cameraRef,
  device,
  outputs,
  isActive,
  isSessionActive,
  hasTorch,
  torchOn,
  zoom,
  minZoom,
  maxZoom,
  onToggleFacing,
  onSessionActiveChange,
}: CameraPreviewProps) {
  /*
   * FOCUS
   */

  const focusX = useSharedValue(0);
  const focusY = useSharedValue(0);
  const focusScale = useSharedValue(1.4);
  const focusOpacity = useSharedValue(0);

  const focusStyle = useAnimatedStyle(() => ({
    opacity: focusOpacity.value,
    transform: [
      {
        translateX: focusX.value - 35,
      },
      {
        translateY: focusY.value - 35,
      },
      {
        scale: focusScale.value,
      },
    ],
  }));

  const focusAt = useCallback(
    (x: number, y: number) => {
      cameraRef.current?.focusTo({ x, y }).catch((error: any) => {
        if (
          String(error?.message).includes(
            "Cancelled by another startFocusAndMetering",
          )
        ) {
          return;
        }

        console.log("Focus error:", error);
      });
    },
    [cameraRef],
  );

  /*
   * SESSION
   */

  const handleSessionStarted = useCallback(() => {
    onSessionActiveChange(true);
  }, [onSessionActiveChange]);

  const handleSessionStopped = useCallback(() => {
    onSessionActiveChange(false);
  }, [onSessionActiveChange]);

  const handleCameraError = useCallback((error: Error) => {
    const message = error.message ?? "";

    if (
      message.includes("Camera is not active") ||
      message.includes("There is a new enableTorch being set") ||
      message.includes("Cancelled due to another zoom value")
    ) {
      return;
    }

    console.warn("Camera error:", error);
  }, []);

  /*
   * GESTURES
   */

  const pinchStartZoom = useSharedValue(1);

  const singleTapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd((event, success) => {
        if (!success) return;

        focusX.value = event.x;
        focusY.value = event.y;

        focusScale.value = 1.4;

        focusScale.value = withTiming(1, {
          duration: 200,
        });

        focusOpacity.value = withSequence(
          withTiming(1, {
            duration: 100,
          }),
          withDelay(
            700,
            withTiming(0, {
              duration: 200,
            }),
          ),
        );

        runOnJS(focusAt)(event.x, event.y);
      }),
    [focusAt, focusOpacity, focusScale, focusX, focusY],
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(DOUBLE_TAP_MAX_DELAY_MS)
        .onEnd((_event, success) => {
          if (!success) return;

          runOnJS(onToggleFacing)();
        }),
    [onToggleFacing],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          pinchStartZoom.value = zoom.value;
        })
        .onUpdate((event) => {
          const next = Math.min(
            maxZoom,
            Math.max(minZoom, pinchStartZoom.value * event.scale),
          );

          zoom.value = next;
        }),
    [maxZoom, minZoom, pinchStartZoom, zoom],
  );

  const taps = useMemo(
    () => Gesture.Exclusive(doubleTapGesture, singleTapGesture),
    [doubleTapGesture, singleTapGesture],
  );

  const gesture = useMemo(
    () => Gesture.Race(pinchGesture, taps),
    [pinchGesture, taps],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1 }}>
        <Camera
          ref={cameraRef}
          style={{ flex: 1 }}
          device={device}
          isActive={isActive}
          outputs={outputs}
          zoom={zoom}
          torchMode={
            isSessionActive && hasTorch ? (torchOn ? "on" : "off") : undefined
          }
          onStarted={handleSessionStarted}
          onStopped={handleSessionStopped}
          onError={handleCameraError}
          resizeMode="cover"
        />

        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              width: 70,
              height: 70,
              borderRadius: 35,
              borderWidth: 2,
              borderColor: "#fff",
            },
            focusStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}
