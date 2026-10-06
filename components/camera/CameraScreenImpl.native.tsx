import { Text, View } from "react-native";
import {
  useCameraPermission,
  useMicrophonePermission,
} from "react-native-vision-camera";
import type { CameraRef, Recorder } from "react-native-vision-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useSharedValue } from "react-native-reanimated";
import { MAX_VIDEO_DURATION_SECONDS } from "@/lib/Attachments";
import { CameraControls } from "@/components/camera/CameraControls";
import { CameraPreview } from "@/components/camera/CameraPreview";
import { useCameraCapture } from "@/components/camera/useCameraCapture";
import { useCameraLenses } from "@/components/camera/useCameraLenses";
import type { CameraLensOption } from "@/components/camera/useCameraLenses";

const MAX_DISPLAY_ZOOM = 10;

/**
 * Opacity of the front camera screen light. The photo flash is a bit brighter
 * than the video light, and both stay dim enough to not wash out the preview or
 * hide the controls.
 */
const SCREEN_FLASH_OPACITY = 0.35;
const SCREEN_LIGHT_OPACITY = 0.25;

export default function CameraScreen() {
  const recorderRef = useRef<Recorder | null>(null);
  const cameraRef = useRef<CameraRef>(null);
  const isRecordingRef = useRef(false);

  const [facing, setFacing] = useState<"back" | "front">("back");

  const {
    activeDevice: device,
    mainDevice,
    zoomOptions,
    setActiveDevice,
  } = useCameraLenses(facing);

  const [mode, setMode] = useState<"picture" | "video">("picture");
  const [flashSetting, setFlashSetting] = useState<"off" | "on">("off");

  const [isVideoLightOn, setIsVideoLightOn] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isScreenFlashVisible, setIsScreenFlashVisible] = useState(false);

  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
  } = useCameraPermission();

  const {
    hasPermission: hasMicrophonePermission,
    requestPermission: requestMicrophonePermission,
  } = useMicrophonePermission();

  // The flash and the torch are part of the main lens module, so they stay
  // available even while another lens (e.g. the ultra-wide one) is active.
  const hasTorch = mainDevice?.hasTorch ?? false;
  const hasFlash = mainDevice?.hasFlash ?? false;

  /*
   * FLASH / LIGHT
   *
   * The rear camera lights photos up with the hardware flash and videos with the
   * hardware torch. The front camera has neither, so it lights up with a white
   * screen overlay instead. Everything is a simple `off / on` toggle.
   */

  const isFront = facing === "front";

  // The screen light is always available on the front camera, no matter what
  // `hasFlash` and `hasTorch` report for that device.
  const hasScreenLight = isFront;

  const isScreenFlashEnabled =
    hasScreenLight && mode === "picture" && flashSetting === "on";

  const isScreenLightRecording =
    hasScreenLight && mode === "video" && isVideoLightOn && isRecording;

  const isFlashDisabled =
    !hasScreenLight && (mode === "video" ? !hasTorch : !hasFlash);

  /*
   * CAPTURE
   */

  const {
    outputs,
    handleClickPhoto,
    handleStartRecording,
    handleStopRecording,
  } = useCameraCapture({
    mode,
    flashSetting,
    hasFlash,
    screenFlashEnabled: isScreenFlashEnabled,
    onScreenFlashChange: setIsScreenFlashVisible,
    isRecording,
    setIsRecording,
    setIsVideoLightOn,
    hasMicrophonePermission,
    requestMicrophonePermission,
    recorderRef,
  });

  /*
   * ZOOM
   *
   * The zoom steps are resolved from the physical lenses of the camera, see
   * `useCameraLenses`. Picking a step may activate another lens (e.g. `0.5x`
   * activates the ultra-wide one) before the zoom is applied to it.
   */

  const zoom = useSharedValue(1);

  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(
    device?.maxZoom ?? MAX_DISPLAY_ZOOM,
    MAX_DISPLAY_ZOOM,
  );

  useEffect(() => {
    if (!device) return;

    const current = zoom.value;

    zoom.value = Math.min(device.maxZoom, Math.max(device.minZoom, current));
  }, [device, zoom]);

  const handleZoomChange = useCallback(
    (option: CameraLensOption) => {
      if (isRecordingRef.current) return;

      if (option.device.id !== device?.id) {
        setActiveDevice(option.device);
      }

      zoom.value = Math.min(
        option.device.maxZoom,
        Math.max(option.device.minZoom, option.zoom),
      );
    },
    [device?.id, setActiveDevice, zoom],
  );

  /*
   * PERMISSIONS
   */

  useEffect(() => {
    if (!hasCameraPermission) {
      requestCameraPermission();
    }
  }, [hasCameraPermission, requestCameraPermission]);

  /*
   * FOCUS / SCREEN
   */

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);

      return () => {
        setIsFocused(false);
      };
    }, []),
  );

  /*
   * RECORDING TIMER
   */

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) {
      setRecordingTime(0);
      return;
    }

    const timer = setInterval(() => {
      setRecordingTime((current) => {
        if (current >= MAX_VIDEO_DURATION_SECONDS - 1) {
          recorderRef.current?.stopRecording();
          return MAX_VIDEO_DURATION_SECONDS;
        }

        return current + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecording]);

  /*
   * CAMERA FLIP
   */

  const toggleCameraFacing = useCallback(() => {
    if (isRecordingRef.current) return;

    setIsVideoLightOn(false);
    setFlashSetting("off");

    // Always start again on the main lens of the camera we flip to.
    setActiveDevice(null);
    zoom.value = 1;

    setFacing((current) => (current === "back" ? "front" : "back"));
  }, [setActiveDevice, zoom]);

  /*
   * FLASH / LIGHT / MODE
   */

  const handleFlashSetting = useCallback(() => {
    // While recording, the button toggles the light: the hardware torch on the
    // rear camera and the screen light on the front camera.
    if (mode === "video") {
      setIsVideoLightOn((current) => !current);
      return;
    }

    setFlashSetting((current) => (current === "off" ? "on" : "off"));
  }, [mode]);

  const handleModeChange = useCallback((nextMode: "picture" | "video") => {
    setIsVideoLightOn(false);

    setMode(nextMode);
  }, []);

  /*
   * CANCEL
   */

  const handleCancel = useCallback(() => {
    if (isRecording) {
      recorderRef.current?.stopRecording();
      return;
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate("/");
    }
  }, [isRecording]);

  /*
   * SHUTTER
   */

  const handleShutter = useCallback(() => {
    if (isRecording) {
      handleStopRecording();
      return;
    }

    if (mode === "video") {
      handleStartRecording();
      return;
    }

    handleClickPhoto();
  }, [
    handleClickPhoto,
    handleStartRecording,
    handleStopRecording,
    isRecording,
    mode,
  ]);

  const handleSessionActiveChange = useCallback((active: boolean) => {
    setIsSessionActive(active);
  }, []);

  /*
   * CAMERA UNAVAILABLE
   */

  if (!hasCameraPermission || device == null) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="text-sm font-medium text-white">
          Camera unavailable
        </Text>
      </View>
    );
  }

  /*
   * UI
   */

  return (
    <View className="flex-1 bg-black">
      <CameraPreview
        cameraRef={cameraRef}
        device={device}
        outputs={outputs}
        isActive={isFocused}
        isSessionActive={isSessionActive}
        hasTorch={hasTorch}
        torchOn={hasTorch && mode === "video" && isVideoLightOn}
        zoom={zoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        onToggleFacing={toggleCameraFacing}
        onSessionActiveChange={handleSessionActiveChange}
      />

      <CameraControls
        mode={mode}
        flashSetting={flashSetting}
        isVideoLightOn={isVideoLightOn}
        isFlashDisabled={isFlashDisabled}
        isRecording={isRecording}
        recordingTime={recordingTime}
        zoomOptions={zoomOptions}
        onZoomChange={handleZoomChange}
        onModeChange={handleModeChange}
        onToggleFlash={handleFlashSetting}
        onToggleFacing={toggleCameraFacing}
        onCancel={handleCancel}
        onShutter={handleShutter}
      />

      {/*
        Screen light of the front camera, which has two separate behaviours:
        - photo: a short, brighter flash while the picture is taken
        - video: a dimmer light for the whole recording
        Both disappear as soon as their moment is over.
      */}

      {(isScreenFlashVisible || isScreenLightRecording) && (
        <View
          pointerEvents="none"
          className="absolute bottom-0 left-0 right-0 top-0 bg-white"
          style={{
            opacity: isScreenFlashVisible
              ? SCREEN_FLASH_OPACITY
              : SCREEN_LIGHT_OPACITY,
          }}
        />
      )}
    </View>
  );
}
