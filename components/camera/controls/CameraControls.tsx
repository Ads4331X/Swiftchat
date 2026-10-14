import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { launchGallery } from "@/lib/Attachments";
import type { CameraLensOption } from "../useCameraLenses";
import { CameraBottomBar } from "./CameraBottomBar";
import { CameraTopBar } from "./CameraTopBar";
import { RecordingIndicator } from "./RecordingIndicator";
import { useLatestAsset } from "./useLatestAsset";

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
          pathname: "/AttachmentReview",
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
