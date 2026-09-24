import { useTheme } from "@/constants/theme-provider";
import Feather from "@expo/vector-icons/Feather";
import {
  Image,
  View,
  Pressable,
  Text,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { getCurrentUserId } from "@/lib/auth";
import { setAvatarUrl, setLocalAvatarUrlPath, upsertUser } from "@/lib/db";
import { useState } from "react";
import { BRAND_COLOR } from "@/constants/theme";
import { downloadAvatar } from "@/lib/utils/avatarStorage";

export default function DisplayPickedAvatar() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const [loading, setLoading] = useState<boolean>(false);

  const { colors, subtleText, dividerColor } = useTheme();
  const handleSave = async () => {
    try {
      setLoading(true);

      const formdata = new FormData();
      const currentUserId = await getCurrentUserId();
      const filename = `${currentUserId}Pfp.jpg`;

      if (Platform.OS === "web") {
        // Web: fetch the uri as a blob, then append as a real File
        const response = await fetch(uri);
        const blob = await response.blob();

        formdata.append("avatar", blob, filename);
      } else {
        formdata.append("avatar", {
          uri,
          name: filename,
          type: "image/jpeg",
        } as any);
      }

      const result = await api.post(
        "/api/user/update-profile-picture",
        formdata,
      );

      const userId = Number(result.data.message.id);
      const avatarUrl = result.data.message.avatar;
      const username = result.data.message.username;

      // Make sure the user exists in the local database
      await upsertUser(userId, username, avatarUrl);

      // Update the remote avatar URL in the local database
      await setAvatarUrl({
        url: avatarUrl,
        userId,
      });

      // Download and cache the avatar locally
      const localPath = await downloadAvatar({
        url: avatarUrl,
        userId,
      });

      // Save the local cached path
      if (localPath) {
        await setLocalAvatarUrlPath({
          url: localPath,
          userId,
        });
      }

      setLoading(false);
      router.navigate("/usersetting");
    } catch (error) {
      console.log("UPLOAD ERROR:", error);
      setLoading(false);
    }
  };
  const handleCancel = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate("/");
    }
  };

  const options = [
    {
      label: "Cancel",
      disabled: loading,
      onPress: handleCancel,
      icon: "x",
      style: {
        backgroundColor: colors.background,
        color: "#FF3B30",
      },
    },
    {
      label: "Save",
      onPress: async () => await handleSave(),
      icon: "check",
      disabled: loading,
      style: {
        backgroundColor: colors.background,
        color: colors.text,
      },
    },
  ];

  return (
    <SafeAreaView
      className="flex-1"
      style={{
        backgroundColor: colors.background,
      }}
    >
      <ShowLoading visible={loading} />
      {/* Header */}
      <View className="px-5 pt-5">
        <Text
          className="text-2xl font-semibold"
          style={{
            color: colors.text,
          }}
        >
          Profile Picture
        </Text>

        <Text
          className="text-sm mt-1"
          style={{
            color: subtleText,
          }}
        >
          Preview your new profile picture
        </Text>
      </View>
      {/* Image Preview */}
      <View className="flex-1 justify-center items-center">
        <View className="rounded-full p-1">
          <Image
            source={{ uri }}
            className="rounded-full"
            style={{
              width: 220,
              height: 220,
            }}
          />
        </View>
      </View>
      {/* Options */}
      <View
        className="flex-row gap-3 px-4 py-4"
        style={{
          borderTopWidth: 1,
          borderColor: dividerColor,
        }}
      >
        {options.map((option) => {
          return (
            <Pressable
              disabled={option.disabled}
              key={option.label}
              onPress={option.onPress}
              className="flex-1 h-12 rounded-xl flex-row justify-center items-center w-max"
              style={{
                backgroundColor: option.style.backgroundColor,
                opacity: option.disabled ? 0.5 : 1,
              }}
            >
              <Feather
                name={option.icon as any}
                size={20}
                color={option.style.color}
              />

              <Text
                className="font-semibold ml-2"
                style={{
                  color: option.style.color,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function ShowLoading({ visible }: { visible: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={BRAND_COLOR} size="large" />
      </View>
    </Modal>
  );
}
