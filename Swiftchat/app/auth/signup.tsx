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
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { router } from "expo-router";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import Toast from "react-native-toast-message";

type FormData = {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
};

export default function SignupScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const isDark = colorScheme === "dark";
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await api.post("/api/auth/register", {
        email: data.email,
        username: data.username,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });

      Toast.show({
        type: "success",
        text1: "Account created!",
        text2: "Welcome to SwiftChat ",
      });

      router.push("/(tabs)");
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Signup failed",
        text2: err.response?.data?.error ?? "Something went wrong",
      });
    }
  };

  const inputBorderColor = isDark ? "#2A2D2F" : "#E5E7EB";
  const inputBg = isDark ? "#1C1F21" : "#F9FAFB";
  const placeholderColor = isDark ? "#6B7280" : "#9CA3AF";

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={{ color: colors.text }}
            className="text-3xl font-bold mb-2"
          >
            Create your account
          </Text>
          <Text
            style={{ color: isDark ? "#9BA1A6" : "#687076" }}
            className="text-base mb-8"
          >
            Join SwiftChat and start messaging securely.
          </Text>

          {/* Email */}
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
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="you@example.com"
                  placeholderTextColor={placeholderColor}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={fieldStyle}
                />
              )}
            />
            {errors.email && (
              <Text className="text-red-500 text-sm mt-1">
                {errors.email.message}
              </Text>
            )}
          </View>

          {/* Username */}
          <View className="mb-4">
            <Text
              style={{ color: colors.text }}
              className="text-sm font-medium mb-1.5"
            >
              Username
            </Text>
            <Controller
              control={control}
              name="username"
              rules={{
                required: "Username is required",
                minLength: { value: 3, message: "At least 3 characters" },
              }}
              render={({ field: { onChange, value, onBlur } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="yourname"
                  placeholderTextColor={placeholderColor}
                  autoCapitalize="none"
                  style={fieldStyle}
                />
              )}
            />
            {errors.username && (
              <Text className="text-red-500 text-sm mt-1">
                {errors.username.message}
              </Text>
            )}
          </View>

          {/* Password */}
          <View className="mb-4">
            <Text
              style={{ color: colors.text }}
              className="text-sm font-medium mb-1.5"
            >
              Password
            </Text>
            <Controller
              control={control}
              name="password"
              rules={{
                required: "Password is required",
                minLength: { value: 8, message: "At least 8 characters" },
                pattern: {
                  value:
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/,
                  message:
                    "Must include uppercase, lowercase, and a special character",
                },
              }}
              render={({ field: { onChange, value, onBlur } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="••••••••"
                  placeholderTextColor={placeholderColor}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={fieldStyle}
                />
              )}
            />
            {errors.password && (
              <Text className="text-red-500 text-sm mt-1">
                {errors.password.message}
              </Text>
            )}
          </View>

          {/* Confirm Password */}
          <View className="mb-2">
            <Text
              style={{ color: colors.text }}
              className="text-sm font-medium mb-1.5"
            >
              Confirm Password
            </Text>
            <Controller
              control={control}
              name="confirmPassword"
              rules={{
                required: "Please confirm your password",
                validate: (value) =>
                  value === watch("password") || "Passwords don't match",
              }}
              render={({ field: { onChange, value, onBlur } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="••••••••"
                  placeholderTextColor={placeholderColor}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={fieldStyle}
                />
              )}
            />
            {errors.confirmPassword && (
              <Text className="text-red-500 text-sm mt-1">
                {errors.confirmPassword.message}
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            className="self-start mb-6 mt-1"
          >
            <Text className="text-[#00A896] text-sm font-medium">
              {showPassword ? "Hide" : "Show"} password
            </Text>
          </Pressable>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="rounded-2xl bg-[#008378] py-4 items-center active:opacity-90"
            style={{ opacity: isSubmitting ? 0.6 : 1 }}
          >
            <Text className="text-white text-lg font-semibold">
              {isSubmitting ? "Creating account..." : "Sign Up"}
            </Text>
          </Pressable>

          {/* back to login */}
          <View className="flex-row items-center justify-center py-6">
            <Text
              style={{ color: isDark ? "#9BA1A6" : "#687076" }}
              className="text-base"
            >
              Already have an account?
            </Text>
            <Pressable
              onPress={() => router.push("/auth/login")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
