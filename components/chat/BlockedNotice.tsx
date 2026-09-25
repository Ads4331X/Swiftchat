import { memo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { type EdgeInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/constants/theme";
import { useTheme } from "@/constants/theme-provider";

type BlockedNoticeProps = {
  /** Called when the user taps "Unblock". */
  onUnblock: () => void;
  /** Shows a spinner on the button and disables it while unblocking. */
  busy?: boolean;
  /** Safe-area insets — keeps the bar clear of the home indicator. */
  insets: EdgeInsets;
};

const DANGER_COLOR = "#EF4444";

/**
 * Compact bar shown in a 1:1 chat when the current user has blocked the other
 * participant. It replaces the composer: the conversation stays readable but
 * can't be replied to until the contact is unblocked.
 */
export default memo(function BlockedNotice({
  onUnblock,
  busy,
  insets,
}: BlockedNoticeProps) {
  const { colors, subtleText, dividerColor } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: (insets?.bottom ?? 0) || 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: dividerColor,
        backgroundColor: colors.background,
      }}
    >
      <Feather name="slash" size={16} color={DANGER_COLOR} />

      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          marginLeft: 10,
          marginRight: 12,
          color: subtleText,
          fontSize: 13.5,
          fontWeight: "600",
        }}
      >
        You blocked this contact
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Unblock contact"
        onPress={onUnblock}
        disabled={busy}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingVertical: 7,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BRAND_COLOR,
          opacity: busy ? 0.6 : pressed ? 0.85 : 1,
        })}
      >
        {busy ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
            Unblock
          </Text>
        )}
      </Pressable>
    </View>
  );
});
