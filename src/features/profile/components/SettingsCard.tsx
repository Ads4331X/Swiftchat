import { Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/shared/providers/theme-provider";
import { BRAND_COLOR } from "@/shared/theme/theme";

const DANGER_COLOR = "#EF4444";

type SettingsCardProps = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  tone?: "default" | "danger";
};

export default function SettingsCard({
  icon,
  title,
  subtitle,
  onPress,
  tone = "default",
}: SettingsCardProps) {
  const { colors, subtleText, inputBg } = useTheme();
  const isDanger = tone === "danger";
  const accent = isDanger ? DANGER_COLOR : BRAND_COLOR;

  return (
    <Pressable
      onPress={onPress}
      className="w-full flex-row items-center gap-3 rounded-2xl px-4 py-3.5"
      style={{ backgroundColor: inputBg }}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: isDanger ? "rgba(239,68,68,0.12)" : "rgba(41,161,149,0.15)" }}
      >
        {icon}
      </View>

      <View className="flex-1">
        <Text
          style={{ color: isDanger ? DANGER_COLOR : colors.text }}
          className="font-semibold text-base"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: subtleText }} className="text-sm mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Feather name="chevron-right" size={20} color={accent} />
    </Pressable>
  );
}
