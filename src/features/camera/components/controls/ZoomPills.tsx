import { Text, View } from "react-native";
import { AppPressable as Pressable } from "@/shared/components/AppPressable";
import type { CameraLensOption } from "@/features/camera/hooks/useCameraLenses";
import { zoomLabel } from "@/features/camera/components/controls/utils";

type ZoomPillsProps = {
  zoomOptions: CameraLensOption[];
  activeZoom?: number;
  onZoomChange: (option: CameraLensOption) => void;
};

export function ZoomPills({
  zoomOptions,
  activeZoom,
  onZoomChange,
}: ZoomPillsProps) {
  return (
    <View className="mb-6 flex-row items-center gap-2">
      {zoomOptions.map((option) => {
        const isActive = activeZoom === option.value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onZoomChange(option)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Zoom ${zoomLabel(option.value)}`}
            accessibilityState={{ selected: isActive }}
            className={`h-11 min-w-[52px] items-center justify-center rounded-full px-3.5 ${
              isActive ? "bg-white" : "bg-black/20"
            }`}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              className={`text-sm font-bold ${
                isActive ? "text-black" : "text-white"
              }`}
            >
              {zoomLabel(option.value)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
