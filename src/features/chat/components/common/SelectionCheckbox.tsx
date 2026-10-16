import { View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/shared/theme/theme";
import { useTheme } from "@/shared/providers/theme-provider";

type SelectionCheckboxProps = {
  selected: boolean;
  size?: number;
  unselectedBorderColor?: string;
};

export function SelectionCheckbox({
  selected,
  size = 22,
  unselectedBorderColor,
}: SelectionCheckboxProps) {
  const { subtleText } = useTheme();

  return (
    <View
      className="items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        borderWidth: 2,
        borderColor: selected
          ? BRAND_COLOR
          : (unselectedBorderColor ?? subtleText + "66"),
        backgroundColor: selected ? BRAND_COLOR : "transparent",
      }}
    >
      {selected ? (
        <Feather name="check" size={Math.round(size * 0.6)} color="#fff" />
      ) : null}
    </View>
  );
}
