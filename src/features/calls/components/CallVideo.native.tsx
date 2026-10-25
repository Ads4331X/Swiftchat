import { RTCView } from "react-native-webrtc";

import type { CallVideoProps } from "./call-video-types";

export default function CallVideo({
  stream,
  muted: _muted,
  ...props
}: CallVideoProps) {
  return (
    <RTCView
      streamURL={stream.toURL()}
      pointerEvents="none"
      {...props}
    />
  );
}
