import { StyleSheet, Text } from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";

type BadgeProps = {
  label: string;
  color: string;
  backgroundColor: string;
};

export default function Badge({ label, color, backgroundColor }: BadgeProps) {
  const { colors } = useTheme();

  return (
    <Text
      style={{
        color,
        backgroundColor: backgroundColor ?? colors.background,
        overflow: "hidden",
        ...styles.base,
      }}
      className="text-[11px] font-semibold"
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
  },
});