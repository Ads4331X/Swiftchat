import { Image, View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AntDesign from "@expo/vector-icons/AntDesign";
import { Link, router } from "expo-router";
import { useTheme } from "@/constants/theme-provider";

export default function WelcomePage() {
  const { colors, subtleText } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex justify-between px-6 py-10">
          {/* logo */}
          <View className="items-center pt-8">
            <Image
              source={require("@/assets/images/logo.png")}
              style={{ width: 220, height: 220 }}
              resizeMode="contain"
            />
          </View>

          {/* welcome (info) */}
          <View className="items-center px-2 ">
            <Text
              className="text-3xl font-bold text-center  mb-3"
              style={{ color: colors.text }}
            >
              Welcome to SwiftChat
            </Text>

            <Text
              className="text-lg text-center leading-relaxed max-w-xs"
                style={{ color: subtleText }}
            >
              Fast, Secure and Private messaging for everyone. Effortless
              connection starts here.
            </Text>
          </View>

          {/* actions */}
          <View className="gap-4 py-3">
            <Link href="/auth/signup" asChild>
              <Pressable className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#008378] py-4 shadow-sm active:opacity-90">
                <Text className="text-white text-lg font-semibold">
                  Get Started
                </Text>
                <AntDesign name="arrow-right" size={18} color="white" />
              </Pressable>
            </Link>

            <View className="flex-row items-center justify-center py-2">
              <Text
                className="text-base"
              style={{ color: subtleText }}
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
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
