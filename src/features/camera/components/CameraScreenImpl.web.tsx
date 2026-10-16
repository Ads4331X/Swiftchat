import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { launchGallery } from "@/features/attachments/services/pickers";

export default function CameraScreen() {
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGallery = async () => {
    setError(null);
    setIsPicking(true);
    try {
      const result = await launchGallery();
      if (!result?.assets?.length) return;

      router.push({
        pathname: "/attachment-review" as any as any,
        params: {
          type: "array",
          assets: JSON.stringify(result.assets),
        },
      });
    } catch (cause) {
      console.error("Gallery selection failed:", cause);
      setError("Unable to open the gallery. Please try again.");
    } finally {
      setIsPicking(false);
    }
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate("/");
    }
  };

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-black">
      <Text className="text-sm font-medium text-white">
        Camera is not available on web
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={isPicking}
        onPress={handleGallery}
        className="rounded-full bg-white px-5 py-3"
      >
        <Text className="text-sm font-medium text-black">
          {isPicking ? "Opening gallery..." : "Choose from gallery"}
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-red-300">
          {error}
        </Text>
      ) : null}
      <Pressable onPress={handleGoBack}>
        <Text className="text-sm font-medium text-white underline">
          Go back
        </Text>
      </Pressable>
    </View>
  );
}
