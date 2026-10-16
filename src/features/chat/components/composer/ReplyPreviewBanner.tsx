import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/shared/theme/theme";
import { useTheme } from "@/shared/providers/theme-provider";

type ReplyPreviewBannerProps = {
  senderName?: string | null;
  text: string;
  onCancel: () => void;
};

export function ReplyPreviewBanner({
  senderName,
  text,
  onCancel,
}: ReplyPreviewBannerProps) {
  const { inputBg, subtleText, dividerColor } = useTheme();

  return (
    <View
      className="flex-row items-center justify-between pl-4 pr-3 py-1.5"
      style={{
        backgroundColor: inputBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: dividerColor,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          flex: 1,
          alignItems: "stretch",
          marginRight: 12,
        }}
      >
        <View
          style={{
            width: 2.5,
            borderRadius: 1.25,
            backgroundColor: BRAND_COLOR,
            opacity: 0.6,
          }}
        />
        <View style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Feather name="corner-up-left" size={10} color={subtleText} />
            <Text
              style={{
                color: BRAND_COLOR,
                fontWeight: "600",
                fontSize: 12,
              }}
              numberOfLines={1}
            >
              {senderName ?? "Reply"}
            </Text>
          </View>
          <Text
            style={{ color: subtleText, fontSize: 11.5 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {text || "…"}
          </Text>
        </View>
      </View>
      <Pressable onPress={onCancel} hitSlop={8}>
        <Feather name="x" size={16} color={subtleText} />
      </Pressable>
    </View>
  );
}
