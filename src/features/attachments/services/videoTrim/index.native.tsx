import { useEffect, useRef } from "react";
import { NativeEventEmitter, NativeModules } from "react-native";
import VideoTrim, { showEditor } from "react-native-video-trim";
import type { UseVideoTrimmer } from "@/features/attachments/services/videoTrim/types";

const isFabric = !!(global as any).nativeFabricUIManager;

const toFileUri = (path: string) =>
  path.startsWith("file://") ? path : `file://${path}`;

export const useVideoTrimmer: UseVideoTrimmer = ({
  uri,
  maxDurationMs,
  onResult,
}) => {
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    if (isFabric) {
      const finish = VideoTrim.onFinishTrimming((event: any) => {
        if (event.outputPath) {
          onResultRef.current(toFileUri(event.outputPath));
        }
      });

      const cancel = VideoTrim.onCancel(() => {
        onResultRef.current(null);
      });

      return () => {
        finish.remove();
        cancel.remove();
      };
    }

    const emitter = new NativeEventEmitter(NativeModules.VideoTrim);

    const subscription = emitter.addListener("VideoTrim", (event: any) => {
      if (event?.name === "onFinishTrimming" && event.outputPath) {
        onResultRef.current(toFileUri(event.outputPath));
      } else if (event?.name === "onCancel") {
        onResultRef.current(null);
      }
    });

    return () => subscription.remove();
  }, []);

  return {
    openTrimmer: () => {
      if (!uri) return;

      showEditor(uri, {
        maxDuration: maxDurationMs,
        saveToPhoto: false,
      });
    },
    trimmer: null,
  };
};
