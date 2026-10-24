import { StyleSheet } from "react-native";
import { RTCView } from "react-native-webrtc";
import type { MediaStream } from "react-native-webrtc";

export default function CallAudio({ stream }: { stream: MediaStream }) {
  return (
    <RTCView
      streamURL={stream.toURL()}
      style={styles.audioSink}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  audioSink: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
});
