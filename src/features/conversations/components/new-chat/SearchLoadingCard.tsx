import { View } from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";

export default function SearchLoadingCard() {
  const colors = useTheme().colors;
  const { inputBorderColor, inputBg } = useTheme();

  return (
    <View
      className="mt-4 rounded-2xl border p-4"
      style={{
        borderColor: inputBorderColor,
        backgroundColor: inputBg,
      }}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="w-10 h-10 rounded-full"
          style={{ backgroundColor: colors.skeletonBg }}
        />
        <View className="flex-1 gap-2">
          <View
            className="h-4 w-1/2 rounded"
            style={{ backgroundColor: colors.skeletonBg }}
          />
          <View
            className="h-3 w-3/4 rounded"
            style={{ backgroundColor: colors.skeletonBg }}
          />
        </View>
      </View>
    </View>
  );
}
