import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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
import { removeToken } from "@/lib/secureStorage";
import { disconnectSocket } from "@/lib/socket";
import Toast from "react-native-toast-message";
import UserProfileCard from "@/components/profile/UserProfileCard";
import SettingsCard from "@/components/profile/SettingsCard";
import PinModal from "@/components/security/PinModal";
import { useKeySetup } from "@/hooks/useKeySetup";
import { BRAND_COLOR } from "@/constants/theme";

type UserDetails = {
  username: string;
  email: string;
};

export default function UserSettings() {
  const router = useRouter();
  const { colors, dividerColor } = useTheme();
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinError, setPinError] = useState<string | null>(null);
  const {
    needsPin,
    pinMode,
    busy: pinBusy,
    startAddPin,
    addPin,
    skip: skipPin,
  } = useKeySetup();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/user/user-details`);
      setUser(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refetch();
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
              onPress={() => {}}
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
                startAddPin();
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

      <PinModal
        visible={needsPin}
        mode={pinMode}
        error={pinError}
        loading={pinBusy}
        onSubmit={async (pin) => {
          const ok = await addPin(pin);
          if (!ok.ok) {
            setPinError(ok.error ?? "Incorrect PIN. Please try again.");
            return;
          }
          setPinError(null);
          Toast.show({ type: "success", text1: "Recovery PIN saved" });
        }}
        onCancel={skipPin}
      />
    </SafeAreaView>
  );
}
