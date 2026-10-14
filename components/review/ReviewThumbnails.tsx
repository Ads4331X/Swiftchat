import { Feather } from "@expo/vector-icons";
import { Image, Pressable, View } from "react-native";
import { useTheme } from "@/constants/theme-provider";
import type { ReviewAsset } from "./types";
import { isVideoAsset } from "./utils";

type ReviewThumbnailsProps = {
  assets: ReviewAsset[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export function ReviewThumbnails({
  assets,
  selectedIndex,
  onSelect,
}: ReviewThumbnailsProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 8,
      }}
    >
      {assets.map((asset, index) => (
        <Pressable
          key={`${asset.uri}-${index}`}
          accessibilityRole="button"
          accessibilityLabel={`Select ${isVideoAsset(asset) ? "video" : "image"} ${index + 1}`}
          onPress={() => onSelect(index)}
          style={{
            width: 52,
            height: 52,
            overflow: "hidden",
            borderRadius: 8,
            borderWidth: selectedIndex === index ? 2 : 0,
            borderColor: colors.tint,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.pillInactiveBg,
          }}
        >
          {isVideoAsset(asset) ? (
            <Feather name="play" size={20} color={colors.icon} />
          ) : (
            <Image
              source={{ uri: asset.uri }}
              resizeMode="cover"
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </Pressable>
      ))}
    </View>
  );
}
