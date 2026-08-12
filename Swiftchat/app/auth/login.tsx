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
import { Image } from "expo-image";
import AntDesign from "@expo/vector-icons/AntDesign";
import * as SecureStore from "expo-secure-store";

type FormData = {
  email: string;
  password: string;
};

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const isDark = colorScheme === "dark";
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      const response = await api.post("/api/auth/login", {
        email: data.email,
        password: data.password,
      });

      Toast.show({
        type: "success",
        text1: "Welcome back!",
        text2: "You're logged in",
      });

      await SecureStore.setItemAsync("token", response.data.token);

      router.push("/chat");
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Login failed",
        text2: err.response?.data?.error ?? "Something went wrong",
      });
    }
  };

  const subtleText = isDark ? "#9BA1A6" : "#687076";
  const inputBorderColor = isDark ? "#2A2D2F" : "#E5E7EB";
  const inputBg = isDark ? "#1C1F21" : "#F9FAFB";
  const placeholderColor = isDark ? "#6B7280" : "#9CA3AF";
  const dividerColor = isDark ? "#2A2D2F" : "#E5E7EB";

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
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 22,
            paddingBottom: 10,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* logo */}
          <View className="items-center ">
            <Image
              source={require("@/assets/images/logo.png")}
              style={{ width: 176, height: 176 }}
              contentFit="contain"
            />
          </View>

          {/* header */}
          <View className="mb-8">
            <Text
              style={{ color: colors.text }}
              className="text-3xl font-bold text-center mb-2"
            >
              Welcome back
            </Text>
            <Text
              style={{ color: subtleText }}
              className="text-base text-center"
            >
              Log in to SwiftChat to continue
            </Text>
          </View>

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
                <View
                  style={{
                    position: "relative",
                    justifyContent: "center",
                  }}
                >
                  {/* Email icon */}
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
                    style={[
                      fieldStyle,
                      {
                        paddingLeft: 50,
                      },
                    ]}
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
          {/* Password */}
          <View className="mb-2">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text
                style={{ color: colors.text }}
                className="text-sm font-medium"
              >
                Password
              </Text>

              <Pressable
                hitSlop={8}
                onPress={() => router.push("/auth/ForgotPassword")}
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: "#00A896" }}
                >
                  Forgot password?
                </Text>
              </Pressable>
            </View>

            <Controller
              control={control}
              name="password"
              rules={{
                required: "Password is required",
              }}
              render={({ field: { onChange, value, onBlur } }) => (
                <View
                  style={{
                    position: "relative",
                    justifyContent: "center",
                  }}
                >
                  {/* Password icon */}
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
                    placeholder="••••••••"
                    placeholderTextColor={placeholderColor}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    style={[
                      fieldStyle,
                      {
                        paddingLeft: 50,
                        paddingRight: 44,
                      },
                    ]}
                  />

                  {/* Show / Hide password */}
                  <Pressable
                    onPress={() => setShowPassword((prev) => !prev)}
                    hitSlop={10}
                    style={{
                      position: "absolute",
                      right: 14,
                    }}
                  >
                    <AntDesign
                      name={showPassword ? "eye-invisible" : "eye"}
                      size={20}
                      color={subtleText}
                    />
                  </Pressable>
                </View>
              )}
            />

            {errors.password && (
              <Text className="text-red-500 text-sm mt-1">
                {errors.password.message}
              </Text>
            )}
          </View>
          {/* Submit */}
          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="rounded-2xl bg-[#008378] py-4 items-center active:opacity-90 mt-6"
            style={{ opacity: isSubmitting ? 0.6 : 1 }}
          >
            <Text className="text-white text-lg font-semibold">
              {isSubmitting ? "Logging in..." : "Log In"}
            </Text>
          </Pressable>

          {/* divider */}
          <View className="flex-row items-center my-8">
            <View
              style={{ flex: 1, height: 1, backgroundColor: dividerColor }}
            />
            <Text style={{ color: subtleText }} className="mx-3 text-sm">
              or
            </Text>
            <View
              style={{ flex: 1, height: 1, backgroundColor: dividerColor }}
            />
          </View>

          {/* log in */}
          <View className="flex-row items-center justify-center">
            <Text style={{ color: subtleText }} className="text-base">
              Don&apos;t have an account?
            </Text>
            <Pressable
              onPress={() => router.push("/auth/signup")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="ml-1 px-1 py-1"
            >
              <Text className="text-[#00A896] font-semibold text-base">
                Sign Up
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
