import { createElement, useEffect, useRef } from "react";
import type { MediaStream as RNMediaStream } from "react-native-webrtc";

const hiddenStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: "none",
} as const;

export default function CallAudio({ stream }: { stream: RNMediaStream }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    audio.srcObject = stream as unknown as MediaStream;

    const tryPlay = () => {
      void audio.play().catch((err) => {
        console.warn("Remote audio playback was blocked:", err);
      });
    };

    tryPlay();
    audio.addEventListener("loadedmetadata", tryPlay);

    const retryOnGesture = () => tryPlay();
    document.addEventListener("pointerdown", retryOnGesture, { once: true });

    return () => {
      audio.removeEventListener("loadedmetadata", tryPlay);
      document.removeEventListener("pointerdown", retryOnGesture);
      audio.srcObject = null;
    };
  }, [stream]);

  return createElement("audio", {
    ref: audioRef,
    autoPlay: true,
    style: hiddenStyle,
  });
}
