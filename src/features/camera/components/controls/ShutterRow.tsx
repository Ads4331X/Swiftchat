import { Ionicons } from "@expo/vector-icons";
import { Image, View } from "react-native";
import { AppPressable as Pressable } from "@/shared/components/AppPressable";

type ShutterRowProps = {
  mode: "picture" | "video";
  isRecording: boolean;
  thumbUri: string | null;
  shutterLabel: string;
  onThumbError: () => void;
  onGallery: () => void;
  onShutter: () => void;
};

export function ShutterRow({
  mode,
  isRecording,
  thumbUri,
  shutterLabel,
  onThumbError,
  onGallery,
  onShutter,
}: ShutterRowProps) {
  return (
    <View className="w-full flex-row items-center justify-between px-10">
      {/* Gallery thumbnail */}
      <Pressable
        onPress={onGallery}
        disabled={isRecording}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Open gallery"
        className="h-14 w-14 overflow-hidden rounded-xl border-2 border-white/90 bg-white/15"
        style={({ pressed }) => ({
          opacity: isRecording ? 0.3 : pressed ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        {thumbUri ? (
          <Image
            key={thumbUri}
            source={{ uri: thumbUri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            onError={onThumbError}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="images-outline" size={26} color="#fff" />
          </View>
        )}
      </Pressable>

      {/* Shutter */}
      <Pressable
        onPress={onShutter}
        accessibilityRole="button"
        accessibilityLabel={shutterLabel}
        className="h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-white"
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? 0.93 : 1 }],
        })}
      >
        <View
          className={
            isRecording
              ? "h-9 w-9 rounded-lg bg-red-500"
              : mode === "video"
                ? "h-[66px] w-[66px] rounded-full bg-red-500"
                : "h-[66px] w-[66px] rounded-full bg-white"
          }
        />
      </Pressable>

      {/* Spacer keeps the shutter centered */}
      <View className="h-14 w-14" />
    </View>
  );
}
