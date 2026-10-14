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
import { CameraControls } from "@/components/camera/controls";
import { CameraPreview } from "@/components/camera/CameraPreview";
import { useCameraCapture } from "@/components/camera/useCameraCapture";
import { useCameraLenses } from "@/components/camera/useCameraLenses";
import type { CameraLensOption } from "@/components/camera/useCameraLenses";

const MAX_DISPLAY_ZOOM = 10;

// Screen light opacity: photo is brighter than video.
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

  // Flash and torch come from the main lens, so they work on any lens.
  const hasTorch = mainDevice?.hasTorch ?? false;
  const hasFlash = mainDevice?.hasFlash ?? false;

  // Flash / light
  const isFront = facing === "front";

  // Front camera always has a screen light.
  const hasScreenLight = isFront;

  const isScreenFlashEnabled =
    hasScreenLight && mode === "picture" && flashSetting === "on";

  const isScreenLightRecording =
    hasScreenLight && mode === "video" && isVideoLightOn && isRecording;

  const isFlashDisabled =
    !hasScreenLight && (mode === "video" ? !hasTorch : !hasFlash);

  // Capture
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

  // Zoom
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

  // Permissions
  useEffect(() => {
    if (!hasCameraPermission) {
      requestCameraPermission();
    }
  }, [hasCameraPermission, requestCameraPermission]);

  // Focus
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);

      return () => {
        setIsFocused(false);
      };
    }, []),
  );

  // Recording timer
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

  // Camera flip
  const toggleCameraFacing = useCallback(() => {
    if (isRecordingRef.current) return;

    setIsVideoLightOn(false);
    setFlashSetting("off");

    // Start again on the main lens.
    setActiveDevice(null);
    zoom.value = 1;

    setFacing((current) => (current === "back" ? "front" : "back"));
  }, [setActiveDevice, zoom]);

  // Flash / light / mode
  const handleFlashSetting = useCallback(() => {
    // While recording, toggle the light instead of the photo flash.
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

  // Cancel
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

  // Shutter
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

  if (!hasCameraPermission || device == null) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="text-sm font-medium text-white">
          Camera unavailable
        </Text>
      </View>
    );
  }

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

      {/* Front camera screen light: flash for photo, dim light while recording. */}
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
