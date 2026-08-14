import { View, Pressable, Text } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import Avatar from "@/components/profile/Avatar";
import { api } from "@/lib/api";

type UserDetails = {
  username: string;
  avatarUrl?: string;
};

export default function ChatHome() {
  const { dividerColor } = useTheme();
  const router = useRouter();
  const [user, setUser] = useState<UserDetails | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .get(`/api/user/user-details`)
        .then((res) => setUser(res.data))
        .catch(() => {});
    }, []),
  );

  return (
    <View className="w-full">
      <View className="w-full px-4 flex-row items-center justify-between">
        <Pressable onPress={() => router.push("/usersetting")}>
          <Avatar username={user?.username ?? "?"} avatarUrl={user?.avatarUrl} size={40} />
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
