import type { StyleProp, ViewStyle } from "react-native";
import type { MediaStream } from "react-native-webrtc";

export type CallVideoProps = {
  stream: MediaStream;
  style?: StyleProp<ViewStyle>;
  mirror?: boolean;
  muted?: boolean;
  objectFit?: "cover" | "contain";
  zOrder?: number;
  onDimensionsChange?: (dimensions: { width: number; height: number }) => void;
};
