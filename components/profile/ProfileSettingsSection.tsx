import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/constants/theme";
import { useTheme } from "@/constants/theme-provider";

export type ProfileRow = {
  key: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  trailing?: string;
  control?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

type ProfileSettingsSectionProps = {
  title: string;
  rows: ProfileRow[];
};

export default function ProfileSettingsSection({
  title,
  rows,
}: ProfileSettingsSectionProps) {
  const { colors } = useTheme();
  const muted = colors.text + "80";
  const faint = colors.text + "1f";
  const disabledText = colors.text + "55";
  const disabledBackground = colors.text + "0a";

  return (
    <View className="mt-7">
      <Text
        style={{ color: BRAND_COLOR + "cc" }}
        className="text-xs font-semibold uppercase tracking-wide px-5 mb-1.5"
      >
        {title}
      </Text>
      <View>
        {rows.map((row) =>
          (() => {
            const isDisabled = row.disabled === true;
            const iconColor = isDisabled
              ? disabledText
              : row.destructive
                ? "#E5484D"
                : muted;
            const labelColor = isDisabled
              ? disabledText
              : row.destructive
                ? "#E5484D"
                : colors.text;

            return (
              <Pressable
                key={row.key}
                onPress={row.onPress}
                disabled={isDisabled}
                accessibilityState={{ disabled: isDisabled }}
                className="flex-row items-center px-5 py-2"
                style={({ pressed }) => ({
                  minHeight: 64,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: faint,
                  backgroundColor: isDisabled
                    ? disabledBackground
                    : pressed
                      ? colors.text + "0d"
                      : "transparent",
                })}
              >
                <Feather name={row.icon} size={20} color={iconColor} />
                <Text
                  style={{ color: labelColor }}
                  className="flex-1 text-[15px] ml-4"
                >
                  {row.label}
                </Text>
                {row.control ?? (
                  <View className="flex-row items-center gap-1.5">
                    {row.trailing && (
                      <Text
                        style={{ color: isDisabled ? disabledText : muted }}
                        className="text-sm"
                      >
                        {row.trailing}
                      </Text>
                    )}
                    {row.onPress &&
                      !isDisabled &&
                      row.key !== "delete" &&
                      row.key !== "block" && (
                        <Feather name="chevron-right" size={16} color={muted} />
                      )}
                  </View>
                )}
              </Pressable>
            );
          })(),
        )}
      </View>
    </View>
  );
}
