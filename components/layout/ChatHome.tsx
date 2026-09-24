import { View, Pressable, Text } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import Avatar from "@/components/profile/Avatar";
import { api } from "@/lib/api";
import { getCurrentUserId } from "@/lib/auth";
import { getUser } from "@/lib/db";

type UserDetails = {
  username: string;
  avatar?: string | null;
  id: number;
  localAvatarUrlPath: string | null;
};

export default function ChatHome() {
  const { dividerColor } = useTheme();
  const router = useRouter();
  const [user, setUser] = useState<UserDetails | null>(null);

  useFocusEffect(
    useCallback(() => {
      const loadUser = async () => {
        try {
          const res = await api.get(`/api/user/user-details`);

          const uid = await getCurrentUserId();

          let localAvatarUrlPath: string | null = null;

          if (uid != null) {
            const local = await getUser(uid);
            localAvatarUrlPath = local?.localAvatarUrlPath ?? null;
          }

          setUser({
            ...res.data,
            localAvatarUrlPath,
          });
        } catch {
          // Keep existing user data if refresh fails
        }
      };

      loadUser();
    }, []),
  );
  return (
    <View className="w-full">
      <View className="w-full px-4 flex-row items-center justify-between">
        <Pressable onPress={() => router.push("/usersetting")}>
          <Avatar
            username={user?.username ?? "?"}
            avatarUrl={user?.avatar ?? undefined}
            size={40}
            userId={Number(user?.id)}
            localAvatarUrlPath={user ? user.localAvatarUrlPath : null}
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
