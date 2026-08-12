import { View, Pressable, Text, Image } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

export default function ChatHome() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const isDark = colorScheme === "dark";
  const dividerColor = isDark ? "#2A2D2F" : "#E5E7EB";

  return (
    <View className="w-full">
      <View className="w-full px-4 flex-row items-center justify-between">
        <Image
          className="w-10 h-10 rounded-full"
          source={require("@/assets/images/icon.png")}
        />

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
