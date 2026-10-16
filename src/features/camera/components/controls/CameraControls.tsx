import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { launchGallery } from "@/features/attachments/services/pickers";
import type { CameraLensOption } from "@/features/camera/hooks/useCameraLenses";
import { CameraBottomBar } from "@/features/camera/components/controls/CameraBottomBar";
import { CameraTopBar } from "@/features/camera/components/controls/CameraTopBar";
import { RecordingIndicator } from "@/features/camera/components/controls/RecordingIndicator";
import { useLatestAsset } from "@/features/camera/components/controls/useLatestAsset";

type CameraControlsProps = {
  mode: "picture" | "video";
  flashSetting: "off" | "on";
  isVideoLightOn: boolean;
  isFlashDisabled: boolean;
  isRecording: boolean;
  recordingTime: number;
  zoomOptions: CameraLensOption[];
  /** Optional: currently selected zoom value, used to highlight a pill. */
  activeZoom?: number;
  /** Optional: extra space under the controls if the bottom is clipped. */
  bottomOffset?: number;
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
  activeZoom,
  bottomOffset = 0,
  onZoomChange,
  onModeChange,
  onToggleFlash,
  onToggleFacing,
  onCancel,
  onShutter,
}: CameraControlsProps) {
  const { uri: libraryUri, refresh } = useLatestAsset();
  const [thumbFailed, setThumbFailed] = useState(false);

  const thumbUri = thumbFailed ? null : libraryUri;

  useEffect(() => {
    setThumbFailed(false);
  }, [libraryUri]);

  // Refresh the thumbnail when a recording ends.
  const wasRecording = useRef(isRecording);
  useEffect(() => {
    if (wasRecording.current && !isRecording) {
      wasRecording.current = isRecording;
      const t = setTimeout(refresh, 800);
      return () => clearTimeout(t);
    }
    wasRecording.current = isRecording;
  }, [isRecording, refresh]);

  const handleShutter = () => {
    onShutter();
    if (mode === "picture") setTimeout(refresh, 1000);
  };

  const handleGallery = async () => {
    try {
      const result = await launchGallery();

      if (result?.assets[0]?.uri) {
        router.push({
          pathname: "/attachment-review" as any as any,
          params: {
            type: "array",
            assets: JSON.stringify(result.assets),
          },
        });
      }
    } finally {
      refresh();
    }
  };

  const shutterLabel =
    mode === "picture"
      ? "Take photo"
      : isRecording
        ? "Stop recording"
        : "Start recording";

  return (
    <>
      {isRecording && <RecordingIndicator recordingTime={recordingTime} />}

      <CameraTopBar
        mode={mode}
        flashSetting={flashSetting}
        isVideoLightOn={isVideoLightOn}
        isFlashDisabled={isFlashDisabled}
        isRecording={isRecording}
        onToggleFlash={onToggleFlash}
        onToggleFacing={onToggleFacing}
        onCancel={onCancel}
      />

      <CameraBottomBar
        mode={mode}
        isRecording={isRecording}
        zoomOptions={zoomOptions}
        activeZoom={activeZoom}
        bottomOffset={bottomOffset}
        thumbUri={thumbUri}
        shutterLabel={shutterLabel}
        onZoomChange={onZoomChange}
        onModeChange={onModeChange}
        onThumbError={() => setThumbFailed(true)}
        onGallery={handleGallery}
        onShutter={handleShutter}
      />
    </>
  );
}
