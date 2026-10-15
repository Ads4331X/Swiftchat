import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { api } from "@/lib/api";
import { removeToken, getCurrentUserId } from "@/lib/auth";
import { getUser } from "@/lib/db";
import { disconnectSocket } from "@/lib/socket";
import Toast from "react-native-toast-message";
import UserProfileCard from "@/components/profile/UserProfileCard";
import SettingsCard from "@/components/profile/SettingsCard";
import PinModal from "@/components/security/PinModal";
import { useKeySetup } from "@/hooks/useKeySetup";
import { BRAND_COLOR } from "@/constants/theme";
import { AvatarPreviewModal } from "../components/showAvatarPicker";
import BottomSheet from "@gorhom/bottom-sheet";
import { ImagePickerSuccessResult } from "expo-image-picker";
import { compressImage } from "@/lib/utils";
import { File } from "expo-file-system";

type UserDetails = {
  username: string;
  email: string;
  avatar?: string | null;
};

export default function UserSettings() {
  const router = useRouter();
  const { colors, dividerColor } = useTheme();
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [localAvatarUrlPath, setLocalAvatarUrlPath] = useState<string | null>(
    null,
  );
  const [pinError, setPinError] = useState<string | null>(null);
  const [avatarSheetMounted, setAvatarSheetMounted] = useState(false);
  const {
    needsPin,
    pinMode,
    busy: pinBusy,
    openRecoveryPin,
    submitPin,
    skip: skipPin,
  } = useKeySetup();

  const bottomSheetRef = useRef<BottomSheet>(null);
  const [image, setImage] = useState<ImagePickerSuccessResult | null>(null);

  const handleSelectImage = async (img: ImagePickerSuccessResult | null) => {
    setImage(img);

    setAvatarSheetMounted(false);
  };

  useEffect(() => {
    if (!image) return;

    const compressAndNavigate = async () => {
      const result = await compressImage({
        uri: image.assets[0].uri,
        width: image.assets[0].width,
        height: image.assets[0].height,
        size: new File(image.assets[0].uri).size,
        maxSize: 5 * 1024 * 1024,
        maxDimension: 512,
      });

      router.push({
        pathname: "/DisplayPickedAvatar",
        params: {
          uri: result.uri,
        },
      });
    };

    compressAndNavigate();
  }, [image, router]);

  const openSheet = () => {
    setAvatarSheetMounted(true);
  };
  const refetch = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const res = await api.get(`/api/user/user-details`);
      setUser(res.data);

      const uid = await getCurrentUserId();

      if (uid != null) {
        const local = await getUser(uid);
        setLocalAvatarUrlPath(local?.localAvatarUrlPath ?? null);
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refetch(true);
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      refetch(false);
    }, [refetch]),
  );
  const handleDeleteAccount = async () => {
    try {
      await api.delete(`/api/user/account`);
      await removeToken("token");
      Toast.show({
        type: "success",
        text1: "Account deleted",
      });
      router.replace("/");
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Delete failed",
        text2: err.response?.data?.error ?? "Something went wrong",
      });
    }
  };

  const confirmDelete = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Delete your account? This can't be undone.")) {
        handleDeleteAccount();
      }
      return;
    }

    Alert.alert(
      "Delete account",
      "This will permanently delete your account, messages and conversations. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: handleDeleteAccount },
      ],
    );
  };

  const handleAvatarPress = () => {
    openSheet();
  };

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
    >
      <View
        className="w-full px-4 py-3 flex-row items-center"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: dividerColor,
        }}
      >
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text
          style={{ color: colors.text }}
          className="flex-1 text-center font-bold text-lg"
        >
          Settings
        </Text>
        <View className="w-8" />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={BRAND_COLOR} size="large" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <UserProfileCard
            username={user?.username ?? "User"}
            subtitle={user?.email}
            avatarUrl={user?.avatar ?? undefined}
            localAvatarUrlPath={localAvatarUrlPath}
            onPressAvatar={handleAvatarPress}
          />
          <View className="px-4 gap-3">
            <SettingsCard
              icon={<Feather name="hard-drive" size={20} color={BRAND_COLOR} />}
              title="Storage and data"
              onPress={() => {}}
            />
            <SettingsCard
              icon={<Feather name="bell" size={20} color={BRAND_COLOR} />}
              title="Notifications"
              onPress={() => {}}
            />
            <SettingsCard
              icon={<Feather name="eye" size={20} color={BRAND_COLOR} />}
              title="Appearance"
              onPress={() => {
                router.push("/appearance");
              }}
            />
          </View>
          <View className="px-4 gap-3 mt-8">
            <SettingsCard
              icon={<Feather name="edit-2" size={20} color={BRAND_COLOR} />}
              title="Edit account"
              subtitle="Username, email, password"
              onPress={() => router.push("/editaccount")}
            />
            <SettingsCard
              icon={<Feather name="key" size={20} color={BRAND_COLOR} />}
              title="Recovery PIN"
              subtitle="Protect your encrypted messages"
              onPress={() => {
                setPinError(null);
                openRecoveryPin();
              }}
            />
            <SettingsCard
              icon={<Feather name="log-out" size={20} color={BRAND_COLOR} />}
              title="Log out"
              subtitle="Sign out of this account"
              onPress={async () => {
                await removeToken("token");
                disconnectSocket();
                Toast.show({ type: "success", text1: "Signed out" });
                router.replace("/");
              }}
            />
            <SettingsCard
              tone="danger"
              icon={<Feather name="trash-2" size={20} color="#EF4444" />}
              title="Delete account"
              subtitle="Permanently delete your account"
              onPress={confirmDelete}
            />
          </View>
        </ScrollView>
      )}
      {avatarSheetMounted ? (
        <AvatarPreviewModal
          ref={bottomSheetRef}
          closeSheet={() => setAvatarSheetMounted(false)}
          onSelectImage={handleSelectImage}
        />
      ) : null}

      <PinModal
        visible={needsPin}
        mode={pinMode}
        error={pinError}
        loading={pinBusy}
        onSubmit={async (pin) => {
          const ok = await submitPin(pin);
          if (!ok.ok) {
            setPinError(ok.error ?? "Incorrect PIN. Please try again.");
            return;
          }
          setPinError(null);
          Toast.show({
            type: "success",
            text1:
              pinMode === "enter"
                ? "Encryption keys recovered"
                : "Recovery PIN saved",
          });
        }}
        onCancel={skipPin}
      />
    </SafeAreaView>
  );
}
