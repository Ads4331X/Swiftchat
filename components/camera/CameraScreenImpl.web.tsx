import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

export default function CameraScreen() {
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
      <Pressable onPress={handleGoBack}>
        <Text className="text-sm font-medium text-white underline">
          Go back
        </Text>
      </Pressable>
    </View>
  );
}
