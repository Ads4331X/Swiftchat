import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
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
import AppTextField from "@/components/profile/AppTextField";
import SettingsCard from "@/components/profile/SettingsCard";
import Toast from "react-native-toast-message";
import { BRAND_COLOR } from "@/constants/theme";

export default function EditAccount() {
  const router = useRouter();
  const { colors, dividerColor } = useTheme();

  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [usernameError, setUsernameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    api
      .get(`/api/user/user-details`)
      .then((res) => {
        if (!active) return;
        setUsername(res.data.username);
        setEmail(res.data.email);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    setUsernameError(undefined);
    setEmailError(undefined);

    if (!username.trim()) {
      setUsernameError("Username is required");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/api/user/update-user-info`, { username, email });
      Toast.show({
        type: "success",
        text1: "Profile updated",
      });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Update failed",
        text2: err.response?.data?.error ?? "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
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
          Edit Account
        </Text>
        <View className="w-8" />
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <Text style={{ color: colors.text }}>Loading...</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <Text
              style={{ color: colors.text }}
              className="text-lg font-bold mb-4"
            >
              Profile
            </Text>

            <AppTextField
              label="Username"
              value={username}
              onChangeText={setUsername}
              icon="user"
              placeholder="yourname"
              error={usernameError}
            />
            <AppTextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              icon="mail"
              placeholder="you@example.com"
              keyboardType="email-address"
              error={emailError}
            />

            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="rounded-2xl bg-[#008378] py-4 items-center active:opacity-90 mb-8"
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              <Text className="text-white text-lg font-semibold">
                {saving ? "Saving..." : "Save Profile"}
              </Text>
            </Pressable>

            <View
              className="mb-6"
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: dividerColor,
              }}
            />

            <Text
              style={{ color: colors.text }}
              className="text-lg font-bold mb-4"
            >
              Security
            </Text>

            <SettingsCard
              icon={<Feather name="lock" size={20} color={BRAND_COLOR} />}
              title="Change password"
              subtitle="Update your account password"
              onPress={() => router.push("/accountpassword")}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
