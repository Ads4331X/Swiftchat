import { useCallback, useMemo, useRef, type RefObject } from "react";
import { router } from "expo-router";
import { File } from "expo-file-system";
import * as VideoThumbnails from "expo-video-thumbnails";
import {
  CommonResolutions,
  usePhotoOutput,
  useVideoOutput,
} from "react-native-vision-camera";
import type { Recorder } from "react-native-vision-camera";
import { compressImage, compressVideo } from "@/lib/utils";
import {
  MAX_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_SIZE,
  needsVideoCompression,
} from "@/lib/Attachments";

const VIDEO_BITRATE = 5_000_000;

/**
 * How long the screen flash stays visible before the photo is taken, so the
 * overlay is actually on screen while the camera captures.
 */
const SCREEN_FLASH_DURATION_MS = 120;

const toFileUri = (path: string) =>
  path.startsWith("file://") ? path : `file://${path}`;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type UseCameraCaptureParams = {
  mode: "picture" | "video";
  flashSetting: "off" | "on";
  hasFlash: boolean;
  screenFlashEnabled: boolean;
  onScreenFlashChange: (isVisible: boolean) => void;
  isRecording: boolean;
  setIsRecording: (isRecording: boolean) => void;
  setIsVideoLightOn: (isOn: boolean) => void;
  hasMicrophonePermission: boolean;
  requestMicrophonePermission: () => Promise<boolean>;
  recorderRef: RefObject<Recorder | null>;
};

export function useCameraCapture({
  mode,
  flashSetting,
  hasFlash,
  screenFlashEnabled,
  onScreenFlashChange,
  isRecording,
  setIsRecording,
  setIsVideoLightOn,
  hasMicrophonePermission,
  requestMicrophonePermission,
  recorderRef,
}: UseCameraCaptureParams) {
  const captureLockRef = useRef(false);

  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_4_3,
    qualityPrioritization: "balanced",
  });

  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.FHD_16_9,
    targetBitRate: VIDEO_BITRATE,
    enableAudio: true,
    fileType: "mp4",
  });

  const outputs = useMemo(
    () => (mode === "video" ? [videoOutput] : [photoOutput]),
    [mode, photoOutput, videoOutput],
  );

  /*
   * PHOTO
   */

  /**
   * The front camera has no flash, so it lights the scene with a white overlay
   * that is shown while the photo is taken. The overlay is always hidden again,
   * even if the capture fails.
   */
  const capturePhoto = useCallback(async () => {
    if (!screenFlashEnabled) {
      return photoOutput.capturePhoto(
        {
          flashMode: hasFlash ? flashSetting : "off",
        },
        {},
      );
    }

    onScreenFlashChange(true);

    try {
      await delay(SCREEN_FLASH_DURATION_MS);

      return await photoOutput.capturePhoto({ flashMode: "off" }, {});
    } finally {
      onScreenFlashChange(false);
    }
  }, [
    flashSetting,
    hasFlash,
    onScreenFlashChange,
    photoOutput,
    screenFlashEnabled,
  ]);

  const handleClickPhoto = useCallback(async () => {
    if (isRecording || captureLockRef.current) return;

    captureLockRef.current = true;

    try {
      const photo = await capturePhoto();

      const { width, height } = photo;

      const path = await photo.saveToTemporaryFileAsync();

      photo.dispose();

      const uri = toFileUri(path);

      const compressImg = await compressImage({
        width,
        height,
        size: new File(uri).size,
        uri,
      });

      if (compressImg) {
        router.push({
          pathname: "/AttachmentReview",
          params: {
            uri: compressImg.uri,
            size: compressImg.compressedSize,
            quality: compressImg.quality,
            type: "image",
          },
        });
      }
    } catch (error) {
      const message = (error as Error)?.message ?? "";

      if (!message.includes("Camera is closed")) {
        console.log("Photo capture error:", error);
      }
    } finally {
      captureLockRef.current = false;
    }
  }, [capturePhoto, isRecording]);

  /*
   * VIDEO FINISHED
   */

  const handleRecordingFinished = useCallback(
    async (filePath: string) => {
      recorderRef.current = null;
      setIsRecording(false);
      setIsVideoLightOn(false);

      try {
        const uri = toFileUri(filePath);

        const file = new File(uri);
        const size = file.size ?? 0;

        if (!needsVideoCompression(size)) {
          router.push({
            pathname: "/AttachmentReview",
            params: {
              uri,
              size,
              quality: 1,
              type: "video",
            },
          });

          return;
        }

        const { width, height } = await VideoThumbnails.getThumbnailAsync(uri, {
          time: 0,
        });

        const compressVid = await compressVideo({
          uri,
          width,
          height,
          size,
          mimeType: file.type ?? "video/mp4",
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
      }
    },
    [recorderRef, setIsRecording, setIsVideoLightOn],
  );

  /*
   * START / STOP RECORDING
   */

  const handleStartRecording = useCallback(async () => {
    if (isRecording) return;

    if (!hasMicrophonePermission) {
      const granted = await requestMicrophonePermission();

      if (!granted) return;
    }

    try {
      const recorder = await videoOutput.createRecorder({
        maxDuration: MAX_VIDEO_DURATION_SECONDS,
        maxFileSize: MAX_VIDEO_SIZE,
      });

      recorderRef.current = recorder;
      setIsRecording(true);

      await recorder.startRecording(
        (filePath) => {
          handleRecordingFinished(filePath);
        },
        (error) => {
          recorderRef.current = null;
          setIsRecording(false);
          setIsVideoLightOn(false);

          console.log("Video recording error:", error);
        },
      );
    } catch (error) {
      recorderRef.current = null;
      setIsRecording(false);

      console.log("Video recording error:", error);
    }
  }, [
    handleRecordingFinished,
    hasMicrophonePermission,
    isRecording,
    recorderRef,
    requestMicrophonePermission,
    setIsRecording,
    setIsVideoLightOn,
    videoOutput,
  ]);

  const handleStopRecording = useCallback(() => {
    if (!isRecording) return;

    recorderRef.current?.stopRecording();
  }, [isRecording, recorderRef]);

  return {
    outputs,
    photoOutput,
    videoOutput,
    handleClickPhoto,
    handleStartRecording,
    handleStopRecording,
  };
}
