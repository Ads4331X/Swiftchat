import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { api } from "@/lib/api";
import AppTextField from "@/components/profile/AppTextField";
import Toast from "react-native-toast-message";

export default function AccountPassword() {
  const router = useRouter();
  const { colors, dividerColor } = useTheme();

  const [step, setStep] = useState<"current" | "new">("current");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentPasswordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (step !== "new") return;

    confirmPasswordRef.current?.blur();
    newPasswordRef.current?.focus();
  }, [step]);

  const handleVerify = async () => {
    setError(undefined);

    if (!currentPassword) {
      setError("Current password is required");
      return;
    }

    setVerifying(true);
    try {
      const res = await api.post(`/api/user/verify-password`, {
        currentPassword,
      });
      if (!res.data.verify) {
        setError("Current password is incorrect");
        return;
      }
      currentPasswordRef.current?.blur();
      setStep("new");
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError("Current password is incorrect");
        return;
      }
      Toast.show({
        type: "error",
        text1: "Verification failed",
        text2: err.response?.data?.error ?? "Something went wrong",
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleChange = async () => {
    setError(undefined);

    if (!newPassword) {
      setError("New password is required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/api/user/change-password`, {
        currentPassword,
        newPassword,
        confirmNewPassword: confirmPassword,
      });
      Toast.show({
        type: "success",
        text1: "Password changed",
      });
      router.back();
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Password change failed",
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
          Change Password
        </Text>
        <View className="w-8" />
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
        {step === "current" ? (
          <>
            <Text
              style={{ color: colors.text }}
              className="text-lg font-bold mb-4"
            >
              Verify your identity
            </Text>
            <Text style={{ color: colors.text }} className="mb-4">
              Enter your current password to continue.
            </Text>

            <AppTextField
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              icon="lock"
              secureTextEntry
              placeholder="Enter current password"
              error={error}
              inputRef={currentPasswordRef}
            />

            <Pressable
              onPress={handleVerify}
              disabled={verifying}
              className="rounded-2xl bg-[#008378] py-4 items-center active:opacity-90 mt-2"
              style={{ opacity: verifying ? 0.6 : 1 }}
            >
              <Text className="text-white text-lg font-semibold">
                {verifying ? "Verifying..." : "Verify"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text
              style={{ color: colors.text }}
              className="text-lg font-bold mb-4"
            >
              Set a new password
            </Text>

            <AppTextField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              icon="lock"
              secureTextEntry
              placeholder="Enter new password"
              inputRef={newPasswordRef}
            />
            <AppTextField
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              icon="lock"
              secureTextEntry
              placeholder="Re-enter new password"
              error={error}
              inputRef={confirmPasswordRef}
            />

            <Pressable
              onPress={handleChange}
              disabled={saving}
              className="rounded-2xl bg-[#008378] py-4 items-center active:opacity-90 mt-2"
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              <Text className="text-white text-lg font-semibold">
                {saving ? "Changing..." : "Change Password"}
              </Text>
            </Pressable>
          </>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
