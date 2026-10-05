import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CameraLensOption } from "./useCameraLenses";

const zoomLabel = (value: number) => `${value}x`;

type CameraControlsProps = {
  mode: "picture" | "video";
  flashSetting: "off" | "on";
  isVideoLightOn: boolean;
  isFlashDisabled: boolean;
  isRecording: boolean;
  recordingTime: number;
  zoomOptions: CameraLensOption[];
  onZoomChange: (option: CameraLensOption) => void;
  onModeChange: (mode: "picture" | "video") => void;
  onToggleFlash: () => void;
  onToggleFacing: () => void;
  onCancel: () => void;
  onShutter: () => void;
};

export function CameraControls({
  mode,
  flashSetting,
  isVideoLightOn,
  isFlashDisabled,
  isRecording,
  recordingTime,
  zoomOptions,
  onZoomChange,
  onModeChange,
  onToggleFlash,
  onToggleFacing,
  onCancel,
  onShutter,
}: CameraControlsProps) {
  const insets = useSafeAreaInsets();

  const minutes = Math.floor(recordingTime / 60);
  const seconds = recordingTime % 60;

  const recordingTimeText = `${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(2, "0")}`;

  return (
    <>
      {/* Recording indicator */}

      {isRecording && (
        <View
          className="absolute left-0 right-0 items-center"
          style={{
            top: insets.top + 20,
          }}
        >
          <View className="flex-row items-center rounded-full bg-black/60 px-4 py-2">
            <View className="mr-2 h-2.5 w-2.5 rounded-full bg-red-500" />

            <Text className="text-sm font-semibold text-white">
              REC {recordingTimeText}
            </Text>
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
          onPress={onCancel}
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
            disabled={isFlashDisabled}
            className="h-12 w-12 items-center justify-center rounded-full"
            style={({ pressed }) => ({
              backgroundColor: "rgba(0,0,0,0.45)",
              opacity: pressed || isFlashDisabled ? 0.3 : 1,
            })}
            onPress={onToggleFlash}
          >
            <Ionicons
              name={
                mode === "video"
                  ? isVideoLightOn
                    ? "flashlight"
                    : "flashlight-outline"
                  : flashSetting === "off"
                    ? "flash-off-outline"
                    : "flash"
              }
              size={26}
              color="#fff"
            />
          </Pressable>

          {/* Flip */}

          <Pressable
            onPress={onToggleFacing}
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
        {/* Zoom buttons */}

        {!isRecording && (
          <View className="mb-5 flex-row items-center rounded-full bg-black/40 px-2 py-1">
            {zoomOptions.map((option) => {
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onZoomChange(option)}
                  className="mx-1 h-9 min-w-9 items-center justify-center rounded-full px-2"
                >
                  <Text className="text-xs font-semibold text-white">
                    {zoomLabel(option.value)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Photo / Video */}

        {!isRecording && (
          <View className="mb-6 flex-row rounded-full bg-black/40 p-1">
            <Pressable
              onPress={() => onModeChange("picture")}
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
              onPress={() => onModeChange("video")}
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
          onPress={onShutter}
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
    </>
  );
}
