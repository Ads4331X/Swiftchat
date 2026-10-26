import { createElement, useEffect, useRef } from "react";
import { View } from "react-native";
import type { CallVideoProps } from "./call-video-types";

export default function CallVideo({
  stream,
  style,
  mirror,
  muted,
  objectFit = "cover",
  onDimensionsChange,
}: CallVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    video.srcObject = stream as unknown as MediaStream;
    video.muted = Boolean(muted);

    const tryPlay = () => {
      void video.play().catch((err) => {
        console.warn("Remote video playback was blocked:", err);
      });
    };
    const reportDimensions = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        onDimensionsChange?.({
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };

    tryPlay();
    video.addEventListener("loadedmetadata", tryPlay);
    video.addEventListener("loadedmetadata", reportDimensions);
    video.addEventListener("resize", reportDimensions);

    const retryOnGesture = () => tryPlay();
    document.addEventListener("pointerdown", retryOnGesture, { once: true });

    return () => {
      video.removeEventListener("loadedmetadata", tryPlay);
      video.removeEventListener("loadedmetadata", reportDimensions);
      video.removeEventListener("resize", reportDimensions);
      document.removeEventListener("pointerdown", retryOnGesture);
      video.srcObject = null;
    };
  }, [muted, onDimensionsChange, stream]);

  return (
    <View pointerEvents="none" style={style}>
      {createElement("video", {
        ref: videoRef,
        autoPlay: true,
        playsInline: true,
        style: {
          width: "100%",
          height: "100%",
          objectFit,
          transform: mirror ? "scaleX(-1)" : undefined,
          backgroundColor: "#000",
        },
      })}
    </View>
  );
}
