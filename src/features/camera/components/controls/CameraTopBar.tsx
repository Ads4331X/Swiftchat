import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RoundButton } from "@/features/camera/components/controls/RoundButton";

type CameraTopBarProps = {
  mode: "picture" | "video";
  flashSetting: "off" | "on";
  isVideoLightOn: boolean;
  isFlashDisabled: boolean;
  isRecording: boolean;
  onToggleFlash: () => void;
  onToggleFacing: () => void;
  onCancel: () => void;
};

export function CameraTopBar({
  mode,
  flashSetting,
  isVideoLightOn,
  isFlashDisabled,
  isRecording,
  onToggleFlash,
  onToggleFacing,
  onCancel,
}: CameraTopBarProps) {
  const insets = useSafeAreaInsets();

  const isVideoMode = mode === "video";
  const flashOn = isVideoMode ? isVideoLightOn : flashSetting === "on";

  const flashIcon = isVideoMode
    ? flashOn
      ? "flashlight"
      : "flashlight-outline"
    : flashOn
      ? "flash"
      : "flash-off-outline";

  const flashLabel = isVideoMode
    ? flashOn
      ? "Turn torch off"
      : "Turn torch on"
    : flashOn
      ? "Turn flash off"
      : "Turn flash on";

  return (
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
      <RoundButton
        icon="close"
        iconSize={28}
        label="Close camera"
        onPress={onCancel}
      />

      <View className="flex-row gap-4">
        <RoundButton
          icon={flashIcon}
          label={flashLabel}
          onPress={onToggleFlash}
          disabled={isFlashDisabled}
        />
        <RoundButton
          icon="camera-reverse-outline"
          label="Switch camera"
          onPress={onToggleFacing}
          disabled={isRecording}
        />
      </View>
    </LinearGradient>
  );
}
