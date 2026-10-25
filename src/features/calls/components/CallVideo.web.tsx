import { createElement, useEffect, useRef } from "react";
import { View } from "react-native";
import type { CallVideoProps } from "./call-video-types";

export default function CallVideo({
  stream,
  style,
  mirror,
  muted,
  objectFit = "cover",
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

    tryPlay();
    video.addEventListener("loadedmetadata", tryPlay);

    const retryOnGesture = () => tryPlay();
    document.addEventListener("pointerdown", retryOnGesture, { once: true });

    return () => {
      video.removeEventListener("loadedmetadata", tryPlay);
      document.removeEventListener("pointerdown", retryOnGesture);
      video.srcObject = null;
    };
  }, [muted, stream]);

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
