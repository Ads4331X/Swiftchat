declare module "expo-blur" {
  import { ComponentType } from "react";
  import { ViewProps } from "react-native";
  export const BlurView: ComponentType<
    ViewProps & {
      intensity?: number;
      tint?: "light" | "dark" | "default";
      experimentalBlurMethod?: "none" | "dimezisBlurView";
      blurReductionFactor?: number;
    }
  >;
}
