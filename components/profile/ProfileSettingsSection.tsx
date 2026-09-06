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

  return (
    <View className="mt-7">
      <Text
        style={{ color: BRAND_COLOR + "cc" }}
        className="text-xs font-semibold uppercase tracking-wide px-5 mb-1.5"
      >
        {title}
      </Text>
      <View>
        {rows.map((row) => (
          
          <Pressable
            key={row.key}
            onPress={row.onPress}
            disabled={!row.onPress}
            className="flex-row items-center px-5 py-2"
            style={({ pressed }) => ({
              minHeight: 64,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: faint,
              backgroundColor: pressed ? colors.text + "0d" : "transparent",
            })}
          >
            <Feather
              name={row.icon}
              size={20}
              color={row.destructive ? "#E5484D" : muted}
            />
            <Text
              style={{ color: row.destructive ? "#E5484D" : colors.text }}
              className="flex-1 text-[15px] ml-4"
            >
              {row.label}
            </Text>
            {row.control ?? (
              <View className="flex-row items-center gap-1.5">
                {row.trailing && (
                  <Text style={{ color: muted }} className="text-sm">
                    {row.trailing}
                  </Text>
                )}
                {row.onPress && row.key !== "delete" && row.key !== "block" && (
                  <Feather name="chevron-right" size={16} color={muted} />
                )}
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
