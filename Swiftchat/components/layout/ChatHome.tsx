import { View, Pressable, Text, Image } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { useRouter } from "expo-router";

export default function ChatHome() {
  const { dividerColor } = useTheme();
  const router = useRouter();

  return (
    <View className="w-full">
      <View className="w-full px-4 flex-row items-center justify-between">
        <Pressable onPress={() => router.push("/usersetting")}>
          <Image
            className="w-10 h-10 rounded-full"
            source={require("@/assets/images/icon.png")}
          />
        </Pressable>

        <Text className="text-[#29A195] font-bold text-xl">SwiftChat</Text>

        <Pressable className="w-10 h-10 items-center justify-center rounded-full">
          <Feather name="search" size={24} color="#29A195" />
        </Pressable>
      </View>

      <View className="w-full px-4 my-2">
        <View
          style={{
            height: 1,
            backgroundColor: dividerColor,
          }}
        />
      </View>
    </View>
  );
}
