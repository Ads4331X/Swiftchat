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
};

export default function ForgotPassword() {
  const theme = useTheme();
  const colors = theme.colors;

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await api.post("/api/auth/forgot-password", {
        email: data.email,
      });

      Toast.show({
        type: "success",
        text1: "Reset code sent!",
        text2: "Check your email for the reset code.",
      });

      //   router.push({
      //     pathname: "/auth/reset-password",
      //     params: {
      //       email: data.email,
      //     },
      //   });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Reset failed",
        text2: err.response?.data?.error ?? "Something went wrong",
      });
    }
  };

  const { subtleText, inputBorderColor, inputBg, placeholderColor } = theme;

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
              Forgot Password?
            </Text>

            <Text
              style={{ color: subtleText }}
              className="text-base text-center"
            >
              Enter your email address and we&apos;ll send you a code to reset
              your password.
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
                    autoComplete="email"
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
              {isSubmitting ? "Sending..." : "Send Reset Code"}
            </Text>
          </Pressable>

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
