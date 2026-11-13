declare module "react-native-webrtc-web-shim" {
  import type { ComponentType } from "react";
  import type { MediaStream, ViewProps } from "react-native";

  export type RTCViewProps = ViewProps & {
    stream?: MediaStream | null;
    objectFit?: "cover" | "contain";
    mirror?: boolean;
    muted?: boolean;
    zOrder?: number;
  };

  export const RTCView: ComponentType<RTCViewProps>;
}
