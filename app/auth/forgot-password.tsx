import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { api } from "@/lib/api";
import { useCooldown } from "@/lib/cooldown";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { router } from "expo-router";
import { useTheme } from "@/constants/theme-provider";
import Toast from "react-native-toast-message";
import { Image } from "expo-image";
import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";

type FormData = {
  email: string;
  otp: string;
  newPassword: string;
  confirmNewPassword: string;
};

type Step = "email" | "otp" | "password";

export default function ForgotPassword() {
  const theme = useTheme();
  const colors = theme.colors;
  const { subtleText, inputBorderColor, inputBg, placeholderColor } = theme;

  const [step, setStep] = useState<Step>("email");
  const [resending, setResending] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const cooldown = useCooldown("reset-code");
  const cooldownSecs = Math.ceil(cooldown.remainingMs / 1000);

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    setError,
    clearErrors,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      email: "",
      otp: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  const onSubmitEmail = async (data: FormData) => {
    try {
      await api.post("/api/auth/forgot-password", { email: data.email });
      Toast.show({
        type: "success",
        text1: "Reset code sent!",
        text2: "Check your email for the reset code.",
      });
      cooldown.start(60_000);
      setStep("otp");
    } catch (err: any) {
      if (err.response?.status === 429) cooldown.start(60_000);
      Toast.show({
        type: "error",
        text1: "Reset failed",
        text2: err.response?.data?.error ?? "Something went wrong",
      });
    }
  };

  const onSubmitOtp = async (data: FormData) => {
    try {
      const res = await api.post("/api/auth/verify-otp", {
        email: data.email,
        otp: data.otp,
      });
      if (res.data.valid) {
        setStep("password");
      }
    } catch (err: any) {
      setError("otp", {
        type: "manual",
        message: err.response?.data?.error ?? "Invalid code",
      });
    }
  };

  const onSubmitPassword = async (data: FormData) => {
    try {
      await api.post("/api/auth/reset-password", {
        email: data.email,
        otp: data.otp,
        newPassword: data.newPassword,
        confirmNewPassword: data.confirmNewPassword,
      });
      Toast.show({
        type: "success",
        text1: "Password reset",
        text2: "You can now log in with your new password.",
      });
      reset();
      router.push("/auth/login");
    } catch (err: any) {
      setError("newPassword", {
        type: "manual",
        message: err.response?.data?.error ?? "Something went wrong",
      });
    }
  };

  const onResend = async () => {
    if (resending) return;
    setResending(true);
    try {
      await api.post("/api/auth/forgot-password", {
        email: getValues("email"),
      });
      setValue("otp", "");
      clearErrors("otp");
      Toast.show({
        type: "success",
        text1: "New code sent!",
        text2: "Check your email for the new reset code.",
      });
      cooldown.start(60_000);
    } catch (err: any) {
      if (err.response?.status === 429) cooldown.start(60_000);
      Toast.show({
        type: "error",
        text1: "Resend failed",
        text2: err.response?.data?.error ?? "Something went wrong",
      });
    } finally {
      setResending(false);
    }
  };

  const fieldStyle = {
    borderWidth: 1,
    borderColor: inputBorderColor,
    backgroundColor: inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.background,
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 22,
            paddingBottom: 10,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <View className="items-center mb-6">
            <Image
              source={require("@/assets/images/logo.png")}
              style={{
                width: 128,
                height: 128,
              }}
              contentFit="contain"
            />
          </View>

          {/* Header */}
          <View className="mb-8">
            <Text
              style={{ color: colors.text }}
              className="text-3xl font-bold text-center mb-2"
            >
              {step === "email" && "Forgot Password?"}
              {step === "otp" && "Enter the code"}
              {step === "password" && "Set a new password"}
            </Text>
            <Text
              style={{ color: subtleText }}
              className="text-base text-center"
            >
              {step === "email" &&
                "Enter your email address and we'll send you a code to reset your password."}
              {step === "otp" &&
                `We sent a 6-digit code to ${getValues("email")}.`}
              {step === "password" &&
                "Your new password must be at least 8 characters with uppercase, lowercase, number and special character."}
            </Text>
          </View>

          {/* Step 1: Email */}
          {step === "email" && (
            <View className="mb-4">
              <Text
                style={{ color: colors.text }}
                className="text-sm font-medium mb-1.5"
              >
                Email
              </Text>
              <Controller
                control={control}
                name="email"
                rules={{
                  required: "Email is required",
                  pattern: {
                    value: /^\S+@\S+\.\S+$/,
                    message: "Enter a valid email address",
                  },
                }}
                render={({ field: { onChange, value, onBlur } }) => (
                  <View
                    style={{
                      position: "relative",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        left: 16,
                        zIndex: 1,
                      }}
                    >
                      <AntDesign name="mail" size={20} color={subtleText} />
                    </View>
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="you@example.com"
                      placeholderTextColor={placeholderColor}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      style={[fieldStyle, { paddingLeft: 50 }]}
                    />
                  </View>
                )}
              />
              {errors.email && (
                <Text className="text-red-500 text-sm mt-1">
                  {errors.email.message}
                </Text>
              )}
            </View>
          )}

          {/* Step 2: OTP */}
          {step === "otp" && (
            <View className="mb-4">
              <Text
                style={{ color: colors.text }}
                className="text-sm font-medium mb-1.5"
              >
                Verification code
              </Text>
              <Controller
                control={control}
                name="otp"
                rules={{
                  required: "Enter the 6-digit code",
                  pattern: {
                    value: /^\d{6}$/,
                    message: "Code must be 6 digits",
                  },
                }}
                render={({ field: { onChange, value, onBlur } }) => (
                  <View
                    style={{
                      position: "relative",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        left: 16,
                        zIndex: 1,
                      }}
                    >
                      <AntDesign name="lock" size={20} color={subtleText} />
                    </View>
                    <TextInput
                      value={value}
                      onChangeText={(text) =>
                        onChange(text.replace(/\D/g, "").slice(0, 6))
                      }
                      onBlur={onBlur}
                      placeholder="000000"
                      placeholderTextColor={placeholderColor}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={[fieldStyle, { paddingLeft: 50 }]}
                    />
                  </View>
                )}
              />
              {errors.otp && (
                <Text className="text-red-500 text-sm mt-1">
                  {errors.otp.message}
                </Text>
              )}
            </View>
          )}

          {/* Step 3: New password */}
          {step === "password" && (
            <View className="mb-4">
              <Text
                style={{ color: colors.text }}
                className="text-sm font-medium mb-1.5"
              >
                New password
              </Text>
              <Controller
                control={control}
                name="newPassword"
                rules={{ required: "Password is required" }}
                render={({ field: { onChange, value, onBlur } }) => (
                  <View
                    style={{
                      position: "relative",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        left: 16,
                        zIndex: 1,
                      }}
                    >
                      <AntDesign name="lock" size={20} color={subtleText} />
                    </View>
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="New password"
                      placeholderTextColor={placeholderColor}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                      style={[
                        fieldStyle,
                        { paddingLeft: 50, paddingRight: 50 },
                      ]}
                    />
                    <Pressable
                      onPress={() => setShowNewPassword((s) => !s)}
                      hitSlop={8}
                      style={{
                        position: "absolute",
                        right: 16,
                        zIndex: 1,
                      }}
                    >
                      <Feather
                        name={showNewPassword ? "eye-off" : "eye"}
                        size={20}
                        color={subtleText}
                      />
                    </Pressable>
                  </View>
                )}
              />
              {errors.newPassword && (
                <Text className="text-red-500 text-sm mt-1">
                  {errors.newPassword.message}
                </Text>
              )}

              <Text
                style={{ color: colors.text }}
                className="text-sm font-medium mb-1.5 mt-4"
              >
                Confirm new password
              </Text>
              <Controller
                control={control}
                name="confirmNewPassword"
                rules={{
                  required: "Please confirm your password",
                  validate: (value) =>
                    value === getValues("newPassword") ||
                    "Passwords do not match",
                }}
                render={({ field: { onChange, value, onBlur } }) => (
                  <View
                    style={{
                      position: "relative",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        left: 16,
                        zIndex: 1,
                      }}
                    >
                      <AntDesign name="lock" size={20} color={subtleText} />
                    </View>
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="Confirm new password"
                      placeholderTextColor={placeholderColor}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      style={[
                        fieldStyle,
                        { paddingLeft: 50, paddingRight: 50 },
                      ]}
                    />
                    <Pressable
                      onPress={() => setShowConfirmPassword((s) => !s)}
                      hitSlop={8}
                      style={{
                        position: "absolute",
                        right: 16,
                        zIndex: 1,
                      }}
                    >
                      <Feather
                        name={showConfirmPassword ? "eye-off" : "eye"}
                        size={20}
                        color={subtleText}
                      />
                    </Pressable>
                  </View>
                )}
              />
              {errors.confirmNewPassword && (
                <Text className="text-red-500 text-sm mt-1">
                  {errors.confirmNewPassword.message}
                </Text>
              )}
            </View>
          )}

          {/* Resend (step 2) */}
          {step === "otp" && (
            <Pressable
              onPress={onResend}
              disabled={cooldown.remainingMs > 0 || resending}
              className="self-center py-1"
            >
              <Text
                className="text-sm font-medium"
                style={{
                  color:
                    cooldown.remainingMs > 0 || resending
                      ? subtleText
                      : "#00A896",
                }}
              >
                {resending
                  ? "Resending..."
                  : cooldown.remainingMs > 0
                    ? `Resend code in ${cooldownSecs}s`
                    : "Resend code"}
              </Text>
            </Pressable>
          )}

          {/* Submit */}
          <Pressable
            onPress={
              step === "email"
                ? handleSubmit(onSubmitEmail)
                : step === "otp"
                  ? handleSubmit(onSubmitOtp)
                  : handleSubmit(onSubmitPassword)
            }
            disabled={
              isSubmitting ||
              (step === "email" && cooldown.remainingMs > 0)
            }
            className="rounded-2xl bg-[#008378] py-4 items-center active:opacity-90 mt-6"
            style={{
              opacity:
                isSubmitting || (step === "email" && cooldown.remainingMs > 0)
                  ? 0.6
                  : 1,
            }}
          >
            <Text className="text-white text-lg font-semibold">
              {step === "email" &&
                (isSubmitting
                  ? "Sending..."
                  : cooldown.remainingMs > 0
                    ? `Wait ${cooldownSecs}s`
                    : "Send Reset Code")}
              {step === "otp" && (isSubmitting ? "Verifying..." : "Verify Code")}
              {step === "password" &&
                (isSubmitting ? "Resetting..." : "Reset Password")}
            </Text>
          </Pressable>

          {step === "email" && cooldown.remainingMs > 0 && (
            <Text
              style={{ color: subtleText }}
              className="text-center text-sm mt-3"
            >
              You can request another code in {cooldownSecs}s.
            </Text>
          )}

          {/* Divider */}
          <View className="flex-row items-center my-8">
            <View
              style={{
                flex: 1,
                height: 1,
                backgroundColor: inputBorderColor,
              }}
            />
            <Text style={{ color: subtleText }} className="mx-3 text-sm">
              or
            </Text>
            <View
              style={{
                flex: 1,
                height: 1,
                backgroundColor: inputBorderColor,
              }}
            />
          </View>

          {/* Back to Login */}
          <View className="flex-row items-center justify-center">
            <Text style={{ color: subtleText }} className="text-base">
              Remember your password?
            </Text>
            <Pressable
              onPress={() => router.push("/auth/login")}
              hitSlop={{
                top: 12,
                bottom: 12,
                left: 12,
                right: 12,
              }}
              className="ml-1 px-1 py-1"
            >
              <Text className="text-[#00A896] font-semibold text-base">
                Log In
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
