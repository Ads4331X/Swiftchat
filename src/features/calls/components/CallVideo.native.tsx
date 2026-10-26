import { RTCView } from "react-native-webrtc";

import type { CallVideoProps } from "./call-video-types";

export default function CallVideo({
  stream,
  muted: _muted,
  onDimensionsChange,
  ...props
}: CallVideoProps) {
  return (
    <RTCView
      streamURL={stream.toURL()}
      pointerEvents="none"
      onDimensionsChange={
        onDimensionsChange
          ? (event) => onDimensionsChange(event.nativeEvent)
          : undefined
      }
      {...props}
    />
  );
}
