import { Pressable, Text, View } from "react-native";
import { CameraView, useMicrophonePermissions } from "expo-camera";
import type { CameraMode, CameraType } from "expo-camera";
import { useRef, useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue, runOnJS } from "react-native-reanimated";
import { compressImage, compressVideo } from "@/lib/utils";
import { File } from "expo-file-system";
import * as VideoThumbnails from "expo-video-thumbnails";

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [facing, setFacing] = useState<CameraType>("back");
  const [mode, setMode] = useState<CameraMode>("picture");

  const [flashSetting, setFlashSetting] = useState<"off" | "on" | "auto">(
    "off",
  );

  const [torch, setTorch] = useState(false);

  const [microphonePermission, requestMicrophonePermission] =
    useMicrophonePermissions();

  const [zoom, setZoom] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const zoomSV = useSharedValue(0);
  const prevScaleSV = useSharedValue(1);
  const lastSentSV = useSharedValue(0);

  function toggleCameraFacing() {
    if (isRecording) return;

    setFacing((current) => (current === "back" ? "front" : "back"));
  }

  const handleStartRecording = async () => {
    if (isRecording) return;

    if (!microphonePermission?.granted) {
      const result = await requestMicrophonePermission();

      if (!result.granted) return;
    }

    setIsRecording(true);

    try {
      const video = await cameraRef.current?.recordAsync();

      if (!video) return;

      setIsRecording(false);
      setTorch(false);

      // gets the width and height of the video
      const { width, height } = await VideoThumbnails.getThumbnailAsync(
        video.uri,
        {
          time: 0,
        },
      );

      const file = new File(video.uri);

      const compressVid = await compressVideo({
        uri: video.uri,
        width,
        height,
        size: file.size,
        mimeType: file.type,
      });

      if (compressVid) {
        router.push({
          pathname: "/AttachmentReview",
          params: {
            uri: compressVid.uri,
            width: compressVid.width,
            height: compressVid.height,
            size: compressVid.compressedSize,
            quality: compressVid.quality,
            type: "video",
          },
        });
      }
    } catch (error) {
      console.log("Video recording error:", error);
    } finally {
      setIsRecording(false);
      setTorch(false);
    }
  };

  const handleStopRecording = () => {
    if (!isRecording) return;

    cameraRef.current?.stopRecording();
  };

  const handleCancel = () => {
    if (isRecording) {
      cameraRef.current?.stopRecording();
      return;
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate("/");
    }
  };

  const handleFlashSetting = () => {
    if (mode === "video") {
      setTorch((current) => !current);
      return;
    }

    setFlashSetting((current) =>
      current === "off" ? "on" : current === "on" ? "auto" : "off",
    );
  };

  const handleClickPhoto = async () => {
    if (isRecording) return;

    setMode("picture");

    const image = await cameraRef.current?.takePictureAsync();

    if (image) {
      const compressImg = await compressImage({
        width: image.width,
        height: image.height,
        size: new File(image.uri).size,
        uri: image.uri,
      });

      if (compressImg) {
        router.push({
          pathname: "/AttachmentReview",
          params: {
            uri: compressImg.uri,
            width: compressImg.width,
            height: compressImg.height,
            size: compressImg.compressedSize,
            quality: compressImg.quality,
            type: "image",
          },
        });
      }
    }
  };

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      prevScaleSV.value = zoomSV.value;
    })
    .onUpdate((event) => {
      const MAX_ZOOM_FACTOR = 10;

      const startVisualScale = 1 + prevScaleSV.value * (MAX_ZOOM_FACTOR - 1);

      const currentVisualScale = startVisualScale * event.scale;

      const newZoom = (currentVisualScale - 1) / (MAX_ZOOM_FACTOR - 1);

      zoomSV.value = Math.min(1, Math.max(0, newZoom));

      if (Math.abs(zoomSV.value - lastSentSV.value) > 0.001) {
        lastSentSV.value = zoomSV.value;
        runOnJS(setZoom)(zoomSV.value);
      }
    });

  const DEAD_ZONE = 0.17;

  const cameraZoom = zoom === 0 ? 0 : DEAD_ZONE + zoom * (1 - DEAD_ZONE);

  const handleShutter = () => {
    if (isRecording) {
      handleStopRecording();
      return;
    }

    if (mode === "video") {
      handleStartRecording();
    } else {
      handleClickPhoto();
    }
  };

  return (
    <View className="flex-1 bg-black">
      <GestureDetector gesture={pinchGesture}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          enableTorch={mode === "video" && torch}
          flash={flashSetting}
          facing={facing}
          mode={mode}
          zoom={cameraZoom}
        />
      </GestureDetector>

      {/* Recording indicator */}
      {isRecording && (
        <View
          className="absolute left-0 right-0 items-center"
          style={{ top: insets.top + 20 }}
        >
          <View className="flex-row items-center rounded-full bg-black/60 px-4 py-2">
            <View className="mr-2 h-2.5 w-2.5 rounded-full bg-red-500" />

            <Text className="text-sm font-semibold text-white">REC</Text>
          </View>
        </View>
      )}

      {/* Top overlay */}
      <LinearGradient
        colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0)"]}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          paddingBottom: 40,
        }}
      >
        <Pressable
          onPress={handleCancel}
          hitSlop={12}
          className="h-12 w-12 items-center justify-center rounded-full"
          style={({ pressed }) => ({
            backgroundColor: "rgba(0,0,0,0.45)",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        <View className="flex-row gap-3">
          {/* Flash / Torch */}
          <Pressable
            hitSlop={12}
            className="h-12 w-12 items-center justify-center rounded-full"
            style={({ pressed }) => ({
              backgroundColor: "rgba(0,0,0,0.45)",
              opacity: pressed ? 0.6 : 1,
            })}
            onPress={handleFlashSetting}
          >
            <View className="relative">
              <Ionicons
                name={
                  mode === "video"
                    ? torch
                      ? "flashlight"
                      : "flashlight-outline"
                    : flashSetting === "off"
                      ? "flash-off-outline"
                      : flashSetting === "on"
                        ? "flash"
                        : "flash-outline"
                }
                size={26}
                color="#fff"
              />

              {mode === "picture" && flashSetting === "auto" && (
                <Text className="absolute -bottom-1 -right-1 text-[9px] font-bold text-white">
                  A
                </Text>
              )}
            </View>
          </Pressable>

          {/* Flip camera */}
          <Pressable
            onPress={toggleCameraFacing}
            disabled={isRecording}
            hitSlop={12}
            className="h-12 w-12 items-center justify-center rounded-full"
            style={({ pressed }) => ({
              backgroundColor: "rgba(0,0,0,0.45)",
              opacity: pressed || isRecording ? 0.4 : 1,
            })}
          >
            <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>

      {/* Bottom controls */}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          alignItems: "center",
          paddingTop: 50,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {/* PHOTO / VIDEO */}
        {!isRecording && (
          <View className="mb-6 flex-row rounded-full bg-black/40 p-1">
            <Pressable
              onPress={() => {
                setTorch(false);
                setMode("picture");
              }}
              className={`rounded-full px-5 py-2 ${
                mode === "picture" ? "bg-white" : ""
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  mode === "picture" ? "text-black" : "text-white"
                }`}
              >
                PHOTO
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setFlashSetting("off");
                setMode("video");
              }}
              className={`rounded-full px-5 py-2 ${
                mode === "video" ? "bg-white" : ""
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  mode === "video" ? "text-black" : "text-white"
                }`}
              >
                VIDEO
              </Text>
            </Pressable>
          </View>
        )}

        {/* Shutter */}
        <Pressable
          onPress={handleShutter}
          disabled={false}
          className="h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-white"
        >
          <View
            className={
              isRecording
                ? "h-[52px] w-[52px] rounded-[14px] bg-red-500"
                : mode === "video"
                  ? "h-[66px] w-[66px] rounded-full bg-red-500"
                  : "h-[66px] w-[66px] rounded-full bg-white"
            }
          />
        </Pressable>
      </LinearGradient>
    </View>
  );
}
