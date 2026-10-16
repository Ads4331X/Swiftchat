import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CameraLensOption } from "@/features/camera/hooks/useCameraLenses";
import { ModeSwitch } from "@/features/camera/components/controls/ModeSwitch";
import { ShutterRow } from "@/features/camera/components/controls/ShutterRow";
import { ZoomPills } from "@/features/camera/components/controls/ZoomPills";

type CameraBottomBarProps = {
  mode: "picture" | "video";
  isRecording: boolean;
  zoomOptions: CameraLensOption[];
  activeZoom?: number;
  bottomOffset: number;
  thumbUri: string | null;
  shutterLabel: string;
  onZoomChange: (option: CameraLensOption) => void;
  onModeChange: (mode: "picture" | "video") => void;
  onThumbError: () => void;
  onGallery: () => void;
  onShutter: () => void;
};

export function CameraBottomBar({
  mode,
  isRecording,
  zoomOptions,
  activeZoom,
  bottomOffset,
  thumbUri,
  shutterLabel,
  onZoomChange,
  onModeChange,
  onThumbError,
  onGallery,
  onShutter,
}: CameraBottomBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.2)"]}
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: "center",
        paddingTop: 56,
        paddingBottom: insets.bottom + 28 + bottomOffset,
      }}
    >
      {!isRecording && (
        <ZoomPills
          zoomOptions={zoomOptions}
          activeZoom={activeZoom}
          onZoomChange={onZoomChange}
        />
      )}

      {!isRecording && (
        <ModeSwitch mode={mode} onModeChange={onModeChange} />
      )}

      <ShutterRow
        mode={mode}
        isRecording={isRecording}
        thumbUri={thumbUri}
        shutterLabel={shutterLabel}
        onThumbError={onThumbError}
        onGallery={onGallery}
        onShutter={onShutter}
      />
    </LinearGradient>
  );
}
