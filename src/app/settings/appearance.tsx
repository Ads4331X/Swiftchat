import { View, Text, Pressable, StyleSheet } from "react-native";
import { AppearanceCard } from "@/features/profile/components/AppearanceCard";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/shared/providers/theme-provider";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSetting } from "@/core/db";

export type Appearance = "light" | "dark" | "system";

const appearanceChoices: Appearance[] = ["light", "dark", "system"];

export default function AppearanceName() {
  const { colors, dividerColor, setAppearance } = useTheme();
  const [active, setActive] = useState<Appearance>("system");

  useEffect(() => {
    let mounted = true;
    getSetting("appearance").then((saved) => {
      if (!mounted) return;
      if (
        saved === "light" ||
        saved === "dark" ||
        saved === "system"
      ) {
        setActive(saved);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleClick = async (choice: Appearance) => {
    setActive(choice);
    await setAppearance(choice);
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
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/settings")
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
            onPress={() => handleClick(choice)}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}
