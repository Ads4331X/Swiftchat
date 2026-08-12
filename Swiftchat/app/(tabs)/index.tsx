import WelcomePage from "@/components/WelcomePage";
import { View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function HomeScreen() {
  const router = useRouter();

  useEffect(() => {
    const checkToken = async () => {
      const token = await SecureStore.getItemAsync("token");

      if (token) {
        router.replace("/chat");
      }
    };

    checkToken();
  }, []);

  return (
    <View className="flex-1">
      <WelcomePage />
    </View>
  );
}
