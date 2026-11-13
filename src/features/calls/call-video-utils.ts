import type { MediaStream } from "react-native-webrtc";

type FacingModeSettings = {
  facingMode?: string;
};

export function shouldMirrorLocalVideo(
  stream: MediaStream | null | undefined,
) {
  const track = stream?.getVideoTracks()[0];
  const settings = track?.getSettings?.() as FacingModeSettings | undefined;

  return settings?.facingMode === "user" || settings?.facingMode === "front";
}
