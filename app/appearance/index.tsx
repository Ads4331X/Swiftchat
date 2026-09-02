import { View, Text, Pressable, StyleSheet } from "react-native";
import { AppearanceCard } from "./AppearanceCard";
import { useState } from "react";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { SafeAreaView } from "react-native-safe-area-context";

export type Appearance = "light" | "dark" | "system";

const appearanceChoices: Appearance[] = ["light", "dark", "system"];

export default function AppearanceName() {
  const [active, setActive] = useState<Appearance>("system");
  const { colors, dividerColor } = useTheme();

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
        <Pressable
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/usersetting")
          }
          className="p-1"
        >
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text
          style={{ color: colors.text }}
          className="flex-1 text-center font-bold text-lg"
        >
          Appearance
        </Text>
        <View className="w-8" />
      </View>

      <View className="pt-6">
        {appearanceChoices.map((choice) => (
          <AppearanceCard
            key={choice}
            appearanceName={choice}
            active={active}
            onPress={() => setActive(choice)}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}
