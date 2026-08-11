import { View, Pressable, Text, Image } from "react-native";
import Constants from "expo-constants";
import Feather from "@expo/vector-icons/Feather";

const appName =
  Constants.expoConfig?.name ?? Constants.manifest?.name ?? "SwiftChat";

export default function HomeHeader() {
  return (
    <View className=" w-full p-4  flex-row items-center justify-between border-b-slate-400 border-b-[0.3px]">
      {/* profile pic */}
      <Image
        className="w-10 h-10 rounded-full"
        source={require("@/assets/images/icon.png")}
      />

      {/* app name */}
      <Text className="text-[#29A195] font-bold text-xl">{appName}</Text>

      {/* search button */}
      <Pressable className="w-10 h-10 items-center justify-center rounded-full ">
        <Feather name="search" size={24} color="#29A195" />
      </Pressable>
    </View>
  );
}
