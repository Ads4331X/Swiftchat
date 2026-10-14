import { useEffect, useRef } from "react";
import { NativeEventEmitter, NativeModules } from "react-native";
import { showEditor } from "react-native-video-trim";
import type { UseVideoTrimmer } from "./types";

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
        saveToPhoto: false, // keep private videos out of the gallery
      });
    },
    trimmer: null,
  };
};
