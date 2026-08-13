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
import { useTheme } from "@/constants/theme-provider";
import Toast from "react-native-toast-message";
import { Image } from "expo-image";
import AntDesign from "@expo/vector-icons/AntDesign";

type FormData = {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
};

export default function SignupScreen() {
  const theme = useTheme();
  const colors = theme.colors;
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
        text2: "Welcome to SwiftChat",
      });

      router.push("/auth/login");
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Signup failed",
        text2: err.response?.data?.error ?? "Something went wrong",
      });
    }
  };

  const {
    subtleText,
    inputBorderColor,
    inputBg,
    placeholderColor,
    dividerColor,
  } = theme;

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
          {/* logo */}
          <View className="items-center ">
            <Image
              source={require("@/assets/images/logo.png")}
              style={{ width: 176, height: 176 }}
              contentFit="contain"
            />
          </View>

          {/* Header */}
          <View className="mb-8">
            <Text
              style={{ color: colors.text }}
              className="text-3xl font-bold text-center mb-2"
            >
              Create your account
            </Text>

            <Text
              style={{ color: subtleText }}
              className="text-base text-center"
            >
              Join SwiftChat and start messaging securely
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
                minLength: {
                  value: 3,
                  message: "At least 3 characters",
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
                    <AntDesign name="user" size={20} color={subtleText} />
                  </View>

                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="yourname"
                    placeholderTextColor={placeholderColor}
                    autoCapitalize="none"
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
                minLength: {
                  value: 8,
                  message: "At least 8 characters",
                },
                pattern: {
                  value:
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/,
                  message:
                    "Must include uppercase, lowercase, and a special character",
                },
              }}
              render={({ field: { onChange, value, onBlur } }) => (
                <View
                  style={{
                    position: "relative",
                    justifyContent: "center",
                  }}
                >
                  {/* Lock icon */}
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

                  {/* Eye */}
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
                <View
                  style={{
                    position: "relative",
                    justifyContent: "center",
                  }}
                >
                  {/* Lock icon */}
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

                  {/* Eye */}
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

            {errors.confirmPassword && (
              <Text className="text-red-500 text-sm mt-1">
                {errors.confirmPassword.message}
              </Text>
            )}
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="rounded-2xl bg-[#008378] py-4 items-center active:opacity-90 mt-6"
            style={{
              opacity: isSubmitting ? 0.6 : 1,
            }}
          >
            <Text className="text-white text-lg font-semibold">
              {isSubmitting ? "Creating account..." : "Sign Up"}
            </Text>
          </Pressable>

          {/* Divider */}
          <View className="flex-row items-center my-8">
            <View
              style={{
                flex: 1,
                height: 1,
                backgroundColor: dividerColor,
              }}
            />

            <Text style={{ color: subtleText }} className="mx-3 text-sm">
              or
            </Text>

            <View
              style={{
                flex: 1,
                height: 1,
                backgroundColor: dividerColor,
              }}
            />
          </View>

          {/* Login */}
          <View className="flex-row items-center justify-center">
            <Text style={{ color: subtleText }} className="text-base">
              Already have an account?
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
